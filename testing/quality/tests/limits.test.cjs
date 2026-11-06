'use strict';
// Input bounds (V6, V7): the iterative inventory, its typed failures, the validator that never throws, and the CLI that answers in one line.
const { assert, test, load, run } = require('./support.cjs');
const { inventory, LIMITS } = require('../limits.cjs');
const { validatePacket } = require('../packet-validator.cjs');
const { main } = require('../validate-packet.cjs');

test('the inventory lists keys, strings, numbers and the joined text of arrays of strings, iteratively', () => {
  const inv = inventory({ a: 'x', b: ['p', 'q'], c: { d: 7, e: [1, 2] }, f: null, g: true });
  assert.equal(inv.error, null);
  assert.deepEqual(inv.items.filter((i) => !i.key).map((i) => `${i.path}=${i.text}`).sort(), ['a=x', 'b[0]=p', 'b[1]=q']);
  assert.deepEqual(inv.items.filter((i) => i.key).map((i) => i.path).sort(), ['a', 'b', 'c', 'c.d', 'c.e', 'f', 'g']);
  assert.deepEqual(inv.joins, [{ path: 'b[*]', text: 'p\nq' }]);
  assert.deepEqual(inv.numbers.sort(), [1, 2, 7]);
});

test('an array of strings that is too long to join is still scanned element by element', () => {
  const half = 'x'.repeat(LIMITS.maxStringLength - 10);
  const inv = inventory({ list: [half, half] });
  assert.equal(inv.error, null);
  assert.deepEqual(inv.joins, []);
  assert.equal(inv.items.filter((i) => !i.key).length, 2);
});

test('depth beyond the limit is INPUT_TOO_DEEP, at the limit it is fine, and nothing recurses', () => {
  let a = [];
  for (let i = 0; i < LIMITS.maxDepth; i += 1) a = [a];
  assert.equal(inventory(a).error, null);
  assert.equal(inventory([a]).error.code, 'INPUT_TOO_DEEP');
  let deep = {};
  for (let i = 0; i < 100000; i += 1) deep = { d: deep };
  assert.equal(inventory(deep).error.code, 'INPUT_TOO_DEEP');
});

test('too many values, too long a string, key, array or object are INPUT_TOO_LARGE', () => {
  assert.equal(inventory(new Array(LIMITS.maxNodes + 5).fill(0)).error.code, 'INPUT_TOO_LARGE');
  assert.equal(inventory({ s: 'y'.repeat(LIMITS.maxStringLength + 1) }).error.code, 'INPUT_TOO_LARGE');
  assert.equal(inventory({ ['k'.repeat(LIMITS.maxStringLength + 1)]: 1 }).error.code, 'INPUT_TOO_LARGE');
  const many = {};
  for (let i = 0; i < LIMITS.maxNodes + 5; i += 1) many[`k${i}`] = 0;
  assert.equal(inventory(many).error.code, 'INPUT_TOO_LARGE');
  const nested = [];
  for (let i = 0; i < 4; i += 1) nested.push(new Array(LIMITS.maxNodes / 2).fill(0));
  assert.equal(inventory(nested).error.code, 'INPUT_TOO_LARGE');
});

test('PACKET_NOT_OBJECT, INPUT_TOO_LARGE and INPUT_TOO_DEEP come back as findings, never as an exception', () => {
  assert.equal(validatePacket([]).findings[0].code, 'PACKET_NOT_OBJECT');
  const p = load();
  p.title = 'z'.repeat(LIMITS.maxStringLength + 1);
  const large = validatePacket(p, {});
  assert.deepEqual(large.findings.map((f) => f.code), ['INPUT_TOO_LARGE']);
  let a = [];
  for (let i = 0; i < 5000; i += 1) a = [a];
  assert.deepEqual(validatePacket({ deep: a }).findings.map((f) => f.code), ['INPUT_TOO_DEEP']);
});

test('VALIDATOR_ERROR: a packet that throws while it is read is rejected with one finding', () => {
  const p = load();
  Object.defineProperty(p, 'title', { enumerable: true, get() { throw new Error('boom'); } });
  const result = validatePacket(p, {});
  assert.equal(result.ok, false);
  assert.deepEqual(result.findings.map((f) => f.code), ['VALIDATOR_ERROR']);
});

test('a markdown copy beyond the limit is INPUT_TOO_LARGE and is not scanned', () => {
  const result = run(load(), { markdown: 'a'.repeat(LIMITS.maxMarkdownLength + 1) });
  assert.ok(result.findings.some((f) => f.code === 'INPUT_TOO_LARGE' && f.path === 'markdown'));
});

function io(files, extra = {}) {
  const out = [];
  const err = [];
  return { out, err, read: (f) => { if (typeof files[f] !== 'string') throw new Error('ENOENT'); return files[f]; }, stdout: (s) => out.push(s), stderr: (s) => err.push(s), nowUtc: () => '2026-11-07T12:00:00Z', ...extra };
}

test('the CLI answers an oversize input, a too deeply nested one and a failing reader in one line each', () => {
  const big = io({ 'p.json': `{"title":"${'7'.repeat(LIMITS.maxJsonBytes)}"}` });
  assert.equal(main(['p.json'], big), 1);
  assert.match(big.out.join('\n'), /^INPUT_TOO_LARGE p\.json: /);
  const deep = io({ 'p.json': '{}' }, { read: () => { throw new RangeError('Maximum call stack size exceeded'); } });
  assert.equal(main(['p.json'], deep), 1);
  assert.match(deep.out.join('\n'), /^INPUT_TOO_DEEP p\.json: /m);
  const broken = io({ 'p.json': JSON.stringify(load()) }, { stdout: () => { throw new Error('the output pipe is closed'); } });
  assert.equal(main(['p.json'], broken), 2);
  assert.match(broken.err.join('\n'), /^internal error: the output pipe is closed$/);
});

test('the CLI refuses a --now that is not ISO and accepts both ISO forms', () => {
  for (const now of ['Dec 20 2026', '12/20/2026', '1', '', '2026-13-01']) assert.equal(main(['p.json', '--now', now], io({ 'p.json': JSON.stringify(load()) })), 2, now);
  assert.equal(main(['p.json', '--now', '2026-11-07'], io({ 'p.json': JSON.stringify(load()) })), 0);
  assert.equal(main(['p.json', '--now', '2026-11-07T12:00:00Z'], io({ 'p.json': JSON.stringify(load()) })), 0);
});

test('the CLI prints findings as CODE path: message and a count, and a plain OK line', () => {
  const x = io({ 'p.json': JSON.stringify({ title: 1 }) });
  assert.equal(main(['p.json'], x), 1);
  assert.match(x.out[x.out.length - 1], /^\d+ findings$/);
  const one = io({ 'p.json': '[]' });
  assert.equal(main(['p.json'], one), 1);
  assert.deepEqual(one.out, ['PACKET_NOT_OBJECT : the packet must be a JSON object', '1 finding']);
});
