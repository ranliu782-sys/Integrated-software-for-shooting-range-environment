'use strict';
/**
 * 本地 JSON 存储层（不使用任何数据库）
 * 所有进度、flag、留言、订单均落在 data/state.json 中。
 */
const fs = require('fs');
const path = require('path');
const { BASE } = require('./root');

const ROOT = BASE;
const DATA_DIR = path.join(ROOT, 'data');
const UPLOAD_DIR = path.join(DATA_DIR, 'uploads');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

function defaultState() {
  return {
    version: 1,
    createdAt: new Date().toISOString(),
    resetAt: null,
    flags: {},
    solves: [],
    xssLogs: [],
    guestbook: [
      {
        id: 1,
        author: '游客_0x1',
        content: '摄像头画质不错，就是夜视有点糊，希望固件升级一下。',
        at: '2026-11-25 10:12'
      }
    ],
    couponRecords: [],
    paidOrders: []
  };
}

let state = null;

function ensureDirs() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

function load() {
  ensureDirs();
  if (fs.existsSync(STATE_FILE)) {
    try {
      const raw = fs.readFileSync(STATE_FILE, 'utf8');
      state = JSON.parse(raw);
      const d = defaultState();
      for (const k of Object.keys(d)) {
        if (state[k] === undefined) state[k] = d[k];
      }
      return state;
    } catch (e) {
      console.error('[store] state.json 读取失败，已重建：', e.message);
    }
  }
  state = defaultState();
  save();
  return state;
}

function get() {
  if (!state) load();
  return state;
}

function save() {
  if (!state) return;
  ensureDirs();
  const tmp = STATE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2), 'utf8');
  fs.renameSync(tmp, STATE_FILE);
}

function reset() {
  state = defaultState();
  save();
  return state;
}

module.exports = { get, save, reset, load, DATA_DIR, UPLOAD_DIR, STATE_FILE };
