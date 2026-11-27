'use strict';
/**
 * 扫描面：真实站点该暴露的目录与文件
 * 目的：让 dirsearch / nikto / xray / awvs 这类工具能扫出东西来，
 *      同时给学员提供"信息收集"阶段的真实情报（源码泄漏、配置泄漏、目录遍历）。
 * 这些内容不占关卡分，但会喂给已有的 12 个关卡。
 */
const fs = require('fs');
const path = require('path');
const store = require('../store');
const flags = require('../flags');
const { send, html, json, esc } = require('../http-util');

function text(res, body, type) {
  send(res, 200, body, { 'Content-Type': (type || 'text/plain') + '; charset=utf-8' });
}

/* ---------------- .git 泄漏 ---------------- */
function gitHead(ctx) {
  text(ctx.res, 'ref: refs/heads/main\n');
}

function gitConfig(ctx) {
  text(
    ctx.res,
    [
      '[core]',
      '\trepositoryformatversion = 0',
      '\tfilemode = true',
      '\tbare = false',
      '\tlogallrefupdates = true',
      '[remote "origin"]',
      '\turl = git@git.cloudpix.local:iot/portal.git',
      '\tfetch = +refs/heads/*:refs/remotes/origin/*',
      '[branch "main"]',
      '\tremote = origin',
      '\tmerge = refs/heads/main',
      '[user]',
      '\tname = ops',
      '\temail = ops@cloudpix.local',
      ''
    ].join('\n')
  );
}

function gitRef(ctx) {
  text(ctx.res, '3f9a1c7e2b8d4f60a5c1e9b7d2f4a8c6e0b3d5f7\n');
}

function gitLog(ctx) {
  text(
    ctx.res,
    [
      '0000000000000000000000000000000000000000 3f9a1c7e2b8d4f60a5c1e9b7d2f4a8c6e0b3d5f7 ops <ops@cloudpix.local> 1732017600 +0800\tcommit (initial): 上线',
      '3f9a1c7e2b8d4f60a5c1e9b7d2f4a8c6e0b3d5f7 8b1e4d7c0a2f6b9e3d5c8a1f4b7e0d3c6a9f2b5e ops <ops@cloudpix.local> 1732104000 +0800\tcommit: 修复登录页样式',
      ''
    ].join('\n')
  );
}

/* ---------------- .env 泄漏 ---------------- */
function envFile(ctx) {
  text(
    ctx.res,
    [
      'APP_NAME=CloudPixPortal',
      'APP_ENV=production',
      'APP_KEY=base64:Kq7vX2mN9pLc4rTz0wYb8Hd3Jf6Ga1Se5Uo7Iu2=',
      'APP_DEBUG=true',
      '',
      'DB_CONNECTION=mysql',
      'DB_HOST=127.0.0.1',
      'DB_PORT=3306',
      'DB_DATABASE=cloudpix',
      'DB_USERNAME=root',
      'DB_PASSWORD=p@ssw0rd_2024',
      '',
      '# 内部服务（不要对外暴露）',
      'INTERNAL_API=http://127.0.0.1:7788/internal/',
      'INTERNAL_TOKEN=cp_int_7f3a9b2c',
      '',
      'REDIS_HOST=127.0.0.1',
      'REDIS_PORT=6379',
      '',
      'UPLOAD_MAX_SIZE=2M',
      'UPLOAD_ALLOW=image/*',
      ''
    ].join('\n')
  );
}

/* ---------------- 源码备份泄漏 ---------------- */
function configBackup(ctx) {
  text(
    ctx.res,
    [
      '<?php',
      '// config.php.bak - 2026-11-18 22:41 手工备份，忘了删',
      'return [',
      "  'db' => ['host' => '127.0.0.1', 'user' => 'root', 'pass' => 'p@ssw0rd_2024', 'name' => 'cloudpix'],",
      "  'debug' => true,",
      "  'upload' => [",
      "      // 只校验 Content-Type，前端已做限制",
      "      'check' => function ($file) {",
      "          return strpos($file['type'], 'image/') === 0;",
      '      },',
      '  ],',
      '];'
    ].join('\n')
  );
}

