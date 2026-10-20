/* ==========================================================
   Nexus Agent: site behaviour
   ========================================================== */
(function () {
  'use strict';

  // Replace YOUR-USERNAME with your GitHub handle (also in index.html).
  var REPO_URL = 'https://github.com/YOUR-USERNAME/kritical-nexus-agent';

  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, reduceMotion ? 0 : ms); }); };
  var fmt = function (n) { return '$' + n.toLocaleString('en-US'); };

  $$('.gh-link').forEach(function (a) { a.href = REPO_URL; });

  /* ---------- Theme ---------- */

  var root = document.documentElement;
  var themeBtn = $('#themeBtn');
  var darkMq = window.matchMedia('(prefers-color-scheme: dark)');
  var ICON_SUN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.2"/><path d="M12 2.5v2.2M12 19.3v2.2M4.6 4.6l1.6 1.6M17.8 17.8l1.6 1.6M2.5 12h2.2M19.3 12h2.2M4.6 19.4l1.6-1.6M17.8 6.2l1.6-1.6"/></svg>';
  var ICON_MOON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" aria-hidden="true"><path d="M20.5 14.3A8.5 8.5 0 0 1 9.7 3.5a8.5 8.5 0 1 0 10.8 10.8z"/></svg>';

  function effectiveTheme() {
    return root.getAttribute('data-theme') || (darkMq.matches ? 'dark' : 'light');
  }
  function paintThemeBtn() {
    var dark = effectiveTheme() === 'dark';
    themeBtn.innerHTML = dark ? ICON_SUN : ICON_MOON;
    themeBtn.setAttribute('aria-label', dark ? 'Switch to light theme' : 'Switch to dark theme');
  }
  themeBtn.addEventListener('click', function () {
    var next = effectiveTheme() === 'dark' ? 'light' : 'dark';
    root.setAttribute('data-theme', next);
    try { localStorage.setItem('nexus-theme', next); } catch (e) { /* storage unavailable */ }
    paintThemeBtn();
  });
  if (darkMq.addEventListener) darkMq.addEventListener('change', paintThemeBtn);
  paintThemeBtn();

  /* ---------- Mobile menu ---------- */

  var menuBtn = $('#menuBtn');
  var navLinks = $('#navLinks');
  function setMenu(open) {
    navLinks.classList.toggle('open', open);
    menuBtn.setAttribute('aria-expanded', String(open));
    menuBtn.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
  }
  menuBtn.addEventListener('click', function () { setMenu(!navLinks.classList.contains('open')); });
  navLinks.addEventListener('click', function (e) { if (e.target.closest('a')) setMenu(false); });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && navLinks.classList.contains('open')) { setMenu(false); menuBtn.focus(); }
  });

  /* ---------- Active section in nav ---------- */

  var linkMap = {};
  $$('.nav-links a').forEach(function (a) { linkMap[a.getAttribute('href').slice(1)] = a; });
  if ('IntersectionObserver' in window) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        Object.keys(linkMap).forEach(function (k) { linkMap[k].removeAttribute('aria-current'); });
        var link = linkMap[en.target.id];
        if (link) link.setAttribute('aria-current', 'location');
      });
    }, { rootMargin: '-45% 0px -50% 0px' });
    Object.keys(linkMap).forEach(function (id) {
      var s = document.getElementById(id);
      if (s) spy.observe(s);
    });
  }

  /* ==========================================================
     Live demo: a simulated agent run (illustrative data)
     ========================================================== */

  var GOAL = 'Compare Starter and Pro pricing at 50 seats, billed annually';
  var STEPS = ['Toggled annual billing', 'Set seats = 50', 'Extracted tier table'];
  var BASE = [
    { id: 'a', name: 'Competitor A', host: 'competitor-a.example', starter: 29, pro: 1450, conf: 98, durations: [4.1, 3.8, 3.7, 0.4] },
    { id: 'b', name: 'Competitor B', host: 'competitor-b.example', starter: 19, pro: 1200, conf: 95, durations: [3.6, 4.2, 3.8, 0.4] },
    { id: 'c', name: 'Competitor C', host: 'competitor-c.example', starter: 39, pro: 1990, conf: 91, durations: [4.4, 3.5, 3.7, 0.4] }
  ];
  var MS_PER_SIM_SECOND = 200; // 12 simulated seconds play in about 2.4 real seconds

  var el = {
    status: $('#runStatus'),
    statusText: $('#runStatus .status-text'),
    goal: $('#goalText'),
    typed: $('#typed'),
    runBtn: $('#runBtn'),
    rerunBtn: $('#rerunBtn'),
    planner: $('#plannerNote'),
    lanes: $('#lanes'),
    body: $('#matrixBody'),
    detail: $('#cellDetail'),
    diff: $('#diffBanner'),
    live: $('#liveRegion'),
    demo: $('#demo')
  };

  var running = false;
  var lastRun = null;       // data from the previous completed run
  var shown = {};           // data currently in the matrix, by id
  var changeShown = false;  // the simulated price move happens once per session
  var detailTrigger = null;

  function clone(list) { return list.map(function (c) { return Object.assign({}, c); }); }

  function setStatus(state, text) {
    el.status.setAttribute('data-state', state);
    el.statusText.textContent = text;
  }

  function renderLanes(data) {
    el.lanes.innerHTML = data.map(function (c) {
      var steps = STEPS.map(function (s) {
        return '<li class="step" data-state="pending"><span class="tick" aria-hidden="true"></span>' + s + '</li>';
      }).join('');
      return '<li class="lane" data-id="' + c.id + '">' +
        '<div class="lane-head"><strong>' + c.name + '</strong><span class="route">Agent API</span><span class="lane-time">0.0s</span></div>' +
        '<ul class="steps">' + steps +
        '<li class="step verify" data-state="pending"><span class="tick" aria-hidden="true"></span>JSON schema valid</li>' +
        '</ul></li>';
    }).join('');
  }

  function renderEmptyMatrix() {
    el.body.innerHTML = '<tr class="empty"><td colspan="4">Run the agents to fill the matrix.</td></tr>';
  }

  function renderPendingMatrix(data) {
    el.body.innerHTML = data.map(function (c) {
      return '<tr class="pending" data-id="' + c.id + '">' +
        '<th scope="row"><span class="comp">' + c.name + '</span><span class="meta">Agent running…</span></th>' +
        '<td><span class="skel"></span><span class="skel"></span></td>' +
        '<td><span class="skel"></span><span class="skel"></span></td>' +
        '<td><span class="skel"></span></td></tr>';
    }).join('');
  }

  function priceCell(c, tier, changed) {
    var value = tier === 'pro' ? c.pro : c.starter;
    var label = c.name + ', ' + (tier === 'pro' ? 'Pro at 50 seats' : 'Starter');
    return '<span class="price' + (changed ? ' is-changed' : '') + '">' + fmt(value) + '<small>/mo</small></span>' +
      '<button type="button" class="src" data-id="' + c.id + '" data-tier="' + tier + '" aria-controls="cellDetail" aria-expanded="false" aria-label="Source and trace for ' + label + '">Source</button>';
  }

  function rowHTML(c, prev) {
    var proChanged = !!prev && prev.pro !== c.pro;
    var proCell = priceCell(c, 'pro', proChanged);
    if (proChanged) {
      var delta = c.pro - prev.pro;
      var pct = (delta / prev.pro * 100).toFixed(1);
      proCell = '<span class="was">' + fmt(prev.pro) + '</span>' + proCell +
        '<span class="delta">' + (delta > 0 ? '+' : '−') + fmt(Math.abs(delta)) + ', ' + (delta > 0 ? '+' : '−') + Math.abs(pct) + '%</span>';
    }
    return '<tr class="fresh" data-id="' + c.id + '">' +
      '<th scope="row"><span class="comp">' + c.name + '</span><span class="meta">3 steps, 12s</span></th>' +
      '<td>' + priceCell(c, 'starter', false) + '</td>' +
      '<td>' + proCell + '</td>' +
      '<td><span class="conf"><span class="conf-num">' + c.conf + '%</span><span class="conf-bar"><i style="width:' + c.conf + '%"></i></span></span></td>' +
      '</tr>';
  }

  function countTo(node, from, to, ms) {
    return new Promise(function (resolve) {
      if (reduceMotion || ms <= 0) { node.textContent = to.toFixed(1) + 's'; resolve(); return; }
      var t0 = performance.now();
      function frame(now) {
        var p = Math.min(1, (now - t0) / ms);
        node.textContent = (from + (to - from) * p).toFixed(1) + 's';
        if (p < 1) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
  }

  function typeGoal() {
    el.goal.classList.add('typing');
    el.typed.textContent = '';
    if (reduceMotion) {
      el.typed.textContent = GOAL;
      el.goal.classList.remove('typing');
      return Promise.resolve();
    }
    var i = 0;
    return new Promise(function (resolve) {
      (function next() {
        i += 1;
        el.typed.textContent = GOAL.slice(0, i);
        if (i < GOAL.length) setTimeout(next, 22);
        else setTimeout(function () { el.goal.classList.remove('typing'); resolve(); }, 260);
      })();
    });
  }

  function runLane(c, index, prev) {
    var lane = el.lanes.querySelector('[data-id="' + c.id + '"]');
    var steps = $$('.step', lane);
    var timeEl = $('.lane-time', lane);
    var t = 0;
    return sleep(160 * index).then(function () {
      lane.classList.add('active');
      var chain = Promise.resolve();
      steps.forEach(function (step, k) {
        chain = chain.then(function () {
          step.setAttribute('data-state', 'running');
          var d = c.durations[k];
          var from = t;
          t += d;
          return countTo(timeEl, from, t, d * MS_PER_SIM_SECOND);
        }).then(function () {
          step.setAttribute('data-state', 'done');
        });
      });
      return chain;
    }).then(function () {
      lane.classList.remove('active');
      lane.classList.add('done');
      var row = el.body.querySelector('tr[data-id="' + c.id + '"]');
      var tmp = document.createElement('tbody');
      tmp.innerHTML = rowHTML(c, prev);
      row.replaceWith(tmp.firstElementChild);
      shown[c.id] = c;
    });
  }

  function dataForRun(mode) {
    if (mode === 'fresh' || !lastRun) return clone(BASE);
    var next = clone(lastRun);
    if (!changeShown) next[1].pro = 1250; // simulated price move on Competitor B
    return next;
  }

  function showDiff(prev, data) {
    if (!prev) { el.diff.hidden = true; return; }
    var changes = data.filter(function (c, i) { return c.pro !== prev[i].pro || c.starter !== prev[i].starter; });
    if (changes.length) {
      var c = changes[0];
      var p = prev[data.indexOf(c)];
      var pct = ((c.pro - p.pro) / p.pro * 100).toFixed(1);
      el.diff.setAttribute('data-kind', 'change');
      el.diff.innerHTML = '<strong>1 change since the last run.</strong> ' + c.name + ' raised Pro at 50 seats from ' +
        fmt(p.pro) + ' to ' + fmt(c.pro) + ' a month (+' + pct + '%). In production this becomes a Slack or email alert.';
      el.diff.hidden = false;
      changeShown = true;
      return 'Change detected: ' + c.name + ' Pro at 50 seats went from ' + fmt(p.pro) + ' to ' + fmt(c.pro) + '.';
    }
    el.diff.setAttribute('data-kind', 'same');
    el.diff.innerHTML = '<strong>No changes since the last run.</strong> Every cell matches the previous snapshot.';
    el.diff.hidden = false;
    return 'No changes since the last run.';
  }

  function run(mode) {
    if (running) return;
    running = true;
    el.runBtn.disabled = true;
    el.rerunBtn.disabled = true;
    closeDetail(false);
    el.diff.hidden = true;
    if (mode === 'fresh') { lastRun = null; changeShown = false; }

    var prev = lastRun;
    var data = dataForRun(mode);
    shown = {};
    renderLanes(data);
    renderPendingMatrix(data);
    setStatus('planning', 'Planning');
    el.planner.textContent = 'Reading the goal';
    el.live.textContent = 'Run started.';

    var start = mode === 'fresh' ? typeGoal() : Promise.resolve(el.typed.textContent = GOAL);

    start.then(function () {
      el.planner.textContent = 'Planner made 3 agent tasks';
      return sleep(550);
    }).then(function () {
      setStatus('running', 'Running');
      el.planner.textContent = '3 agents running in parallel';
      return Promise.all(data.map(function (c, i) { return runLane(c, i, prev ? prev[i] : null); }));
    }).then(function () {
      lastRun = data;
      setStatus('live', 'Live');
      el.planner.textContent = 'All 3 agents done, every cell validated';
      var diffMsg = showDiff(prev, data);
      el.live.textContent = 'Run complete. Matrix filled with 3 competitors, every cell cited.' + (diffMsg ? ' ' + diffMsg : '');
      el.runBtn.disabled = false;
      el.rerunBtn.disabled = false;
      running = false;
    });
  }

  /* Source detail */
  function closeDetail(returnFocus) {
    el.detail.hidden = true;
    $$('.src[aria-expanded="true"]', el.body).forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    if (returnFocus && detailTrigger && document.body.contains(detailTrigger)) detailTrigger.focus();
    detailTrigger = null;
  }

  function openDetail(btn) {
    var c = shown[btn.getAttribute('data-id')];
    if (!c) return;
    var isPro = btn.getAttribute('data-tier') === 'pro';
    var trace = STEPS.concat('JSON schema valid').map(function (s) { return '<li>' + s + '</li>'; }).join('');
    $$('.src[aria-expanded="true"]', el.body).forEach(function (b) { b.setAttribute('aria-expanded', 'false'); });
    btn.setAttribute('aria-expanded', 'true');
    detailTrigger = btn;
    el.detail.innerHTML =
      '<div class="detail-head"><strong>' + c.name + ', ' + (isPro ? 'Pro at 50 seats' : 'Starter') + '</strong>' +
      '<button type="button" class="detail-close">Close</button></div>' +
      '<dl class="detail-grid">' +
      '<div><dt>Value</dt><dd>' + fmt(isPro ? c.pro : c.starter) + '/mo</dd></div>' +
      '<div><dt>Confidence</dt><dd>' + c.conf + '%</dd></div>' +
      '<div><dt>Source</dt><dd>https://' + c.host + '/pricing</dd></div>' +
      '</dl>' +
      '<ol class="detail-trace" aria-label="Agent step trace">' + trace + '</ol>';
    el.detail.hidden = false;
    $('.detail-close', el.detail).focus();
  }

  el.body.addEventListener('click', function (e) {
    var btn = e.target.closest('.src');
    if (!btn) return;
    if (btn.getAttribute('aria-expanded') === 'true') closeDetail(true);
    else openDetail(btn);
  });
  el.detail.addEventListener('click', function (e) {
    if (e.target.closest('.detail-close')) closeDetail(true);
  });

  el.runBtn.addEventListener('click', function () { run('fresh'); });
  el.rerunBtn.addEventListener('click', function () { run('rerun'); });

  // Initial state, then play once when the console comes into view
  renderLanes(BASE);
  renderEmptyMatrix();
  setStatus('idle', 'Ready');

  var autoPlayed = false;
  function startOnce() {
    if (autoPlayed) return;
    autoPlayed = true;
    if (demoObserver) demoObserver.disconnect();
    run('fresh');
  }
  var demoObserver = null;
  if ('IntersectionObserver' in window) {
    demoObserver = new IntersectionObserver(function (entries) {
      if (entries.some(function (en) { return en.isIntersecting; })) startOnce();
    }, { threshold: 0.9 });
    demoObserver.observe($('.goal-row', el.demo));
  }

  $$('[data-run-demo]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      e.preventDefault();
      el.demo.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block: 'start' });
      if (running) return;
      if (!autoPlayed) { setTimeout(startOnce, reduceMotion ? 0 : 500); return; }
      setTimeout(function () { run('fresh'); }, reduceMotion ? 0 : 500);
    });
  });

  /* ==========================================================
     AI loop tabs
     ========================================================== */

  var tabs = $$('.stage-tab');
  function selectTab(tab, focus) {
    tabs.forEach(function (t) {
      var on = t === tab;
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    if (focus) tab.focus();
  }
  tabs.forEach(function (tab, i) {
    tab.addEventListener('click', function () { selectTab(tab, false); });
    tab.addEventListener('keydown', function (e) {
      var j = null;
      if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
      else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = tabs.length - 1;
      if (j !== null) { e.preventDefault(); selectTab(tabs[j], true); }
    });
  });

  /* ==========================================================
     Architecture tracer
     ========================================================== */

  var nodes = $$('#pipeline .node');
  var loops = { retry: $('[data-loop="retry"]'), fallback: $('[data-loop="fallback"]') };
  var caption = $('#traceCaption');
  var traceBtns = $$('[data-trace]');
  var tracing = false;

  var START = [
    [0, 'You submit a goal from the React UI.'],
    [1, 'FastAPI hands it to the LangGraph state machine, which plans per-site tasks and fans them out over the Redis queue.']
  ];
  var FINISH = [
    [4, 'The synthesis LLM writes comparisons from validated cells only.'],
    [5, 'The cited matrix renders, and Postgres stores a snapshot so the next run can be diffed.']
  ];
  var SCENARIOS = {
    clean: START.concat([
      [2, 'TinyFish agents run in parallel, and each step streams to the UI over SSE.'],
      [3, 'Pydantic validates every extraction against its schema, and the verifier scores confidence.']
    ], FINISH),
    retry: START.concat([
      [2, 'An agent comes back with a pricing table.'],
      [3, 'The verifier scores it low, so the cell isn’t accepted.', 'warn'],
      ['retry', 'LangGraph refines the goal and sends the task back to the Agent API.', 'warn'],
      [2, 'The agent tries again with the refined goal.'],
      [3, 'This time the cell validates with high confidence.']
    ], FINISH),
    fallback: START.concat([
      [2, 'The agent run fails partway through.', 'warn'],
      ['fallback', 'Fallback kicks in: the Fetch API returns the page as markdown and a rule-based parser extracts the tiers.', 'warn'],
      [3, 'The parsed values still go through schema validation like any other cell.']
    ], FINISH)
  };

  function clearTrace() {
    nodes.forEach(function (n) { n.classList.remove('lit', 'warn', 'visited'); });
    loops.retry.classList.remove('lit');
    loops.fallback.classList.remove('lit');
  }

  function playTrace(name) {
    if (tracing) return;
    tracing = true;
    traceBtns.forEach(function (b) {
      b.disabled = true;
      b.setAttribute('aria-pressed', String(b.getAttribute('data-trace') === name));
    });
    clearTrace();
    var steps = SCENARIOS[name];
    var chain = Promise.resolve();
    steps.forEach(function (s) {
      chain = chain.then(function () {
        nodes.forEach(function (n) {
          if (n.classList.contains('lit') || n.classList.contains('warn')) {
            n.classList.remove('lit', 'warn');
            n.classList.add('visited');
          }
        });
        loops.retry.classList.remove('lit');
        loops.fallback.classList.remove('lit');
        var target = typeof s[0] === 'number' ? nodes[s[0]] : loops[s[0]];
        target.classList.add(s[2] === 'warn' && typeof s[0] === 'number' ? 'warn' : 'lit');
        caption.textContent = s[1];
        caption.setAttribute('data-kind', s[2] === 'warn' ? 'warn' : 'ok');
        return sleep(1300);
      });
    });
    chain.then(function () {
      tracing = false;
      traceBtns.forEach(function (b) { b.disabled = false; });
    });
  }
  traceBtns.forEach(function (b) {
    b.addEventListener('click', function () { playTrace(b.getAttribute('data-trace')); });
  });

  /* ==========================================================
     TinyFish router
     ========================================================== */

  var PAGES = [
    { label: 'Pricing calculator', api: 'agent', why: 'Totals only appear after the form is filled in, so an agent fills the calculator and reads the result.' },
    { label: 'Monthly/annual toggle', api: 'agent', why: 'Prices change when billing is toggled, so an agent clicks the toggle and reads both states.' },
    { label: 'Seat slider', api: 'agent', why: 'The 50-seat price doesn’t exist until the slider moves, so an agent drags it.' },
    { label: 'Paginated plan table', api: 'agent', why: 'An agent pages through the plan table and dismisses any modal in the way.' },
    { label: 'Docs page', api: 'fetch', why: 'Static content. The Fetch API renders it into clean markdown, cheaper and faster than running an agent.' },
    { label: 'Changelog', api: 'fetch', why: 'Plain text that only needs reading. The Fetch API returns it as markdown or JSON.' },
    { label: 'Blog or review', api: 'fetch', why: 'Readable as-is, so the Fetch API handles it without any clicking.' },
    { label: 'Failed agent run', api: 'fetch', why: 'Deterministic fallback: the Fetch API’s markdown goes to a rule-based parser so the cell still gets filled.' }
  ];
  var pagesWrap = $('#routerPages');
  var reason = $('#routeReason');
  var targets = $$('.route-target');

  pagesWrap.innerHTML = PAGES.map(function (p, i) {
    return '<button type="button" class="page-chip" data-i="' + i + '" aria-pressed="false">' + p.label + '</button>';
  }).join('');
  var chips = $$('.page-chip', pagesWrap);

  function route(i) {
    var p = PAGES[i];
    chips.forEach(function (c, j) { c.setAttribute('aria-pressed', String(j === i)); });
    targets.forEach(function (t) { t.classList.toggle('on', t.getAttribute('data-api') === p.api); });
    reason.textContent = p.label + ' → ' + (p.api === 'agent' ? 'Agent API' : 'Fetch API') + '. ' + p.why;
  }
  chips.forEach(function (c, i) { c.addEventListener('click', function () { route(i); }); });
  route(0);
})();
