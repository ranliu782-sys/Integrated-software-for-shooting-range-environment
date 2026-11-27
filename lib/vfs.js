'use strict';
/**
 * 虚拟主机（沙箱）
 * 命令注入与提权关卡共享同一台「主机」：一个纯内存的文件系统 + 一个受限 shell。
 * 所有命令都在虚拟 FS 上执行，不会触达真实操作系统，不会真的发起网络请求。
 */

const USERS = {
  root: 0,
  'www-data': 33,
  ops: 1000
};

const flags = require('./flags');

// 文件内容里的 @@FLAG:xxx@@ 在读取时才替换，保证重置后拿到新 flag
function read(node) {
  return flags.resolve(node.content);
}

const HOME = { root: '/root', ops: '/home/ops', 'www-data': '/var/www' };

function file(owner, mode, content) {
  return { type: 'file', owner, mode, content };
}
function dir(owner, mode, children) {
  return { type: 'dir', owner, mode, children: children || {} };
}

function buildTree() {
  return dir('root', '755', {
    flag: file(
      'root',
      '644',
      '恭喜，你拿到了 www-data 身份的命令执行权限。\n\n@@FLAG:web-cmdi@@\n\n(请把 flag 提交到控制台的「Ping 检测工具的命令注入」关卡)\n'
    ),
    etc: dir('root', '755', {
      hostname: file('root', '644', 'cloudpix-web01\n'),
      passwd: file(
        'root',
        '644',
        'root:x:0:0:root:/root:/bin/bash\n' +
          'daemon:x:1:1:daemon:/usr/sbin:/usr/sbin/nologin\n' +
          'www-data:x:33:33:www-data:/var/www:/usr/sbin/nologin\n' +
          'ops:x:1000:1000:ops:/home/ops:/bin/bash\n'
      ),
      shadow: file('root', '640', 'root:$6$Yq2mZ0pL$3fD9...:19342:0:99999:7:::\nops:$6$Rk8t1vXc$9aB2...:19350:0:99999:7:::\n'),
      group: file('root', '644', 'root:x:0:\nwww-data:x:33:\nops:x:1000:\n'),
      hosts: file('root', '644', '127.0.0.1\tlocalhost\n127.0.1.1\tcloudpix-web01\n'),
      os_release: file('root', '644', 'PRETTY_NAME="Ubuntu 22.04.4 LTS"\nVERSION_ID="22.04"\n')
    }),
    home: dir('root', '755', {
      ops: dir('ops', '750', {
        'flag_user.txt': file('ops', '640', 'ops 账号已攻破。\n\n@@FLAG:host-weakpwd@@\n'),
        '.bash_history': file(
          'ops',
          '600',
          'mysql -h 127.0.0.1 -uroot -pCloud@2024\n' +
            'cd /usr/local/bin\n' +
            './backup --list\n' +
            './backup --restore\n' +
            'sudo -l\n'
        ),
        '.ssh': dir('ops', '700', {
          authorized_keys: file('ops', '600', 'ssh-rsa AAAAB3NzaC1yc2E... ops@ops-laptop\n')
        })
      })
    }),
    root: dir('root', '700', {
      'flag.txt': file(
        'root',
        '600',
        'root 权限到手，这台主机已经是你的了。\n\n@@FLAG:host-privesc@@\n'
      ),
      '.ssh': dir('root', '700', {})
    }),
    usr: dir('root', '755', {
      local: dir('root', '755', {
        bin: dir('root', '755', {
          backup: file('root', '4755', 'ELF 64-bit LSB executable (SUID root) - 运维数据备份工具\n')
        })
      })
    }),
    var: dir('root', '755', {
      backups: dir('root', '700', {
        'manifest.db': file('root', '600', '# internal backup manifest\n# 请勿外传\n')
      }),
      www: dir('root', '755', {
        html: dir('www-data', '755', {
          'index.php': file('www-data', '644', '<?php echo "CloudPix Portal"; ?>'),
          'upload.php': file('www-data', '644', '<?php // 头像上传处理，仅校验 Content-Type ?>'),
          'ping.php': file('www-data', '644', '<?php system("ping -c 4 " . $_GET["ip"]); ?>')
        }),
        uploads: dir('www-data', '777', {})
      }),
      log: dir('root', '755', {
        nginx: dir('root', '755', {
          'access.log': file(
            'root',
            '644',
            '10.0.8.24 - - [25/Nov/2026:09:12:44] "GET /robots.txt HTTP/1.1" 200\n' +
              '10.0.8.24 - - [25/Nov/2026:09:12:51] "GET /backup/db.sql HTTP/1.1" 200\n' +
              '127.0.0.1 - - [25/Nov/2026:09:13:02] "GET /internal/flag HTTP/1.1" 403\n'
          )
        })
      })
    }),
    opt: dir('root', '755', {}),
    tmp: dir('root', '1777', {})
  });
}

