'use strict';
/**
 * 极简 JWT 实现（JWT 伪造靶标）
 * 刻意保留两个真实世界常见缺陷：
 *   1. HS256 密钥极短，可离线爆破
 *   2. 服务端接受 alg=none，且不校验签名
 */
const crypto = require('crypto');

const WEAK_SECRET = 'cloudpix';

function b64u(input) {
  return Buffer.from(input).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function unb64u(str) {
  const s = String(str).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(s, 'base64').toString('utf8');
}

function sign(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64u(JSON.stringify(header));
  const p = b64u(JSON.stringify(payload));
  const sig = b64u(crypto.createHmac('sha256', secret || WEAK_SECRET).update(h + '.' + p).digest());
  return h + '.' + p + '.' + sig;
}

/**
 * 校验令牌
 * @returns {{ok:boolean, payload?:object, header?:object, reason?:string, alg?:string}}
 */
function verify(token) {
  const parts = String(token || '').trim().split('.');
  if (parts.length < 2) return { ok: false, reason: '令牌格式错误' };

  let header = {};
  let payload = {};
  try {
    header = JSON.parse(unb64u(parts[0]));
    payload = JSON.parse(unb64u(parts[1]));
  } catch (e) {
    return { ok: false, reason: '令牌解析失败' };
  }

  // 缺陷一：alg=none 直接放行
  if (String(header.alg || '').toLowerCase() === 'none') {
    return { ok: true, payload, header, alg: 'none' };
  }

  if (String(header.alg).toUpperCase() !== 'HS256') {
    return { ok: false, reason: '不支持的签名算法' };
  }

  const expect = b64u(crypto.createHmac('sha256', WEAK_SECRET).update(parts[0] + '.' + parts[1]).digest());
  // 缺陷二：签名比较用的是长度不敏感的字符串比较（可被逐位猜，这里只做演示）
  if (expect !== parts[2]) return { ok: false, reason: '签名校验失败' };

  return { ok: true, payload, header, alg: 'HS256' };
}

module.exports = { sign, verify, WEAK_SECRET };
