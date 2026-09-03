"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");

const html = fs.readFileSync("apps/boolean-sentences.html", "utf8");
const scripts = Array.from(html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g));
assert.equal(scripts.length, 2, "expected the core and interface scripts");
for (const script of scripts) new vm.Script(script[1]);
const match = html.match(/<script id="logic-core">([\s\S]*?)<\/script>/);
assert(match, "logic core script is present");

const context = { console };
vm.createContext(context);
vm.runInContext(match[1], context);
const logic = context.LogicCore;

function mask(source) {
  const tree = logic.parse(source);
  return logic.maskOf(tree, logic.variables(tree));
}

assert.equal(logic.format(logic.parse("P and not Q")), "P ∧ ¬Q");
assert.equal(mask("P -> Q"), mask("not P or Q"));
assert.equal(mask("if P then Q"), mask("P implies Q"));
assert.equal(mask("P or Q and R"), mask("P ∨ (Q ∧ R)"));
assert.equal(mask("not (P and Q)"), mask("not P or not Q"));
assert.equal(mask("P nand Q"), mask("not (P and Q)"));
assert.equal(mask("P nor Q"), mask("not (P or Q)"));

const sample = logic.parse("(P xor Q) or R");
const names = logic.variables(sample);
const target = logic.maskOf(sample, names);
assert.equal(logic.maskOf(logic.parse(logic.canonicalDNF(sample, names)), names), target);
assert.equal(logic.maskOf(logic.parse(logic.canonicalCNF(sample, names)), names), target);

const result = logic.analyze("(P -> Q) and (Q -> R)", 50);
assert.equal(result.rowCount, 8);
assert.equal(result.equivalents.length, 50);
for (const equivalent of result.equivalents) {
  assert.equal(
    logic.maskOf(logic.parse(equivalent.text), result.variables),
    result.mask,
    `not equivalent: ${equivalent.text}`
  );
}

assert.throws(() => logic.analyze("A & B & C & D & E & F & G", 50), /at most six/);
console.log(`verified ${result.equivalents.length} equivalent formulas`);
