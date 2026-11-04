'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const path = require('node:path');
const { load, fixtureSubject } = require('./support.cjs');
const cli = path.resolve(__dirname, '..', 'cli.cjs');
// cli.cjs runs main() on load, so the closed entry point is driven in process with captured console output
// and a fixture-owned session; no live ledger, C015 restore or private publisher is read.
async function run(args, readiness = fixtureSubject()) {
  const out = [];
  const err = [];
  const saved = { argv: process.argv, log: console.log, error: console.error, exitCode: process.exitCode };
  let finish;
  const finished = new Promise((resolve) => { finish = resolve; });
  const timer = setTimeout(() => finish('timeout'), 15000);
  console.log = (...items) => { out.push(items.join(' ')); finish('done'); };
  console.error = (...items) => { err.push(items.join(' ')); finish('done'); };
  process.argv = [saved.argv[0], cli, ...args];
  process.exitCode = undefined;
  try {
    load(cli, { './readiness.js': readiness });
    assert.equal(await finished, 'done');
    return { out, err, exitCode: process.exitCode };
  } finally {
    clearTimeout(timer);
    process.argv = saved.argv;
    process.exitCode = saved.exitCode;
    console.log = saved.log;
    console.error = saved.error;
  }
}
const noNativeClaims = (value, flags) => {
  for (const key of Object.keys(flags)) assert.equal(value[key], false, key);
};
test('list prints the closed fixture ids with every native flag false and never opens a session', async () => {
  const readiness = { ...fixtureSubject(), open: async () => { throw new Error('list must not open a session'); } };
  const result = await run(['list'], readiness);
  assert.equal(result.err.length, 0);
  assert.equal(result.exitCode, undefined);
  const list = JSON.parse(result.out[0]);
  assert.equal(list.cardId, 'C038');
  assert.deepEqual(list.fixtures, [...readiness.ids]);
  noNativeClaims(list, readiness.flags);
});
test('context opens one fixture-owned session and inspects nothing', async () => {
  const readiness = fixtureSubject();
  const result = await run(['context'], readiness);
  assert.equal(result.exitCode, undefined);
  const printed = JSON.parse(result.out[0]);
  assert.equal(printed.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.deepEqual(printed.results, []);
  assert.deepEqual(printed.snapshot.history, []);
  assert.equal(printed.snapshot.ownerContextOrigin, (await readiness.open()).snapshot().ownerContextOrigin);
  noNativeClaims(printed.snapshot, readiness.flags);
});
test('inspect single-probe holds while inspect complete is the sole closed synthetic positive', async () => {
  const held = JSON.parse((await run(['inspect', 'single-probe'])).out[0]);
  assert.equal(held.results.length, 1);
  assert.equal(held.results[0].decision, 'UNKNOWN');
  assert.equal(held.results[0].action, 'HOLD');
  assert.equal(held.results[0].syntheticPoolReady, false);
  assert.equal(held.results[0].freshReadyProbes, 1);
  const ready = JSON.parse((await run(['inspect', 'complete'])).out[0]);
  assert.equal(ready.results[0].decision, 'CLOSED_SYNTHETIC_READY');
  assert.equal(ready.results[0].syntheticPoolReady, true);
  assert.equal(ready.results[0].actualPoolReady, false);
  assert.equal(ready.snapshot.history.length, 1);
});
test('compare keeps the failed original immutable behind the later fresh round', async () => {
  const printed = JSON.parse((await run(['compare', 'failed-node', 'later-fresh'])).out[0]);
  assert.deepEqual(printed.results.map((item) => item.decision), ['FAILED', 'CLOSED_SYNTHETIC_READY']);
  assert.deepEqual(printed.snapshot.history.map((item) => item.decision), ['FAILED', 'CLOSED_SYNTHETIC_READY']);
  assert.equal(printed.snapshot.history[0].originalClientJourneyRepaired, false);
});
test('an unknown fixture id is a closed HOLD error with its code and exit status 2', async () => {
  const result = await run(['inspect', 'actual-pool']);
  assert.equal(result.out.length, 0);
  assert.equal(result.exitCode, 2);
  const failure = JSON.parse(result.err[0]);
  assert.deepEqual([failure.decision, failure.action, failure.syntheticPoolReady, failure.code],
    ['UNKNOWN', 'HOLD', false, 'UNKNOWN_FIXTURE_ID']);
  noNativeClaims(failure, fixtureSubject().flags);
});
for (const args of [[], ['inspect'], ['inspect', 'complete', '--eligible'], ['compare', 'complete'],
  ['context', 'extra'], ['list', 'extra'], ['status']]) {
  test(`${JSON.stringify(args)} is not a closed command`, async () => {
    const result = await run(args);
    assert.equal(result.out.length, 0);
    assert.equal(result.exitCode, 2);
    assert.equal(JSON.parse(result.err[0]).code, 'CLOSED_COMMAND_REQUIRED');
  });
}
test('an unexpected session failure without a code maps to the unavailable default and never a positive', async () => {
  const readiness = { ...fixtureSubject(), open: async () => { throw new Error('unexpected'); } };
  const result = await run(['inspect', 'complete'], readiness);
  assert.equal(result.exitCode, 2);
  const failure = JSON.parse(result.err[0]);
  assert.equal(failure.code, 'CONTEXT_OR_INSPECTION_UNAVAILABLE');
  assert.equal(failure.syntheticPoolReady, false);
});
