'use strict';
/**
 * 迷你模板引擎（SSTI 靶标）
 * 支持 {{ 表达式 }}，表达式里可用：数字、字符串、变量名（含 a.b 形式）、+ - * / 和括号。
 * 用户输入被当作模板渲染 → 这就是模板注入。
 */

function tokenize(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "'" || c === '"') {
      const q = c;
      let j = i + 1;
      let s = '';
      while (j < src.length && src[j] !== q) { s += src[j++]; }
      out.push({ t: 'str', v: s });
      i = j + 1;
      continue;
    }
    if (/[0-9]/.test(c)) {
      let j = i;
      while (j < src.length && /[0-9.]/.test(src[j])) j++;
      out.push({ t: 'num', v: Number(src.slice(i, j)) });
      i = j;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_$.]/.test(src[j])) j++;
      out.push({ t: 'var', v: src.slice(i, j) });
      i = j;
      continue;
    }
    if ('+-*/()'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error('unexpected token: ' + c);
  }
  return out;
}

function lookup(path, scope) {
  const parts = String(path).split('.');
  let cur = scope;
  for (const p of parts) {
    if (cur === undefined || cur === null) return undefined;
    cur = cur[p];
  }
  return cur;
}

function parse(tokens) {
  let pos = 0;
  const peek = () => tokens[pos];
  const eat = t => {
    if (!tokens[pos] || tokens[pos].t !== t) throw new Error('expected ' + t);
    return tokens[pos++];
  };

  function primary() {
    const tk = peek();
    if (!tk) throw new Error('unexpected end');
    if (tk.t === 'num' || tk.t === 'str') { pos++; return tk.v; }
    if (tk.t === '(') { pos++; const v = expr(); eat(')'); return v; }
    if (tk.t === 'var') { pos++; return { var: tk.v }; }
    if (tk.t === '-') { pos++; const v = primary(); return -Number(v); }
    throw new Error('unexpected token');
  }

  function mul() {
    let left = primary();
    while (peek() && (peek().t === '*' || peek().t === '/')) {
      const op = tokens[pos++].t;
      const right = primary();
      left = op === '*' ? Number(left) * Number(right) : Number(left) / Number(right);
    }
    return left;
  }

  function expr() {
    let left = mul();
    while (peek() && (peek().t === '+' || peek().t === '-')) {
      const op = tokens[pos++].t;
      const right = mul();
      left = op === '+' ? (typeof left === 'string' || typeof right === 'string' ? String(left) + String(right) : Number(left) + Number(right)) : Number(left) - Number(right);
    }
    return left;
  }

  const v = expr();
  if (pos !== tokens.length) throw new Error('unexpected trailing token');
  return v;
}

function evaluate(expression, scope) {
  // 先把变量解析成字面量，剩下的就是纯算术
  const tokens = tokenize(expression).map(t => {
    if (t.t !== 'var') return t;
    const v = lookup(t.v, scope || {});
    if (typeof v === 'number') return { t: 'num', v };
    return { t: 'str', v: v === undefined || v === null ? '' : String(v) };
  });
  return parse(tokens);
}

function render(template, scope) {
  return String(template).replace(/\{\{([\s\S]*?)\}\}/g, (m, expr) => {
    try {
      const v = evaluate(expr.trim(), scope || {});
      return v === undefined ? '' : String(v);
    } catch (e) {
      return '[模板错误] ' + e.message;
    }
  });
}

module.exports = { render, evaluate };
