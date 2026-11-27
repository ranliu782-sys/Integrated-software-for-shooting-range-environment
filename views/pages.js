'use strict';
/** 目标站页面（云图科技业务系统） */
const { esc } = require('../lib/http-util');
const { layout, notice } = require('./layout');
const { PRODUCTS } = require('../lib/sql-engine');

const VISIBLE = PRODUCTS.filter(p => !p.hidden);

function money(n) {
  return '¥' + Number(n).toFixed(2);
}

/* ---------------- 首页 ---------------- */
function home(session) {
  const cards = VISIBLE.map(
    p => `
    <a class="product-card" href="/lab/product/${p.id}">
      <div class="product-thumb thumb-${(p.id % 4) + 1}"><span>${esc(p.short || p.name.slice(0, 2))}</span></div>
      <div class="product-body">
        <h3>${esc(p.name)}</h3>
        <p class="muted small">${esc(p.description)}</p>
        <div class="product-foot"><strong class="price">${money(p.price)}</strong><span class="tag">现货</span></div>
      </div>
    </a>`
  ).join('');

  return layout({
    title: '云图商城',
    active: '商城',
    session,
    body: `
    <section class="hero">
      <div class="hero-copy">
        <p class="eyebrow">CloudPix IoT Platform</p>
        <h1>让每一台设备<br>都在你的视野里</h1>
        <p class="hero-sub">覆盖安防监控、智能门锁、边缘存储与云端回放的完整物联网解决方案，服务全国 30 万+ 家庭与企业客户。</p>
        <form class="search-bar" action="/lab/search" method="get">
          <input type="text" name="q" placeholder="搜索商品，例如：摄像头 / 门锁 / 网关" value="">
          <button class="btn btn-primary" type="submit">搜索</button>
        </form>
        <p class="tiny muted">热门：摄像头 · 门锁 · NVR · 云存储</p>
      </div>
      <div class="hero-visual">
        <div class="hero-ring"></div>
        <div class="hero-dot"></div>
        <div class="hero-label">在线设备 <strong>128,406</strong></div>
      </div>
    </section>
    <section class="section">
      <div class="section-head">
        <h2>全部商品</h2>
        <div class="quick-links">
          <a href="/lab/cart">购物车</a><span>·</span>
          <a href="/lab/checkout">收银台</a><span>·</span>
          <a href="/lab/proxy">图片代理</a>
        </div>
      </div>
      <div class="product-grid">${cards}</div>
    </section>
    <section class="section">
      <div class="banner-row">
        <div class="banner"><h3>企业采购</h3><p>批量授权与私有化部署，支持对公结算。</p><a href="/lab/checkout">前往开票 →</a></div>
        <div class="banner"><h3>开发者中心</h3><p>开放设备接入 API 与 Webhook 回调。</p><a href="/lab/tools">查看运维面板 →</a></div>
        <div class="banner"><h3>安全公告</h3><p>2026 年第三季度固件安全更新已发布。</p><a href="/lab/guestbook">参与讨论 →</a></div>
      </div>
    </section>`
  });
}

/* ---------------- 搜索 ---------------- */
function searchPage(opts) {
  const q = opts.q || '';
  const result = opts.result || { ok: true, rows: [] };
  let panel;

  if (!result.ok) {
    panel = `
      <div class="alert alert-error">
        <strong>数据库查询失败</strong>
        <p>${esc(result.error || '')}</p>
      </div>
      <div class="code-block"><div class="code-title">执行语句</div><pre>${esc(result.sql || '')}</pre></div>`;
  } else if (!result.rows.length) {
    panel = '<div class="empty">没有找到与「' + esc(q) + '」相关的商品，换个关键字试试。</div>';
  } else {
    const rows = result.rows
      .map(r => {
        const o = Array.isArray(r)
          ? { id: r[0], name: r[1], price: r[2], description: r[3] }
          : r;
        return `<tr>
          <td class="mono">${esc(o.id)}</td>
          <td>${esc(o.name)}</td>
          <td class="mono">${esc(o.price)}</td>
          <td class="muted">${esc(o.description)}</td>
        </tr>`;
      })
      .join('');
    panel = `
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>ID</th><th>商品名称</th><th>价格</th><th>描述</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  return layout({
    title: '搜索结果',
    active: '商城',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>商品搜索</h1>
        <form class="search-bar" action="/lab/search" method="get">
          <input type="text" name="q" placeholder="输入关键字" value="${esc(q)}">
          <button class="btn btn-primary" type="submit">搜索</button>
        </form>
      </section>
      <p class="tiny muted mono">共 ${result.ok ? result.rows.length : 0} 条结果</p>
      ${panel}
      ${result.ok && result.sql ? '<details class="sql-detail"><summary>查看后端执行的 SQL</summary><pre class="code">' + esc(result.sql) + '</pre></details>' : ''}
      <p class="back"><a href="/lab">← 返回商城首页</a></p>`
  });
}

