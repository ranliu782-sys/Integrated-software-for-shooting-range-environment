'use strict';
/**
 * 迷你 SQL 引擎
 * 目的：让靶场里的 SQL 注入「真的」能被注入，payload 由词法分析 + 表达式求值驱动，
 * 而不是靠关键字匹配假装通过。支持的语法子集：
 *   WHERE 条件：<列|字面量> (= != <> > < >= <= LIKE) <列|字面量>，AND / OR / 括号
 *   注释截断：-- 与 #
 *   联合查询：UNION SELECT <投影> [FROM <表>]
 */

const PRODUCTS = [
  { id: 1, name: '云图 智能摄像头 Pro', short: '摄像', price: 399, description: '400 万像素，全彩夜视，AI 人形侦测。', hidden: 0 },
  { id: 2, name: '云图 智能门锁 S2', short: '门锁', price: 1299, description: '指纹 + 密码 + NFC 三合一，支持远程授权。', hidden: 0 },
  { id: 3, name: '云图 可视门铃', short: '门铃', price: 599, description: '2K 超广角，双向对讲，本地存储。', hidden: 0 },
  { id: 4, name: '云图 智能网关 Mini', short: '网关', price: 249, description: '支持 Zigbee 3.0 与 Matter 协议。', hidden: 0 },
  { id: 5, name: '云图 工业级 NVR 8 路', short: 'NVR', price: 2380, description: '8 盘位，支持 H.265 智能编码。', hidden: 0 },
  { id: 6, name: '云图 太阳能户外摄像机', short: '太阳能', price: 899, description: '内置 10000mAh 电池，IP66 防水。', hidden: 0 },
  { id: 7, name: '云图 云存储年包 1TB', short: '云存', price: 199, description: '七天循环录制，支持多端回放。', hidden: 0 },
  { id: 8, name: '云图 安装服务（上门）', short: '安装', price: 150, description: '全国 200 城次日上门。', hidden: 0 },
  {
    id: 9,
    name: '[内部] 供应链对账系统 授权单',
    price: 0,
    description: '内部商品，禁止对外展示。对账密钥：@@FLAG:web-sqli@@',
    hidden: 1
  }
];

const SECRETS = [
  { id: 1, flag: '@@FLAG:web-sqli@@', note: 'do-not-export' },
  { id: 2, flag: 'flag{decoy_not_the_answer}', note: 'honeypot' },
  { id: 3, flag: '@@FLAG:web-blind@@', note: 'blind-target' }
];

const flags = require('./flags');

const OPS2 = ['!=', '<>', '>=', '<='];
const OPS1 = ['=', '>', '<'];

function lex(src) {
  const t = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      const q = c;
      let j = i + 1;
      let val = '';
      let closed = false;
      while (j < src.length) {
        if (src[j] === q && src[j + 1] === q) { val += q; j += 2; continue; }
        if (src[j] === q) { closed = true; break; }
        val += src[j++];
      }
      if (!closed) throw new SqlError('Unclosed quotation mark after the character string.');
      t.push({ type: 'str', value: val });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      t.push({ type: 'num', value: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_.]/.test(src[j])) j++;
      const w = src.slice(i, j);
      const up = w.toUpperCase();
      if (['AND', 'OR', 'LIKE', 'NOT', 'IS', 'NULL', 'IN'].includes(up)) t.push({ type: 'kw', value: up });
      else t.push({ type: 'ident', value: w });
      i = j;
      continue;
    }
    if (c === '(' || c === ')' || c === ',') { t.push({ type: c }); i++; continue; }
    const two = src.slice(i, i + 2);
    if (OPS2.includes(two)) { t.push({ type: 'op', value: two }); i += 2; continue; }
    if (OPS1.includes(c)) { t.push({ type: 'op', value: c }); i++; continue; }
    if (c === '*') { t.push({ type: 'star' }); i++; continue; }
    throw new SqlError("Syntax error near '" + c + "'");
  }
  return t;
}

class SqlError extends Error {}

function stripComment(s) {
  let cut = -1;
  const a = s.indexOf('--');
  if (a !== -1) cut = a;
  const b = s.indexOf('#');
  if (b !== -1 && (cut === -1 || b < cut)) cut = b;
  return cut === -1 ? s : s.slice(0, cut);
}

