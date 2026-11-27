'use strict';
/**
 * SSH 风格交互服务（默认 2222）
 * 目的：让 nmap 能扫到一个「ssh 服务」，让人能用 nc/telnet 直接连进来敲命令。
 * 注意：这不是完整的 OpenSSH 协议实现（不做密钥交换），因此 ssh 客户端与 hydra 不能直接登录，
 *      但 banner 指纹、口令交互、命令执行都是真实的 TCP 会话。
 */
const net = require('net');
const vfs = require('./vfs');

const BANNER = 'SSH-2.0-OpenSSH_8.9p1 Ubuntu-3ubuntu0.6';
const ACCOUNTS = {
  ops: { pass: 'Cloud@2024', home: '/home/ops' }
};

function start(port, host) {
  const server = net.createServer({ allowHalfOpen: true }, sock => {
    sock.setEncoding('utf8');
    sock.setTimeout(0);

    let stage = 'user';
    let buf = '';
    let user = null;
    let sess = null;

    const write = s => {
      try { sock.write(s); } catch (e) { /* 连接已断开 */ }
    };
    const prompt = () => write(user + '@cloudpix-web01:' + sess.cwd + '$ ');

    write(BANNER + '\r\n');
    write('login as: ');

    function handleLine(rawLine) {
      const line = rawLine.replace(/\r$/, '');
      // OpenSSH 客户端会先发自己的版本号，忽略掉
      if (/^SSH-\d/.test(line)) return;

      if (stage === 'user') {
        const name = line.trim();
        if (!name) { write('login as: '); return; }
        if (ACCOUNTS[name]) {
          user = name;
          stage = 'pass';
          write('\r\nPassword: ');
        } else {
          write('\r\nPermission denied, please try again.\r\nlogin as: ');
        }
        return;
      }

      if (stage === 'pass') {
        if (ACCOUNTS[user].pass === line) {
          stage = 'shell';
          sess = vfs.makeSession(user, ACCOUNTS[user].home);
          write('\r\nWelcome to Ubuntu 22.04.4 LTS (GNU/Linux 5.15.0-91-generic x86_64)\r\n');
          write('Last login: Wed Nov 25 09:14:02 2026 from 10.0.8.24\r\n\r\n');
          prompt();
        } else {
          write('\r\nPermission denied, please try again.\r\nlogin as: ');
          stage = 'user';
          user = null;
        }
        return;
      }

      if (stage === 'shell') {
        const cmd = line.trim();
        if (cmd === 'exit' || cmd === 'logout') {
          write('logout\r\nConnection to cloudpix-web01 closed.\r\n');
          sock.end();
          return;
        }
        if (!cmd) { prompt(); return; }
        const r = vfs.exec(cmd, sess);
        sess.cwd = r.session.cwd;
        const out = r.output.join('\r\n');
        if (out) write(out + '\r\n');
        if (r.exited) {
          write('logout\r\n');
          sock.end();
          return;
        }
        prompt();
      }
    }

    sock.on('data', chunk => {
      buf += chunk;
      let idx;
      while ((idx = buf.indexOf('\n')) !== -1) {
        const line = buf.slice(0, idx);
        buf = buf.slice(idx + 1);
        try {
          handleLine(line);
        } catch (e) {
          write('bash: internal error\r\n');
        }
      }
    });

    sock.on('error', () => {});
    sock.on('close', () => {
      if (sess) console.log('  [ssh] ' + (sock.remoteAddress || '-') + ' 会话结束（' + sess.user + '）');
    });
  });

  server.on('error', e => {
    console.error('  [ssh] 启动失败：' + e.message);
  });

  server.listen(port, host, () => {
    console.log('  [ssh]  已就绪 ' + port + '（banner: OpenSSH_8.9p1）');
  });

  return server;
}

module.exports = { start, ACCOUNTS };