/* ---------------- 商品详情 ---------------- */
function productPage(p, session) {
  return layout({
    title: p.name,
    active: '商城',
    session,
    body: `
      <div class="detail-grid">
        <div class="detail-thumb thumb-${(p.id % 4) + 1}"><span>${esc(p.short || p.name.slice(0, 2))}</span></div>
        <div class="detail-info">
          <h1>${esc(p.name)}</h1>
          <p class="muted">${esc(p.description)}</p>
          <div class="price-line">${money(p.price)}<span class="tag">含税 · 包邮</span></div>
          <div class="row">
            <a class="btn btn-primary" href="/lab/cart">加入购物车</a>
            <a class="btn btn-ghost" href="/lab/checkout">立即购买</a>
          </div>
          <ul class="spec">
            <li>发货地：深圳 · 顺丰包邮</li>
            <li>质保：整机 2 年，云服务 1 年</li>
            <li>支持 7 天无理由退货</li>
          </ul>
        </div>
      </div>
      <p class="back"><a href="/lab">← 返回商城首页</a></p>`
  });
}

/* ---------------- 留言板（存储型 XSS 靶标） ---------------- */
function guestbookPage(opts) {
  const entries = opts.entries || [];
  // 注意：这里故意不做转义，这是靶场的漏洞点
  const list = entries
    .map(
      e => `<article class="comment">
        <div class="comment-head"><strong>${esc(e.author)}</strong><span class="muted tiny">${esc(e.at)}</span></div>
        <div class="comment-body">${e.content}</div>
      </article>`
    )
    .join('');

  return layout({
    title: '产品留言板',
    active: '留言板',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>产品留言板</h1>
        <p class="muted">欢迎反馈使用体验，平台管理员会定期查看新留言。</p>
      </section>
      ${notice(opts.msg, 'success')}
      <form class="card form" method="post" action="/lab/guestbook">
        <div class="field"><label>昵称</label><input type="text" name="author" value="游客_${Math.floor(Math.random() * 9000 + 1000)}" maxlength="40"></div>
        <div class="field"><label>留言内容</label><textarea name="content" rows="4" placeholder="说说你的使用感受…" required></textarea></div>
        <div class="form-foot">
          <span class="tiny muted">提交后管理员 Bot 会自动访问本页一次（沙箱模拟）</span>
          <button class="btn btn-primary" type="submit">发布留言</button>
        </div>
      </form>
      <p class="tiny muted">攻击者回连平台：<a href="/lab/collect" target="_blank">/lab/collect</a>（Bot 外带记录会显示在这里）</p>
      <section class="section">
        <h2>全部留言（${entries.length}）</h2>
        <div class="comments">${list || '<div class="empty">还没有留言</div>'}</div>
      </section>`
  });
}

/* ---------------- 上传中心 ---------------- */
function uploadPage(opts) {
  const files = opts.files || [];
  const list = files.length
    ? '<ul class="file-list">' +
      files.map(f => '<li><span class="mono">' + esc(f.name) + '</span><span class="muted tiny">' + esc(f.type) + ' · ' + f.size + ' B</span><a href="/uploads/' + encodeURIComponent(f.name) + '" target="_blank">访问</a></li>').join('') +
      '</ul>'
    : '<div class="empty">还没有上传文件</div>';

  return layout({
    title: '头像上传',
    active: '上传中心',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>头像上传</h1>
        <p class="muted">仅支持 JPG / PNG / GIF，单文件不超过 2MB。</p>
      </section>
      ${notice(opts.msg, opts.ok === false ? 'error' : 'success')}
      <form class="card form" method="post" action="/lab/upload" enctype="multipart/form-data" id="up-form">
        <div class="field">
          <label>选择文件</label>
          <input type="file" name="avatar" accept=".jpg,.jpeg,.png,.gif,image/*" id="up-input">
        </div>
        <div class="form-foot">
          <span class="tiny muted" id="up-hint">上传后可在下方列表中访问</span>
          <button class="btn btn-primary" type="submit">上传</button>
        </div>
      </form>
      <section class="section">
        <h2>已上传文件（当前会话）</h2>
        ${list}
      </section>`,
    script: `
      var input = document.getElementById('up-input');
      var hint = document.getElementById('up-hint');
      var form = document.getElementById('up-form');
      form.addEventListener('submit', function (e) {
        var f = input.files[0];
        if (!f) { e.preventDefault(); hint.textContent = '请先选择文件'; return; }
        var ok = /\\.(jpg|jpeg|png|gif)$/i.test(f.name);
        if (!ok) { e.preventDefault(); hint.textContent = '只允许上传图片文件：' + f.name; return; }
        hint.textContent = '正在上传 ' + f.name + ' …';
      });
    `
  });
}