function splitTop(tokens, kw) {
  const parts = [[]];
  let depth = 0;
  for (const t of tokens) {
    if (t.type === '(') depth++;
    if (t.type === ')') depth--;
    if (depth === 0 && t.type === 'kw' && t.value === kw) { parts.push([]); continue; }
    parts[parts.length - 1].push(t);
  }
  return parts;
}

function balanced(tokens) {
  let d = 0;
  for (const t of tokens) {
    if (t.type === '(') d++;
    if (t.type === ')') d--;
    if (d < 0) return false;
  }
  return d === 0;
}

function operandValue(tokens, row) {
  if (tokens.length === 1) {
    const t = tokens[0];
    if (t.type === 'str') return t.value;
    if (t.type === 'num') return t.value;
    if (t.type === 'ident') {
      const k = t.value.toLowerCase();
      return Object.prototype.hasOwnProperty.call(row, k) ? row[k] : null;
    }
    throw new SqlError("Syntax error near '" + (t.value || t.type) + "'");
  }
  if (tokens.length === 0) throw new SqlError('Incomplete WHERE clause');
  // 处理并列的字面量（说明用户输入把引号玩坏了）
  throw new SqlError("Syntax error near '" + tokens.map(t => t.value).join(' ') + "'");
}

function likeToRegExp(pattern) {
  const body = String(pattern)
    .replace(/[.*+?^${}()|[\]\\]/g, m => (m === '%' || m === '_' ? m : '\\' + m))
    .replace(/%/g, '[\u0000-\uFFFF]*')
    .replace(/_/g, '[\u0000-\uFFFF]');
  return new RegExp('^' + body + '$', 'i');
}

function looseEqual(a, b) {
  if (a === null || b === null || a === undefined || b === undefined) return false;
  if (String(a) === String(b)) return true;
  const na = Number(a);
  const nb = Number(b);
  return Number.isFinite(na) && Number.isFinite(nb) && na === nb;
}

function compare(l, r, op) {
  if (op === 'LIKE') return likeToRegExp(r).test(String(l == null ? '' : l));
  if (op === '=') return looseEqual(l, r);
  if (op === '!=' || op === '<>') return !looseEqual(l, r);
  const a = Number(l);
  const b = Number(r);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false;
  if (op === '>') return a > b;
  if (op === '<') return a < b;
  if (op === '>=') return a >= b;
  if (op === '<=') return a <= b;
  return false;
}

function evalTokens(tokens, row) {
  let tk = tokens.filter(t => !(t.type === 'kw' && t.value === 'NOT' && false));
  while (tk.length === 0) return false;

  // 去掉最外层成对括号
  let guard = 0;
  while (tk[0] && tk[0].type === '(' && tk[tk.length - 1].type === ')' && balanced(tk.slice(1, -1))) {
    tk = tk.slice(1, -1);
    if (++guard > 32) break;
  }

  const ors = splitTop(tk, 'OR');
  if (ors.length > 1) return ors.some(p => evalTokens(p, row));

  const ands = splitTop(tk, 'AND');
  if (ands.length > 1) return ands.every(p => evalTokens(p, row));

  const opIdx = tk.findIndex(t => t.type === 'op' || (t.type === 'kw' && t.value === 'LIKE'));
  if (opIdx === -1) {
    const v = operandValue(tk, row);
    return Boolean(v);
  }
  const op = tk[opIdx].type === 'op' ? tk[opIdx].value : 'LIKE';
  const l = operandValue(tk.slice(0, opIdx), row);
  const r = operandValue(tk.slice(opIdx + 1), row);
  return compare(l, r, op);
}

function splitComma(src) {
  const out = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quote) {
      cur += c;
      if (c === quote) quote = null;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; cur += c; continue; }
    if (c === ',') { out.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim() !== '' || out.length) out.push(cur);
  return out;
}

function unionValue(item, secretRow) {
  const s = item.trim();
  if (!s) return null;
  if (/^'.*'$/.test(s)) return s.slice(1, -1);
  if (/^".*"$/.test(s)) return s.slice(1, -1);
  if (/^-?\d+(\.\d+)?$/.test(s)) return Number(s);
  const k = s.toLowerCase();
  return Object.prototype.hasOwnProperty.call(secretRow, k) ? secretRow[k] : null;
}

/**
 * 预处理：把标量子查询与字符串函数「折叠」成字面量
 * 支持 (SELECT col FROM table [WHERE ...])、SUBSTR/SUBSTRING、LENGTH、ASCII
 * 这样盲注关才能用真实 payload 逐字符判断，sqlmap 的 SUBSTR 语法也能走通。
 */
