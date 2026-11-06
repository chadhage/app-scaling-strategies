'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');

const steps = (list) => list.map((e) => e.step);

async function crashedDuringStep3(t, withCancel) {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  ctx.g.hold('in', 3);
  const actionId = await s.startAction(ctx);
  await ctx.g.reached('in', 3);
  let pending = null;
  if (withCancel) {
    pending = ctx.engine.execute(s.cancelCmd('cancel-key-0001', actionId));
    await s.wait(ctx, (state) => Boolean(state.action.cancel));
  }
  await ctx.engine.close();
  const answerAtCrash = pending ? await pending : null;
  const again = s.boot({ dir: ctx.dir });
  t.after(() => again.engine.close());
  return { ctx, again, actionId, answerAtCrash };
}

test('after a crash mid-step the action is INTERRUPTED, never cancelled or completed, and an intent without an effect is UNKNOWN', async (t) => {
  const { again, actionId } = await crashedDuringStep3(t, false);
  const action = s.actionOf(again);
  assert.equal(action.status, 'INTERRUPTED');
  assert.deepEqual(steps(action.effectsStanding), [1, 2]);
  assert.deepEqual(action.unknownSteps, [3]);
  assert.deepEqual(action.stepsNotRun, [4]);
  assert.ok(!['CANCELLED', 'COMPLETED'].includes(action.status));
  const before = again.engine.view().journal.length;
  const answer = await again.engine.execute(s.cancelCmd('cancel-key-0001', actionId));
  assert.equal(answer.status, 503);
  assert.equal(answer.body.outcome, 'CANCEL_UNKNOWN');
  assert.equal(answer.body.effective, false);
  assert.deepEqual(answer.body.facts.unknownSteps, [3]);
  assert.match(answer.body.statement, /not confirmed/i);
  assert.equal(again.engine.view().journal.length, before, 'an unknown answer writes nothing');
  s.assertHonest(assert, answer.body, again.engine.view().journal);
});

test('reconciliation after a restart is an explicit, idempotent command that settles facts without claiming cancelled or completed', async (t) => {
  const { again, actionId } = await crashedDuringStep3(t, false);
  const answer = await again.engine.execute(s.reconcileCmd('reconcile-key-01', actionId));
  assert.equal(answer.status, 200);
  assert.equal(answer.body.determination, 'INTERRUPTED_UNKNOWN');
  assert.deepEqual(answer.body.facts.unknownSteps, [3]);
  assert.doesNotMatch(answer.body.statement, /was cancelled|completed successfully|rolled back/i);
  assert.equal(s.actionOf(again).status, 'RECONCILED');
  const replay = await again.engine.execute(s.reconcileCmd('reconcile-key-01', actionId));
  assert.deepEqual({ ...replay.body, idempotentReplay: undefined }, { ...answer.body, idempotentReplay: undefined });
  assert.equal(again.engine.view().journal.filter((e) => e.type === 'reconciled').length, 1);
  assert.equal((await again.engine.execute(s.cancelCmd('cancel-key-0009', actionId))).body.error?.code, 'ACTION_NOT_RUNNING');
  const next = await again.engine.execute(s.startCmd('start-key-0002', 1));
  assert.equal(next.status, 202);
});

test('a cancel that raced the crash is CANCEL_UNKNOWN when replayed with its key, before and after reconciliation', async (t) => {
  const { again, actionId, answerAtCrash } = await crashedDuringStep3(t, true);
  assert.equal(answerAtCrash.status, 503);
  assert.equal(answerAtCrash.body.error?.code, 'SERVER_CLOSING');
  assert.equal(answerAtCrash.body.outcome, undefined);
  const state = s.actionOf(again);
  assert.equal(state.status, 'INTERRUPTED');
  assert.equal(state.cancel?.decided, false);
  assert.equal(state.cancel?.outcome, 'CANCEL_UNKNOWN');
  const replay = await again.engine.execute(s.cancelCmd('cancel-key-0001', actionId));
  assert.equal(replay.body.outcome, 'CANCEL_UNKNOWN');
  const reconciled = await again.engine.execute(s.reconcileCmd('reconcile-key-01', actionId));
  assert.equal(reconciled.body.determination, 'CANCEL_UNKNOWN');
  const after = await again.engine.execute(s.cancelCmd('cancel-key-0001', actionId));
  assert.equal(after.body.outcome, 'CANCEL_UNKNOWN');
  s.assertHonest(assert, after.body, again.engine.view().journal);
  assert.equal((await again.engine.execute(s.cancelCmd('cancel-key-0002', actionId))).body.error?.code, 'ACTION_NOT_RUNNING');
});

test('a restart after a clean completion shows COMPLETED, and a cancel of it is too late (never unknown)', async (t) => {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  const actionId = await s.startAction(ctx);
  await s.wait(ctx, (state) => state.action.status === 'COMPLETED');
  await ctx.engine.close();
  const again = s.boot({ dir: ctx.dir });
  t.after(() => again.engine.close());
  assert.equal(s.actionOf(again).status, 'COMPLETED');
  const answer = await again.engine.execute(s.cancelCmd('cancel-key-0001', actionId));
  assert.equal(answer.body.outcome, 'CANCEL_TOO_LATE');
  s.assertHonest(assert, answer.body, again.engine.view().journal);
});
