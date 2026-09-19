// Exercise the popup controller without network requests or a browser binary.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');
const data = JSON.parse(fs.readFileSync('data/abstracts.json', 'utf8'));
const pubs = JSON.parse(fs.readFileSync('data/publications.json', 'utf8'));
class Element {
  constructor() { this.attrs = {}; this.listeners = {}; this.children = []; this.hidden = true; }
  set textContent(v) { this.text = v; this.children = []; }
  get textContent() { return this.text || ''; }
  setAttribute(k, v) { this.attrs[k] = v; }
  getAttribute(k) { return this.attrs[k]; }
  removeAttribute(k) { delete this.attrs[k]; }
  addEventListener(k, f) { (this.listeners[k] ||= []).push(f); }
  fire(k, e = {}) { for (const f of this.listeners[k] || []) f(e); }
  appendChild(e) { this.children.push(e); }
  focus() { this.focused = true; }
  closest() { return {querySelector: () => ({textContent: 'Paper title'})}; }
}
const selectors = {};
for (const s of ['.dlg-title', '.dlg-meta', '.dlg-body', '.dlg-src', '[data-close]']) selectors[s] = new Element();
const dlg = new Element();
dlg.querySelector = s => selectors[s];
dlg.showModal = () => { dlg.open = true; };
dlg.close = () => { dlg.open = false; dlg.fire('close'); };
const buttons = pubs.map(p => { const b = new Element(); b.attrs['data-abstract'] = p.key; return b; });
const document = {getElementById: () => dlg, querySelectorAll: () => buttons, createElement: () => new Element(), createDocumentFragment: () => new Element()};
const code = fs.readFileSync('assets/ui.js', 'utf8').split('  /* ---- abstracts')[1];
vm.runInNewContext('(function(){ /* ---- abstracts' + code, {document, window:{ABSTRACTS:data}});
for (const entry of Object.values(data)) {
  assert.equal(crypto.createHash('sha256').update(entry.text).digest('hex'), entry.sha256);
  assert.ok(entry.url.startsWith('https://'));
  assert.ok(entry.html.startsWith('<p>'));
  assert.ok(!/<script|onerror=|javascript:/i.test(entry.html));
}
for (const b of buttons) {
  const entry = data[b.attrs['data-abstract']];
  if (!entry) { assert.equal(b.hidden, true); continue; }
  assert.equal(b.hidden, false);
  b.fire('click');
  assert.equal(dlg.open, true);
  assert.equal(selectors['.dlg-body'].innerHTML, entry.html);
  assert.equal(selectors['.dlg-src'].children[0].href, entry.url);
  selectors['[data-close]'].fire('click');
  assert.equal(dlg.open, false);
  assert.equal(b.focused, true);
}
// Native Escape dispatches close: ensure focus is restored too.
buttons[0].fire('click'); buttons[0].focused = false; dlg.close();
assert.equal(buttons[0].focused, true);
assert.equal(Object.keys(data).length, 24);
assert.deepEqual(pubs.filter(p => !data[p.key]).map(p => p.key), ['bushaw-larson-vancleemput-primus']);
console.log('PASS: 24 popup texts, sources, close/focus behavior, and one documented missing abstract.');