function foldSubqueries(src, depth) {
  if ((depth || 0) > 4) return src;
  return src.replace(
    /\(\s*select\s+([A-Za-z_][\w]*)\s+from\s+([A-Za-z_][\w]*)(?:\s+where\s+([^()]*?))?\s*\)/gi,
    (m, col, table, cond) => {
      const t = table.toLowerCase();
      const rows = t === 'secrets' ? SECRETS : t === 'products' ? PRODUCTS : null;
      if (!rows) throw new SqlError("Table '" + table + "' doesn't exist");
      let filtered = rows;
      if (cond && cond.trim()) {
        const inner = lex(foldFunctions(foldSubqueries(cond, (depth || 0) + 1)));
        filtered = rows.filter(r => evalTokens(inner, r));
      }
      if (!filtered.length) return 'NULL';
      const v = filtered[0][col.toLowerCase()];
      if (v === null || v === undefined) return 'NULL';
      return "'" + flags.resolve(String(v)).replace(/'/g, "''") + "'";
    }
  );
}

function foldFunctions(src) {
  let prev;
  let out = src;
  do {
    prev = out;
    // SUBSTR('abc', 1, 2) → 'ab'
    out = out.replace(
      /\b(?:substr|substring)\s*\(\s*'((?:[^']|'')*)'\s*,\s*(-?\d+)\s*(?:,\s*(-?\d+)\s*)?\)/gi,
      (m, str, p1, p2) => {
        const val = str.replace(/''/g, "'");
        const start = Math.max(0, (parseInt(p1, 10) || 1) - 1);
        const len = p2 === undefined ? val.length : parseInt(p2, 10);
        return "'" + val.substr(start, len).replace(/'/g, "''") + "'";
      }
    );
    // ASCII('a') → 97
    out = out.replace(/\bascii\s*\(\s*'((?:[^']|'')*)'\s*\)/gi, (m, str) => {
      const val = str.replace(/''/g, "'");
      return String(val.length ? val.charCodeAt(0) : 0);
    });
    // LENGTH('abc') → 3
    out = out.replace(/\b(?:length|char_length)\s*\(\s*'((?:[^']|'')*)'\s*\)/gi, (m, str) =>
      String(str.replace(/''/g, "'").length)
    );
  } while (out !== prev);
  return out;
}

function preprocess(wherePart) {
  return foldFunctions(foldSubqueries(wherePart));
}

/**
 * 执行商品搜索
 * @returns {{ok:boolean, rows:Array, error?:string, sql:string}}
 */
function searchProducts(q) {
  const raw = String(q == null ? '' : q);
  const where = "name LIKE '%" + raw + "%' AND hidden = 0";
  const sql = 'SELECT id, name, price, description FROM products WHERE ' + where;

  try {
    const cleaned = stripComment(where);
    const unionIdx = cleaned.search(/\bunion\s+select\b/i);
    let wherePart = unionIdx === -1 ? cleaned : cleaned.slice(0, unionIdx);
    let unionPart = unionIdx === -1 ? null : cleaned.slice(unionIdx).replace(/^\s*union\s+select\s*/i, '');

    wherePart = preprocess(wherePart);

    const condTokens = lex(wherePart);
    const rows = PRODUCTS.filter(p => evalTokens(condTokens, p));

    if (unionPart !== null) {
      let table = 'secrets';
      let proj = unionPart;
      const fm = unionPart.match(/\bfrom\s+([A-Za-z_][\w]*)/i);
      if (fm) {
        table = fm[1].toLowerCase();
        proj = unionPart.replace(fm[0], '');
      }
      if (table !== 'secrets') {
        throw new SqlError("Table '" + table + "' doesn't exist");
      }
      const items = proj.trim() === '*' ? null : splitComma(proj).map(s => s.trim());
      const unionRows = SECRETS.map(sr => {
        if (!items) return sr;
        return items.map(it => unionValue(it, sr));
      });
      return { ok: true, rows: rows.concat(unionRows), sql, injected: true };
    }

    return { ok: true, rows, sql, injected: rows.length > PRODUCTS.filter(p => !p.hidden).length };
  } catch (e) {
    if (e instanceof SqlError) {
      return { ok: false, rows: [], error: e.message, sql };
    }
    throw e;
  }
}

module.exports = { searchProducts, PRODUCTS, SECRETS, SqlError, preprocess, lex, evalTokens };
