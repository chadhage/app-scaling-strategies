'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const cli = require('..\\cli.cjs');
const { childEnvironment } = require('.\\nested-runner.cjs');

function capture(argv) {
  const out = [];
  const err = [];
  const status = cli.main(argv, { stdout: (text) => out.push(text), stderr: (text) => err.push(text) });
  return { status, out: out.join(''), err: err.join('') };
}

test('list prints every saved id with its group and exits 0', () => {
  const result = capture(['list']);
  assert.equal(result.status, 0);
  const listed = JSON.parse(result.out);
  assert.equal(listed.length, 8);
  assert.deepEqual(listed.map((item) => item.group), ['historical', 'historical', 'baseline', 'negative', 'negative', 'negative', 'negative', 'negative']);
  assert.equal(result.err, '');
});

for (const [id, fraction] of [['c034-closed-history', '3/7'], ['c034-held-snapshot', '1/2'], ['fleet-baseline', '3/8'], ['negative-unchanged-flood', '3/8'],
  ['negative-replayed-v2-request', '3/10'], ['negative-duplicated-trace', '3/9'], ['negative-stale-cached-ack', '3/9'], ['negative-out-of-order', '3/11']]) {
  test(`evaluate ${id} prints the exact fraction ${fraction} and exits 0`, () => {
    const result = capture(['evaluate', id]);
    assert.equal(result.status, 0);
    assert.equal(JSON.parse(result.out).successRate.fraction, fraction);
  });
}

test('compare prints the not-raised decision for a negative set', () => {
  const result = capture(['compare', 'negative-stale-cached-ack']);
  assert.equal(result.status, 0);
  const comparison = JSON.parse(result.out);
  assert.deepEqual([comparison.decision, comparison.before.fraction, comparison.after.fraction], ['NOT_RAISED', '3/8', '3/9']);
});

test('an unknown id or a non-negative compare exits 1 with a rejected report and no success rate', () => {
  const unknown = capture(['evaluate', 'nope']);
  assert.equal(unknown.status, 1);
  assert.deepEqual([JSON.parse(unknown.out).valid, JSON.parse(unknown.out).code], [false, 'UNKNOWN_SAVED_ID']);
  const baseline = capture(['compare', 'fleet-baseline']);
  assert.equal(baseline.status, 1);
  assert.equal(JSON.parse(baseline.out).code, 'COMPARISON_REQUIRES_NEGATIVE_FLEET');
});

test('anything else prints the usage and exits 2: no paths, URLs or verdicts are accepted', () => {
  for (const argv of [[], ['bogus'], ['list', 'extra'], ['evaluate'], ['evaluate', 'a', 'b'], ['compare'], ['EVALUATE', 'fleet-baseline']]) {
    const result = capture(argv);
    assert.deepEqual([result.status, result.out, result.err], [2, '', `${cli.usage}\n`], argv.join(' '));
  }
});

test('a path or URL given as an id is only an unknown saved id: nothing is read and nothing is adopted', (t) => {
  const reads = [];
  const original = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (...args) => { reads.push(String(args[0])); return original(...args); });
  for (const id of ['..\\x.json', 'C:\\Windows\\win.ini', 'https://example.invalid/a', '{"verdict":"PASS"}']) {
    const result = capture(['evaluate', id]);
    assert.equal(result.status, 1, id);
    assert.deepEqual([JSON.parse(result.out).valid, JSON.parse(result.out).code], [false, 'UNKNOWN_SAVED_ID']);
  }
  assert.ok(reads.every((name) => /imports\.json|saved\.js|bundle\.json|bundle\.js|contract\.js|evaluator\.js|source\.cjs/.test(name) || name.includes('C031') || name.includes('C034')), reads.join(','));
  assert.ok(!reads.some((name) => /x\.json|win\.ini/.test(name)));
});

test('a pin or read failure is reported by its code and exits 1', (t) => {
  t.mock.method(fs, 'readFileSync', () => Buffer.from('changed'), { times: 1 });
  assert.deepEqual(capture(['list']), { status: 1, out: '', err: 'SOURCE_PIN_MISMATCH\n' });
  t.mock.method(fs, 'readFileSync', () => { throw new Error('disk'); }, { times: 1 });
  assert.deepEqual(capture(['evaluate', 'fleet-baseline']), { status: 1, out: '', err: 'CLI_UNAVAILABLE\n' });
});

test('the real process prints JSON, uses exit codes and writes nothing else', () => {
  const run = (...args) => spawnSync(process.execPath, [path.join(__dirname, '..', 'cli.cjs'), ...args], {
    env: childEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const listed = run('list');
  assert.equal(listed.status, 0);
  assert.equal(JSON.parse(listed.stdout).length, 8);
  const flood = run('evaluate', 'negative-unchanged-flood');
  assert.equal(flood.status, 0);
  assert.deepEqual([JSON.parse(flood.stdout).successRate.fraction, JSON.parse(flood.stdout).counts.unchanged], ['3/8', 42]);
  const bad = run('bogus');
  assert.deepEqual([bad.status, bad.stdout, bad.stderr], [2, '', `${cli.usage}\n`]);
  const missing = run('evaluate', 'nope');
  assert.deepEqual([missing.status, JSON.parse(missing.stdout).valid], [1, false]);
});
