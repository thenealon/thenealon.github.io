/*!
 * tidal-graph.js -- an ambient random geometric graph, advected by a tide.
 *
 * MODEL.  Vertices are n points in the (slightly enlarged) viewport; two
 * vertices are joined whenever their Euclidean distance is less than r.
 * This is Gilbert's random geometric graph G(n, r):
 *   E. N. Gilbert, "Random plane networks", J. Soc. Indust. Appl. Math. 9
 *     (1961), 533-543.
 *   M. D. Penrose, "Random Geometric Graphs", Oxford Univ. Press, 2003.
 *
 * CHOICE OF r.  The expected degree of the model is k = n*pi*r^2/A, so we fix
 * a target k and solve r = sqrt(k*A/(pi*n)).  We use k = 5.5, which sits above
 * the continuum percolation threshold of the Gilbert disc model, k_c =
 * 4.51218... (Quintanilla, Torquato & Ziff, "Efficient measurement of the
 * percolation threshold for fully penetrable discs", J. Phys. A 33 (2000),
 * L399-L407: eta_c = 1.128087 for discs of radius r/2, and k = 4*eta), but
 * below the connectivity threshold k ~ log n (Penrose 1997/2003).  So the
 * picture is always one ragged giant component adrift in isolated debris --
 * supercritical, but a long way from connected.
 *
 * THE TIDE.  Vertices are carried by a velocity field v = (dpsi/dy, -dpsi/dx)
 * derived from a stream function psi that is a sum of three travelling
 * sinusoidal modes, plus a uniform current whose magnitude oscillates with a
 * period of ~74 s and whose bearing rotates slowly.  Any such field is
 * divergence-free, so the flow neither compresses nor rarefies the point
 * process: the graph drifts and reshuffles without the vertices piling up.
 * Edges therefore fade in and out continuously rather than blinking.
 *
 * The domain is a torus (positions wrap through an off-screen margin), so
 * there is no boundary depletion and no visible teleporting.
 *
 * BOOTSTRAP PERCOLATION. Coffee mode runs synchronous r-neighbour bootstrap
 * percolation on a finite rectangular subset of Z^2, without wraparound or
 * an infected exterior. A site joins the infected set when at least r of
 * its four orthogonal neighbours were infected in the previous generation.
 * A site never heals within a round.
 *
 * Each experiment begins with an independent Bernoulli seed set A_0. It is
 * held for four seconds before propagation. Subsequent generations take
 * three seconds at the default pace. Only the threshold rule adds sites;
 * the actual closure is held before fading into a fresh experiment.
 *
 * Graph-paper lines and vertices are fixed. Brown dots show A_t exactly;
 * a softly spreading coffee stain interpolates each discrete update.
 * The pigment settles between updates, without moving the lattice or
 * suggesting propagation unrelated to the bootstrap rule.
 *
 * Only one of the two runs at a time; the control in the corner switches
 * between them and the choice is remembered.  The idle one is neither
 * stepped nor drawn.
 *
 * Dependencies: coffee-surface.js; no third-party libraries or WebGL.
 * Degrades to a plain background without JS.
 */
