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

test('list prints every saved set with its role, label and origins and exits 0', () => {
  const result = capture(['list']);
  assert.equal(result.status, 0);
  const listed = JSON.parse(result.out);
  assert.equal(listed.length, 8);
  assert.deepEqual(listed.map((item) => item.role), ['historical', 'historical', 'fictional-baseline', 'negative', 'negative', 'negative', 'negative', 'negative']);
  assert.deepEqual(listed[0].origins.latency, { kind: 'producer-saved-output', producer: 'C029', id: 'closed-history' });
  assert.equal(result.err, '');
});

test('table prints the rows, the summary and the exact status counts of a complete table and exits 0', () => {
  const result = capture(['table', 'closed-history', 'latency']);
  assert.equal(result.status, 0);
  const printed = JSON.parse(result.out);
  assert.deepEqual([printed.cardId, printed.savedSet, printed.table, printed.state], ['C040', 'closed-history', 'latency', 'COMPLETE']);
  assert.deepEqual(printed.statusCounts, { WITHIN: 2, EXCEEDED: 1, FAILED: 1, UNKNOWN: 3, NOT_SAVED: 0 });
  assert.equal(printed.rows.length, 7);
  assert.deepEqual(printed.rows.filter((row) => row.attention).map((row) => row.status), ['EXCEEDED', 'FAILED', 'UNKNOWN', 'UNKNOWN', 'UNKNOWN']);
  assert.match(printed.summary, /showing 7 of 7 rows, COMPLETE/);
  assert.match(printed.producerLine, /^Producer C029 says: decision FAIL; originals 7: pass 2, fail 2, unknown 3\.$/);
});

test('the success filter on 3 failed and 2 unknown among 40 successes still prints all 5 and names them', () => {
  const result = capture(['table', 'negative-3-failed-2-unknown-of-40', 'cohort', 'success']);
  assert.equal(result.status, 0);
  const printed = JSON.parse(result.out);
  assert.equal(printed.rows.length, 45);
  assert.equal(printed.rows.filter((row) => row.attention).length, 5);
  assert.match(printed.filterNote, /alone would have hidden 3 FAILED and 2 UNKNOWN rows/);
  assert.equal(printed.query.filter, 'success');
});

test('a table that is not COMPLETE exits 3, so an empty, incomplete or inconsistent table is never reported as success', () => {
  for (const [id, state] of [['negative-empty', 'EMPTY'], ['negative-truncated', 'INCOMPLETE'], ['negative-duplicated-row', 'INCONSISTENT']]) {
    const result = capture(['table', id, 'cohort']);
    assert.equal(result.status, 3, id);
    assert.equal(JSON.parse(result.out).state, state);
  }
  assert.match(JSON.parse(capture(['table', 'negative-empty', 'effect']).out).summary, /no attempts recorded/);
});

test('an unknown saved set exits 1 with its code and prints nothing on stdout', () => {
  assert.deepEqual(capture(['table', 'nope', 'cohort']), { status: 1, out: '', err: 'UNKNOWN_SAVED_SET\n' });
});

test('anything else prints the usage and exits 2: no paths, URLs, verdicts or provenance are accepted', () => {
  for (const argv of [[], ['bogus'], ['list', 'extra'], ['table'], ['table', 'closed-history'], ['table', 'closed-history', 'bogus'], ['table', 'closed-history', 'cohort', 'all', 'extra'],
    ['TABLE', 'closed-history', 'cohort'], ['table', 7, 'cohort']]) {
    const result = capture(argv);
    assert.deepEqual([result.status, result.out, result.err], [2, '', `${cli.usage}\n`], argv.join(' '));
  }
});

test('a path or URL given as an id is only an unknown saved set: nothing is read and nothing is adopted', (t) => {
  const reads = [];
  const original = fs.readFileSync;
  t.mock.method(fs, 'readFileSync', (...args) => { reads.push(String(args[0])); return original(...args); });
  for (const id of ['..\\x.json', 'C:\\Windows\\win.ini', 'https://example.invalid/a', '{"verdict":"PASS"}']) {
    assert.deepEqual(capture(['table', id, 'cohort']), { status: 1, out: '', err: 'UNKNOWN_SAVED_SET\n' }, id);
  }
  assert.ok(reads.every((name) => /imports\.json|saved\.js/.test(name)), reads.join(','));
});

test('a pin or read failure is reported by its code and exits 1', (t) => {
  t.mock.method(fs, 'readFileSync', () => Buffer.from('changed'), { times: 1 });
  assert.deepEqual(capture(['list']), { status: 1, out: '', err: 'SOURCE_PIN_MISMATCH\n' });
  t.mock.method(fs, 'readFileSync', () => { throw new Error('disk'); }, { times: 1 });
  assert.deepEqual(capture(['table', 'closed-history', 'cohort']), { status: 1, out: '', err: 'CLI_UNAVAILABLE\n' });
});

test('run wires the streams and returns the same exit code', () => {
  const written = [];
  const streams = { stdout: { write: (text) => written.push(['out', text]) }, stderr: { write: (text) => written.push(['err', text]) } };
  assert.equal(cli.run(['list'], streams), 0);
  assert.equal(cli.run(['bogus'], streams), 2);
  assert.deepEqual(written.map(([kind]) => kind), ['out', 'err']);
  assert.equal(written[1][1], `${cli.usage}\n`);
});

test('the real process prints JSON, uses exit codes and writes nothing else', () => {
  const run = (...args) => spawnSync(process.execPath, [path.join(__dirname, '..', 'cli.cjs'), ...args], {
    env: childEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 30000 });
  const listed = run('list');
  assert.equal(listed.status, 0);
  assert.equal(JSON.parse(listed.stdout).length, 8);
  const forty = run('table', 'negative-3-failed-2-unknown-of-40', 'effect', 'success');
  assert.equal(forty.status, 0);
  assert.deepEqual(JSON.parse(forty.stdout).statusCounts, { ONE_INTENDED_EFFECT: 40, DUPLICATE: 3, MISSING: 0, MISSING_OBSERVATION: 0, UNKNOWN: 2, NOT_SAVED: 0 });
  const bad = run('bogus');
  assert.deepEqual([bad.status, bad.stdout, bad.stderr], [2, '', `${cli.usage}\n`]);
  const missing = run('table', 'nope', 'cohort');
  assert.deepEqual([missing.status, missing.stdout, missing.stderr], [1, '', 'UNKNOWN_SAVED_SET\n']);
  const truncated = run('table', 'negative-truncated', 'latency');
  assert.equal(truncated.status, 3);
});