/* ---------------- 运维工具（命令注入靶标） ---------------- */
function toolsPage(opts) {
  const out = opts.output
    ? '<div class="term"><pre>' + esc(opts.output) + '</pre></div>'
    : '';
  return layout({
    title: '运维工具',
    active: '运维工具',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>运维工具 · 网络连通性检测</h1>
        <p class="muted">用于检测设备到边缘节点的连通性，仅内部人员可用。</p>
      </section>
      <form class="card form form-inline" method="get" action="/lab/tools">
        <div class="field grow"><label>目标地址</label><input type="text" name="ip" value="${esc(opts.ip || '')}" placeholder="例如 127.0.0.1"></div>
        <button class="btn btn-primary" type="submit">开始检测</button>
      </form>
      ${out}
      <div class="hint-box">
        <strong>后端实现（伪代码）</strong>
        <pre class="code">system("ping -c 4 " + ip);</pre>
      </div>`
  });
}

/* ---------------- 图片代理（SSRF 靶标） ---------------- */
function proxyPage(opts) {
  const res = opts.result;
  return layout({
    title: '图片代理',
    active: '运维工具',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>图片代理服务</h1>
        <p class="muted">由服务端代为拉取外部图片，避免前端跨域限制。</p>
      </section>
      <form class="card form form-inline" method="get" action="/lab/proxy">
        <div class="field grow"><label>图片地址</label><input type="text" name="url" value="${esc(opts.url || '')}" placeholder="http://example.com/a.png"></div>
        <button class="btn btn-primary" type="submit">拉取</button>
      </form>
      ${res ? `<div class="card"><h3 class="card-title">服务端响应</h3>
        <p class="tiny muted mono">GET ${esc(res.target || '')} → ${esc(String(res.status))}</p>
        <pre class="code">${esc(res.body || '')}</pre></div>` : ''}
      <div class="hint-box">
        <strong>后端实现（伪代码）</strong>
        <pre class="code">const body = await fetch(req.query.url)  // 未做任何地址校验
res.send(body)</pre>
      </div>`
  });
}

