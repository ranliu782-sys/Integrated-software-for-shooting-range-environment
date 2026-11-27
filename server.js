'use strict';
/**
 * 云图科技一体化靶场
 * - 零第三方依赖，只用 Node 内置模块
 * - 数据全部落本地 data/*.json，不使用任何数据库
 * - 三套真实监听：HTTP(7788) / HTTPS(7789) / SSH 风格终端(2222)
 */
const http = require('http');
const https = require('https');
const path = require('path');
const crypto = require('crypto');

const store = require('./lib/store');
const flags = require('./lib/flags');
const assets = require('./lib/assets');
const { match } = require('./lib/router');
const { readBody, mimeOf, html } = require('./lib/http-util');

const web = require('./lib/modules/web');
const biz = require('./lib/modules/biz');
const host = require('./lib/modules/host');
const surface = require('./lib/modules/surface');
const consoleApi = require('./lib/modules/console-api');
const sshService = require('./lib/ssh-service');

const PORT = Number(process.env.PORT || 7788);
const TLS_PORT = Number(process.env.TLS_PORT || 7789);
const SSH_PORT = Number(process.env.SSH_PORT || 2222);
const HOST = process.env.HOST || '127.0.0.1';

// 扫描面优先：/uploads/ 需要命中目录列表，而不是被 /uploads/:name 吃掉
const ROUTES = [].concat(surface.routes, web.routes, biz.routes, host.routes, consoleApi.routes);

/** 统一响应头：伪装成一个跑在 nginx 上的 PHP 站点；安全头故意缺失，扫描器会报 */
function decorate(req, res) {
  res.setHeader('Server', 'nginx/1.18.0 (Ubuntu)');
  res.setHeader('X-Powered-By', 'PHP/7.4.33');
  res.setHeader('X-Request-Id', crypto.randomBytes(6).toString('hex'));
  res.setHeader('X-Backend', 'cloudpix-web01');
}

function serveStatic(res, relPath) {
  const safe = path.normalize(relPath).replace(/^(\.\.[\\/])+/, '');
  const buf = assets.read('public/' + safe.split(path.sep).join('/'));
  if (!buf) return false;
  res.writeHead(200, { 'Content-Type': mimeOf(path.extname(safe)), 'Content-Length': buf.length, 'Cache-Control': 'no-cache' });
  res.end(buf);
  return true;
}

function notFound(res, pathname) {
  html(
    res,
    '<html><head><title>404 Not Found</title></head><body>\n' +
      '<center><h1>404 Not Found</h1></center>\n' +
      '<hr><center>nginx/1.18.0 (Ubuntu)</center>\n' +
      '</body></html>',
    404
  );
}

async function handle(req, res) {
  const started = Date.now();
  let pathname = '/';
  try {
    const u = new URL(req.url, 'http://' + (req.headers.host || 'localhost'));
    pathname = decodeURIComponent(u.pathname);

    decorate(req, res);

    if (pathname.startsWith('/assets/')) {
      if (serveStatic(res, pathname.slice('/assets/'.length))) return;
      return notFound(res, pathname);
    }

    if (pathname === '/' || pathname === '/index.html') {
      if (serveStatic(res, 'index.html')) return;
      return notFound(res, pathname);
    }

    for (const r of ROUTES) {
      if (r.method !== req.method) continue;
      const params = match(r.path, pathname);
      if (!params) continue;

      let body = null;
      if (req.method === 'POST' || req.method === 'PUT') body = await readBody(req);
      await r.handler({ req, res, url: u, query: u.searchParams, params, body });

      if (process.env.RANGE_LOG !== '0') {
        const who = req.socket.remoteAddress || '-';
        console.log(
          '  ' + who + '  ' + req.method + ' ' + pathname + '  ' + res.statusCode + '  ' + (Date.now() - started) + 'ms'
        );
      }
      return;
    }

    return notFound(res, pathname);
  } catch (e) {
    console.error('[error]', pathname, e);
    if (!res.headersSent) {
      res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body><h1>500 Internal Server Error</h1></body></html>');
    } else {
      res.end();
    }
  }
}

const httpServer = http.createServer(handle);
let httpsServer = null;

const keyBuf = assets.read('certs/server.key');
const crtBuf = assets.read('certs/server.crt');
if (keyBuf && crtBuf) {
  httpsServer = https.createServer({ key: keyBuf, cert: crtBuf }, handle);
}

store.load();
const f = flags.ensureFlags();

const line = '='.repeat(62);

httpServer.listen(PORT, HOST, () => {
  console.log('');
  console.log(line);
  console.log('  云图科技 · 一体化靶场 v1.1');
  console.log(line);
  console.log('  攻击控制台     http://' + HOST + ':' + PORT + '/');
  console.log('  目标站 HTTP    http://' + HOST + ':' + PORT + '/lab');
  console.log('  目标站 HTTPS   https://' + HOST + ':' + TLS_PORT + '/lab   (自签证书)');
  console.log('  主机终端       ssh 风格的 ' + HOST + ':' + SSH_PORT + '（nc 可直接连）');
  console.log('  本地数据       ' + store.STATE_FILE);
  console.log('  关卡数量       ' + Object.keys(f).length + ' 个（含终局）');
  console.log(line);
  console.log('  Burp / 抓包：浏览器代理设为 127.0.0.1:8080 即可');
  console.log('  端口扫描：nmap -sV -p 7788,7789,2222 ' + HOST);
  console.log(line);
});

if (httpsServer) {
  httpsServer.listen(TLS_PORT, HOST, () => {
    console.log('  [https] 已就绪 ' + TLS_PORT);
  });
}

try {
  sshService.start(SSH_PORT, HOST);
} catch (e) {
  console.error('  [ssh] 端口占用，已跳过：', e.message);
}

process.on('SIGINT', () => {
  console.log('\n靶场已停止，进度已保存在 data/state.json');
  process.exit(0);
});
