'use strict';
/** 控制台 API：状态、提交 flag、重置靶场 */
const store = require('../store');
const flags = require('../flags');
const { CHALLENGES, CATEGORIES, BY_ID } = require('../challenges');
const { json, parseJSON } = require('../http-util');

function scoreOfSolved(solves) {
  const seen = new Set();
  let score = 0;
  for (const s of solves) {
    if (seen.has(s.challengeId)) continue;
    seen.add(s.challengeId);
    const c = BY_ID[s.challengeId];
    if (c) score += c.points;
  }
  return score;
}

function solvedIdSet(solves, actor) {
  return new Set(solves.filter(s => !actor || s.actor === actor).map(s => s.challengeId));
}

function state(ctx) {
  const s = store.get();
  const actor = ctx.query.get('actor') || '';
  const mine = solvedIdSet(s.solves, actor);

  const challenges = CHALLENGES.map(c => {
    const solved = mine.has(c.id);
    return {
      id: c.id,
      cat: c.cat,
      title: c.title,
      level: c.level,
      points: c.points,
      summary: c.summary,
      goal: c.goal,
      entry: c.entry,
      hints: c.hints || [],
      requiresAll: Boolean(c.requiresAll),
      locked: Boolean(c.requiresAll) && !flags.finalUnlocked(Array.from(mine)),
      solved,
      flag: solved ? flags.get(c.id) : null
    };
  });

  const byActor = {};
  for (const solve of s.solves) {
    const key = solve.actor || '匿名';
    byActor[key] = byActor[key] || { actor: key, score: 0, solved: 0, lastAt: solve.at };
    byActor[key].score += (BY_ID[solve.challengeId] || {}).points || 0;
    byActor[key].solved += 1;
    byActor[key].lastAt = solve.at;
  }
  const leaderboard = Object.values(byActor).sort((a, b) => b.score - a.score).slice(0, 20);

  return json(ctx.res, {
    ok: true,
    actor,
    score: scoreOfSolved(s.solves.filter(x => !actor || x.actor === actor)),
    solvedCount: mine.size,
    totalCount: CHALLENGES.length,
    totalScore: CHALLENGES.reduce((a, c) => a + c.points, 0),
    categories: CATEGORIES,
    challenges,
    leaderboard,
    resetAt: s.resetAt,
    startedAt: s.createdAt
  });
}

function submit(ctx) {
  const body = parseJSON(ctx.body || Buffer.alloc(0));
  const id = String(body.challengeId || '');
  const raw = String(body.flag == null ? '' : body.flag).trim();
  const actor = String(body.actor || '').trim().slice(0, 24) || '匿名';

  const c = BY_ID[id];
  if (!c) return json(ctx.res, { ok: false, message: '关卡不存在' }, 404);
  if (!raw) return json(ctx.res, { ok: false, message: '请输入 flag' }, 400);

  const s = store.get();
  if (c.requiresAll) {
    const done = s.solves.map(x => x.challengeId);
    if (!flags.finalUnlocked(done)) {
      return json(ctx.res, { ok: false, message: '终局关卡尚未解锁，请先完成全部关卡' });
    }
  }

  const solvedThis = s.solves.some(x => x.actor === actor && x.challengeId === id);
  if (solvedThis) return json(ctx.res, { ok: false, message: '该关卡你已经通过了' });

  const expect = flags.get(id);
  if (raw !== expect) {
    return json(ctx.res, { ok: false, message: 'flag 不正确，再仔细看看线索' });
  }

  s.solves.push({ challengeId: id, flag: raw, actor, at: new Date().toISOString() });
  store.save();

  const mine = s.solves.filter(x => x.actor === actor);
  return json(ctx.res, {
    ok: true,
    message: '通关 +' + c.points,
    points: c.points,
    score: scoreOfSolved(mine),
    solvedCount: new Set(mine.map(x => x.challengeId)).size
  });
}

function reset(ctx) {
  const s = store.reset();
  s.resetAt = new Date().toISOString();
  store.save();
  flags.ensureFlags();
  return json(ctx.res, { ok: true, message: '靶场已重置，所有 flag 重新生成' });
}

function health(ctx) {
  return json(ctx.res, { ok: true, service: 'cloudpix-range', time: new Date().toISOString() });
}

/** 给控制台用的网络信息：对外暴露了哪些端口、怎么抓包、怎么扫 */
function net(ctx) {
  const host = process.env.HOST || '127.0.0.1';
  const httpPort = Number(process.env.PORT || 7788);
  const tlsPort = Number(process.env.TLS_PORT || 7789);
  const sshPort = Number(process.env.SSH_PORT || 2222);
  const base = 'http://' + host + ':' + httpPort;
  const tls = 'https://' + host + ':' + tlsPort;
  return json(ctx.res, {
    ok: true,
    host,
    ports: [
      { port: httpPort, proto: 'HTTP', service: 'nginx/1.18.0 (Ubuntu) · PHP/7.4.33', note: '靶标业务站 + 控制台' },
      { port: tlsPort, proto: 'HTTPS', service: '同上（自签证书）', note: '抓 TLS 流量用，证书在 certs/server.crt' },
      { port: sshPort, proto: 'TCP', service: 'SSH-2.0-OpenSSH_8.9p1 Ubuntu', note: 'ssh 风格终端，nc 可直接连' }
    ],
    capture: [
      { label: 'Burp 代理抓 HTTP', cmd: '浏览器 / 系统代理设为 127.0.0.1:8080' },
      { label: 'Burp 抓 HTTPS', cmd: '导入 certs/server.crt 到受信任根，再访问 ' + tls + '/lab' },
      { label: '让服务端 SSRF 也进 Burp', cmd: 'set RANGE_UPSTREAM_PROXY=http://127.0.0.1:8080 后重启靶场' },
      { label: '命令行看原始报文', cmd: 'curl -i ' + base + '/lab/search?q=1' }
    ],
    scan: [
      { label: '端口与服务识别', cmd: 'nmap -sV -p ' + httpPort + ',' + tlsPort + ',' + sshPort + ' ' + host },
      { label: '目录扫描', cmd: 'dirsearch -u ' + base + ' -e php,bak,zip,txt,env -w db/common.txt' },
      { label: 'Web 漏洞扫描', cmd: 'nikto -h ' + base + ' -ssl' },
      { label: 'SQL 注入探测', cmd: 'sqlmap -u "' + base + '/lab/search?q=1" --batch --level=2' },
      { label: '敏感文件速查', cmd: 'curl ' + base + '/.env ; curl ' + base + '/.git/config' },
      { label: '连主机终端', cmd: 'nc ' + host + ' ' + sshPort }
    ]
  });
}

const routes = [
  { method: 'GET', path: '/api/state', handler: state },
  { method: 'POST', path: '/api/submit', handler: submit },
  { method: 'POST', path: '/api/reset', handler: reset },
  { method: 'GET', path: '/api/health', handler: health },
  { method: 'GET', path: '/api/net', handler: net }
];

module.exports = { routes };