/* ---------------- 登录（验证码缺陷靶标） ---------------- */
function loginPage(opts) {
  return layout({
    title: '登录',
    active: '',
    session: opts.session,
    body: `
      <div class="auth-wrap">
        <div class="card auth-card">
          <h1>手机验证码登录</h1>
          <p class="muted small">未注册手机号将自动创建账号。</p>
          ${notice(opts.msg, opts.ok === false ? 'error' : 'success')}
          <div class="field"><label>手机号</label><input type="text" id="phone" placeholder="请输入手机号" value="${esc(opts.phone || '')}"></div>
          <div class="field">
            <label>验证码</label>
            <div class="row">
              <input type="text" id="code" placeholder="6 位验证码">
              <button class="btn btn-ghost" type="button" id="send">发送验证码</button>
            </div>
          </div>
          <button class="btn btn-primary btn-block" type="button" id="submit">登录</button>
          <p class="tiny muted" id="tip">提示：管理员账号使用 13800000001</p>
        </div>
      </div>`,
    script: `
      var tip = document.getElementById('tip');
      document.getElementById('send').addEventListener('click', function () {
        var phone = document.getElementById('phone').value.trim();
        if (!phone) { tip.textContent = '请先填写手机号'; return; }
        fetch('/api/lab/sms/send', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone })
        }).then(function (r) { return r.json(); }).then(function (d) {
          tip.textContent = '验证码已发送（沙箱：接口响应中包含 code）';
          console.log('[SMS]', d);
        });
      });
      document.getElementById('submit').addEventListener('click', function () {
        var phone = document.getElementById('phone').value.trim();
        var code = document.getElementById('code').value.trim();
        fetch('/api/lab/sms/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: phone, code: code })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d.ok) { location.href = d.role === 'admin' ? '/lab/admin' : '/lab/orders'; }
          else { tip.textContent = d.message || '登录失败'; }
        });
      });
    `
  });
}

/* ---------------- 管理后台 ---------------- */
function adminPage(opts) {
  return layout({
    title: '管理后台',
    active: '',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>管理后台</h1>
        <p class="muted">欢迎回来，${esc((opts.session.user || {}).username || '')}</p>
      </section>
      ${notice(opts.msg, opts.ok === false ? 'error' : 'success')}
      <div class="grid-2">
        <div class="card">
          <h3 class="card-title">平台密钥</h3>
          <p class="tiny muted">仅管理员可见，请勿外泄。</p>
          <pre class="code">${esc(opts.flag || '')}</pre>
        </div>
        <div class="card">
          <h3 class="card-title">系统概览</h3>
          <ul class="kv">
            <li><span>在线设备</span><strong>128,406</strong></li>
            <li><span>今日订单</span><strong>3,182</strong></li>
            <li><span>待处理工单</span><strong>27</strong></li>
            <li><span>数据库</span><strong>MySQL 8.0.32</strong></li>
          </ul>
        </div>
      </div>`
  });
}

/* ---------------- 订单中心（越权靶标） ---------------- */
function ordersPage(opts) {
  const user = opts.session.user;
  if (!user) {
    return layout({
      title: '订单中心',
      active: '订单',
      session: opts.session,
      body: '<div class="card"><h1>请先登录</h1><p class="muted">订单中心需要登录后访问。</p><a class="btn btn-primary" href="/lab/login">去登录</a></div>'
    });
  }
  const orders = opts.orders || [];
  const rows = orders
    .map(
      o => `<tr>
        <td class="mono">${o.id}</td>
        <td>${esc(o.item)}</td>
        <td class="mono">${money(o.amount)}</td>
        <td><span class="badge ${o.status === '已支付' ? 'badge-ok' : 'badge-warn'}">${esc(o.status)}</span></td>
        <td class="mono tiny">${esc(o.owner)}</td>
        <td><a class="link-btn" href="/api/lab/orders/${o.id}" target="_blank">详情 JSON</a></td>
      </tr>`
    )
    .join('');

  return layout({
    title: '我的订单',
    active: '订单',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>订单中心</h1>
        <p class="muted">当前账号：${esc(user.username)}（${esc(user.role)}）</p>
      </section>
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>订单号</th><th>商品</th><th>金额</th><th>状态</th><th>归属</th><th>操作</th></tr></thead>
          <tbody>${rows || '<tr><td colspan="6" class="empty">暂无订单</td></tr>'}</tbody>
        </table>
      </div>
      <div class="hint-box">
        <strong>接口说明</strong>
        <pre class="code">GET /api/lab/orders/:id
Authorization: Cookie(lab_sid)  // 仅校验登录态，未校验订单归属</pre>
      </div>`
  });
}