function searchBackup(ctx) {
  text(
    ctx.res,
    [
      '<?php',
      '// search.php.bak',
      '$q = $_GET["q"];',
      '$sql = "SELECT id, name, price, description FROM products WHERE name LIKE \'%{$q}%\' AND hidden = 0";',
      '$rows = $pdo->query($sql)->fetchAll();',
      '// TODO: 用预处理语句重写（一直没时间）',
      'foreach ($rows as $r) { echo "<tr><td>{$r[\'name\']}</td></tr>"; }'
    ].join('\n')
  );
}

/* ---------------- 目录遍历 ---------------- */
function uploadsIndex(ctx) {
  let files = [];
  try {
    files = fs.readdirSync(store.UPLOAD_DIR).map(name => {
      const st = fs.statSync(path.join(store.UPLOAD_DIR, name));
      return { name, size: st.size, mtime: st.mtime.toISOString().slice(0, 16).replace('T', ' ') };
    });
  } catch (e) {
    files = [];
  }
  const rows = files
    .map(f => '<tr><td><a href="/uploads/' + encodeURIComponent(f.name) + '">' + esc(f.name) + '</a></td><td>' + f.mtime + '</td><td>' + f.size + '</td></tr>')
    .join('');
  html(
    ctx.res,
    '<html><head><title>Index of /uploads/</title></head><body>\n' +
      '<h1>Index of /uploads/</h1>\n<hr>\n<pre>\n' +
      '<a href="../">../</a>\n' +
      (rows ? rows.replace(/<tr>/g, '').replace(/<\/tr>/g, '\n').replace(/<td>|<\/td>/g, '  ') : '') +
      '</pre>\n<hr><center>nginx/1.18.0 (Ubuntu)</center>\n</body></html>'
  );
}

/* ---------------- phpinfo ---------------- */
function phpinfo(ctx) {
  html(
    ctx.res,
    '<html><head><title>phpinfo()</title><style>' +
      'body{font:13px/1.6 Verdana,Arial,sans-serif;background:#fff;color:#000;padding:12px}' +
      'h1{font-size:20px;font-weight:600;margin:0 0 12px}' +
      'table{border-collapse:collapse;margin-bottom:16px;min-width:640px}' +
      'td,th{border:1px solid #9a9a9a;padding:4px 8px;font-size:12px;text-align:left}' +
      'th{background:#5a8fc7;color:#fff;font-weight:600}' +
      '.k{background:#eee;width:280px}' +
      '</style></head><body><h1>PHP Version 7.4.33</h1>' +
      '<table><tr><th colspan="2">System</th></tr>' +
      '<tr><td class="k">System</td><td>Linux cloudpix-web01 5.15.0-91-generic #101-Ubuntu SMP x86_64</td></tr>' +
      '<tr><td class="k">Server API</td><td>FPM/FastCGI</td></tr>' +
      '<tr><td class="k">Loaded Configuration File</td><td>/etc/php/7.4/fpm/php.ini</td></tr>' +
      '<tr><td class="k">DOCUMENT_ROOT</td><td>/var/www/html</td></tr>' +
      '<tr><td class="k">disable_functions</td><td>no value</td></tr>' +
      '<tr><td class="k">open_basedir</td><td>no value</td></tr>' +
      '<tr><td class="k">allow_url_fopen</td><td>On</td></tr>' +
      '<tr><td class="k">allow_url_include</td><td>Off</td></tr>' +
      '<tr><td class="k">upload_max_filesize</td><td>2M</td></tr>' +
      '<tr><td class="k">display_errors</td><td>On</td></tr>' +
      '</table>' +
      '<table><tr><th colspan="2">Environment</th></tr>' +
      '<tr><td class="k">DB_HOST</td><td>127.0.0.1</td></tr>' +
      '<tr><td class="k">APP_ENV</td><td>production</td></tr>' +
      '<tr><td class="k">APP_DEBUG</td><td>true</td></tr>' +
      '</table>' +
      '<table><tr><th colspan="2">Modules</th></tr>' +
      '<tr><td class="k">curl / mysqli / pdo_mysql / gd / fileinfo</td><td>enabled</td></tr>' +
      '</table></body></html>'
  );
}

