'use strict';
/**
 * 运行根目录解析
 * - 开发态（node server.js）：项目目录
 * - 单文件 exe（Node SEA）：exe 所在目录，data/ 会建在这里
 */
const path = require('path');

let isSea = false;
try {
  const sea = require('node:sea');
  if (sea && typeof sea.isSea === 'function') isSea = sea.isSea();
} catch (e) {
  /* 旧版本 Node 没有 node:sea */
}

const BASE = isSea ? path.dirname(process.execPath) : path.join(__dirname, '..');

module.exports = { BASE, isSea };