/* ---------------- 收银台（金额篡改靶标） ---------------- */
function checkoutPage(opts) {
  return layout({
    title: '收银台',
    active: '商城',
    session: opts.session,
    body: `
      <section class="page-head"><h1>企业版授权收银台</h1></section>
      <div class="grid-2">
        <div class="card">
          <h3 class="card-title">订单摘要</h3>
          <ul class="kv">
            <li><span>商品</span><strong>云图 企业版平台授权（50 节点）</strong></li>
            <li><span>标价</span><strong>¥19800.00</strong></li>
            <li><span>优惠</span><strong>¥0.00</strong></li>
            <li class="total"><span>应付</span><strong>¥19800.00</strong></li>
          </ul>
        </div>
        <div class="card">
          <h3 class="card-title">确认支付</h3>
          <p class="muted small">点击下方按钮发起支付，金额由前端提交。</p>
          <button class="btn btn-primary btn-block" id="pay">确认支付 ¥19800.00</button>
          <div id="pay-result" class="pay-result"></div>
          <p class="tiny muted mono">POST /api/lab/pay  {"orderId":2001,"amount":19800}</p>
        </div>
      </div>`,
    script: `
      document.getElementById('pay').addEventListener('click', function () {
        fetch('/api/lab/pay', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ orderId: 2001, amount: 19800 })
        }).then(function (r) { return r.json(); }).then(function (d) {
          var box = document.getElementById('pay-result');
          box.innerHTML = '<pre class="code">' + JSON.stringify(d, null, 2).replace(/</g, '&lt;') + '</pre>';
        });
      });
    `
  });
}

/* ---------------- 购物车（优惠券漏洞靶标） ---------------- */
function cartPage(opts) {
  const total = opts.total == null ? 19800 : opts.total;
  return layout({
    title: '购物车',
    active: '商城',
    session: opts.session,
    body: `
      <section class="page-head"><h1>购物车</h1></section>
      ${notice(opts.msg, opts.ok === false ? 'error' : 'success')}
      <div class="table-wrap">
        <table class="data-table">
          <thead><tr><th>商品</th><th>单价</th><th>数量</th><th>小计</th></tr></thead>
          <tbody><tr><td>云图 企业版平台授权（50 节点）</td><td class="mono">¥19800.00</td><td>1</td><td class="mono">¥19800.00</td></tr></tbody>
        </table>
      </div>
      <div class="card coupon-card">
        <h3 class="card-title">使用优惠券</h3>
        <form class="form form-inline" method="post" action="/lab/cart/coupon">
          <div class="field grow"><label>优惠券码</label><input type="text" name="code" value="NEW100" placeholder="输入券码"></div>
          <input type="hidden" name="times" value="1">
          <button class="btn btn-primary" type="submit">立即抵扣</button>
        </form>
        <p class="tiny muted">NEW100：每张抵扣 ¥100，单笔订单限用 1 张。</p>
        <p class="total-line">应付金额：<strong>${money(total)}</strong></p>
        ${opts.paid ? '<pre class="code">' + esc(opts.paid) + '</pre>' : ''}
      </div>`
  });
}

