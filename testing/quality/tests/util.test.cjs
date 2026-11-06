'use strict';
// Direct tests of the shared helpers: they carry the rules, so their edge cases are pinned here.
const { assert, test } = require('./support.cjs');
const u = require('../util.cjs');

test('type guards', () => {
  assert.ok(u.isObj({}) && !u.isObj(null) && !u.isObj([]) && !u.isObj('x'));
  assert.ok(u.isNum(0) && !u.isNum(NaN) && !u.isNum(Infinity) && !u.isNum('1'));
  assert.ok(u.isStr('a') && !u.isStr('  ') && !u.isStr(3));
  assert.ok(u.isArr([]) && !u.isArr({}));
});

test('approx and round tolerate float noise but not real differences', () => {
  assert.ok(u.approx(0.1 + 0.2, 0.3, 1e-9));
  assert.ok(!u.approx(1, 1.001, 1e-6));
  assert.ok(!u.approx('1', 1));
  assert.equal(u.round(1.0000004, 6), 1);
});

test('ceilingFor follows ceil(worst x 1.25 / 5) x 5 and reproduces the reviewer figures', () => {
  assert.equal(u.ceilingFor(55.054), 70);
  assert.equal(u.ceilingFor(56.074), 75);
  assert.equal(u.ceilingFor(57.354), 75);
  assert.equal(u.ceilingFor(11.0318), 15);
  assert.equal(u.ceilingFor(0.88828), 5);
  assert.equal(u.ceilingFor(4), 5);
  assert.equal(u.ceilingFor(4.0001), 10);
});

test('integrityHash ignores the integrity and validation fields and keeps key order', () => {
  const a = { x: 1, y: { z: 2 }, integrity: { packetSha256: 'a' }, validation: { v: 1 } };
  const b = { x: 1, y: { z: 2 }, integrity: { packetSha256: 'b' } };
  assert.equal(u.integrityHash(a), u.integrityHash(b));
  assert.notEqual(u.integrityHash({ y: 1, x: 2 }), u.integrityHash({ x: 2, y: 1 }));
  assert.match(u.integrityHash(a), /^[0-9a-f]{64}$/);
});

test('makeSink collects findings in order', () => {
  const { findings, add } = u.makeSink();
  add('A', 'p', 'first');
  add('B', 'q', 'second');
  assert.deepEqual(findings.map((f) => f.code), ['A', 'B']);
});
