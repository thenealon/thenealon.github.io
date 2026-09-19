/* Headless check of tidal-graph.js: stub out DOM, run frames, and compare the
   grid-based edge set against brute force. */
const fs = require('fs');

const calls = [];
const ctxStub = new Proxy({}, {
  get(t, k) {
    if (k === 'setTransform' || k === 'fillRect' || k === 'beginPath' ||
        k === 'moveTo' || k === 'lineTo' || k === 'stroke' || k === 'arc' ||
        k === 'rect' || k === 'fill' || k === 'save' || k === 'restore' ||
        k === 'drawImage' || k === 'clearRect') {
      return () => { calls.push(k); };
    }
    return undefined;
  },
  set() { return true; }
});

const canvas = {
  clientWidth: 1440, clientHeight: 900, width: 0, height: 0,
  getContext: () => ctxStub,
  addEventListener() {}
};

function mkCanvas() {
  return { width: 0, height: 0, clientWidth: 1440, clientHeight: 900,
           getContext: () => ctxStub, addEventListener() {} };
}
global.document = {
  getElementById: (id) => (id === 'tidal-graph' ? canvas : null),
  createElement: (tag) => (tag === 'canvas' ? mkCanvas() : {}),
  documentElement: { getAttribute: () => null, setAttribute() {} },
  hidden: false,
  addEventListener() {}
};
global.getComputedStyle = () => ({
  getPropertyValue(n) {
    return ({ '--bg': '#0a0a0b', '--graph-edge': '#ffb300',
              '--graph-edge-alpha': '0.30', '--graph-node-lo': '#6a6259',
              '--graph-node-hi': '#ffb300', '--graph-node-alpha': '0.9',
              '--perc-a': '#0f0f11', '--perc-b': '#dedede',
              '--perc-alpha': '0.15' })[n] || '';
  }
});

let queued = null;
global.window = {
  devicePixelRatio: 2,
  innerWidth: 1440, innerHeight: 900,
  requestAnimationFrame: (fn) => { queued = fn; return 1; },
  cancelAnimationFrame: () => { queued = null; },
  addEventListener() {},
  matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }),
  PointerEvent: null,
  setTimeout, clearTimeout
};
global.requestAnimationFrame = global.window.requestAnimationFrame;
global.cancelAnimationFrame = global.window.cancelAnimationFrame;
global.performance = { now: () => 0 };

const src = fs.readFileSync(__dirname + '/../assets/tidal-graph.js', 'utf8');
// expose internals for the test
const anchor = '  lastW = canvas.clientWidth;\n  lastH = canvas.clientHeight;\n  build();';
if (src.indexOf(anchor) === -1) { throw new Error('anchor not found'); }
const patched = src.replace(anchor,
  '  window.__peek = function () { return { n: n, r: r, xs: xs, ys: ys, deg: deg, segN: segN, live: segN, segs: segs }; };\n'
  + '  window.__peekPerc = function () { return { cols: pCols, rows: pRows, count: pCount, total: pTotal, gen: pGen, phase: pPhase, grid: Array.from(pInf), levels: Array.from(pLevel), threshold: PERC_R, density: seedDensity(), drain: pDrain }; };\n'
  + '  window.__newRound = newRound;\n'
  + '  window.__generation = percGeneration;\n'
  + '  window.__setPerc = function (cells) { pInf.set(cells); pCount = cells.reduce(function(a,b){return a+b;},0); };\n' + anchor);
eval(patched);

function bruteForce(xs, ys, n, r) {
  const r2 = r * r;
  let m = 0;
  const deg = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const dx = xs[i] - xs[j], dy = ys[i] - ys[j];
      if (dx * dx + dy * dy < r2) { m++; deg[i]++; deg[j]++; }
    }
  }
  return { m, deg };
}

/* the two backgrounds are mutually exclusive now; test each in its mode */
window.tidalGraph.setMode('graph');

let t = 0;
let maxErr = 0;
let degSum = 0, frames = 0;
for (let f = 0; f < 400; f++) {
  t += 1000 / 60;
  global.performance.now = () => t;
  if (queued) { const fn = queued; queued = null; fn(t); }
  if (f % 40 === 0) {
    const s = window.__peek();
    const bf = bruteForce(s.xs, s.ys, s.n, s.r);
    let derr = 0;
    for (let i = 0; i < s.n; i++) { derr = Math.max(derr, Math.abs(bf.deg[i] - s.deg[i])); }
    maxErr = Math.max(maxErr, Math.abs(bf.m - s.live), derr);
    degSum += 2 * bf.m / s.n;
    frames++;
    console.log(`frame ${String(f).padStart(3)}  n=${s.n}  r=${s.r.toFixed(1)}  ` +
                `edges=${s.live}  brute=${bf.m}  meanDeg=${(2 * bf.m / s.n).toFixed(2)}`);
  }
}
console.log('\nmax discrepancy tracked vs brute force:', maxErr);

