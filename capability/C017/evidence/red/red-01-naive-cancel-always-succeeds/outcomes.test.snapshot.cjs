'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');

async function cancelAt(ctx, key, compensate = false) {
  const actionId = ctx.actionId;
  const pending = ctx.engine.execute(s.cancelCmd(key, actionId, 1, compensate));
  await s.wait(ctx, (state) => state.action && state.action.cancel && state.action.cancel.key === key, 'the cancel request was never journaled');
  return pending;
}

async function scenario(t, hold) {
  const ctx = s.boot(hold.engine ? { engine: hold.engine } : {});
  t.after(() => ctx.cleanup());
  ctx.g.hold(hold.kind, hold.step);
  ctx.actionId = await s.startAction(ctx);
  await ctx.g.reached(hold.kind, hold.step);
  return ctx;
}

test('cancel before any step ran is CANCELLED_BEFORE_EFFECT with nothing to undo', async (t) => {
  const ctx = await scenario(t, { kind: 'before', step: 1 });
  const answer = await cancelAt(ctx, 'cancel-key-0001');
  assert.equal(answer.status, 200);
  assert.equal(answer.body.outcome, 'CANCELLED_BEFORE_EFFECT');
  assert.deepEqual(answer.body.facts.effectsStanding, []);
  assert.deepEqual(answer.body.facts.stepsNotRun, [1, 2, 3, 4]);
  assert.equal(answer.body.facts.standingUnits, 0);
  assert.match(answer.body.statement, /nothing to undo/i);
  assert.deepEqual([answer.body.leaseId, answer.body.runId, answer.body.epoch], ['lease-synthetic-001', 'synthetic-run-001', 1]);
  assert.ok(!s.types(ctx).includes('step-intent') && !s.types(ctx).includes('step-effect'));
  s.assertHonest(assert, answer.body, ctx.engine.view().journal);
});

test('cancel while waiting before step 3 is CANCELLED_PARTIAL: steps 1 and 2 stand and nothing is undone', async (t) => {
  const ctx = await scenario(t, { kind: 'before', step: 3 });
  const answer = await cancelAt(ctx, 'cancel-key-0001');
  assert.equal(answer.status, 200);
  assert.equal(answer.body.outcome, 'CANCELLED_PARTIAL');
  assert.deepEqual(answer.body.facts.effectsStanding, [{ step: 1, units: 5 }, { step: 2, units: 5 }]);
  assert.deepEqual(answer.body.facts.stepsNotRun, [3, 4]);
  assert.deepEqual(answer.body.facts.undone, []);
  assert.equal(answer.body.facts.standingUnits, 10);
  assert.equal(answer.body.nothingUndone, true);
  assert.match(answer.body.statement, /nothing was undone/i);
  assert.ok(!s.types(ctx).some((type) => type.startsWith('compensation')));
  s.assertHonest(assert, answer.body, ctx.engine.view().journal);
});

test('cancel during step 3 is applied at the boundary: the step finishes and stands', async (t) => {
  const ctx = await scenario(t, { kind: 'in', step: 3 });
  const pending = cancelAt(ctx, 'cancel-key-0001');
  await s.wait(ctx, (state) => state.action.cancel && state.action.cancel.key === 'cancel-key-0001');
  ctx.g.release('in', 3);
  const answer = await pending;
  assert.equal(answer.body.outcome, 'CANCELLED_PARTIAL');
  assert.deepEqual(answer.body.facts.effectsStanding.map((e) => e.step), [1, 2, 3]);
  assert.deepEqual(answer.body.facts.stepsNotRun, [4]);
  assert.deepEqual(answer.body.facts.unknownSteps, []);
  const order = s.types(ctx);
  assert.ok(order.indexOf('cancel-requested') < order.lastIndexOf('step-effect'), 'the request arrived while step 3 was in flight');
  assert.ok(order.lastIndexOf('step-effect') < order.indexOf('cancel-decided'), 'the decision follows the in-flight effect');
  s.assertHonest(assert, answer.body, ctx.engine.view().journal);
});

test('cancel after completion is CANCEL_TOO_LATE: a conflict, all effects stand, not a success', async (t) => {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  const actionId = await s.startAction(ctx);
  await s.wait(ctx, (state) => state.action.status === 'COMPLETED', 'the action never completed');
  const answer = await ctx.engine.execute(s.cancelCmd('cancel-key-0001', actionId));
  assert.equal(answer.status, 409);
  assert.equal(answer.body.outcome, 'CANCEL_TOO_LATE');
  assert.equal(answer.body.effective, false);
  assert.equal(answer.body.facts.effectsStanding.length, 4);
  assert.equal(answer.body.facts.standingUnits, 20);
  assert.match(answer.body.statement, /not effective/i);
  s.assertHonest(assert, answer.body, ctx.engine.view().journal);
});

test('cancel with compensation is COMPENSATED only after journaled compensating steps ran in reverse order', async (t) => {
  const ctx = await scenario(t, { kind: 'before', step: 3 });
  const answer = await cancelAt(ctx, 'cancel-key-0001', true);
  assert.equal(answer.status, 200);
  assert.equal(answer.body.outcome, 'COMPENSATED');
  assert.deepEqual(answer.body.facts.undone, [{ step: 2, units: 5 }, { step: 1, units: 5 }]);
  assert.deepEqual(answer.body.facts.effectsStanding, []);
  assert.equal(answer.body.facts.standingUnits, 0);
  assert.equal(answer.body.facts.compensation, 'COMPLETE');
  const journal = ctx.engine.view().journal;
  assert.equal(journal.filter((e) => e.type === 'step-effect').length, 2, 'the original effects stay in the journal');
  const tail = journal.slice(journal.findIndex((e) => e.type === 'cancel-requested')).map((e) => e.type);
  assert.deepEqual(tail, ['cancel-requested', 'compensation-intent', 'compensation-effect', 'compensation-intent', 'compensation-effect', 'cancel-decided']);
  assert.deepEqual(journal.filter((e) => e.type === 'compensation-effect').map((e) => [e.step, e.units, e.standingUnits]), [[2, -5, 5], [1, -5, 0]]);
  s.assertHonest(assert, answer.body, journal);
});

test('a failed compensation is reported as such and is never COMPENSATED', async (t) => {
  const ctx = await scenario(t, { kind: 'before', step: 3, engine: { faults: { compensation: (step) => step === 1 } } });
  const answer = await cancelAt(ctx, 'cancel-key-0001', true);
  assert.equal(answer.body.outcome, 'CANCELLED_PARTIAL');
  assert.notEqual(answer.body.outcome, 'COMPENSATED');
  assert.deepEqual(answer.body.facts.effectsStanding, [{ step: 1, units: 5 }]);
  assert.deepEqual(answer.body.facts.undone, [{ step: 2, units: 5 }]);
  assert.equal(answer.body.facts.compensation, 'FAILED');
  assert.deepEqual(answer.body.facts.compensationFailure, { step: 1, reason: 'SYNTHETIC_FAULT' });
  assert.match(answer.body.statement, /compensating step 1 failed/i);
  assert.ok(s.types(ctx).includes('compensation-failed'));
  s.assertHonest(assert, answer.body, ctx.engine.view().journal);
});
