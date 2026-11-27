'use strict';
/** 靶场会话（内存态，重启即失效，不影响关卡进度） */
const crypto = require('crypto');
const { cookies } = require('./http-util');

const sessions = new Map();

function newSession() {
  return {
    sid: crypto.randomBytes(9).toString('hex'),
    user: null, // 商城登录用户 { id, username, role }
    smsCode: null,
    smsPhone: null,
    ssh: null // { user, uid, cwd }
  };
}

function get(req, res) {
  const sid = cookies(req)['lab_sid'];
  if (sid && sessions.has(sid)) return sessions.get(sid);
  const s = newSession();
  sessions.set(s.sid, s);
  if (res && !res.headersSent) {
    // 双 Cookie：PHPSESSID 用于伪装成 PHP 站点，lab_sid 是靶场自己的会话
    res.setHeader('Set-Cookie', [
      'lab_sid=' + s.sid + '; Path=/; HttpOnly; SameSite=Lax',
      'PHPSESSID=' + crypto.randomBytes(13).toString('hex') + '; path=/; HttpOnly'
    ]);
  }
  return s;
}

module.exports = { get };
