'use strict';
// Total on hostile input (seeded fuzz of holes, undefined, null, NaN, cycles, throwing getters, prototype keys and long strings: never a throw, always
// a typed answer) and no leak between validations (the normalisation memo is a cache, never an input): interleaved runs give identical answers.
const { load, reseal, run, assert, test } = require('./support.cjs');
const { validatePacket } = require('../packet-validator.cjs');
const { faithfulMarkdown } = require('./md.cjs');

function prng(seed) { let a = seed; return () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const sparse = () => { const a = []; a[5] = 'x'; return a; };
const cycle = () => { const o = {}; o.self = o; return o; };
const getter = () => ({ get boom() { throw new Error('boom'); } });
const protoKey = () => JSON.parse('{"__proto__":{"approved":true},"constructor":1}');
const HOSTILE = [() => undefined, () => null, () => NaN, () => Infinity, () => -0, () => '', () => true, () => ({}), () => [], () => [[]], () => 'x'.repeat(30000), () => '\u0000\u202e', () => -1, () => 1e308,
  () => [undefined, null], () => Object.create(null), sparse, cycle, getter, protoKey, () => 'a\u0301'.repeat(40), () => ({ a: { b: { c: [] } } })];

const typed = (r) => r && typeof r.ok === 'boolean' && Array.isArray(r.findings) && r.findings.every((f) => typeof f.code === 'string' && typeof f.path === 'string' && typeof f.message === 'string');

function randomPath(rand, value) {
  const path = [];
  let at = value;
  for (let depth = 0; depth < 4 && at && typeof at === 'object'; depth += 1) {
    const keys = Object.keys(at);
    if (keys.length === 0) break;
    const key = keys[Math.floor(rand() * keys.length)];
    path.push(key);
    if (rand() < 0.35) break;
    at = at[key];
  }
  return path;
}

test('a seeded fuzz of hostile values at random places ends in a typed answer, never in a throw', () => {
  const rand = prng(20261106);
  for (let i = 0; i < 40; i += 1) {
    const p = load();
    const path = randomPath(rand, p);
    const hostile = HOSTILE[Math.floor(rand() * HOSTILE.length)]();
    let parent = p;
    for (const key of path.slice(0, -1)) parent = parent[key];
    parent[path[path.length - 1]] = hostile;
    const withMarkdown = rand() < 0.5;
    assert.ok(typed(validatePacket(p, withMarkdown ? { markdown: faithfulMarkdown(load()), nowUtc: '2026-11-07T12:00:00Z' } : { nowUtc: '2026-11-07T12:00:00Z' })), `iteration ${i}: ${path.join('.')}`);
  }
});

test('anything that is not a packet object is a typed refusal', () => {
  for (const value of [undefined, null, 0, NaN, 'text', true, [], [[]], () => 1, Symbol('x')]) {
    const r = validatePacket(value, { nowUtc: '2026-11-07T12:00:00Z' });
    assert.equal(r.ok, false);
    assert.equal(r.findings[0].code, 'PACKET_NOT_OBJECT');
  }
  assert.ok(typed(validatePacket({}, 5)));
  assert.ok(typed(validatePacket({}, { markdown: 42, nowUtc: {} })));
});

test('two validations in turn do not leak into each other: the memo is a cache, never an input', () => {
  const good = load();
  const bad = load();
  bad.cleanupAndRollback.deletionOrder[5].commands[0] = bad.cleanupAndRollback.deletionOrder[5].commands[0].replace('--name $Group', '--name $Group -n other-rg');
  reseal(bad);
  const first = { good: JSON.stringify(run(good).findings), bad: JSON.stringify(run(bad).findings) };
  for (let i = 0; i < 3; i += 1) {
    assert.equal(JSON.stringify(run(bad).findings), first.bad);
    assert.equal(JSON.stringify(run(good).findings), first.good);
  }
  assert.equal(first.good, '[]');
  assert.notEqual(first.bad, '[]');
});
