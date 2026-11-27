'use strict';
const { esc } = require('../lib/http-util');

function navItem(href, label, active) {
  return '<a class="nav-link' + (active === label ? ' is-active' : '') + '" href="' + href + '">' + esc(label) + '</a>';
}

function layout(opts) {
  const o = opts || {};
  const s = o.session || {};
  const user = s.user;
  const isAdmin = user && user.role === 'admin';
  const right = user
    ? '<span class="who">' + esc(user.username) + (isAdmin ? ' · 管理员' : '') + '</span>' +
      '<a class="btn btn-ghost btn-sm" href="/lab/logout">退出</a>'
    : '<a class="btn btn-primary btn-sm" href="/lab/login">登录 / 注册</a>';

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(o.title || '云图科技')} · CloudPix</title>
<link rel="stylesheet" href="/assets/lab.css">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='8' fill='%232563eb'/%3E%3Ccircle cx='16' cy='16' r='6' fill='white'/%3E%3C/svg%3E">
</head>
<body>
<header class="site-header">
  <div class="header-inner">
    <a class="brand" href="/lab">
      <span class="brand-mark"></span>
      <span class="brand-text">云图科技<small>CloudPix IoT</small></span>
    </a>
    <nav class="site-nav">
      ${navItem('/lab', '商城', o.active)}
      ${navItem('/lab/guestbook', '留言板', o.active)}
      ${navItem('/lab/upload', '上传中心', o.active)}
      ${navItem('/lab/tools', '运维工具', o.active)}
      ${navItem('/lab/orders', '订单', o.active)}
      ${navItem('/lab/ssh', '主机门户', o.active)}
    </nav>
    <div class="header-right">${right}</div>
  </div>
</header>
<main class="site-main">
${o.body || ''}
</main>
<footer class="site-footer">
  <div class="footer-inner">
    <span>CloudPix IoT 云图科技 · 内部演练系统 v1.0</span>
    <span class="muted">本站为本地沙箱靶场，仅用于安全技能训练</span>
  </div>
</footer>
${o.script ? '<script>' + o.script + '</script>' : ''}
</body>
</html>`;
}

function notice(msg, type) {
  if (!msg) return '';
  return '<div class="notice notice-' + (type || 'info') + '">' + msg + '</div>';
}

module.exports = { layout, notice };