/* every drawn segment must lie inside a disc of radius r */
{
  let worst = 0, bad = 0;
  for (let f = 0; f < 400; f++) {
    t += 1000 / 60;
    global.performance.now = () => t;
    if (queued) { const fn = queued; queued = null; fn(t); }
    const s = window.__peek();
    for (let k = 0; k < s.segN; k++) {
      const o = k << 2;
      const L = Math.hypot(s.segs[o+2]-s.segs[o], s.segs[o+3]-s.segs[o+1]);
      if (L > worst) worst = L;
      if (L > s.r + 0.5) bad++;
    }
  }
  const r = window.__peek().r;
  console.log(`longest drawn segment over 400 frames: ${worst.toFixed(1)} px  (r = ${r.toFixed(1)})`);
  console.log(`segments longer than r: ${bad}`);
}
console.log('mean degree over run:', (degSum / frames).toFixed(3), '(target 5.5)');
console.log('canvas ops last frame:', calls.length > 0 ? 'yes' : 'NONE');


/* edge turnover: what fraction of the edge set changes over T seconds? */
function edgeSet(s) {
  const set = new Set();
  const r2 = s.r * s.r;
  for (let i = 0; i < s.n; i++)
    for (let j = i + 1; j < s.n; j++) {
      const dx = s.xs[i] - s.xs[j], dy = s.ys[i] - s.ys[j];
      if (dx * dx + dy * dy < r2) set.add(i * 100000 + j);
    }
  return set;
}
function advance(seconds) {
  for (let f = 0; f < Math.round(seconds * 60); f++) {
    t += 1000 / 60;
    global.performance.now = () => t;
    if (queued) { const fn = queued; queued = null; fn(t); }
  }
}
{
  const base = edgeSet(window.__peek());
  for (const T of [5, 10, 20, 30]) {
    advance(T === 5 ? 5 : T - prevT);
    var prevT = T;
    const now = edgeSet(window.__peek());
    let gone = 0; base.forEach(e => { if (!now.has(e)) gone++; });
    let born = 0; now.forEach(e => { if (!base.has(e)) born++; });
    console.log(`after ${String(T).padStart(2)} s: ${gone} of ${base.size} edges gone ` +
      `(${(100 * gone / base.size).toFixed(1)}%), ${born} new`);
  }
}

/* displacement check: how far does a vertex travel in 10 s? */
const s0 = window.__peek();
const x0 = Float32Array.from(s0.xs), y0 = Float32Array.from(s0.ys);
for (let f = 0; f < 600; f++) {
  t += 1000 / 60;
  global.performance.now = () => t;
  if (queued) { const fn = queued; queued = null; fn(t); }
}
const s1 = window.__peek();
let mean = 0, max = 0;
for (let i = 0; i < s1.n; i++) {
  const dx = s1.xs[i] - x0[i], dy = s1.ys[i] - y0[i];
  const d = Math.hypot(dx, dy);
  if (d < 500) { mean += d; max = Math.max(max, d); }  // skip torus wraps
}
console.log('mean drift over 10 s:', (mean / s1.n).toFixed(1), 'px; max', max.toFixed(1),
            'px; r =', s1.r.toFixed(1));

/* ---- bootstrap: compare each threshold to an independent oracle ---- */
const assert = require('node:assert/strict');
window.tidalGraph.setMode('perc');
let rng = 12345;
function random() { rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0; return rng / 4294967296; }
for (let threshold = 1; threshold <= 4; threshold++) {
  window.tidalGraph.setThreshold(threshold);
  const state = window.__peekPerc();
  let cells = Array.from({length: state.total}, () => random() < .23 ? 1 : 0);
  window.__setPerc(cells);
  for (let generation = 0; generation < 12; generation++) {
    const expected = cells.map((infected, i) => {
      if (infected) return 1;
      const x = i % state.cols, y = Math.floor(i / state.cols);
      let count = 0;
      for (const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = x+dx, ny = y+dy;
        if (nx >= 0 && nx < state.cols && ny >= 0 && ny < state.rows)
          count += cells[ny*state.cols+nx];
      }
      return count >= threshold ? 1 : 0;
    });
    window.__generation();
    assert.deepEqual(window.__peekPerc().grid, expected, `threshold ${threshold}, generation ${generation}`);
    cells = expected;
  }
  console.log(`threshold ${threshold}: 12 synchronous generations match the independent oracle`);
}

