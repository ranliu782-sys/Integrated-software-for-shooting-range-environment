# 云图科技 · 一体化靶场 v1.0

一个装在单个文件夹里的本地安全训练环境：**零第三方依赖、不需要数据库、不装任何中间件**，双击即用。
靶标是一套虚构的物联网公司业务系统（商城 / 订单 / 上传 / 运维面板 / Web SSH），覆盖 Web 漏洞、业务逻辑漏洞、主机渗透三类共 12 个关卡，外加一个集齐全部 flag 才解锁的终局关卡。

它不是静态页面，而是**三个真实监听的服务**：HTTP(7788) / HTTPS(7789，自签) / SSH 风格终端(2222)。
所以 Burp 能抓、nmap 能扫、dirsearch 能列目录、xray 能报洞——看到的状态码、响应头、Cookie、报错都是真产生的。

> 全部内容运行在本机沙箱内：命令执行、SSRF、提权都发生在虚拟主机里，不会真的执行系统命令。默认只监听 `127.0.0.1`。

---

## 一、启动

### 方式一：直接跑打包好的 exe（推荐，不需要装 Node）

```
dist/靶场.exe
```

双击即可。这是一个 83 MB 的单文件程序，**内含 Node 运行时 + 全部业务代码 + 前端与证书**，不依赖本机任何环境，也不需要数据库。
`data/` 会自动创建在 exe 同目录。

同目录还带了：

| 文件 | 用途 |
| --- | --- |
| `启动靶场.bat` | 起服务 + 用应用模式打开客户端窗口（无地址栏，像独立程序） |
| `服务管理.bat` | 开机自启 / 注册为系统服务 / 停止 / 查看状态 / 卸载 |
| `使用说明.txt` | 给拿到这个文件夹的人看的说明 |

### 方式二：源码运行（改代码时用）

```bash
cd target-range
node server.js
```

要求 Node.js 16+（本机已验证 Node 22）。无需 `npm install`。

也可以双击根目录的 `启动靶场.bat`（会自动起服务并打开客户端窗口），`靶场客户端.bat` 单独开窗口。

自定义端口：

```bash
PORT=8000 TLS_PORT=8001 SSH_PORT=20022 node server.js   # macOS / Linux / Git Bash
set PORT=8000& set TLS_PORT=8001& node server.js         # Windows CMD
```

### 方式三：重新构建 exe

改了代码之后想更新 `dist/靶场.exe`：

```bash
npm i postject --prefix ../.tools     # 只有第一次需要
node tools/build-exe.js
```

构建流程：`tools/bundle.js` 把本地 require 图打包成单文件 → Node SEA 生成 blob → 注入 node 运行时 → 附带 bat 与说明。
产物在 `dist/`，约 83 MB。

### 想被抓包 / 被扫描

```bat
set RANGE_UPSTREAM_PROXY=http://127.0.0.1:8080
node server.js
```

带上这个变量后，SSRF 关卡里**服务端发出的请求也会经过 Burp**，你能在抓包里看到一条不是浏览器发出的请求。
完整配置见 `抓包与扫描指南.md`。

### 想让它常驻

`dist/服务管理.bat` 里有两个选项：开机自启（当前用户，免管理员）或注册为系统级开机任务（需管理员）。
源码模式下也可以用 `schtasks` 把 `node server.js` 注册成开机任务。

---

## 二、三个入口

| 入口 | 地址 | 说明 |
| --- | --- | --- |
| 攻击控制台 | `http://127.0.0.1:7788/` | 关卡列表、目标描述、线索、flag 提交、进度环、排行榜 |
| 靶标业务站 | `http://127.0.0.1:7788/lab` | 需要你攻击的目标系统 |
| 靶标 HTTPS | `https://127.0.0.1:7789/lab` | 同一套站点，自签证书，练 TLS 抓包 |
| 主机终端 | `nc 127.0.0.1 2222` | ssh 风格终端，banner 是 `OpenSSH_8.9p1` |

控制台里每个关卡都有「目标入口」按钮，点开就是对应的靶标页面。发现 flag 后回到控制台提交即可计分。
控制台右上角有个「抓包 / 扫描」按钮，里面直接给了 Burp 配置说明和可复制的扫描命令。

---

## 三、关卡总览（16 关 · 4600 分）

### Web 漏洞（7 关 · 2050 分）

| 关卡 | 难度 | 分值 | 靶标位置 |
| --- | --- | --- | --- |
| 搜索框里的 SQL 注入 | 简单 | 200 | `/lab/search` |
| 留言板的存储型 XSS | 中等 | 300 | `/lab/guestbook` |
| 头像上传绕过 | 中等 | 250 | `/lab/upload` |
| Ping 检测工具的命令注入 | 中等 | 300 | `/lab/tools` |
| 图片代理的 SSRF | 较难 | 350 | `/lab/proxy` |
| 报表标题的模板注入 | 较难 | 300 | `/lab/report` |
| 无回显的布尔盲注 | 较难 | 350 | `/lab/search/blind` |