/* ---------------- 主机门户（弱口令 + 提权靶标） ---------------- */
function sshPage(opts) {
  const s = opts.ssh;
  if (!s) {
    return layout({
      title: '主机门户',
      active: '主机门户',
      session: opts.session,
      body: `
        <div class="auth-wrap">
          <div class="card auth-card">
            <h1>Web SSH · cloudpix-web01</h1>
            <p class="muted small">生产主机远程运维入口（10.0.8.31）</p>
            ${notice(opts.msg, opts.ok === false ? 'error' : 'success')}
            <form method="post" action="/lab/ssh/login">
              <div class="field"><label>用户名</label><input type="text" name="user" value="${esc(opts.user || '')}" autocomplete="off"></div>
              <div class="field"><label>密码</label><input type="password" name="pass" autocomplete="off"></div>
              <button class="btn btn-primary btn-block" type="submit">连接</button>
            </form>
            <p class="tiny muted">提示：账号口令可在备份文件中找到。</p>
          </div>
        </div>`
    });
  }

  return layout({
    title: '终端 · ' + s.user,
    active: '主机门户',
    session: opts.session,
    body: `
      <div class="term-shell">
        <div class="term-bar">
          <span class="dot dot-r"></span><span class="dot dot-y"></span><span class="dot dot-g"></span>
          <span class="term-title">${esc(s.user)}@cloudpix-web01: ${esc(s.cwd)}</span>
          <a class="term-exit" href="/lab/ssh/logout">断开</a>
        </div>
        <div class="term-body" id="term-out"></div>
        <form class="term-input" id="cmd-form">
          <span class="prompt" id="prompt">${esc(s.user)}@cloudpix-web01:${esc(s.cwd)}$</span>
          <input type="text" id="cmd" autocomplete="off" spellcheck="false" autofocus>
        </form>
      </div>
      <p class="tiny muted">支持命令：ls cd pwd cat id whoami uname echo ping ps find sudo backup history exit</p>`,
    script: `
      var out = document.getElementById('term-out');
      var prompt = document.getElementById('prompt');
      var input = document.getElementById('cmd');
      var cwd = ${JSON.stringify(s.cwd)};
      var user = ${JSON.stringify(s.user)};

      function append(text, cls) {
        var d = document.createElement('div');
        if (cls) d.className = cls;
        d.textContent = text;
        out.appendChild(d);
        out.scrollTop = out.scrollHeight;
      }
      append('Welcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-91-generic x86_64)');
      append('Last login: Wed Nov 25 09:14:02 2026 from 10.0.8.24');
      append('');

      document.getElementById('cmd-form').addEventListener('submit', function (e) {
        e.preventDefault();
        var cmd = input.value;
        if (!cmd.trim()) return;
        append(user + '@cloudpix-web01:' + cwd + '$ ' + cmd);
        input.value = '';
        fetch('/api/lab/ssh/exec', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cmd: cmd })
        }).then(function (r) { return r.json(); }).then(function (d) {
          if (d.needLogin) { location.href = '/lab/ssh'; return; }
          if (d.cwd) { cwd = d.cwd; prompt.textContent = user + '@cloudpix-web01:' + cwd + '$'; }
          if (d.cleared) { out.innerHTML = ''; }
          if (d.output && d.output.length) append(d.output.join('\\n'));
          append('');
          if (d.exited) { setTimeout(function () { location.href = '/lab/ssh'; }, 600); }
        });
      });
    `
  });
}

/* ---------------- 回连记录（攻击者视角） ---------------- */
function collectPage(opts) {
  const logs = opts.logs || [];
  const list = logs.length
    ? logs
        .map(
          l => `<article class="comment">
            <div class="comment-head"><strong class="mono">${esc(l.from || 'bot')}</strong><span class="muted tiny">${esc(l.at)}</span></div>
            <div class="comment-body mono">${esc(l.data)}</div>
          </article>`
        )
        .join('')
    : '<div class="empty">还没有回连记录，等待 Bot 访问…</div>';

  return layout({
    title: '回连记录',
    active: '',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>回连记录</h1>
        <p class="muted">模拟攻击者搭建的外带接收端。Bot 触发脚本后会带着 Cookie 请求这里。</p>
      </section>
      <div class="comments">${list}</div>`
  });
}

/* ---------------- 终局关卡 ---------------- */
function finalPage(opts) {
  return layout({
    title: '终极挑战',
    active: '',
    session: opts.session,
    body: `
      <section class="page-head"><h1>终极挑战</h1></section>
      <div class="card">
        ${
          opts.unlocked
            ? '<p class="muted">你已集齐全部关卡的 flag。终局 flag 如下：</p><pre class="code">' + esc(opts.flag) + '</pre>'
            : '<p class="muted">终局关卡尚未解锁。当前完成 <strong>' + opts.solved + ' / ' + opts.total + '</strong> 关。</p>' +
              '<div class="progress"><div class="progress-bar" style="width:' + Math.round((opts.solved / opts.total) * 100) + '%"></div></div>' +
              '<p class="tiny muted">集齐全部 12 枚 flag 后本页将显示终极 flag。</p>'
        }
      </div>`
  });
}

/* ---------------- 报表中心（SSTI 靶标） ---------------- */
function reportPage(opts) {
  return layout({
    title: '报表中心',
    active: '运维工具',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>报表中心</h1>
        <p class="muted">标题支持模板占位符，例如 <code class="inline-code">{{site}}</code> 会渲染成站点名。</p>
      </section>
      <form class="card form form-inline" method="get" action="/lab/report">
        <div class="field grow"><label>报表标题</label><input type="text" name="name" value="${esc(opts.name || '')}" placeholder="月度销售报表"></div>
        <button class="btn btn-primary" type="submit">生成报表</button>
      </form>
      ${
        opts.rendered !== undefined
          ? `<div class="card"><h3 class="card-title">渲染结果</h3>
              <div class="report-preview">${opts.rendered}</div>
              <p class="tiny muted">渲染上下文：name / site / user / env.APP_ENV / flag</p>
            </div>`
          : ''
      }
      <div class="hint-box">
        <strong>后端实现（伪代码）</strong>
        <pre class="code">const html = template.render(req.query.name, {
  name: '月度销售报表', site: 'CloudPix', user: session.user, flag: process.env.FLAG
})</pre>
      </div>`
  });
}

