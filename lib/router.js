'use strict';
/** 极简路由匹配：支持 :param 与 * 通配 */

function match(pattern, pathname) {
  if (pattern === '*') return {};
  const p = pattern.split('/');
  const s = pathname.split('/');
  if (p[p.length - 1] === '*') {
    if (s.length < p.length) return null;
  } else if (p.length !== s.length) {
    return null;
  }
  const params = {};
  for (let i = 0; i < p.length; i++) {
    const seg = p[i];
    if (seg === '*') return params;
    if (seg.startsWith(':')) {
      params[seg.slice(1)] = decodeURIComponent(s[i] || '');
    } else if (seg !== s[i]) {
      return null;
    }
  }
  return params;
}

module.exports = { match };
