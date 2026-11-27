'use strict';
/**
 * Flag 生成与占位符解析
 * 首次启动为每个关卡生成随机 flag，写入本地 state.json；模板里的 @@FLAG:id@@ 会被替换成真实值。
 */
const crypto = require('crypto');
const store = require('./store');
const { CHALLENGES, BY_ID } = require('./challenges');

const PLACEHOLDER = /@@FLAG:([a-z0-9-]+)@@/g;

function rand(n) {
  return crypto.randomBytes(32).toString('hex').slice(0, n);
}

function computeFinal(flags) {
  const ids = Object.keys(flags).filter(k => k !== 'final').sort();
  const seed = ids.map(k => flags[k]).join('|') + '|cloudpix-final-v1';
  const h = crypto.createHash('sha256').update(seed).digest('hex').slice(0, 20);
  return 'flag{final_' + h + '}';
}

function ensureFlags() {
  const s = store.get();
  let dirty = false;
  for (const c of CHALLENGES) {
    if (c.id === 'final') continue;
    if (!s.flags[c.id]) {
      s.flags[c.id] = 'flag{' + c.id.replace(/-/g, '_') + '_' + rand(12) + '}';
      dirty = true;
    }
  }
  const want = computeFinal(s.flags);
  if (s.flags['final'] !== want) {
    s.flags['final'] = want;
    dirty = true;
  }
  if (dirty) store.save();
  return s.flags;
}

function get(id) {
  ensureFlags();
  return store.get().flags[id] || '';
}

/** 把文本中的 @@FLAG:id@@ 替换为真实 flag */
function resolve(text) {
  if (typeof text !== 'string') return text;
  ensureFlags();
  const flags = store.get().flags;
  return text.replace(PLACEHOLDER, (_, id) => flags[id] || '@@MISSING_' + id + '@@');
}

/** 已解锁终局关卡：前 12 关全部完成 */
function finalUnlocked(solvedIds) {
  const need = CHALLENGES.filter(c => c.id !== 'final').map(c => c.id);
  return need.every(id => solvedIds.includes(id));
}

function scoreOf(challengeId) {
  const c = BY_ID[challengeId];
  return c ? c.points : 0;
}

module.exports = { ensureFlags, get, resolve, finalUnlocked, scoreOf, computeFinal };