### 业务逻辑（5 关 · 1300 分）

| 关卡 | 难度 | 分值 | 靶标位置 |
| --- | --- | --- | --- |
| 订单详情的越权访问 | 简单 | 200 | `/lab/orders` + `/api/lab/orders/:id` |
| 支付金额可篡改 | 简单 | 250 | `/lab/checkout` |
| 短信验证码未校验 | 中等 | 200 | `/lab/login` |
| 优惠券叠加逻辑漏洞 | 中等 | 300 | `/lab/cart` |
| JWT 令牌伪造 | 中等 | 350 | `/lab/jwt` |

### 主机渗透（3 关 · 750 分）

| 关卡 | 难度 | 分值 | 靶标位置 |
| --- | --- | --- | --- |
| robots.txt 与备份文件泄露 | 简单 | 150 | `/robots.txt` → `/backup/` |
| 弱口令登录主机 | 中等 | 200 | `/lab/ssh` 或 `nc 127.0.0.1 2222` |
| SUID 提权到 root | 较难 | 400 | 主机终端内 |

### 综合挑战（1 关 · 500 分）

集齐其余 15 枚 flag 后，`/lab/final` 自动显示终极 flag。

> 想再加题、或者把现有关卡调难，见 `扩展指南.md`。

---

## 四、几个值得说明的设计

**它是一个真站点，不是假页面。** 三个端口都在真监听：HTTP 7788、HTTPS 7789（自签证书）、SSH 风格终端 2222（banner 是 `OpenSSH_8.9p1`，`nc` 能直接连进去敲命令）。响应头伪装成 `nginx/1.18.0` + `PHP/7.4.33`，带 `PHPSESSID` Cookie，安全头故意缺失——所以 nikto/xray 报的那些"缺少安全响应头"是真结论，不是误报。

**扫描面是真的。** `/.git/config`、`/.env`、`config.php.bak`、`search.php.bak`、`phpinfo.php`、`/server-status`、`/backup/`、`/uploads/` 目录索引都在，dirsearch 一扫一片 200。其中 `search.php.bak` 直接暴露了那句有漏洞的 SQL 拼接代码，`/.env` 里有数据库口令和 `INTERNAL_API` 地址。

**SSRF 会真的发一次请求。** 图片代理用 Node 的 socket 真连内网地址，服务端日志和抓包里都能看到这次请求。带上 `RANGE_UPSTREAM_PROXY` 后它还会经过 Burp，你能直观看到"服务端代替你发出的请求"。

**SQL 注入是真的注入。** 靶场内置了一个迷你 SQL 引擎（词法分析 + 表达式求值），`' OR 1=1 --`、`UNION SELECT ... FROM secrets`、语法报错回显都能按真实语义工作，不是靠关键字猜中才给 flag。

**盲注也真的只能靠布尔。** 加固版接口 `/lab/search/blind` 只回「命中几条」，错误信息一律吞掉。引擎额外支持标量子查询和 `SUBSTR` / `ASCII` / `LENGTH`，所以 `AND SUBSTR((SELECT flag FROM secrets WHERE id=3),1,5)='flag{'` 这种逐位判断是真能跑通的——用 ffuf 或 Burp Intruder 爆破即可。

**SSTI 是自研迷你模板引擎。** `lib/template.js` 做词法分析 + 递归下降求值，不是把输入拼进 `eval`。`{{7*7}}` 返回 49，`{{flag}}` 直接取到上下文变量——也就意味着这个洞是真的。

**JWT 留了两个真实缺陷。** `lib/jwt.js` 里 HS256 密钥是 `cloudpix`（可离线爆破），并且服务端接受 `alg=none` 且不校验签名——两条路都能伪造出 `role=admin`。

**命令执行跑在虚拟主机里。** `/lab/tools`、`/lab/ssh` 和 2222 端口共用同一套虚拟文件系统（`/flag`、`/home/ops`、`/root`、SUID 的 `/usr/local/bin/backup`），有真实权限位与 owner 判定：`www-data` 读不到 `/root/flag.txt`，`ops` 读得到自己的家目录。所有命令都在内存里跑，绝不触达你本机的系统。

**XSS 有 Bot。** 留言提交后，模拟的管理员 Bot 会访问该页面，脚本触发时会把带 flag 的 Cookie 送到 `/lab/collect`（攻击者回连平台），你可以在那里看到外带记录。

**flag 每次重置都会变。** 首次启动为每个关卡生成随机 flag 并写入本地，重置后重新生成；页面里的 flag 是从存储中动态注入的，不会因为写死而失效。

---

## 五、数据存储（不使用数据库）

所有状态都是本地 JSON 文件，没有任何数据库依赖：

```
target-range/
├─ data/
│  ├─ state.json      # 所有 flag、通关记录、留言、排行榜数据
│  └─ uploads/        # 上传关卡产生的文件
```

