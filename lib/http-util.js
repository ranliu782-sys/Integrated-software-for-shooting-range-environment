'use strict';
/** HTTP 基础工具：Cookie、请求体、响应、multipart 解析 */

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.sql': 'text/plain; charset=utf-8'
};

function mimeOf(ext) {
  return MIME[ext.toLowerCase()] || 'application/octet-stream';
}

function cookies(req) {
  const raw = req.headers.cookie || '';
  const out = {};
  raw.split(';').forEach(kv => {
    const i = kv.indexOf('=');
    if (i > 0) out[kv.slice(0, i).trim()] = decodeURIComponent(kv.slice(i + 1).trim());
  });
  return out;
}

function readBody(req, limit = 8 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if (size > limit) {
        reject(new Error('payload too large'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function parseForm(buf) {
  const out = {};
  const s = buf.toString('utf8');
  if (!s) return out;
  for (const pair of s.split('&')) {
    if (!pair) continue;
    const i = pair.indexOf('=');
    const k = i === -1 ? pair : pair.slice(0, i);
    const v = i === -1 ? '' : pair.slice(i + 1);
    out[decodeURIComponent(k.replace(/\+/g, ' '))] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  return out;
}

function parseJSON(buf) {
  try {
    return JSON.parse(buf.toString('utf8') || '{}');
  } catch (e) {
    return {};
  }
}

/** 手写 multipart/form-data 解析（不依赖第三方库） */
function parseMultipart(buf, boundary) {
  const result = { fields: {}, files: [] };
  if (!boundary) return result;
  const delim = Buffer.from('--' + boundary);
  let idx = buf.indexOf(delim);
  while (idx !== -1) {
    let start = idx + delim.length;
    if (buf.slice(start, start + 2).toString() === '--') break;
    if (buf.slice(start, start + 2).toString() === '\r\n') start += 2;
    const next = buf.indexOf(delim, start);
    let part = buf.slice(start, next === -1 ? buf.length : next);
    if (part.slice(-2).toString() === '\r\n') part = part.slice(0, -2);
    const hEnd = part.indexOf('\r\n\r\n');
    if (hEnd !== -1) {
      const head = part.slice(0, hEnd).toString('utf8');
      const content = part.slice(hEnd + 4);
      const nameM = head.match(/name="([^"]*)"/i);
      const fileM = head.match(/filename="([^"]*)"/i);
      const typeM = head.match(/content-type:\s*([^\r\n]+)/i);
      const name = nameM ? nameM[1] : '';
      if (fileM) {
        result.files.push({
          field: name,
          filename: fileM[1],
          contentType: typeM ? typeM[1].trim() : 'application/octet-stream',
          data: content
        });
      } else {
        result.fields[name] = content.toString('utf8');
      }
    }
    idx = next;
  }
  return result;
}

function send(res, status, body, headers = {}) {
  const buf = Buffer.isBuffer(body) ? body : Buffer.from(String(body), 'utf8');
  res.writeHead(status, Object.assign({ 'Content-Length': buf.length }, headers));
  res.end(buf);
}

function html(res, body, status = 200, headers = {}) {
  send(res, status, body, Object.assign({ 'Content-Type': 'text/html; charset=utf-8' }, headers));
}

function json(res, obj, status = 200) {
  send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8' });
}

function redirect(res, location, headers = {}) {
  send(res, 302, '', Object.assign({ Location: location }, headers));
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = {
  MIME,
  mimeOf,
  cookies,
  readBody,
  parseForm,
  parseJSON,
  parseMultipart,
  send,
  html,
  json,
  redirect,
  esc
};
