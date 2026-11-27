(function () {
  'use strict';

  var ACTOR_KEY = 'cr_actor_v1';
  var state = null;
  var current = null;

  var $ = function (id) { return document.getElementById(id); };

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function actor() {
    var a = localStorage.getItem(ACTOR_KEY);
    if (!a) {
      a = '白帽_' + Math.random().toString(16).slice(2, 6).toUpperCase();
      localStorage.setItem(ACTOR_KEY, a);
    }
    return a;
  }

  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.hidden = true; }, 2400);
  }

  /* ---------------- 数据 ---------------- */
  function load() {
    return fetch('/api/state?actor=' + encodeURIComponent(actor()))
      .then(function (r) { return r.json(); })
      .then(function (d) {
        state = d;
        renderAll();
      })
      .catch(function () {
        $('stage').innerHTML = '<div class="loading">无法连接靶场服务，请确认 node server.js 正在运行</div>';
      });
  }

  function renderAll() {
    if (!state) return;
    $('actor').value = actor();
    renderScore();
    renderNav();
    var pick = current || (state.challenges.filter(function (c) { return !c.solved && !c.locked; })[0]) || state.challenges[0];
    select(pick.id);
  }

  function renderScore() {
    $('score').textContent = state.score;
    $('solvedText').textContent = '已通关 ' + state.solvedCount + ' / ' + state.totalCount;
    var pct = state.totalScore ? Math.round((state.score / state.totalScore) * 100) : 0;
    $('pct').textContent = pct + '%';
    var C = 263.9;
    $('ringBar').style.strokeDashoffset = String(C - (C * pct) / 100);
  }

  function renderNav() {
    var nav = $('nav');
    var html = '';
    state.categories.forEach(function (cat) {
      var items = state.challenges.filter(function (c) { return c.cat === cat.id; });
      if (!items.length) return;
      var done = items.filter(function (c) { return c.solved; }).length;
      html += '<div class="nav-group">';
      html += '<div class="group-head"><span class="bar" style="background:' + cat.color + '"></span>' +
        esc(cat.name) + '<span class="count">' + done + '/' + items.length + '</span></div>';
      items.forEach(function (c) {
        var cls = 'nav-item' + (c.solved ? ' solved' : '') + (c.locked ? ' locked' : '');
        html += '<div class="' + cls + '" data-id="' + c.id + '" title="' + esc(c.summary) + '">' +
          '<span class="status"></span><span class="label">' + esc(c.title) + '</span>' +
          '<span class="pts">' + c.points + '</span></div>';
      });
      html += '</div>';
    });
    nav.innerHTML = html;

    Array.prototype.forEach.call(nav.querySelectorAll('.nav-item'), function (el) {
      el.addEventListener('click', function () {
        var c = state.challenges.filter(function (x) { return x.id === el.dataset.id; })[0];
        if (c && c.locked) { toast('先完成其余关卡才能解锁终局挑战'); return; }
        select(el.dataset.id);
      });
    });
  }

  function select(id) {
    var c = state.challenges.filter(function (x) { return x.id === id; })[0];
    if (!c) return;
    current = c;
    Array.prototype.forEach.call(document.querySelectorAll('.nav-item'), function (el) {
      el.classList.toggle('is-active', el.dataset.id === id);
    });

    var cat = state.categories.filter(function (x) { return x.id === c.cat; })[0] || { name: '关卡', color: '#22d3ee' };
    var hints = (c.hints || []).map(function (h, i) {
      return '<div class="hint"><span class="n">' + (i + 1) + '</span><div>' + esc(h) + '</div></div>';
    }).join('');

    var body =
      '<div class="detail">' +
        '<div class="detail-head"><div>' +
          '<h1>' + esc(c.title) + '</h1>' +
          '<div class="chips">' +
            '<span class="chip" style="color:' + cat.color + ';border-color:' + cat.color + '33">' + esc(cat.name) + '</span>' +
            '<span class="chip">难度 · ' + esc(c.level) + '</span>' +
            '<span class="chip points">' + c.points + ' 分</span>' +
            (c.solved ? '<span class="chip ok">已通关</span>' : '') +
            (c.locked ? '<span class="chip">未解锁</span>' : '') +
          '</div>' +
        '</div></div>' +

        '<div class="panel"><div class="panel-title">场景描述</div><p>' + esc(c.summary) + '</p></div>' +
        '<div class="panel"><div class="panel-title">通关目标</div><p class="goal">' + esc(c.goal) + '</p></div>' +

        '<div class="panel">' +
          '<div class="panel-title">目标入口</div>' +
          '<div class="entry-row">' +
            '<a class="btn btn-primary" href="' + esc(c.entry.path) + '" target="_blank" rel="noopener">' + esc(c.entry.label) + ' ↗</a>' +
            '<span class="entry-url">' + esc(c.entry.path) + '</span>' +
          '</div>' +
          '<div class="meta-line"><span>提示数量 <b>' + (c.hints || []).length + '</b></span>' +
          '<span>关卡 ID <b>' + esc(c.id) + '</b></span></div>' +
        '</div>' +

        '<div class="panel">' +
          '<div class="panel-title">通关线索</div>' +
          (hints || '<p class="empty-hint">本关没有提示，靠自己。</p>') +
        '</div>' +

        '<div class="panel">' +
          '<div class="panel-title">提交 Flag</div>' +
          (c.solved
            ? '<p>这一关你已经拿下了，flag 记录如下：</p><div class="solved-box">' + esc(c.flag) + '</div>'
            : '<p>把在靶标上找到的 flag 提交到这里，格式形如 <code>flag{...}</code>。</p>' +
              '<form class="flag-form" id="flag-form">' +
                '<input id="flag-input" type="text" placeholder="flag{...}" autocomplete="off" spellcheck="false">' +
                '<button class="btn btn-primary" type="submit">提交</button>' +
              '</form>' +
              '<div class="feedback" id="feedback"></div>') +
        '</div>' +
      '</div>';

    $('stage').innerHTML = body;
    $('stage').scrollTop = 0;

    var form = $('flag-form');
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        submit(c.id, $('flag-input').value);
      });
    }
  }

  function submit(challengeId, flag) {
    var fb = $('feedback');
    if (!flag || !flag.trim()) {
      fb.className = 'feedback err';
      fb.textContent = '请先填写 flag';
      return;
    }
    fb.className = 'feedback';
    fb.textContent = '校验中…';
    fetch('/api/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ challengeId: challengeId, flag: flag.trim(), actor: actor() })
    })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) {
          toast(d.message);
          load().then(function () { select(challengeId); });
        } else {
          fb.className = 'feedback err';
          fb.textContent = d.message || '提交失败';
        }
      })
      .catch(function () {
        fb.className = 'feedback err';
        fb.textContent = '网络错误，请重试';
      });
  }

  /* ---------------- 排行榜 ---------------- */
  function openBoard() {
    var rows = (state.leaderboard || []).map(function (r, i) {
      return '<div class="board-row' + (i === 0 ? ' top1' : '') + '">' +
        '<span class="board-rank">' + (i + 1) + '</span>' +
        '<span>' + esc(r.actor) + (r.actor === actor() ? ' <span class="board-sub">(你)</span>' : '') + '</span>' +
        '<span class="board-score">' + r.score + '</span>' +
        '<span class="board-sub">' + r.solved + ' 关</span>' +
        '</div>';
    }).join('');
    $('boardBody').innerHTML = rows || '<div class="empty-hint">还没有人提交 flag</div>';
    $('boardModal').hidden = false;
  }

  /* ---------------- 抓包 / 扫描面板 ---------------- */
  function copyText(t) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(t).then(function () { toast('已复制：' + t); }, function () { toast(t); });
    } else {
      toast(t);
    }
  }

  function cmdRow(item) {
    return '<div class="cmd-row">' +
      '<span class="cmd-label">' + esc(item.label) + '</span>' +
      '<code class="cmd-text">' + esc(item.cmd) + '</code>' +
      '<button class="cmd-copy" data-cmd="' + esc(item.cmd) + '">复制</button>' +
      '</div>';
  }

  function openNet() {
    fetch('/api/net').then(function (r) { return r.json(); }).then(function (d) {
      var ports = d.ports.map(function (p) {
        return '<div class="port-row">' +
          '<span class="port-num">' + p.port + '</span>' +
          '<span class="port-proto">' + esc(p.proto) + '</span>' +
          '<div class="port-meta"><div class="port-svc">' + esc(p.service) + '</div>' +
          '<div class="port-note">' + esc(p.note) + '</div></div>' +
          '</div>';
      }).join('');

      $('netBody').innerHTML =
        '<div class="net-section"><h3>真实监听端口</h3><div class="port-list">' + ports + '</div></div>' +
        '<div class="net-section"><h3>抓包（Burp / mitmproxy）</h3><div class="cmd-list">' +
        d.capture.map(cmdRow).join('') + '</div></div>' +
        '<div class="net-section"><h3>扫描（nmap / dirsearch / nikto / sqlmap）</h3><div class="cmd-list">' +
        d.scan.map(cmdRow).join('') + '</div></div>' +
        '<p class="net-tip">靶场是真实 HTTP 服务：响应头、Cookie、状态码、报错都是真实产生的，' +
        '扫描器看到的差异不是伪造的。点「复制」可直接粘贴到终端。</p>';

      Array.prototype.forEach.call(document.querySelectorAll('.cmd-copy'), function (b) {
        b.addEventListener('click', function () { copyText(b.dataset.cmd); });
      });

      $('netModal').hidden = false;
    }).catch(function () { toast('无法获取网络信息'); });
  }

  /* ---------------- 事件 ---------------- */
  $('btn-board').addEventListener('click', openBoard);
  $('btn-net').addEventListener('click', openNet);
  $('modal-close').addEventListener('click', function () { $('boardModal').hidden = true; });
  $('net-close').addEventListener('click', function () { $('netModal').hidden = true; });

  ['boardModal', 'netModal'].forEach(function (id) {
    $(id).addEventListener('click', function (e) { if (e.target === $(id)) $(id).hidden = true; });
  });

  $('btn-reset').addEventListener('click', function () {
    if (!confirm('重置会清空所有通关记录并重新生成 flag，确定继续？')) return;
    fetch('/api/reset', { method: 'POST' })
      .then(function (r) { return r.json(); })
      .then(function (d) {
        if (d.ok) { toast('靶场已重置'); current = null; load(); }
      });
  });

  var actorInput = $('actor');
  actorInput.addEventListener('change', function () {
    var v = (actorInput.value || '').trim().slice(0, 24);
    if (!v) { actorInput.value = actor(); return; }
    localStorage.setItem(ACTOR_KEY, v);
    toast('操作员已切换为 ' + v + '，进度按该昵称统计');
    current = null;
    load();
  });
  actorInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') actorInput.blur(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') { $('boardModal').hidden = true; $('netModal').hidden = true; }
  });

  load();

  // 深链：/#net 直接打开抓包面板，/#board 打开排行榜
  if (location.hash === '#net') setTimeout(openNet, 300);
  if (location.hash === '#board') setTimeout(openBoard, 300);
})();
