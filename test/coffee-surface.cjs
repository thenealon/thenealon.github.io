/* Check the visible mathematical contract without browser/GPU dependencies. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');

function context() {
  const calls = [];
  return new Proxy({calls, createImageData: (w, h) => ({data: new Uint8ClampedArray(w * h * 4)})}, {
    get(o, key) {
      if (key in o) return o[key];
      return (...args) => calls.push([key, ...args]);
    },
    set(o, key, value) { o[key] = value; return true; }
  });
}
const scope = {
  document: {createElement: () => ({getContext: () => context()})},
  window: {devicePixelRatio: 2}, console, Math, Float32Array
};
vm.runInNewContext(fs.readFileSync(__dirname + '/../assets/coffee-surface.js', 'utf8'), scope);
const surface = scope.window.createCoffeeSurface();

for (const [cols, rows] of [[13, 28], [60, 37], [160, 90]]) {
  const cell = 24;
  surface.resize(cols * cell, rows * cell, cols, rows, cell);
  const infected = Uint8Array.from({length: cols * rows}, (_, i) => (i % 7 === 0 || i % 31 === 0) ? 1 : 0);
  const levels = Float32Array.from(infected, (v, i) => v * (i % 2 ? .35 : 1));
  const original = Array.from(infected), originalLevels = Array.from(levels);
  const ctx = context();
  surface.draw(ctx, levels, infected, 1);
  const vertices = ctx.calls.filter(c => c[0] === 'arc').map(c => c.slice(1, 3));
  const expected = [];
  for (let i = 0; i < infected.length; i++) if (infected[i])
    expected.push([(i % cols + .5) * cell, (Math.floor(i / cols) + .5) * cell]);
  const sort = a => a.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  assert.deepEqual(sort(vertices), sort(expected), 'Every infected site is marked at its exact fixed lattice position, including new sites');
  assert.deepEqual(Array.from(infected), original, 'Rendering cannot change the binary process');
  assert.deepEqual(Array.from(levels), originalLevels, 'Rendering cannot advance the interpolation');
  assert.ok(ctx.calls.flat().filter(v => typeof v === 'number').every(Number.isFinite));
  const paused = context();
  surface.draw(paused, levels, infected, 1);
  assert.deepEqual(paused.calls, ctx.calls, 'A redraw has no independent animation');

  let lastFill = 0;
  for (const progress of [0, .3, .6, .8, 1]) {
    const draining = context();
    const fill = surface.draw(draining, levels, infected, 1, {progress, x:48, y:rows * cell - 68});
    assert.deepEqual(sort(draining.calls.filter(c => c[0] === 'arc').map(c => c.slice(1, 3))), sort(expected), 'Draining pigment does not move or erase infected vertices');
    assert.ok(fill >= lastFill && fill <= 1, 'The collector only fills');
    assert.ok(draining.calls.flat().filter(v => typeof v === 'number').every(Number.isFinite));
    assert.deepEqual(Array.from(infected), original, 'Drainage cannot alter the process');
    if (progress === 1) {
      assert.equal(fill, 1);
      assert.equal(draining.calls.filter(c => c[0] === 'clip').length, 0, 'All coffee has reached the mug');
    }
    lastFill = fill;
  }

  surface.reset();
  const empty = context();
  surface.draw(empty, new Float32Array(infected.length), new Uint8Array(infected.length), 1);
  assert.equal(empty.calls.filter(c => c[0] === 'arc').length, 0);
  assert.equal(empty.calls.filter(c => c[0] === 'clip').length, 0, 'No coffee without infection');
  assert.equal(empty.calls.filter(c => c[0] === 'drawImage').length, 1, 'The graph paper remains visible');

  const diagonal = new Uint8Array(infected.length);
  diagonal[cols + 1] = 1; diagonal[2 * cols + 2] = 1;
  const separate = context();
  surface.draw(separate, Float32Array.from(diagonal), diagonal, 1);
  assert.equal(separate.calls.filter(c => c[0] === 'closePath').length, 2, 'Diagonal sites do not merge');
}
console.log('PASS: exact fixed vertices on phone, desktop and 4K grids; no mutation, phantom sites, diagonal bridges, or independent motion.');
