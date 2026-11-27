'use strict';
/**
 * 静态资源读取
 * - 开发态：从磁盘读 public/ 与 certs/
 * - 单文件 exe：从 SEA 内嵌资源读（构建时打包进去）
 */
const fs = require('fs');
const path = require('path');
const { BASE, isSea } = require('./root');

let sea = null;
try {
  sea = require('node:sea');
} catch (e) {
  sea = null;
}

function read(relKey) {
  const key = String(relKey).replace(/\\/g, '/');
  if (isSea && sea && typeof sea.getRawAsset === 'function') {
    try {
      return Buffer.from(sea.getRawAsset(key));
    } catch (e) {
      return null;
    }
  }
  const p = path.join(BASE, key);
  try {
    return fs.existsSync(p) ? fs.readFileSync(p) : null;
  } catch (e) {
    return null;
  }
}

module.exports = { read };