- 想重开一局：控制台右上角「重置靶场」，或直接删除 `data/state.json`（下次启动自动重建）。
- 想备份进度：复制 `data/state.json` 即可。
- 想分发给别人：整个 `target-range` 目录打包，删掉 `data/` 就是全新环境。

---

## 六、目录结构

```
target-range/
├─ server.js                  # 三端口服务（HTTP/HTTPS/SSH）与路由分发
├─ 启动靶场.bat               # 源码模式：起 node 服务 + 打开客户端窗口
├─ 靶场客户端.bat             # 只打开客户端窗口（应用模式）
├─ certs/server.crt|.key      # 自签证书（抓 HTTPS 用）
├─ dist/                      # 打包产物：靶场.exe + 启动/服务脚本 + 使用说明
├─ build/                     # 构建中间产物（bundle.js、sea-prep.blob）
├─ 抓包与扫描指南.md          # Burp / nmap / dirsearch / nikto / sqlmap 怎么接
├─ 扩展指南.md                # 怎么加新关卡、怎么把题目变难
├─ 参考解法.md                # 全部关卡的答案（学员慎入）
├─ lib/
│  ├─ store.js                # 本地 JSON 存储
│  ├─ root.js                 # 运行根目录（区分 node 与 exe）
│  ├─ assets.js               # 静态资源读取（磁盘 / SEA 内嵌）
│  ├─ challenges.js           # 关卡元数据
│  ├─ flags.js                # flag 生成与占位符解析
│  ├─ sql-engine.js           # 迷你 SQL 引擎（含子查询与 SUBSTR/ASCII）
│  ├─ template.js             # 迷你模板引擎（SSTI 靶标）
│  ├─ jwt.js                  # 极简 JWT（alg=none + 弱密钥）
│  ├─ ssh-service.js          # 2222 端口的 ssh 风格终端
│  ├─ vfs.js                  # 虚拟文件系统与受限 shell
│  ├─ sessions.js             # 靶场会话
│  ├─ http-util.js            # Cookie / 表单 / multipart 解析
│  ├─ router.js
│  └─ modules/
│     ├─ web.js               # 7 个 Web 靶标
│     ├─ biz.js               # 5 个业务逻辑靶标（含 JWT）
│     ├─ host.js              # 3 个主机渗透靶标
│     ├─ surface.js           # 扫描面：.git / .env / 备份文件 / 目录索引
│     └─ console-api.js       # 控制台 API（含 /api/net 端口与工具信息）
├─ views/                     # 靶标页面渲染
├─ public/                    # 控制台前端 + 样式
├─ tools/
│  ├─ smoke.js                # 自检脚本：27 项断言
│  ├─ bundle.js               # 单文件打包器（CJS require 图内联）
│  ├─ build-exe.js            # 构建 dist/靶场.exe（Node SEA）
│  ├─ bat/                    # 已转码的 GBK+CRLF 批处理（构建时拷进 dist）
│  └─ bat-src/                # 批处理的 UTF-8 可读源码
└─ data/                      # 运行时数据（自动生成）
```

> 批处理文件是 **GBK + CRLF** 编码的。cmd 用 UTF-8/LF 会解析崩（中文尾字节撞括号），改脚本时请改 `tools/bat-src/*.utf8`，再重新转码。

---

## 七、自检（改代码之后跑一下）

先启动服务，再执行：

```bash
node tools/smoke.js
```

27 项断言，覆盖：15 个靶标是否仍可被正常利用（SQLi / XSS Bot 外带 / 上传执行 / 命令注入 / SSRF / SSTI / 盲注 / 越权 / 金额篡改 / 验证码绕过 / 优惠券叠加 / JWT 伪造 / 备份泄露 / 弱口令 / SUID 提权）、扫描面是否还能扫到、HTTPS 与 SSH 端口是否活着，最后完整提交一遍并校验终局解锁。

脚本会自动找最近被写入的 `state.json`（源码模式的 `data/` 或 exe 旁边的 `dist/data/`），也可以手动指定：

```bash
node tools/smoke.js "D:\path\to\state.json"
```

注意：自检会写入通关记录，跑完记得在控制台点一次「重置靶场」。

---

## 八、注意事项

- 靶场只应在本机使用。若要放到局域网给同事练习，请自行评估风险：**这是一个故意留有漏洞的系统，不要暴露到公网。**
- 每次重启后靶场会话（登录态、SSH 登录）会失效，关卡进度保留。
- 抓包、端口扫描、漏扫工具的具体配置见 `抓包与扫描指南.md`（里面有个 Chrome 绕过 localhost 代理的坑，不处理会抓不到包）。
- 参考解法见 `参考解法.md`（含完整答案，建议学员先别看）。
- 想加新题、想把现有题变难，见 `扩展指南.md`（含 8 个更难题的设计与 3 步接入流程）。
