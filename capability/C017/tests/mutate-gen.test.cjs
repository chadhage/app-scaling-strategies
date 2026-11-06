'use strict';

// The systematic mutation generator (tests\mutate-gen.cjs) is itself tested on a tiny source: every if condition, every operand of a top-level
// || or && and every single-line effect statement yields mutants, declarations, returns and throws do not, and each mutant is valid JavaScript.
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const G = require('./mutate-gen.cjs');

const source = [
  'function f(a, b, c) {',
  '  if (a && (b || c)) return 1;',
  "  if (a.length > 2 || a.includes('||')) throw new Error('x');",
  '  foo.bar(1);',
  '  state.count = 2;',
  '  const k = 3;',
  '  return k;',
  '}',
  '',
].join('\n');

test('the generator yields a mutant for every condition, every operand and every effect statement and for nothing else', () => {
  const sites = G.generate(source);
  const kinds = sites.map((site) => `${site.kind}@${site.line}`);
  assert.deepEqual(kinds, [
    'cond-false@2', 'cond-true@2', 'operand1-true@2', 'operand1-false@2', 'operand2-true@2', 'operand2-false@2',
    'cond-false@3', 'cond-true@3', 'operand1-true@3', 'operand1-false@3', 'operand2-true@3', 'operand2-false@3',
    'delete-statement@4', 'delete-statement@5',
  ]);
  assert.equal(new Set(sites.map((site) => site.id)).size, sites.length, 'ids are unique');
});

test('an operator inside a string or a bracket is not an operand boundary, and every mutant is valid JavaScript with exactly one change', () => {
  const sites = G.generate(source);
  assert.deepEqual(sites.filter((site) => site.line === 3).map((site) => site.was).slice(0, 4), ["a.length > 2 || a.includes('||')", "a.length > 2 || a.includes('||')", 'a.length > 2', 'a.length > 2']);
  for (const site of sites) {
    const mutated = source.slice(0, site.from) + site.replace + source.slice(site.to);
    assert.notEqual(mutated, source, `${site.id} changes nothing`);
    assert.doesNotThrow(() => new vm.Script(mutated), site.id);
  }
  assert.equal(G.closeOf('if (a && (b || c)) x', 3), 17);
  assert.deepEqual(G.operands("a && 'b || c' && (d || e)", 0, 25).map((part) => ["a && 'b || c' && (d || e)".slice(part.from, part.to).trim()]), [['a'], ["'b || c'"], ['(d || e)']]);
});

test('the generator covers the production server: every guard of server.cjs has mutants and the list is stable', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const text = fs.readFileSync(path.join(__dirname, '..', 'server.cjs'), 'utf8').replace(/\r\n/g, '\n');
  const sites = G.generate(text);
  const ifs = [...text.matchAll(/\bif \(/g)].length;
  assert.equal(sites.filter((site) => site.kind === 'cond-false').length, ifs, 'one cond-false mutant per if');
  assert.equal(sites.filter((site) => site.kind === 'cond-true').length, ifs, 'one cond-true mutant per if');
  assert.ok(sites.length >= 100, `${sites.length} mutants`);
  assert.deepEqual(G.TESTS.map((name) => name.split('\\').pop()), ['server-guards.test.cjs', 'refusal-shapes.test.cjs', 'drain.test.cjs', 'pending-flood.test.cjs', 'limits.test.cjs', 'two-servers.test.cjs', 'server.test.cjs', 'chunked.test.cjs', 'resources.test.cjs']);
});