function normalize(base, p) {
  const parts = (p.startsWith('/') ? p : base + '/' + p).split('/');
  const out = [];
  for (const seg of parts) {
    if (!seg || seg === '.') continue;
    if (seg === '..') out.pop();
    else out.push(seg);
  }
  return '/' + out.join('/');
}

function lookup(rootNode, absPath) {
  if (absPath === '/') return { node: rootNode, parent: null, name: '' };
  const segs = absPath.split('/').filter(Boolean);
  let node = rootNode;
  let parent = null;
  let name = '';
  for (const s of segs) {
    if (!node || node.type !== 'dir') return null;
    parent = node;
    name = s;
    node = node.children[s];
  }
  if (!node) return null;
  return { node, parent, name };
}

function permBits(mode) {
  return parseInt(mode, 8) & 0o7777;
}

function canRead(node, user) {
  const bits = permBits(node.mode);
  if (user === 'root') return true;
  if (node.owner === user) return Boolean(bits & 0o400);
  return Boolean(bits & 0o004);
}

function canTraverse(node, user) {
  const bits = permBits(node.mode);
  if (user === 'root') return true;
  if (node.owner === user) return Boolean(bits & 0o100);
  return Boolean(bits & 0o001);
}

function modeString(node) {
  const bits = permBits(node.mode);
  let s = node.type === 'dir' ? 'd' : '-';
  const map = [
    [0o400, 'r'], [0o200, 'w'], [0o100, 'x'],
    [0o040, 'r'], [0o020, 'w'], [0o010, 'x'],
    [0o004, 'r'], [0o002, 'w'], [0o001, 'x']
  ];
  for (const [bit, ch] of map) s += bits & bit ? ch : '-';
  if (bits & 0o4000) s = s.slice(0, 3) + 's' + s.slice(4);
  return s;
}

function makeSession(user, cwd) {
  return { user: user || 'www-data', uid: USERS[user] || 33, cwd: cwd || HOME[user] || '/' };
}

function expandVars(str, sess) {
  return String(str)
    .replace(/\$USER/g, sess.user)
    .replace(/\$HOME/g, HOME[sess.user] || '/')
    .replace(/\$PWD/g, sess.cwd);
}

function tokenizeArgs(cmd) {
  const out = [];
  const re = /"([^"]*)"|'([^']*)'|(\S+)/g;
  let m;
  while ((m = re.exec(cmd))) {
    out.push(m[1] !== undefined ? m[1] : m[2] !== undefined ? m[2] : m[3]);
  }
  return out;
}