/* A_0 is visible without animation. Four seconds to inspect it, then one
   synchronous generation every three seconds; pause freezes both layers. */
window.tidalGraph.setThreshold(2);
window.__newRound();
const initial = window.__peekPerc();
assert.ok(initial.count > 0);
assert.deepEqual(initial.levels, initial.grid);
advance(2);
assert.deepEqual(window.__peekPerc(), initial);
window.tidalGraph.setPaused(true);
advance(10);
assert.deepEqual(window.__peekPerc(), initial);
window.tidalGraph.setPaused(false);
advance(2.15);
assert.equal(window.__peekPerc().gen, 1);
const first = window.__peekPerc().grid;
advance(2.65);
assert.equal(window.__peekPerc().gen, 1);
assert.deepEqual(window.__peekPerc().grid, first);
advance(.4);
assert.equal(window.__peekPerc().gen, 2);
window.tidalGraph.setPaused(true);
const spreading = window.__peekPerc();
advance(2);
assert.deepEqual(window.__peekPerc(), spreading, 'Pause freezes the exact state and its visual interpolation');
window.tidalGraph.setPaused(false);
window.tidalGraph.setSpeed(true);
advance(1.3);
assert.equal(window.__peekPerc().gen, 3);
window.tidalGraph.setSpeed(false);
console.log('pace: initial state held; updates are 3 seconds apart (1.25 seconds when faster); pause freezes both layers');

/* Higher thresholds begin denser, but never receive extra infections. */
const densities = [];
for (let r = 1; r <= 4; r++) {
  window.tidalGraph.setThreshold(r);
  densities.push(window.__peekPerc().density);
}
assert.ok(densities.every((p, i) => i === 0 || p > densities[i - 1]));
assert.equal(densities[0], .012);
assert.equal(densities[2], .55);
assert.equal(densities[3], .8);
console.log('seed densities increase with the threshold:', densities.map(p => (100 * p).toFixed(1) + '%').join(', '));

window.tidalGraph.setThreshold(4);
for (let wait = 0; wait < 60 && window.__peekPerc().phase !== 'hold'; wait++) advance(.25);
let stalled = window.__peekPerc();
assert.equal(stalled.phase, 'hold');
const stoppedCount = stalled.count;
advance(1);
assert.equal(window.__peekPerc().count, stoppedCount);
advance(12);
assert.equal(window.__peekPerc().phase, 'hold');
assert.deepEqual(window.__peekPerc().grid, stalled.grid);
advance(2);
assert.equal(window.__peekPerc().phase, 'drain');
assert.deepEqual(window.__peekPerc().grid, stalled.grid, 'Drainage does not heal or infect sites');
window.tidalGraph.setPaused(true);
const draining = window.__peekPerc();
advance(5);
assert.deepEqual(window.__peekPerc(), draining, 'Pause also freezes the drain');
window.tidalGraph.setPaused(false);
advance(9.5);
assert.equal(window.__peekPerc().phase, 'seed');
assert.equal(window.__peekPerc().gen, 0);
console.log('completed round: holds its closure, drains without changing A_t, then starts a new experiment');

window.tidalGraph.setPaused(true);
window.tidalGraph.reseed();
const pausedSeed = window.__peekPerc();
assert.equal(pausedSeed.gen, 0);
assert.deepEqual(pausedSeed.levels, pausedSeed.grid, 'Paused resets show A_0 without skipped generations');
advance(5);
assert.deepEqual(window.__peekPerc(), pausedSeed);
window.tidalGraph.setPaused(false);

window.tidalGraph.setThreshold(99);
assert.equal(window.tidalGraph.getThreshold(), 4);
window.tidalGraph.setThreshold(-5);
assert.equal(window.tidalGraph.getThreshold(), 1);
window.tidalGraph.setThreshold(NaN);
assert.equal(window.tidalGraph.getThreshold(), 1);
console.log('threshold control: bounds and invalid inputs handled');