/* ---------------- 盲注接口（无回显） ---------------- */
function blindPage(opts) {
  return layout({
    title: '搜索结果（加固版）',
    active: '商城',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>商品搜索 <span class="tag">加固版</span></h1>
        <p class="muted">出于安全考虑，本接口不再返回商品明细，只返回命中数量；异常信息已统一屏蔽。</p>
      </section>
      <form class="card form form-inline" method="get" action="/lab/search/blind">
        <div class="field grow"><label>关键字</label><input type="text" name="q" value="${esc(opts.q || '')}" placeholder="输入关键字"></div>
        <button class="btn btn-primary" type="submit">搜索</button>
      </form>
      ${
        opts.q
          ? opts.failed
            ? '<div class="result-box result-fail">查询失败，请检查参数。</div>'
            : '<div class="result-box">命中 <strong>' + opts.count + '</strong> 条</div>'
          : ''
      }
      <p class="tiny muted">提示：本页不会回显任何数据字段，也不会回显错误细节。</p>`
  });
}

/* ---------------- 令牌调试台（JWT 靶标） ---------------- */
function jwtPage(opts) {
  const r = opts.result;
  return layout({
    title: '令牌调试台',
    active: '',
    session: opts.session,
    body: `
      <section class="page-head">
        <h1>令牌调试台</h1>
        <p class="muted">内部工具：签发 / 校验 JWT，方便联调。鉴权接口在 <code class="inline-code">/api/lab/jwt/me</code>。</p>
      </section>
      <div class="grid-2">
        <div class="card">
          <h3 class="card-title">1. 以普通用户登录，拿一个合法令牌</h3>
          <button class="btn btn-primary" id="jwt-login">以 alice 登录</button>
          <p class="tiny muted" style="margin-top:10px">当前令牌：</p>
          <pre class="code" id="jwt-token">${esc(opts.token || '（还没有令牌）')}</pre>
        </div>
        <div class="card">
          <h3 class="card-title">2. 提交令牌做鉴权</h3>
          <textarea id="jwt-input" rows="4" placeholder="粘贴 JWT，例如 eyJhbGciOi...">${esc(opts.token || '')}</textarea>
          <button class="btn btn-primary btn-block" id="jwt-check">校验令牌</button>
          <div id="jwt-result">${
            r
              ? '<pre class="code">' + esc(JSON.stringify(r, null, 2)) + '</pre>'
              : ''
          }</div>
        </div>
      </div>`,
    script: `
      var tokenEl = document.getElementById('jwt-token');
      var inputEl = document.getElementById('jwt-input');
      var outEl = document.getElementById('jwt-result');

      document.getElementById('jwt-login').addEventListener('click', function () {
        fetch('/api/lab/jwt/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice' }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            tokenEl.textContent = d.token;
            inputEl.value = d.token;
          });
      });

      document.getElementById('jwt-check').addEventListener('click', function () {
        fetch('/api/lab/jwt/me', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: inputEl.value }) })
          .then(function (r) { return r.json(); })
          .then(function (d) {
            outEl.innerHTML = '<pre class="code">' + JSON.stringify(d, null, 2).replace(/</g, '&lt;') + '</pre>';
          });
      });
    `
  });
}

module.exports = {
  home,
  searchPage,
  productPage,
  guestbookPage,
  uploadPage,
  toolsPage,
  proxyPage,
  loginPage,
  adminPage,
  ordersPage,
  checkoutPage,
  cartPage,
  sshPage,
  collectPage,
  finalPage,
  reportPage,
  blindPage,
  jwtPage
};
