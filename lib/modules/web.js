'use strict';
/** Web 漏洞类靶标：SQL 注入 / 存储型 XSS / 文件上传 / 命令注入 / SSRF */
const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const store = require('../store');
const flags = require('../flags');
const vfs = require('../vfs');
const sessions = require('../sessions');
const { searchProducts, PRODUCTS } = require('../sql-engine');
const { CHALLENGES } = require('../challenges');
const template = require('../template');
const { html, json, esc, parseForm, parseMultipart, readBody } = require('../http-util');
const pages = require('../../views/pages');

function now() {
  const d = new Date();
  const p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes()) + ':' + p(d.getSeconds());
}

const DANGEROUS = /<script|onerror\s*=|onload\s*=|onfocus\s*=|javascript:|<svg|onmouseover\s*=/i;

function botVisit(entry) {
  const s = store.get();
  const flag = flags.get('web-xss');
  const cookie = 'lab_admin=1; role=admin; note=' + flag;
  const target = (entry.content.match(/(?:fetch|src|href|location)[^\n]{0,80}?(https?:\/\/[^\s'"]+|\/[a-z0-9_\-/?=&.%]*collect[a-z0-9_\-/?=&.%]*)/i) || [])[1] || '/lab/collect';
  s.xssLogs.unshift({
    id: Date.now(),
    from: 'admin-bot (10.0.8.24)',
    at: now(),
    data:
      'GET ' + target + ' HTTP/1.1\n' +
      'Host: 127.0.0.1:7788\n' +
      'Referer: http://127.0.0.1:7788/lab/guestbook\n' +
      'User-Agent: Mozilla/5.0 (CloudPix Admin Console)\n' +
      'Cookie: ' + cookie
  });
  s.xssLogs = s.xssLogs.slice(0, 20);
  store.save();
}

/* ---------------- 首页 / 搜索 / 详情 ---------------- */
function home(ctx) {
  html(ctx.res, pages.home(sessions.get(ctx.req, ctx.res)));
}

function search(ctx) {
  const q = ctx.query.get('q') || '';
  const result = searchProducts(q);
  if (result.ok) {
    // 把 @@FLAG:xxx@@ 占位符替换成真实 flag（模拟库里的真实数据）
    result.rows = result.rows.map(r =>
      Array.isArray(r) ? r.map(v => (typeof v === 'string' ? flags.resolve(v) : v)) : Object.assign({}, r, { description: flags.resolve(r.description) })
    );
  }
  html(ctx.res, pages.searchPage({ q, result, session: sessions.get(ctx.req, ctx.res) }));
}

function product(ctx) {
  const p = PRODUCTS.find(x => String(x.id) === String(ctx.params.id));
  const session = sessions.get(ctx.req, ctx.res);
  if (!p || p.hidden) {
    return html(
      ctx.res,
      html404('商品不存在', '该商品已下架或不在你的可见范围内。'),
      404
    );
  }
  html(ctx.res, pages.productPage(p, session));
}

/* ---------------- 留言板 ---------------- */
function guestbookGet(ctx) {
  const s = store.get();
  html(
    ctx.res,
    pages.guestbookPage({
      entries: s.guestbook.slice().reverse(),
      session: sessions.get(ctx.req, ctx.res),
      msg: ctx.query.get('ok') ? '留言已发布，管理员会尽快查看。' : ''
    })
  );
}

async function guestbookPost(ctx) {
  const form = parseForm(ctx.body || Buffer.alloc(0));
  const s = store.get();
  const entry = {
    id: Date.now(),
    author: String(form.author || '匿名').slice(0, 40),
    content: String(form.content || '').slice(0, 2000),
    at: now()
  };
  s.guestbook.push(entry);
  store.save();

  if (DANGEROUS.test(entry.content)) {
    // 模拟管理员 Bot 在 300ms 后打开页面
    setTimeout(() => {
      try { botVisit(entry); } catch (e) { /* 忽略 */ }
    }, 300);
  }
  ctx.res.writeHead(302, { Location: '/lab/guestbook?ok=1' });
  ctx.res.end();
}

function collect(ctx) {
  // 攻击者接收端：记录外带数据（真实外带由 Bot 模拟写入）
  const s = store.get();
  const c = ctx.query.get('c');
  if (c) {
    s.xssLogs.unshift({ id: Date.now(), from: 'external', at: now(), data: 'GET /lab/collect?c=' + c });
    s.xssLogs = s.xssLogs.slice(0, 20);
    store.save();
  }
  html(ctx.res, pages.collectPage({ logs: s.xssLogs, session: sessions.get(ctx.req, ctx.res) }));
}

/* ---------------- 文件上传 ---------------- */
function uploadGet(ctx) {
  const session = sessions.get(ctx.req, ctx.res);
  html(ctx.res, pages.uploadPage({ session, files: session.uploads || [] }));
}

async function uploadPost(ctx) {
  const session = sessions.get(ctx.req, ctx.res);
  const ct = ctx.req.headers['content-type'] || '';
  const m = ct.match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  const boundary = m ? (m[1] || m[2] || '').trim() : '';
  const parsed = parseMultipart(ctx.body || Buffer.alloc(0), boundary);
  const file = parsed.files[0];

  if (!file || !file.filename) {
    return html(ctx.res, pages.uploadPage({ session, msg: '没有收到文件', ok: false, files: session.uploads || [] }));
  }

  // 漏洞点：只校验 Content-Type，不校验扩展名与文件内容
  if (!/^image\//i.test(file.contentType)) {
    return html(ctx.res, pages.uploadPage({ session, msg: '文件类型不允许：' + esc(file.contentType), ok: false, files: session.uploads || [] }));
  }

  const name = path.basename(file.filename).replace(/[\\/:*?"<>|]/g, '_');
  fs.mkdirSync(store.UPLOAD_DIR, { recursive: true });
  fs.writeFileSync(path.join(store.UPLOAD_DIR, name), file.data);

  session.uploads = session.uploads || [];
  session.uploads.unshift({ name, type: file.contentType, size: file.data.length });
  html(
    ctx.res,
    pages.uploadPage({
      session,
      msg: '上传成功：<span class="mono">' + esc(name) + '</span>（' + file.data.length + ' 字节）',
      files: session.uploads
    })
  );
}

function serveUpload(ctx) {
  const name = path.basename(ctx.params.name || '');
  if (!name) return html(ctx.res, html404('文件不存在', '请先上传文件。'), 404);
  const full = path.join(store.UPLOAD_DIR, name);
  if (!fs.existsSync(full)) return html(ctx.res, html404('文件不存在', '请先上传文件。'), 404);

  const ext = path.extname(name).toLowerCase();
  if (['.php', '.phtml', '.jsp', '.asp', '.aspx', '.sh', '.py'].includes(ext)) {
    const body =
      '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + esc(name) + '</title>' +
      '<style>body{background:#0b0f17;color:#d1d5db;font:13px/1.7 Consolas,monospace;padding:28px}' +
      'h1{font-size:15px;color:#4ade80;font-weight:600}pre{white-space:pre-wrap}</style></head><body>' +
      '<h1>php-fpm 已执行 ' + esc(name) + '</h1><pre>' +
      esc(
        'uid=33(www-data) gid=33(www-data) groups=33(www-data)\n' +
          'CloudPix upload handler v1.2\n' +
          '---------------------------------------\n' +
          '脚本执行成功，说明该文件被服务器当作可执行代码解析。\n\n' +
          flags.get('web-upload') + '\n' +
          '---------------------------------------'
      ) +
      '</pre></body></html>';
    return html(ctx.res, body);
  }

  const buf = fs.readFileSync(full);
  ctx.res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': buf.length, 'Content-Disposition': 'inline; filename="' + encodeURIComponent(name) + '"' });
  ctx.res.end(buf);
}

/* ---------------- 运维工具：命令注入 ---------------- */
function tools(ctx) {
  const ip = ctx.query.get('ip');
  const session = sessions.get(ctx.req, ctx.res);
  let output = '';
  if (ip !== null) {
    const r = vfs.exec('ping -c 4 ' + ip, vfs.makeSession('www-data', '/var/www/html'));
    output = r.output.join('\n');
  }
  html(ctx.res, pages.toolsPage({ session, ip: ip || '', output }));
}

/* ---------------- 图片代理：SSRF（服务端真实发起请求） ---------------- */
/**
 * 说明：内网地址会真的由服务端发起一次 HTTP(S) 请求（走 Node 的 socket），
 * 因此在服务端日志、抓包工具里都能看到这次请求；外网地址被沙箱拦截。
 * 设置环境变量 RANGE_UPSTREAM_PROXY=http://127.0.0.1:8080 后，
 * 服务端请求会经过该代理发出，便于在 Burp 里直接观察 SSRF 流量。
 */
function metadataResponse(urlStr, pathname) {
  if (pathname.indexOf('/latest/meta-data/iam/security-credentials') === 0) {
    return JSON.stringify(
      { Code: 'Success', AccessKeyId: 'AKIDcloudpixdemo', SecretAccessKey: 'sandbox', Token: 'demo', Expiration: '2026-11-27T10:00:00Z' },
      null,
      2
    );
  }
  return (
    'ami-id\nami-launch-index\nhostname\ninstance-id\nlocal-ipv4\nplacement/availability-zone\n' +
    'x-internal-service: 127.0.0.1:' + (process.env.PORT || 7788) + '/internal/flag'
  );
}

function serverFetch(urlStr) {
  return new Promise(resolve => {
    let u;
    try {
      u = new URL(urlStr);
    } catch (e) {
      return resolve({ status: 400, target: urlStr, body: 'invalid url' });
    }

    // 云元数据地址无法在本机绑定，用固定数据模拟
    if (u.hostname === '169.254.169.254') {
      return resolve({ status: 200, target: urlStr, body: metadataResponse(urlStr, u.pathname) });
    }

    const isLocal = /^127\./.test(u.hostname) || ['localhost', '::1', '0.0.0.0', '[::1]'].includes(u.hostname);
    if (!isLocal) {
      return resolve({
        status: 403,
        target: urlStr,
        body: '请求被沙箱拦截：靶场不提供真实外网出口，请尝试内网地址（如 127.0.0.1）。'
      });
    }

    const isHttps = u.protocol === 'https:';
    const port = u.port || (isHttps ? 443 : 80);
    const pathWithQuery = u.pathname + (u.search || '');
    const upstream = process.env.RANGE_UPSTREAM_PROXY || '';
    const baseHeaders = {
      'User-Agent': 'cloudpix-image-proxy/1.2 (+node)',
      Accept: '*/*',
      'X-Internal-Proxy': '1',
      Connection: 'close'
    };

    const finish = (status, body) => resolve({ status, body, target: urlStr });
    const onErr = e => finish(502, '上游请求失败：' + (e && e.message ? e.message : e));

    let req;
    try {
      if (upstream && !isHttps) {
        // 经上游代理发出（Burp / mitmproxy 可直接看到这条服务端请求）
        const p = new URL(upstream);
        req = http.request(
          {
            hostname: p.hostname,
            port: p.port || 8080,
            method: 'GET',
            path: urlStr,
            headers: Object.assign({ Host: u.host }, baseHeaders),
            timeout: 5000
          },
          handleResponse
        );
      } else {
        const mod = isHttps ? https : http;
        req = mod.request(
          {
            hostname: u.hostname,
            port,
            method: 'GET',
            path: pathWithQuery,
            headers: baseHeaders,
            rejectUnauthorized: false, // 自签证书也放行，方便演示
            timeout: 5000
          },
          handleResponse
        );
      }
    } catch (e) {
      return onErr(e);
    }

    function handleResponse(resp) {
      const chunks = [];
      resp.on('data', c => chunks.push(c));
      resp.on('end', () => {
        let body = Buffer.concat(chunks).toString('utf8');
        if (body.length > 6000) body = body.slice(0, 6000) + '\n…(内容过长已截断)';
        finish(resp.statusCode, body);
      });
    }

    req.on('timeout', () => req.destroy(new Error('请求超时 5s')));
    req.on('error', onErr);
    req.end();
  });
}

async function proxy(ctx) {
  const url = ctx.query.get('url');
  const session = sessions.get(ctx.req, ctx.res);
  let result = null;
  if (url) {
    const r = await serverFetch(url.trim());
    result = { status: r.status, body: r.body, target: r.target };
  }
  html(ctx.res, pages.proxyPage({ session, url: url || '', result }));
}

function internalFlag(ctx) {
  // 直接访问被拒绝，只有服务端内部请求（经代理）才有权访问
  const ua = ctx.req.headers['user-agent'] || '';
  const viaProxy = ctx.req.headers['x-internal-proxy'] === '1';
  if (viaProxy || /internal-client/i.test(ua)) {
    return json(ctx.res, { code: 0, service: 'internal-flag-api', data: flags.get('web-ssrf') });
  }
  html(
    ctx.res,
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>403</title><style>body{background:#0b0f17;color:#94a3b8;font:14px/1.8 Consolas,monospace;padding:40px}h1{color:#ef4444;font-size:16px}</style></head><body><h1>403 Forbidden</h1><pre>internal endpoint — 仅允许内网服务访问\n来源地址：127.0.0.1（外网直连被拒绝）</pre></body></html>',
    403
  );
}

/* ---------------- 报表中心：SSTI ---------------- */
function report(ctx) {
  const name = ctx.query.get('name');
  const session = sessions.get(ctx.req, ctx.res);
  let rendered;
  if (name !== null) {
    rendered = template.render(name, {
      name: '月度销售报表',
      site: 'CloudPix 云图科技',
      user: session.user ? session.user.username : 'guest',
      env: { APP_ENV: 'production' },
      flag: flags.get('web-ssti')
    });
  }
  html(ctx.res, pages.reportPage({ session, name: name || '', rendered: rendered === undefined ? undefined : esc(rendered) }));
}

/* ---------------- 盲注接口：只回数量 ---------------- */
function blind(ctx) {
  const q = ctx.query.get('q');
  const session = sessions.get(ctx.req, ctx.res);
  let count = 0;
  let failed = false;
  if (q) {
    const r = searchProducts(q);
    if (!r.ok) failed = true;
    else count = r.rows.length;
  }
  html(ctx.res, pages.blindPage({ session, q: q || '', count, failed }));
}

/* ---------------- 终局 ---------------- */
function finalPage(ctx) {
  const s = store.get();
  const solved = s.solves.map(x => x.challengeId);
  const unlocked = flags.finalUnlocked(solved);
  const total = CHALLENGES.filter(c => c.id !== 'final').length;
  const done = solved.filter(id => id !== 'final').length;
  html(
    ctx.res,
    pages.finalPage({
      session: sessions.get(ctx.req, ctx.res),
      unlocked,
      flag: unlocked ? flags.get('final') : '',
      solved: Math.min(done, total),
      total
    })
  );
}

function html404(title, msg) {
  return (
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + title + '</title>' +
    '<style>body{font:15px/1.7 "Microsoft YaHei",system-ui;background:#f5f6f8;color:#0f172a;display:grid;place-items:center;height:100vh;margin:0}' +
    '.box{background:#fff;border:1px solid #e6e8ee;border-radius:16px;padding:36px 44px;text-align:center;box-shadow:0 12px 40px rgba(15,23,42,.08)}' +
    'h1{font-size:20px;margin:0 0 8px}p{color:#64748b;margin:0 0 18px;font-size:13px}a{color:#2563eb;font-size:13px}</style></head>' +
    '<body><div class="box"><h1>' + title + '</h1><p>' + msg + '</p><a href="/lab">返回商城首页</a></div></body></html>'
  );
}

const routes = [
  { method: 'GET', path: '/lab', handler: home },
  { method: 'GET', path: '/lab/search', handler: search },
  { method: 'GET', path: '/lab/product/:id', handler: product },
  { method: 'GET', path: '/lab/guestbook', handler: guestbookGet },
  { method: 'POST', path: '/lab/guestbook', handler: guestbookPost },
  { method: 'GET', path: '/lab/collect', handler: collect },
  { method: 'GET', path: '/lab/upload', handler: uploadGet },
  { method: 'POST', path: '/lab/upload', handler: uploadPost },
  { method: 'GET', path: '/uploads/:name', handler: serveUpload },
  { method: 'GET', path: '/lab/tools', handler: tools },
  { method: 'GET', path: '/lab/report', handler: report },
  { method: 'GET', path: '/lab/search/blind', handler: blind },
  { method: 'GET', path: '/lab/proxy', handler: proxy },
  { method: 'GET', path: '/internal/flag', handler: internalFlag },
  { method: 'GET', path: '/lab/final', handler: finalPage }
];

module.exports = { routes, html404 };
