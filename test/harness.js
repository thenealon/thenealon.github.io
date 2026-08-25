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
  + '  window.__peekPerc = function () { return { cols: pCols, rows: pRows, count: pCount, total: pTotal, gen: pGen, phase: pPhase, base: pBase }; };\n'
  + '  window.__newRound = newRound;\n' + anchor);
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

/* ---- bootstrap percolation: one clean round, start to finish ---- */
{
  window.tidalGraph.setMode('perc');
  window.__newRound(false);
  let p = window.__peekPerc();
  console.log(`\nlattice ${p.cols}x${p.rows} = ${p.total} sites, 2-neighbour rule`);
  console.log(`seeded ${p.count} sites = ${(100*p.count/p.total).toFixed(2)}%`);

  let filledAt = null, holdAt = null, reseedAt = null, last = p.count;
  for (let sec = 1; sec <= 70; sec++) {
    advance(1);
    p = window.__peekPerc();
    if (!filledAt && p.count >= p.total) filledAt = sec;
    if (!holdAt && p.phase !== 'grow') holdAt = sec;
    if (filledAt && !reseedAt && p.count < last) reseedAt = sec;
    if (sec % 7 === 0)
      console.log(`  t=${String(sec).padStart(2)}s  gen ${String(p.gen).padStart(4)}  ` +
        `infected ${(100*p.count/p.total).toFixed(1).padStart(5)}%  ${p.phase}  base=${p.base}`);
    last = p.count;
  }
  console.log(`\nfully infected at t=${filledAt}s; held at t=${holdAt}s; next round began at t=${reseedAt}s`);
  console.log('background state is now', window.__peekPerc().base, '(started at 0)');
}
