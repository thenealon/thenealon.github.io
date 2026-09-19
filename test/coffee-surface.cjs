/* Renderer checks are independent of the bootstrap state oracle in harness.js.
   No browser or graphics package is needed to check the wave state and flow. */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
let uploaded, time;
const gl = new Proxy({
  getExtension: () => ({}), getShaderParameter: () => true,
  getProgramParameter: () => true, getUniformLocation: (_, name) => name,
  getAttribLocation: () => 0,
  uniform1f: (name, value) => { if (name === 'uTime') time = value; },
  texSubImage2D: (...args) => { uploaded = Float32Array.from(args.at(-1)); }
}, {get: (o, k) => k in o ? o[k] : /^[A-Z_]+$/.test(k) ? 1 : () => ({})});
const scope = {
  document: {createElement: () => ({getContext: () => gl, addEventListener() {}})},
  window: {devicePixelRatio: 1}, console, Math, Uint8Array, Float32Array
};
vm.runInNewContext(fs.readFileSync(__dirname + '/../assets/coffee-surface.js', 'utf8'), scope);
const surface = scope.window.createCoffeeSurface();
surface.resize(720, 540, 40, 30, 18);
const levels = Float32Array.from({length: 1200}, (_, i) => (i % 40 < 23 && i > 240) ? 1 : 0);
const original = Array.from(levels), ctx = {drawImage() {}};
surface.draw(ctx, levels, 0, 1);
surface.splash(180, 270, 1);
surface.stir(180, 270, 0);
surface.stir(210, 275, .03);
for (let frame = 1; frame <= 600; frame++) surface.draw(ctx, levels, frame / 30, 1);
assert.deepEqual(Array.from(levels), original, 'Surface effects cannot infect or heal a site');
assert.ok(uploaded.every(Number.isFinite), 'Wave and colour fields remain finite');
assert.ok(uploaded.every((v, i) => i % 4 !== 1 || (v >= 0 && v <= 1)), 'Surface height stays bounded');
const paused = Array.from(uploaded);
surface.draw(ctx, levels, 20, 1);
assert.deepEqual(Array.from(uploaded), paused, 'Redrawing at the same time does not advance the waves');
assert.equal(time, 20);
surface.reset();
surface.draw(ctx, new Float32Array(1200), 20, 1);
assert.ok(uploaded.every((v, i) => i % 4 !== 0 || v === 0), 'An empty infection set has no coffee');
for (const t of [0, 1, 5, 20]) for (const [x, y] of [[80, 100], [300, 400], [690, 250]]) {
  const e = .0001, p = surface.project(x, y, t), a = surface.project(x + e, y, t), b = surface.project(x, y + e, t);
  const determinant = ((a.x - p.x) * (b.y - p.y) - (b.x - p.x) * (a.y - p.y)) / (e * e);
  assert.ok(Math.abs(determinant - 1) < .0001, 'Display flow preserves area and orientation');
}
console.log('PASS: liquid never changes infection state; waves stay bounded, pause and reset work, and flow preserves area.');
