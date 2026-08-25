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
 * BOOTSTRAP PERCOLATION.  Underneath the graph, a large lattice runs
 * 2-neighbour bootstrap percolation: a site with at least two already
 * infected von Neumann neighbours becomes infected, and infection never
 * heals.  The dynamics are the ones you would expect on Z^2 -- infected
 * regions square themselves off and grow as rectangles, rectangles merge,
 * and once one of them spans the box the rest goes quickly.
 *
 * The seed density is well over critical.  A near-critical seeding takes
 * hundreds of generations to fill and spends most of them with one small
 * frontier crawling across an otherwise motionless screen; seeding harder
 * gives many rectangles growing at once, so there is movement everywhere
 * without speeding the generation clock up.  The threshold itself:  Holroyd's threshold for the
 * square [n]^2 is p_c ~ pi^2 / (18 log n), but the convergence to that
 * asymptotic is famously slow (Gravner, Holroyd & Morris), so the constant
 * here was fixed by simulation at the grid sizes a browser actually uses
 * rather than taken from the theorem.  If a round stalls short of full --
 * the final set under this rule is a union of rectangles, and it need not
 * be everything -- a few fresh sites are sprinkled in until it completes.
 *
 * Once the lattice is full, the two states trade places: what was infected
 * becomes the new healthy background, a fresh set is chosen, and the round
 * runs again in the other colour.  So the field never blanks out; it just
 * keeps turning over between the two states.
 *
 * The infected lattice is painted onto an offscreen canvas as it grows, so
 * each frame is one blit rather than tens of thousands of rectangles.
 *
 * Only one of the two runs at a time; the control in the corner switches
 * between them and the choice is remembered.  The idle one is neither
 * stepped nor drawn.
 *
 * Dependencies: none.  Canvas 2D only.  Degrades to nothing without JS.
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
  var PERC_CELL = 11;         /* px per lattice site                    */
  var PERC_R = 2;             /* neighbours needed to become infected   */
  var PERC_HZ = 5.5;          /* generations per second, at turtle speed */
  var PERC_P = 0.36;          /* seed density is PERC_P / log(min side) */
  var PERC_P_MIN = 0.06, PERC_P_MAX = 0.13;
  var PERC_SPRINKLE = 0.004;  /* fraction of sites added on a stall     */
  var PERC_HOLD = 2.6;        /* s, the full lattice is held before the
                                 states trade places                     */
  /* A newly infected site does not appear all at once.  It is painted over
     several generations: faintly in the bright colour first, brightening,
     then covered back down to the settled tone.  So the visible event is a
     glow travelling along the infection frontier, and the settled field is
     barely there.  Alphas are chosen so that after the last step under 3%
     of the glow remains.                                                  */
  var PERC_FADE = [
    ['glow', 0.20], ['glow', 0.36], ['glow', 0.50], ['glow', 0.56],
    ['glow', 0.56],
    ['set', 0.16], ['set', 0.20], ['set', 0.26], ['set', 0.33],
    ['set', 0.42], ['set', 0.53], ['set', 0.66], ['set', 0.80], ['set', 0.92]
  ];

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
  var off = null, offCtx = null;
  var pInf = null, pCols = 0, pRows = 0, pCount = 0, pTotal = 0, pGen = 0;
  var pPhase = 'grow', pTimer = 0, pAcc = 0, pAdd = null;
  var percPal = [[16, 16, 19], [28, 28, 26]];   /* state 0, state 1 */
  var percGlow = [255, 179, 0];
  var fadeQ = [];
  var pBase = 0;              /* which state is currently the background */
  var percA = 0.3;
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
    percPal = [hexToRgb(v('--perc-a')) || [16, 16, 19],
               hexToRgb(v('--perc-b')) || [28, 28, 26]];
    percGlow = hexToRgb(v('--perc-glow')) || [255, 179, 0];
    percA = parseFloat(v('--perc-alpha'));
    if (!(percA > 0)) { percA = 0.3; }
    repaintPerc();

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
    if (!off) {
      off = document.createElement('canvas');
      offCtx = off.getContext('2d');
    }
    off.width = canvas.width;
    off.height = canvas.height;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    offCtx.setTransform(dpr, 0, 0, dpr, 0, 0);

    pCols = Math.max(4, Math.ceil(W / PERC_CELL));
    pRows = Math.max(4, Math.ceil(H / PERC_CELL));
    pTotal = pCols * pRows;
    pInf = new Uint8Array(pTotal);
    pAdd = new Int32Array(pTotal);
    newRound(false);
  }

  function seedDensity() {
    var p = PERC_P / Math.log(Math.max(3, Math.min(pCols, pRows)));
    if (p < PERC_P_MIN) { p = PERC_P_MIN; }
    if (p > PERC_P_MAX) { p = PERC_P_MAX; }
    return p;
  }

  function rgb(c) { return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')'; }

  /* Whatever the last round infected becomes the healthy state of the next
     one, so the field trades between the two colours instead of blanking. */
  function newRound(swap) {
    var i;
    if (swap) { pBase = 1 - pBase; }

    for (i = 0; i < pTotal; i++) { pInf[i] = 0; }
    pCount = 0;
    pGen = 0;
    pPhase = 'grow';
    pTimer = 0;

    fadeQ = [];
    offCtx.fillStyle = rgb(percPal[pBase]);
    offCtx.fillRect(0, 0, W, H);

    var p = seedDensity();
    var m = 0;
    for (i = 0; i < pTotal; i++) {
      if (Math.random() < p) { pInf[i] = 1; pCount++; pAdd[m++] = i; }
    }
    paintCells(m);
  }

  /* Paint a list of sites in one colour at one alpha. */
  function paintList(list, count, col, alpha) {
    if (!count) { return; }
    offCtx.fillStyle = 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' +
                       alpha + ')';
    offCtx.beginPath();
    var size = PERC_CELL - 1;
    for (var k = 0; k < count; k++) {
      var i = list[k];
      offCtx.rect((i % pCols) * PERC_CELL, ((i / pCols) | 0) * PERC_CELL,
                  size, size);
    }
    offCtx.fill();
  }

  /* Hand a freshly infected batch to the fade queue rather than stamping it
     down at full strength, which is what made new infection jarring. */
  function paintCells(m) {
    if (!m) { return; }
    fadeQ.push({ cells: pAdd.slice(0, m), n: m, step: 0 });
  }

  function advanceFades() {
    for (var q = fadeQ.length; q--;) {
      var b = fadeQ[q];
      var f = PERC_FADE[b.step];
      paintList(b.cells, b.n,
                f[0] === 'glow' ? percGlow : percPal[1 - pBase], f[1]);
      b.step++;
      if (b.step >= PERC_FADE.length) { fadeQ.splice(q, 1); }
    }
  }

  /* One synchronous update of the bootstrap rule. Returns sites added. */
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

  function sprinkle() {
    var want = Math.max(1, Math.round(pTotal * PERC_SPRINKLE)), m = 0;
    var guard = want * 40;
    while (want > 0 && guard--) {
      var j = (Math.random() * pTotal) | 0;
      if (pInf[j]) { continue; }
      pInf[j] = 1;
      pCount++;
      pAdd[m++] = j;
      want--;
    }
    paintCells(m);
  }

  function stepPerc(dt) {
    if (!pInf) { return; }

    if (pPhase === 'hold') {
      pTimer += dt;
      if (fadeQ.length) {
        pAcc += dt;
        while (pAcc >= 1 / PERC_HZ && fadeQ.length) {
          pAcc -= 1 / PERC_HZ;
          advanceFades();
        }
      }
      if (pTimer >= PERC_HOLD && !fadeQ.length) { newRound(true); }
      return;
    }

    pAcc += dt;
    var budget = 4;                    /* cap the catch-up after a tab switch */
    while (pAcc >= 1 / PERC_HZ && budget--) {
      pAcc -= 1 / PERC_HZ;
      pGen++;
      advanceFades();
      var m = percGeneration();
      if (m) {
        paintCells(m);
      } else if (pCount < pTotal) {
        sprinkle();                    /* stalled short of full: nudge it */
      }
      if (pCount >= pTotal) {
        pPhase = 'hold';
        pTimer = 0;
        break;
      }
    }
  }

  function drawPerc() {
    if (!off || !pInf) { return; }
    ctx.save();
    ctx.globalAlpha = percA;
    ctx.drawImage(off, 0, 0, W, H);
    ctx.restore();
  }

  /* A theme change repaints the whole lattice in the new palette. */
  function repaintPerc() {
    if (!pInf || !offCtx) { return; }
    offCtx.fillStyle = rgb(percPal[pBase]);
    offCtx.fillRect(0, 0, W, H);
    var m = 0;
    for (var i = 0; i < pTotal; i++) { if (pInf[i]) { pAdd[m++] = i; } }
    paintList(pAdd, m, percPal[1 - pBase], 1);
    fadeQ = [];
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
    setSpeed: function (fast) {
      speed = fast ? RABBIT : TURTLE;
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