(function () {
  'use strict';

  var canvas = document.getElementById('tidal-graph');
  if (!canvas || !canvas.getContext) { return; }
  var ctx = canvas.getContext('2d');
  if (!ctx) { return; }

  var TAU = Math.PI * 2;

  /* ---- tunables ---------------------------------------------------- */
  var AREA_PER_VERTEX = 4200;   /* px^2 of viewport per vertex          */
  var MIN_N = 50, MAX_N = 780;  /* clamp, for phones and for 5K monitors */
  var MEAN_DEGREE = 5.8;        /* nominal k; the domain has a boundary, */
                                /* so the realised mean degree is ~5.5.  */
  var MARGIN = 90;              /* off-screen apron, px                 */
  var MAX_DT = 0.05;            /* s; clamps jumps after a tab switch   */
  var EDGE_BUCKETS = 6;         /* quantised opacity bands for edges    */
  /* Turtle is the default and is deliberately languid; rabbit is the pace
     the constants below are actually written for. */
  var TURTLE = 0.25, RABBIT = 1;
  /* An edge's weight is a function of distance alone: it is at its faintest
     as the pair crosses the threshold and strongest when they are close.
     So edges dissolve into and out of existence continuously as vertices
     drift, with no event, no flash and nothing to catch the eye.        */
  var NODE_LEVELS = 5;          /* quantised degree levels for vertices */

  /* stream-function modes: {speed px/s, spatial freqs, temporal freqs}.
     The short-wavelength modes matter most: a purely large-scale current
     carries neighbouring vertices together and never changes an edge.      */
  var MODES = [
    { s: 3.0, ax: 0.0042, by: 0.0031, w1:  0.11, w2: -0.07 },
    { s: 1.9, ax: 0.0019, by: 0.0056, w1: -0.06, w2:  0.09 },
    { s: 1.7, ax: 0.0091, by: 0.0083, w1:  0.17, w2:  0.13 },
    { s: 1.2, ax: 0.0175, by: 0.0152, w1:  0.29, w2: -0.24 }
  ];
  var TIDE_SPEED = 2.4;   /* px/s, peak uniform current                 */
  var TIDE_PERIOD = 74;   /* s, one flood-ebb cycle                     */
  var SWIRL = 0.021;      /* rad/s, bearing of the current              */
  var NOISE_SIGMA = 2.2;  /* px/s, r.m.s. of the per-vertex eddy velocity */
  var NOISE_TAU = 2.5;    /* s, its correlation time                     */
  var WAKE_R = 130;       /* px, radius of the pointer wake             */
  var WAKE_S = 26;        /* px/s, strength of the pointer wake         */

  /* bootstrap percolation */
  var PERC_CELL = 24;          /* px per lattice site; keep neighbours legible */
  var PERC_R = 2;              /* orthogonal neighbours required */
  var PERC_STEP = 3;           /* seconds per synchronous generation */
  var PERC_FAST_STEP = 1.25;   /* optional faster observation */
  var PERC_P = 0.42;           /* seed density = PERC_P / log(min side) */
  var PERC_P_MIN = 0.06, PERC_P_MAX = 0.13;
  var PERC_HOLD = 14;          /* time to inspect the actual closure */
  var PERC_CLEAR = 3;          /* gentle fade between independent experiments */
  var PERC_SEED_HOLD = 4;      /* time to inspect A_0 */

  /* ---- state ------------------------------------------------------- */
  var W = 0, H = 0, EW = 0, EH = 0, n = 0, r = 0, r2 = 0;
  var xs, ys, vx, vy, deg;
  var segs, segB, segN = 0, maxE = 0;
  var cols = 0, rows = 0, head, nxt;
  var bg = '#0a0a0b', edgeA = 0.30, nodeCols = [];
  var raf = 0, lastT = 0, paused = false, reduced = false;
  /* prefers-reduced-motion stops the animation, as it should.  But the
     setting is on by default for a lot of people who would still like to
     watch this, so pressing play explicitly overrides it for the session. */
  var override = false;
  /* Two backgrounds share this file and only one runs at a time: bootstrap
     percolation, and the random geometric graph.  The control in the corner
     switches them; the idle one is neither stepped nor drawn.  The graph
     (and with it the dark palette) is the default.                      */
  var mode = 'graph';
  var speed = TURTLE;         /* TURTLE or RABBIT */
  var edgeCol = [206, 197, 178], glowCol = [217, 148, 0];
  var edgeBand = [];          /* per-band stroke style, built in readTheme */
  var mx = -1e9, my = -1e9, wake = false;
  var coffee = null;
  var pInf = null, pLevel = null, pCols = 0, pRows = 0;
  var pCount = 0, pTotal = 0, pGen = 0, pAdd = null;
  var pPhase = 'seed', pTimer = 0, pAcc = 0;
  var pOpacity = 1;
  var fu = 0, fv = 0;   /* flow() writes here, to avoid allocating */

  /* ---- helpers ----------------------------------------------------- */
  function hexToRgb(h) {
    if (!h) { return null; }
    h = h.replace(/^#/, '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    if (h.length !== 6) { return null; }
    var v = parseInt(h, 16);
    if (isNaN(v)) { return null; }
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }

  /* cheap unit-variance noise: three uniforms, Irwin-Hall, scaled */
  function gauss() {
    return (Math.random() + Math.random() + Math.random() - 1.5) * 2;
  }

  function mix(a, b, u) {
    return [Math.round(a[0] + (b[0] - a[0]) * u),
            Math.round(a[1] + (b[1] - a[1]) * u),
            Math.round(a[2] + (b[2] - a[2]) * u)];
  }

  function readTheme() {
    var cs = getComputedStyle(document.documentElement);
    function v(name) { return (cs.getPropertyValue(name) || '').trim(); }
    bg = v('--bg') || '#0a0a0b';
    edgeCol = hexToRgb(v('--graph-edge')) || [206, 197, 178];
    glowCol = hexToRgb(v('--graph-glow')) || [217, 148, 0];
    edgeA = parseFloat(v('--graph-edge-alpha'));
    if (!(edgeA > 0)) { edgeA = 0.30; }
    var lo = hexToRgb(v('--graph-node-lo')) || [107, 98, 90];
    var hi = hexToRgb(v('--graph-node-hi')) || [255, 179, 0];
    var na = parseFloat(v('--graph-node-alpha'));
    if (!(na > 0)) { na = 0.85; }
    /* band 0 is a pair just crossing the threshold, band 5 a close pair */
    edgeBand = [];
    for (var q = 0; q < EDGE_BUCKETS; q++) {
      var u = (q + 0.5) / EDGE_BUCKETS;
      var col = mix(edgeCol, glowCol, Math.pow(u, 1.5));
      edgeBand.push({
        stroke: 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' +
                (edgeA * (0.10 + 0.90 * u)).toFixed(3) + ')',
        width: (0.45 + 0.75 * u).toFixed(2)
      });
    }

    nodeCols = [];
    for (var i = 0; i < NODE_LEVELS; i++) {
      var c = mix(lo, hi, i / (NODE_LEVELS - 1));
      nodeCols.push('rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' +
                    (na * (0.55 + 0.45 * i / (NODE_LEVELS - 1))).toFixed(3) + ')');
    }
  }

  /* ---- construction ------------------------------------------------ */
  function build() {
    W = canvas.clientWidth || window.innerWidth;
    H = canvas.clientHeight || window.innerHeight;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.max(1, Math.round(W * dpr));
    canvas.height = Math.max(1, Math.round(H * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    EW = W + 2 * MARGIN;
    EH = H + 2 * MARGIN;
    var A = EW * EH;

    n = Math.round(A / AREA_PER_VERTEX);
    if (n < MIN_N) { n = MIN_N; }
    if (n > MAX_N) { n = MAX_N; }

    r = Math.sqrt(MEAN_DEGREE * A / (Math.PI * n));
    r2 = r * r;

    xs = new Float32Array(n);
    ys = new Float32Array(n);
    vx = new Float32Array(n);
    vy = new Float32Array(n);
    deg = new Uint16Array(n);
    for (var i = 0; i < n; i++) {
      xs[i] = -MARGIN + Math.random() * EW;
      ys[i] = -MARGIN + Math.random() * EH;
      vx[i] = NOISE_SIGMA * gauss();
      vy[i] = NOISE_SIGMA * gauss();
    }

    maxE = n * 10;
    segs = new Float32Array(maxE * 4);
    segB = new Uint8Array(maxE);

    cols = Math.max(1, Math.ceil(EW / r));
    rows = Math.max(1, Math.ceil(EH / r));
    head = new Int32Array(cols * rows);
    nxt = new Int32Array(n);

    readTheme();
    initPerc();
  }

  /* ---- the tidal field --------------------------------------------
     v = (dpsi/dy, -dpsi/dx) for a sum of travelling sinusoidal modes,
     plus a uniform current.  Divergence-free by construction.  Writes
     into fu/fv rather than returning, so it allocates nothing.        */
  function flow(x, y, t, tux, tuy) {
    var u = tux, v = tuy;
    for (var m = 0; m < MODES.length; m++) {
      var M = MODES[m];
      var a = M.ax * x + M.w1 * t;
      var b = M.by * y + M.w2 * t;
      u += M.s * Math.sin(a) * Math.cos(b);
      v -= M.s * (M.ax / M.by) * Math.cos(a) * Math.sin(b);
    }
    fu = u;
    fv = v;
  }

  /* ---- dynamics ---------------------------------------------------- */
  function step(dt, t) {
    if (mode === 'perc') { stepPerc(dt); return; }

    var tide = TIDE_SPEED * Math.sin(TAU * t / TIDE_PERIOD);
    var th = SWIRL * t;
    var tux = tide * Math.cos(th), tuy = tide * Math.sin(th);
    /* exact update for the Ornstein-Uhlenbeck eddy velocity */
    var decay = Math.exp(-dt / NOISE_TAU);
    var kick = NOISE_SIGMA * Math.sqrt(1 - decay * decay);

    for (var i = 0; i < n; i++) {
      var x = xs[i], y = ys[i];
      flow(x, y, t, tux, tuy);
      var u = fu, v = fv;

      /* small independent eddies: without them the flow is too coherent
         to break any edges, and the graph would drift without changing. */
      vx[i] = vx[i] * decay + kick * gauss();
      vy[i] = vy[i] * decay + kick * gauss();
      u += vx[i];
      v += vy[i];

      if (wake) {
        var dx = x - mx, dy = y - my, d2 = dx * dx + dy * dy;
        if (d2 < WAKE_R * WAKE_R && d2 > 1) {
          var d = Math.sqrt(d2), f = WAKE_S * (1 - d / WAKE_R) / d;
          u += f * dx;
          v += f * dy;
        }
      }

      x += u * dt;
      y += v * dt;
      if (x < -MARGIN) { x += EW; } else if (x > W + MARGIN) { x -= EW; }
      if (y < -MARGIN) { y += EH; } else if (y > H + MARGIN) { y -= EH; }
      xs[i] = x;
      ys[i] = y;
    }

  }


  /* ---- bootstrap percolation ---------------------------------------- */

  function initPerc() {
    pCols = Math.max(4, Math.floor(W / PERC_CELL));
    pRows = Math.max(4, Math.floor(H / PERC_CELL));
    pTotal = pCols * pRows;
    pInf = new Uint8Array(pTotal);
    pLevel = new Float32Array(pTotal);
    pAdd = new Int32Array(pTotal);
    if (!coffee && window.createCoffeeSurface) {
      coffee = window.createCoffeeSurface();
    }
    if (coffee) { coffee.resize(W, H, pCols, pRows, PERC_CELL); }
    newRound();
  }

  function seedDensity() {
    return Math.max(PERC_P_MIN, Math.min(PERC_P_MAX,
      PERC_P / Math.log(Math.max(3, Math.min(pCols, pRows)))));
  }

  function labelGeneration() {
    var output = document.getElementById('perc-generation');
    if (output) { output.textContent = pGen; }
    var status = document.getElementById('perc-status');
    if (status) { status.setAttribute('data-phase', pPhase); }
  }

  function newRound() {
    pInf.fill(0);
    pLevel.fill(0);
    pCount = 0;
    pGen = 0;
    pAcc = 0;
    pTimer = 0;
    pOpacity = 1;
    pPhase = 'seed';
    if (coffee && coffee.reset) { coffee.reset(); }
    var p = seedDensity();
    for (var i = 0; i < pTotal; i++) {
      if (Math.random() >= p) { continue; }
      pInf[i] = 1;
      pLevel[i] = 1;
      pCount++;
    }
    /* A_0 is visible immediately, including with reduced motion or pause. */
    labelGeneration();
  }

  /* One synchronous update. No sprinkling or spontaneous infection. */
  function percGeneration() {
    var m = 0, x, y, i, k;
    for (y = 0; y < pRows; y++) {
      var row = y * pCols;
      for (x = 0; x < pCols; x++) {
        i = row + x;
        if (pInf[i]) { continue; }
        k = 0;
        if (x > 0 && pInf[i - 1]) { k++; }
        if (x < pCols - 1 && pInf[i + 1]) { k++; }
        if (y > 0 && pInf[i - pCols]) { k++; }
        if (y < pRows - 1 && pInf[i + pCols]) { k++; }
        if (k >= PERC_R) { pAdd[m++] = i; }
      }
    }
    for (k = 0; k < m; k++) { pInf[pAdd[k]] = 1; }
    pCount += m;
    return m;
  }

  function stepPerc(dt) {
    if (!pInf) { return; }
    var realDt = dt / speed;
    var period = speed === RABBIT ? PERC_FAST_STEP : PERC_STEP;
    var ease = 1 - Math.exp(-realDt * 3.5);
    for (var i = 0; i < pTotal; i++) {
      pLevel[i] += (pInf[i] - pLevel[i]) * ease;
      if (pInf[i] - pLevel[i] < .001) { pLevel[i] = pInf[i]; }
    }
    if (pPhase === 'seed') {
      pTimer += realDt;
      if (pTimer < PERC_SEED_HOLD) { return; }
      pPhase = 'grow'; pTimer = 0; pAcc = period;
    }
    if (pPhase === 'hold') {
      pTimer += realDt;
      if (pTimer >= PERC_HOLD) { pPhase = 'clear'; pTimer = 0; labelGeneration(); }
      return;
    }
    if (pPhase === 'clear') {
      pTimer += realDt;
      var u = Math.min(1, pTimer / PERC_CLEAR);
      pOpacity = 1 - u * u * (3 - 2 * u);
      if (u >= 1) { newRound(); }
      return;
    }
    pAcc += realDt;
    if (pAcc >= period) {
      pAcc -= period;
      pGen++;
      var m = percGeneration();
      if (!m || pCount >= pTotal) { pPhase = 'hold'; pTimer = 0; }
      labelGeneration();
    }
  }

  function drawPerc() {
    if (!pInf) { return; }
    if (coffee) { coffee.draw(ctx, pLevel, pInf, pOpacity); }
  }

  function push(x1, y1, x2, y2, band) {
    if (segN >= maxE) { return; }
    var o = segN << 2;
    segs[o] = x1; segs[o + 1] = y1;
    segs[o + 2] = x2; segs[o + 3] = y2;
    segB[segN++] = band;
  }

  /* ---- neighbour search: uniform grid of cell size r --------------- */
  var NB = [[1, 0], [-1, 1], [0, 1], [1, 1]];

  function edges() {
    var i, j, c;
    segN = 0;
    for (i = 0; i < n; i++) { deg[i] = 0; }
    for (c = head.length; c--;) { head[c] = -1; }

    for (i = 0; i < n; i++) {
      var cx = (xs[i] + MARGIN) / r | 0;
      var cy = (ys[i] + MARGIN) / r | 0;
      if (cx < 0) { cx = 0; } else if (cx >= cols) { cx = cols - 1; }
      if (cy < 0) { cy = 0; } else if (cy >= rows) { cy = rows - 1; }
      c = cy * cols + cx;
      nxt[i] = head[c];
      head[c] = i;
    }

    for (var gy = 0; gy < rows; gy++) {
      for (var gx = 0; gx < cols; gx++) {
        var h = head[gy * cols + gx];
        for (i = h; i !== -1; i = nxt[i]) {
          for (j = nxt[i]; j !== -1; j = nxt[j]) { pair(i, j); }
          for (var k = 0; k < 4; k++) {
            var ox = gx + NB[k][0], oy = gy + NB[k][1];
            if (ox < 0 || ox >= cols || oy >= rows) { continue; }
            for (j = head[oy * cols + ox]; j !== -1; j = nxt[j]) { pair(i, j); }
          }
        }
      }
    }

  }

  function pair(i, j) {
    var dx = xs[i] - xs[j], dy = ys[i] - ys[j];
    var d2 = dx * dx + dy * dy;
    if (d2 >= r2) { return; }
    deg[i]++;
    deg[j]++;
    if (segN >= maxE) { return; }

    /* slack is 1 at coincident vertices and 0 at the threshold; smoothstep
       it so an edge dissolves rather than blinks */
    var sl = 1 - Math.sqrt(d2) / r;
    sl = sl * sl * (3 - 2 * sl);
    var b = (sl * EDGE_BUCKETS) | 0;
    if (b > EDGE_BUCKETS - 1) { b = EDGE_BUCKETS - 1; }
    push(xs[i], ys[i], xs[j], ys[j], b);
  }

  /* ---- rendering --------------------------------------------------- */
  function draw() {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);

    if (mode === 'perc') {
      drawPerc();
      return;
    }

    ctx.lineCap = 'round';

    for (var b = 0; b < EDGE_BUCKETS; b++) {
      var any = false;
      ctx.beginPath();
      for (var k = 0; k < segN; k++) {
        if (segB[k] !== b) { continue; }
        var o = k << 2;
        ctx.moveTo(segs[o], segs[o + 1]);
        ctx.lineTo(segs[o + 2], segs[o + 3]);
        any = true;
      }
      if (!any) { continue; }
      var st = edgeBand[b];
      ctx.strokeStyle = st.stroke;
      ctx.lineWidth = st.width;
      ctx.stroke();
    }

    for (var lv = 0; lv < NODE_LEVELS; lv++) {
      var rad = 1.1 + 1.4 * lv / (NODE_LEVELS - 1);
      var drew = false;
      ctx.beginPath();
      for (var i = 0; i < n; i++) {
        var d = deg[i];
        var l = d > 9 ? NODE_LEVELS - 1 : (d * 0.42) | 0;
        if (l !== lv) { continue; }
        var x = xs[i], y = ys[i];
        if (x < -4 || y < -4 || x > W + 4 || y > H + 4) { continue; }
        ctx.moveTo(x + rad, y);
        ctx.arc(x, y, rad, 0, TAU);
        drew = true;
      }
      if (!drew) { continue; }
      ctx.fillStyle = nodeCols[lv];
      ctx.fill();
    }
  }

  /* ---- loop -------------------------------------------------------- */
  function frame(now) {
    raf = 0;
    var t = now / 1000;
    /* Thirty frames per second is ample for the slowly spreading stain. */
    if (mode === 'perc' && lastT && t - lastT < 1 / 32) { schedule(); return; }
    var dt = lastT ? t - lastT : 0.016;
    lastT = t;
    if (dt > MAX_DT) { dt = MAX_DT; }
    dt *= speed;
    step(dt, t);
    if (mode === 'graph') { edges(); }
    draw();
    schedule();
  }

  function stopped() { return paused || (reduced && !override); }

  function schedule() {
    if (raf || stopped() || document.hidden) { return; }
    raf = window.requestAnimationFrame(frame);
  }

  function still() {
    if (mode === 'graph') { edges(); }
    draw();
  }

  /* ---- wiring ------------------------------------------------------ */
  var rTimer = 0, lastW = 0, lastH = 0;
  function onResize() {
    var w = canvas.clientWidth, h = canvas.clientHeight;
    /* ignore the small height changes a mobile URL bar makes while scrolling */
    if (w === lastW && Math.abs(h - lastH) < 90) { return; }
    clearTimeout(rTimer);
    rTimer = setTimeout(function () {
      lastW = canvas.clientWidth;
      lastH = canvas.clientHeight;
      build();
      still();
      schedule();
    }, 180);
  }

  var mq = window.matchMedia ?
    window.matchMedia('(prefers-reduced-motion: reduce)') : null;

  function syncMotion() {
    reduced = !!(mq && mq.matches);
    if (reduced && !override) {
      if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
      still();
    } else {
      lastT = 0;
      schedule();
    }
  }

  window.addEventListener('resize', onResize, false);
  window.addEventListener('orientationchange', onResize, false);
  document.addEventListener('visibilitychange', function () {
    lastT = 0;
    schedule();
  }, false);

  if (mq) {
    if (mq.addEventListener) { mq.addEventListener('change', syncMotion); }
    else if (mq.addListener) { mq.addListener(syncMotion); }
  }

  /* follow the theme however it changes, not only via the control */
  if (window.MutationObserver) {
    new MutationObserver(function () {
      var was = mode;
      readTheme();
      if (mode !== was) { lastT = 0; }
      still();
      schedule();
      if (stopped()) { draw(); }
    }).observe(document.documentElement,
      { attributes: true, attributeFilter: ['data-bg'] });
  }

  if (window.PointerEvent) {
    window.addEventListener('pointermove', function (e) {
      if (e.pointerType !== 'mouse') { return; }
      mx = e.clientX; my = e.clientY; wake = true;
    }, { passive: true });
    window.addEventListener('pointerleave', function () { wake = false; },
      { passive: true });
  }

  /* public handle, used by the pause / theme controls */
  window.tidalGraph = {
    setMode: function (m) {
      mode = (m === 'graph') ? 'graph' : 'perc';
      document.documentElement.setAttribute('data-bg', mode);
      lastT = 0;
      readTheme();
      still();
      schedule();
    },
    getThreshold: function () { return PERC_R; },
    setThreshold: function (value) {
      var r = Math.round(Number(value));
      if (!isFinite(r)) { return; }
      r = Math.max(1, Math.min(4, r));
      if (r === PERC_R) { return; }
      PERC_R = r;
      newRound();
      still();
      schedule();
    },
    setSpeed: function (fast) {
      var previous = speed === RABBIT ? PERC_FAST_STEP : PERC_STEP;
      speed = fast ? RABBIT : TURTLE;
      pAcc *= (speed === RABBIT ? PERC_FAST_STEP : PERC_STEP) / previous;
    },
    isFast: function () { return speed === RABBIT; },
    getMode: function () { return mode; },
    setPaused: function (p) {
      paused = !!p;
      if (!paused) { override = true; }   /* an explicit play beats the OS */
      if (paused) {
        if (raf) { window.cancelAnimationFrame(raf); raf = 0; }
      } else {
        lastT = 0;
        schedule();
      }
    },
    isPaused: function () { return stopped(); },
    refresh: function () { readTheme(); if (stopped()) { draw(); } },
    reseed: function () { build(); still(); }
  };

  var startBg = document.documentElement.getAttribute('data-bg');
  mode = (startBg === 'perc') ? 'perc' : 'graph';

  lastW = canvas.clientWidth;
  lastH = canvas.clientHeight;
  build();
  syncMotion();
  still();
}());