function runOne(cmdLine, sess, tree) {
  const out = [];
  const argv = tokenizeArgs(cmdLine.trim());
  if (!argv.length) return { out };
  // 支持 /usr/local/bin/backup、./backup 这类带路径的调用
  const cmd = argv[0].split('/').pop();
  const args = argv.slice(1);
  const abs = p => normalize(sess.cwd, expandVars(p, sess));

  switch (cmd) {
    case 'help':
      out.push('可用命令: ls cd pwd cat id whoami uname echo ping ps find sudo backup history clear exit');
      out.push('提示: 这是一个受限沙箱 shell，不支持文件写入。');
      break;

    case 'pwd':
      out.push(sess.cwd);
      break;

    case 'whoami':
      out.push(sess.user);
      break;

    case 'id':
      out.push(
        'uid=' + sess.uid + '(' + sess.user + ') gid=' + sess.uid + '(' + sess.user + ') groups=' + sess.uid + '(' + sess.user + ')'
      );
      break;

    case 'uname':
      out.push('Linux cloudpix-web01 5.15.0-91-generic #101-Ubuntu SMP x86_64 GNU/Linux');
      break;

    case 'echo':
      out.push(args.join(' '));
      break;

    case 'cd': {
      const target = args[0] || HOME[sess.user] || '/';
      const p = abs(target);
      const hit = lookup(tree, p);
      if (!hit) { out.push('bash: cd: ' + target + ': No such file or directory'); break; }
      if (hit.node.type !== 'dir') { out.push('bash: cd: ' + target + ': Not a directory'); break; }
      if (!canTraverse(hit.node, sess.user)) { out.push('bash: cd: ' + target + ': Permission denied'); break; }
      sess.cwd = p;
      break;
    }

    case 'ls': {
      const flags = args.filter(a => a.startsWith('-')).join('');
      const targets = args.filter(a => !a.startsWith('-'));
      const p = abs(targets[0] || '.');
      const hit = lookup(tree, p);
      if (!hit) { out.push('ls: cannot access \'' + (targets[0] || '.') + '\': No such file or directory'); break; }
      if (hit.node.type === 'file') { out.push(targets[0] || p); break; }
      if (!canTraverse(hit.node, sess.user) || !canRead(hit.node, sess.user)) {
        out.push('ls: cannot open directory \'' + (targets[0] || '.') + '\': Permission denied');
        break;
      }
      const names = Object.keys(hit.node.children).sort();
      if (flags.includes('a')) names.unshift('.', '..');
      if (flags.includes('l')) {
        out.push('total ' + names.length * 4);
        for (const n of names) {
          const c = n === '.' ? hit.node : n === '..' ? hit.parent || hit.node : hit.node.children[n];
          if (!c) continue;
          out.push(
            modeString(c) +
              ' 1 ' + (c.owner || 'root').padEnd(8) + (c.owner || 'root').padEnd(8) +
              String(c.type === 'dir' ? 4096 : (c.content || '').length).padStart(5) +
              ' Nov 25 09:12 ' + n
          );
        }
      } else {
        out.push(names.join('  '));
      }
      break;
    }

    case 'cat': {
      const targets = args.filter(a => !a.startsWith('>'));
      if (!targets.length) { out.push('cat: missing operand'); break; }
      for (const t of targets) {
        const p = abs(t);
        const hit = lookup(tree, p);
        if (!hit) { out.push('cat: ' + t + ': No such file or directory'); continue; }
        if (hit.node.type === 'dir') { out.push('cat: ' + t + ': Is a directory'); continue; }
        if (!canRead(hit.node, sess.user)) { out.push('cat: ' + t + ': Permission denied'); continue; }
        out.push(read(hit.node).replace(/\n$/, ''));
      }
      break;
    }

    case 'ping': {
      const host = args.filter(a => !a.startsWith('-') && !/^\d+$/.test(a)).pop() || '127.0.0.1';
      out.push('PING ' + host + ' (' + host + ') 56(84) bytes of data.');
      for (let i = 1; i <= 4; i++) out.push('64 bytes from ' + host + ': icmp_seq=' + i + ' ttl=64 time=0.0' + (40 + i) + ' ms');
      out.push('');
      out.push('--- ' + host + ' ping statistics ---');
      out.push('4 packets transmitted, 4 received, 0% packet loss, time 3004ms');
      break;
    }

    case 'ps':
      out.push('USER       PID %CPU %MEM    VSZ   RSS TTY      STAT START   TIME COMMAND');
      out.push('root         1  0.0  0.1 168312 11204 ?        Ss   09:12   0:02 /sbin/init');
      out.push('root       812  0.0  0.2 241880 20112 ?        S    09:12   0:00 /usr/sbin/nginx');
      out.push('www-data   915  0.1  0.4 612344 34908 ?        S    09:12   0:05 php-fpm: pool www');
      out.push('ops       1402  0.0  0.1  23456  6120 pts/0    Ss   09:14   0:00 -bash');
      break;

    case 'find': {
      let start = '/';
      let perm4000 = false;
      for (const a of args) {
        if (a === '-perm') perm4000 = true;
        else if (/^-?[0-9]{3,4}$/.test(a)) perm4000 = true;
        else if (a.startsWith('/')) start = a;
        else if (a === '2>/dev/null' || a === '2>&1') { /* 忽略重定向 */ }
      }
      const p = abs(start);
      const results = [];
      (function walk(node, path) {
        if (!node) return;
        if (node.type === 'dir') {
          for (const k of Object.keys(node.children)) walk(node.children[k], path === '/' ? '/' + k : path + '/' + k);
        } else if (perm4000 && permBits(node.mode) & 0o4000) {
          results.push(path);
        }
      })(tree, '/');
      if (perm4000) {
        if (!results.length) out.push('find: 未找到 SUID 文件');
        else results.forEach(r => out.push(r));
      } else {
        out.push('find: 未指定条件，仅支持 -perm 4xxx 枚举');
      }
      break;
    }

    case 'sudo':
      if (args[0] === '-l' || args[0] === '--list') {
        out.push('Matching Defaults entries for ' + sess.user + ' on cloudpix-web01:');
        out.push('    env_reset, mail_badpass, secure_path=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin');
        out.push('');
        out.push('User ' + sess.user + ' may not run sudo on cloudpix-web01.');
      } else {
        out.push(sess.user + ' is not in the sudoers file.  This incident will be reported.');
      }
      break;

    case 'backup': {
      if (!args.length) {
        out.push('cloudpix-backup 2.3.1 - 运维数据备份工具');
        out.push('用法: backup [--list | --restore | --dump]');
        out.push('  --list     列出备份清单（无需特权）');
        out.push('  --restore  以备份清单中的凭据恢复（需要读 /root 权限）');
        out.push('  --dump     导出受保护的清单原文');
        break;
      }
      if (args.includes('--list')) {
        out.push('2026-11-20 03:00  full   /var/www      1.2G');
        out.push('2026-11-21 03:00  incr   /var/www      84M');
        out.push('2026-11-22 03:00  incr   /var/www      61M');
        break;
      }
      const rootNode = lookup(tree, '/root/flag.txt');
      if (args.includes('--restore') || args.includes('--dump')) {
        out.push('[backup] effective uid = 0 (root)');
        out.push('[backup] opening protected manifest /root/flag.txt');
        out.push('----------------------------------------');
        out.push(read(rootNode.node).replace(/\n$/, ''));
        out.push('----------------------------------------');
        out.push('[backup] done');
        break;
      }
      out.push('backup: 未知参数 ' + args[0]);
      break;
    }

    case 'history':
      out.push('    1  mysql -h 127.0.0.1 -uroot -pCloud@2024');
      out.push('    2  cd /usr/local/bin');
      out.push('    3  ./backup --list');
      out.push('    4  ./backup --restore');
      out.push('    5  sudo -l');
      break;

    case 'clear':
      return { out, clear: true };

    case 'exit':
    case 'logout':
      return { out: ['logout'], exit: true };

    case 'ifconfig':
    case 'ip':
      out.push('eth0: flags=4163<UP,BROADCAST,RUNNING,MULTICAST>  mtu 1500');
      out.push('        inet 10.0.8.31  netmask 255.255.255.0  broadcast 10.0.8.255');
      break;

    case 'curl':
    case 'wget':
      out.push('curl: (6) Could not resolve host（沙箱内不提供外网访问）');
      break;

    default:
      out.push('bash: ' + cmd + ': command not found');
  }
  return { out };
}

function exec(line, session) {
  const tree = buildTree();
  const sess = Object.assign({}, session);
  const output = [];
  let cleared = false;
  let exited = false;

  // 命令替换：$(...) 与 `...`
  let expanded = String(line);
  expanded = expanded.replace(/\$\(([^()]*)\)/g, (_, inner) => {
    const r = exec(inner, sess);
    return r.output.join(' ').trim();
  });
  expanded = expanded.replace(/`([^`]*)`/g, (_, inner) => {
    const r = exec(inner, sess);
    return r.output.join(' ').trim();
  });

  const segments = expanded.split(/\s*(?:;|&&|\|\||\||\n)\s*/).filter(s => s.trim());
  for (const seg of segments) {
    const r = runOne(seg, sess, tree);
    output.push(...r.out);
    if (r.clear) cleared = true;
    if (r.exit) { exited = true; break; }
  }

  return { output, session: sess, cleared, exited };
}

module.exports = { exec, makeSession, buildTree, USERS, HOME };
