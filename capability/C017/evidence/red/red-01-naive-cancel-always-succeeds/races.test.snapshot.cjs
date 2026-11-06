'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');

const recoveryActions = ['reinspect', 'correct-closed-command', 'confirm-operator-review', 'stop', 'retry-identical'];

async function hold(t, kind, step, options = {}) {
  const ctx = s.boot(options);
  t.after(() => ctx.cleanup());
  ctx.g.hold(kind, step);
  ctx.actionId = await s.startAction(ctx);
  await ctx.g.reached(kind, step);
  return ctx;
}
const requested = (key) => (state) => Boolean(state.action && state.action.cancel && state.action.cancel.key === key);
const strip = (body) => ({ ...body, idempotentReplay: undefined });

test('cancel is idempotent per key; a different command under the same key conflicts and changes nothing', async (t) => {
  const ctx = await hold(t, 'before', 3);
  const first = ctx.engine.execute(s.cancelCmd('cancel-key-0001', ctx.actionId));
  await s.wait(ctx, requested('cancel-key-0001'));
  const pendingReplay = ctx.engine.execute(s.cancelCmd('cancel-key-0001', ctx.actionId));
  const [a, b] = await Promise.all([first, pendingReplay]);
  assert.deepEqual(strip(b.body), strip(a.body));
  assert.equal(b.body.idempotentReplay, true);
  const size = ctx.engine.view().journal.length;
  const c = await ctx.engine.execute(s.cancelCmd('cancel-key-0001', ctx.actionId));
  assert.deepEqual(strip(c.body), strip(a.body));
  assert.equal(ctx.engine.view().journal.length, size, 'a replay appends nothing');
  assert.equal(s.decisions(ctx).length, 1);
  const conflict = await ctx.engine.execute(s.cancelCmd('cancel-key-0001', ctx.actionId, 1, true));
  assert.equal(conflict.status, 409);
  assert.equal(conflict.body.error?.code, 'IDEMPOTENCY_CONFLICT');
  assert.equal(conflict.body.outcome, undefined);
  assert.equal(ctx.engine.view().journal.length, size);
});

test('a second cancel with a new key is CANCEL_IN_PROGRESS while pending and ALREADY_TERMINAL afterwards', async (t) => {
  const ctx = await hold(t, 'in', 2);
  const first = ctx.engine.execute(s.cancelCmd('cancel-key-0001', ctx.actionId));
  await s.wait(ctx, requested('cancel-key-0001'));
  const busy = await ctx.engine.execute(s.cancelCmd('cancel-key-0002', ctx.actionId));
  assert.equal(busy.status, 409);
  assert.equal(busy.body.error?.code, 'CANCEL_IN_PROGRESS');
  assert.equal(busy.body.outcome, undefined);
  ctx.g.release('in', 2);
  await first;
  const late = await ctx.engine.execute(s.cancelCmd('cancel-key-0003', ctx.actionId));
  assert.equal(late.body.error?.code, 'ALREADY_TERMINAL');
  assert.equal(late.body.outcome, undefined);
  assert.equal(s.decisions(ctx).length, 1);
});

test('wrong lease, run, user, action, stale and future epochs are typed failures that claim and change nothing', async (t) => {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  await s.startAction(ctx);
  await s.wait(ctx, (state) => state.action.status === 'COMPLETED');
  ctx.g.hold('before', 2);
  const second = await ctx.engine.execute(s.startCmd('start-key-0002', 1));
  assert.equal(second.status, 202);
  const id2 = second.body.action.actionId;
  await s.wait(ctx, (state) => state.action.epoch === 2 && state.action.effectsStanding.length === 1);
  const size = ctx.engine.view().journal.length;
  const cases = [
    [{ leaseId: 'lease-other-0001' }, 'UNKNOWN_LEASE', 404], [{ runId: 'synthetic-run-002' }, 'UNKNOWN_RUN', 404],
    [{ userId: 'user-other-0001' }, 'UNKNOWN_USER', 403], [{ actionId: 'act-2-ffffffff' }, 'UNKNOWN_ACTION', 404],
    [{ epoch: 1 }, 'STALE_EPOCH', 409], [{ epoch: 3 }, 'FUTURE_EPOCH', 409],
  ];
  for (const [override, code, status] of cases) {
    const answer = await ctx.engine.execute({ ...s.cancelCmd(`probe-key-${code}`, id2, 2), ...override });
    assert.equal(answer.status, status, code);
    assert.equal(answer.body.error?.code, code);
    assert.equal(answer.body.outcome, undefined, 'a typed failure never claims an outcome');
    assert.equal(answer.body.effectClaimed, false);
    assert.ok(answer.body.allowedActions?.length > 0 && answer.body.allowedActions.every((a) => recoveryActions.includes(a)));
    assert.equal(ctx.engine.view().journal.length, size, `${code} wrote nothing`);
  }
  ctx.g.release('before', 2);
  await s.wait(ctx, (state) => state.action.status === 'COMPLETED' && state.action.epoch === 2);
  assert.equal(s.decisions(ctx).length, 0, 'no failed cancel ever stopped the action');
});

