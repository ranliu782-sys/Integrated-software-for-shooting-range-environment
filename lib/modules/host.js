'use strict';
/** 主机渗透类靶标：信息泄露 / 弱口令登录 / SUID 提权 */
const flags = require('../flags');
const vfs = require('../vfs');
const sessions = require('../sessions');
const { html, json, send, parseForm, parseJSON, esc } = require('../http-util');
const pages = require('../../views/pages');

const SSH_ACCOUNTS = {
  ops: { pass: 'Cloud@2024', home: '/home/ops' }
};

/* ---------------- robots.txt ---------------- */
function robots(ctx) {
  send(
    ctx.res,
    200,
    [
      'User-agent: *',
      'Disallow: /backup/',
      'Disallow: /lab/admin',
      'Disallow: /lab/tools',
      'Disallow: /api/',
      '',
      '# 生产环境禁止收录备份目录'
    ].join('\n'),
    { 'Content-Type': 'text/plain; charset=utf-8' }
  );
}

/* ---------------- 备份目录 ---------------- */
function backupIndex(ctx) {
  const files = [
    { name: 'db.sql', size: '1.2M', date: '2026-11-20 03:00' },
    { name: 'www.tar.gz', size: '86M', date: '2026-11-20 03:00' },
    { name: 'nginx.conf.bak', size: '4.1K', date: '2026-11-18 22:41' }
  ];
  const rows = files
    .map(f => '<tr><td><a href="/backup/' + f.name + '">' + f.name + '</a></td><td>' + f.date + '</td><td>' + f.size + '</td></tr>')
    .join('');
  const body =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Index of /backup/</title>' +
    '<style>body{font:14px/1.6 Consolas,monospace;background:#fff;color:#111;padding:24px}' +
    'h1{font-size:16px;font-weight:600;border-bottom:1px solid #ddd;padding-bottom:10px}' +
    'table{border-collapse:collapse;width:100%;max-width:760px}td,th{text-align:left;padding:6px 10px;font-size:13px}' +
    'a{color:#0366d6;text-decoration:none}a:hover{text-decoration:underline}</style></head><body>' +
    '<h1>Index of /backup/</h1><table><thead><tr><th>Name</th><th>Last modified</th><th>Size</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table></body></html>';
  html(ctx.res, body);
}

/* ---------------- db.sql ---------------- */
function backupSql(ctx) {
  const sql = [
    '-- CloudPix production dump',
    '-- generated: 2026-11-20 03:00:12 by ops@cloudpix-web01',
    '-- ！！！ 该文件包含敏感信息，禁止外传 ！！！',
    '',
    'CREATE TABLE `sys_user` (',
    '  `id` int(11) NOT NULL AUTO_INCREMENT,',
    '  `username` varchar(32) NOT NULL,',
    '  `password` varchar(64) NOT NULL,',
    '  `uid` int(11) DEFAULT NULL,',
    '  `role` varchar(16) DEFAULT NULL,',
    '  PRIMARY KEY (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
    '',
    'INSERT INTO `sys_user` VALUES (1,\'root\',\'$6$Yq2mZ0pL$3fD9...\',0,\'admin\');',
    'INSERT INTO `sys_user` VALUES (2,\'ops\',\'Cloud@2024\',1000,\'ops\');',
    'INSERT INTO `sys_user` VALUES (3,\'www-data\',\'!\',33,\'service\');',
    '',
    'CREATE TABLE `audit_log` (',
    '  `id` int(11) NOT NULL AUTO_INCREMENT,',
    '  `action` varchar(128) DEFAULT NULL,',
    '  `note` text,',
    '  PRIMARY KEY (`id`)',
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;',
    '',
    'INSERT INTO `audit_log` VALUES (1,\'export_backup\',\'导出人: ops，审批单: OPS-20261120-01\');',
    'INSERT INTO `audit_log` VALUES (2,\'rotate_key\',\'轮换失败，旧密钥仍在用\');',
    'INSERT INTO `audit_log` VALUES (3,\'incident\',\'备份目录权限配置错误，已临时标记：@@FLAG:host-leak@@\');',
    '',
    '-- dump completed: 2026-11-20 03:00:48'
  ].join('\n');
  send(ctx.res, 200, flags.resolve(sql), { 'Content-Type': 'text/plain; charset=utf-8' });
}

/* ---------------- SSH 门户 ---------------- */
function sshPage(ctx) {
  const session = sessions.get(ctx.req, ctx.res);
  html(
    ctx.res,
    pages.sshPage({
      session,
      ssh: session.ssh,
      user: ctx.query.get('user') || '',
      msg: ctx.query.get('err') ? '用户名或密码错误' : ''
    })
  );
}

function sshLogin(ctx) {
  const form = parseForm(ctx.body || Buffer.alloc(0));
  const session = sessions.get(ctx.req, ctx.res);
  const user = String(form.user || '').trim();
  const pass = String(form.pass || '');
  const acc = SSH_ACCOUNTS[user];

  if (!acc || acc.pass !== pass) {
    ctx.res.writeHead(302, { Location: '/lab/ssh?err=1&user=' + encodeURIComponent(user) });
    return ctx.res.end();
  }
  session.ssh = { user, cwd: acc.home };
  ctx.res.writeHead(302, { Location: '/lab/ssh' });
  ctx.res.end();
}

function sshLogout(ctx) {
  const session = sessions.get(ctx.req, ctx.res);
  session.ssh = null;
  ctx.res.writeHead(302, { Location: '/lab/ssh' });
  ctx.res.end();
}

function sshExec(ctx) {
  const body = parseJSON(ctx.body || Buffer.alloc(0));
  const session = sessions.get(ctx.req, ctx.res);
  if (!session.ssh) return json(ctx.res, { needLogin: true, output: ['请先登录'] });

  const cmd = String(body.cmd || '');
  const r = vfs.exec(cmd, vfs.makeSession(session.ssh.user, session.ssh.cwd));
  session.ssh.cwd = r.session.cwd;
  return json(ctx.res, {
    output: r.output,
    cwd: r.session.cwd,
    cleared: r.cleared,
    exited: r.exited
  });
}

const routes = [
  { method: 'GET', path: '/robots.txt', handler: robots },
  { method: 'GET', path: '/backup/', handler: backupIndex },
  { method: 'GET', path: '/backup', handler: backupIndex },
  { method: 'GET', path: '/backup/db.sql', handler: backupSql },
  { method: 'GET', path: '/lab/ssh', handler: sshPage },
  { method: 'POST', path: '/lab/ssh/login', handler: sshLogin },
  { method: 'GET', path: '/lab/ssh/logout', handler: sshLogout },
  { method: 'POST', path: '/api/lab/ssh/exec', handler: sshExec }
];

module.exports = { routes };
