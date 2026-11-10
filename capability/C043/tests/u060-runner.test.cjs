'use strict';

const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const test = require('node:test');
const { createRunner, judge, WORKERS } = require('./u060-mutation-runner.cjs');
const { ORIGINAL, CURRENT, assertNoTimeoutKill } = require('./u060-runner-fixture.cjs');

const complete = (extra = {}) => ({
  code: 1, signal: null, error: null, timedOut: false, streamsClosed: true, cleanup: { clean: true },
  output: 'U060_MUTANT_APPLIED runner.cjs\nnot ok 1 - selected guard\n  code: ERR_ASSERTION\n# tests 1\n# pass 0\n# fail 1\n# skipped 0\n# todo 0\n# cancelled 0\n',
  ...extra,
});

test('U060 RED replays unchanged: timeout-with-partial-assertion is rejected only by the repaired callback', async () => {
  await assert.rejects(() => assertNoTimeoutKill(ORIGINAL), /Missing expected rejection/);
  await assertNoTimeoutKill(CURRENT);
});

test('U060 verdict: only completed named applied assertions kill; timers, signals, missing application and incomplete summaries refuse', () => {
  assert.equal(judge(complete(), 'selected guard').decided, true);
  for (const outcome of [
    complete({ timedOut: true }), complete({ signal: 'SIGKILL' }), complete({ streamsClosed: false }),
    complete({ cleanup: { clean: false } }), complete({ error: 'spawn failed' }),
    complete({ output: complete().output.replace('U060_MUTANT_APPLIED runner.cjs\n', '') }),
    complete({ output: complete().output.replace('# cancelled 0', '# cancelled 1') }),
    complete({ output: complete().output + '\nSyntaxError: invalid mutation' }),
    complete({ output: 'not ok 1 - selected guard\ncode: ERR_ASSERTION\n' }),
  ]) assert.equal(judge(outcome, 'selected guard').decided, false, JSON.stringify(outcome));
  assert.equal(judge(complete(), 'another guard').decided, false);
});

test('U060 worker pool: every row runs, never more than two workers, and one worker cannot consume a neighbour result', async () => {
  const runner = createRunner({ register: async () => ({}), cleanup: async () => ({ clean: true }), progress() {} });
  let active = 0, peak = 0;
  const results = await runner.pool(Array.from({ length: 17 }, (_, index) => index), WORKERS, async (value) => {
    active += 1; peak = Math.max(peak, active);
    await Promise.resolve();
    active -= 1;
    return value * 2;
  });
  assert.equal(peak, 2);
  assert.deepEqual(results, Array.from({ length: 17 }, (_, index) => index * 2));
  await assert.rejects(runner.pool([1], 3, async (value) => value), /worker cap is two/);
});

test('U060 child lifetime: exit with an open inherited pipe settles explicitly undecided after exact owned cleanup', async () => {
  const timers = [];
  const roots = [];
  const cleaned = [];
  const spawn = () => {
    const child = new EventEmitter();
    child.pid = 100 + roots.length;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdout.destroy = () => {}; child.stderr.destroy = () => {};
    roots.push(child);
    return child;
  };
  const runner = createRunner({
    spawn, register: async (pid) => ({ entries: [{ pid, createdAt: '1' }] }),
    cleanup: async (snapshot) => { cleaned.push(snapshot.entries[0].pid); return { clean: true }; },
    setTimeout: (callback) => { const timer = { callback, cancelled: false }; timers.push(timer); return timer; },
    clearTimeout: (timer) => { if (timer) timer.cancelled = true; }, progress() {},
  });
  const result = runner.runNode(['fixture.cjs'], {}, 1000);
  roots[0].emit('spawn');
  await Promise.resolve(); await Promise.resolve();
  roots[0].emit('exit', 0, null);
  for (let turn = 0; turn < 5; turn += 1) await Promise.resolve();
  for (const timer of timers.filter((item) => !item.cancelled)) timer.callback();
  const outcome = await result;
  assert.deepEqual(cleaned, [100]);
  assert.equal(outcome.code, 0);
  assert.equal(outcome.streamsClosed, false);
  assert.equal(judge(outcome, '', true).decided, false);
});

test('U060 environment and commands: explicit test mode and both caller context variables absent', async () => {
  let captured;
  const spawn = (file, args, settings) => {
    captured = settings.env;
    const child = new EventEmitter(); child.pid = 101;
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter();
    child.stdout.destroy = () => {}; child.stderr.destroy = () => {};
    queueMicrotask(() => {
      child.emit('spawn');
      child.stdout.emit('data', Buffer.from('ok 1 - selected\n# tests 1\n# pass 1\n# fail 0\n# skipped 0\n# todo 0\n# cancelled 0\n'));
      child.emit('exit', 0, null); child.emit('close', 0, null);
    });
    return child;
  };
  const runner = createRunner({ spawn, env: { NODE_TEST_CONTEXT: 'child-v8', NODE_V8_COVERAGE: 'caller' },
    register: async () => ({}), cleanup: async () => ({ clean: true }), progress() {} });
  const args = runner.focused('fixture.cjs', 'selected');
  assert.equal(args[0], '--test');
  const outcome = await runner.runNode(args, {}, 1000);
  assert.equal(Object.hasOwn(captured, 'NODE_TEST_CONTEXT'), false);
  assert.equal(Object.hasOwn(captured, 'NODE_V8_COVERAGE'), false);
  assert.equal(judge(outcome, 'selected', true).decided, true);
});