test('a storm of parallel cancels racing the final step yields exactly one consistent outcome', async (t) => {
  const ctx = await hold(t, 'in', 4);
  const keys = Array.from({ length: 12 }, (_, i) => `storm-key-${String(i).padStart(4, '0')}`);
  const calls = [...keys, keys[0], keys[0]].map((key) => ctx.engine.execute(s.cancelCmd(key, ctx.actionId)));
  await s.wait(ctx, (state) => Boolean(state.action.cancel));
  ctx.g.release('in', 4);
  const answers = await Promise.all(calls);
  const results = answers.filter((a) => a.body.kind === 'C017-cancel-result');
  const refused = answers.filter((a) => a.body.kind !== 'C017-cancel-result');
  assert.ok(results.length >= 1 && refused.length >= 1);
  assert.ok(refused.every((a) => a.body.error?.code === 'CANCEL_IN_PROGRESS'));
  assert.ok(results.every((a) => a.body.outcome === 'CANCEL_TOO_LATE' && a.status === 409));
  const journal = ctx.engine.view().journal;
  assert.equal(journal.filter((e) => e.type === 'cancel-requested').length, 1);
  assert.equal(s.decisions(ctx).length, 1);
  assert.ok(results.every((a) => a.body.key === s.decisions(ctx)[0].key));
  results.forEach((a) => s.assertHonest(assert, a.body, journal));
  assert.ok(journal.findIndex((e) => e.type === 'action-completed') < journal.findIndex((e) => e.type === 'cancel-decided'));
});

test('a storm racing before step 4 yields exactly one consistent partial outcome', async (t) => {
  const ctx = await hold(t, 'before', 4);
  const calls = Array.from({ length: 10 }, (_, i) => ctx.engine.execute(s.cancelCmd(`storm-key-${String(i).padStart(4, '0')}`, ctx.actionId)));
  const answers = await Promise.all(calls);
  const results = answers.filter((a) => a.body.kind === 'C017-cancel-result');
  assert.equal(results.length, 1);
  assert.equal(results[0].body.outcome, 'CANCELLED_PARTIAL');
  assert.deepEqual(results[0].body.facts.stepsNotRun, [4]);
  assert.equal(s.decisions(ctx).length, 1);
  s.assertHonest(assert, results[0].body, ctx.engine.view().journal);
});

test('a start is refused while an action is in flight; replays are idempotent; stale and future epochs are rejected', async (t) => {
  const ctx = await hold(t, 'before', 2);
  const busy = await ctx.engine.execute(s.startCmd('start-key-0002', 1));
  assert.equal(busy.body.error?.code, 'ACTION_NOT_SETTLED');
  const size = ctx.engine.view().journal.length;
  const replay = await ctx.engine.execute(s.startCmd('start-key-0001'));
  assert.equal(replay.status, 202);
  assert.equal(replay.body.idempotentReplay, true);
  assert.equal(replay.body.action.actionId, ctx.actionId);
  assert.equal((await ctx.engine.execute(s.startCmd('start-key-0003', 0))).body.error?.code, 'STALE_EPOCH');
  assert.equal((await ctx.engine.execute(s.startCmd('start-key-0004', 5))).body.error?.code, 'FUTURE_EPOCH');
  assert.equal(ctx.engine.view().journal.length, size);
  ctx.g.release('before', 2);
  await s.wait(ctx, (state) => state.action.status === 'COMPLETED');
  assert.equal((await ctx.engine.execute(s.startCmd('start-key-0005', 1))).body.action.epoch, 2);
});