/* ---------------- nginx 状态 ---------------- */
function serverStatus(ctx) {
  text(
    ctx.res,
    [
      'Active connections: 3',
      'server accepts handled requests',
      ' 1042 1042 3187',
      'Reading: 0 Writing: 1 Waiting: 2',
      ''
    ].join('\n')
  );
}

/* ---------------- 其他常见站点文件 ---------------- */
function wwwZip(ctx) {
  text(ctx.res, 'PK\u0003\u0004 (placeholder archive — 沙箱内不提供真实压缩包)', 'application/zip');
}

function sitemap(ctx) {
  text(
    ctx.res,
    '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      '  <url><loc>http://127.0.0.1:7788/lab</loc><priority>1.0</priority></url>\n' +
      '  <url><loc>http://127.0.0.1:7788/lab/guestbook</loc><priority>0.6</priority></url>\n' +
      '  <url><loc>http://127.0.0.1:7788/lab/upload</loc><priority>0.5</priority></url>\n' +
      '  <url><loc>http://127.0.0.1:7788/backup/</loc><priority>0.1</priority></url>\n' +
      '</urlset>\n',
    'application/xml'
  );
}

function crossdomain(ctx) {
  text(
    ctx.res,
    '<?xml version="1.0"?>\n<cross-domain-policy>\n  <allow-access-from domain="*" />\n</cross-domain-policy>\n',
    'application/xml'
  );
}

function apiIndex(ctx) {
  json(ctx.res, {
    name: 'CloudPix Portal API',
    version: '1.4.0',
    docs: '/api/',
    endpoints: [
      { method: 'GET', path: '/api/lab/orders/:id', auth: 'cookie', note: '订单详情' },
      { method: 'POST', path: '/api/lab/pay', auth: 'cookie', note: '发起支付' },
      { method: 'POST', path: '/api/lab/sms/send', auth: 'none', note: '发送验证码' },
      { method: 'POST', path: '/api/lab/sms/login', auth: 'none', note: '验证码登录' },
      { method: 'POST', path: '/api/lab/ssh/exec', auth: 'cookie', note: '在线终端' },
      { method: 'GET', path: '/api/state', auth: 'none', note: '靶场控制台接口（内部）' }
    ]
  });
}

function redirectTo(pathname) {
  return ctx => {
    ctx.res.writeHead(302, { Location: pathname });
    ctx.res.end();
  };
}

function favicon(ctx) {
  ctx.res.writeHead(200, { 'Content-Type': 'image/svg+xml', 'Cache-Control': 'public, max-age=86400' });
  ctx.res.end('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="8" fill="#2563eb"/><circle cx="16" cy="16" r="6" fill="#fff"/></svg>');
}

const routes = [
  { method: 'GET', path: '/.git/HEAD', handler: gitHead },
  { method: 'GET', path: '/.git/config', handler: gitConfig },
  { method: 'GET', path: '/.git/refs/heads/main', handler: gitRef },
  { method: 'GET', path: '/.git/logs/HEAD', handler: gitLog },
  { method: 'GET', path: '/.env', handler: envFile },
  { method: 'GET', path: '/config.php.bak', handler: configBackup },
  { method: 'GET', path: '/search.php.bak', handler: searchBackup },
  { method: 'GET', path: '/phpinfo.php', handler: phpinfo },
  { method: 'GET', path: '/server-status', handler: serverStatus },
  { method: 'GET', path: '/www.zip', handler: wwwZip },
  { method: 'GET', path: '/uploads/', handler: uploadsIndex },
  { method: 'GET', path: '/uploads', handler: redirectTo('/uploads/') },
  { method: 'GET', path: '/sitemap.xml', handler: sitemap },
  { method: 'GET', path: '/crossdomain.xml', handler: crossdomain },
  { method: 'GET', path: '/api/', handler: apiIndex },
  { method: 'GET', path: '/api', handler: apiIndex },
  { method: 'GET', path: '/.well-known/security.txt', handler: ctx =>
      text(ctx.res, 'Contact: mailto:security@cloudpix.local\nExpires: 2027-12-31T00:00:00Z\n') },
  { method: 'GET', path: '/admin', handler: redirectTo('/lab/admin') },
  { method: 'GET', path: '/login', handler: redirectTo('/lab/login') },
  { method: 'GET', path: '/favicon.ico', handler: favicon }
];

module.exports = { routes };
