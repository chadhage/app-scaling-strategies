'use strict';

// The answer checks of contract.js (F3) must ACCEPT every answer and view the honest server produces: a false refusal would break the page.
// Every state the engine can reach is walked with a real engine (running, in flight with a pending cancel, partial, compensated, failed
// compensation, completed, too late, interrupted, reconciled, cancel raced the crash, unreadable) and every answer it gives is checked.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./support.cjs');
const C = require('../contract.js');
const R = require('../reconcile.cjs');

const ok = { ok: true, problems: [] };
const asHttp = (view) => ({ ...view, journalOmitted: 0, journalEntries: view.journal.length });
const checkView = (ctx, where) => assert.deepEqual(C.viewCheck(asHttp(ctx.engine.view())), ok, where);
const answerCheck = (body, where) => {
  const check = { 'C017-cancel-result': C.claimCheck, 'C017-reconcile-result': C.reconcileCheck, 'C017-start-result': C.startCheck, 'C017-typed-failure': C.failureCheck }[body.kind];
  assert.deepEqual(check(body), ok, where);
};

async function running(t, faults) {
  const ctx = s.boot({ engine: { faults } });
  t.after(() => ctx.cleanup());
  ctx.g.hold('before', 3);
  const started = await ctx.engine.execute(s.startCmd('start-key-0001'));
  answerCheck(started.body, 'start answer');
  await ctx.g.reached('before', 3);
  checkView(ctx, 'running');
  return { ctx, actionId: started.body.action.actionId };
}

test('the empty lease, a running action and the unreadable journal are accepted', async (t) => {
  const empty = s.boot();
  t.after(() => empty.cleanup());
  checkView(empty, 'empty lease');
  await running(t);
  const made = s.scratch('hv');
  t.after(() => made.remove());
  fs.writeFileSync(path.join(made.dir, 'journal.jsonl'), 'not a journal\n');
  const broken = s.boot({ dir: made.dir });
  t.after(() => broken.cleanup());
  assert.equal(broken.engine.view().journalStatus, 'UNREADABLE');
  checkView(broken, 'unreadable');
  answerCheck((await broken.engine.execute(s.cancelCmd('cancel-key-0001', 'act-1-00000001'))).body, 'cancel on an unreadable journal');
});

for (const [name, compensate, faults, outcome] of [['partial', false, undefined, 'CANCELLED_PARTIAL'], ['compensated', true, undefined, 'COMPENSATED'],
  ['failed compensation at the first step', true, { compensation: (step) => step === 2 }, 'CANCELLED_PARTIAL'], ['failed compensation at the second step', true, { compensation: (step) => step === 1 }, 'CANCELLED_PARTIAL']]) {
  test(`a cancel decided ${name} is accepted as an answer and as a view`, async (t) => {
    const { ctx, actionId } = await running(t, faults);
    const answer = await ctx.engine.execute(s.cancelCmd('cancel-key-0001', actionId, 1, compensate));
    assert.equal(answer.body.outcome, outcome);
    answerCheck(answer.body, name);
    checkView(ctx, `${name} view`);
    answerCheck((await ctx.engine.execute(s.cancelCmd('cancel-key-0001', actionId, 1, compensate))).body, 'idempotent replay');
    answerCheck((await ctx.engine.execute(s.cancelCmd('cancel-key-0002', actionId, 1, compensate))).body, 'a typed failure after the decision');
  });
}

test('a cancel that waits for the step in flight, a completed action and a too-late cancel are accepted', async (t) => {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  ctx.g.hold('in', 2);
  const actionId = await s.startAction(ctx);
  await ctx.g.reached('in', 2);
  const pending = ctx.engine.execute(s.cancelCmd('cancel-key-0001', actionId));
  await s.wait(ctx, (state) => Boolean(state.action.cancel));
  checkView(ctx, 'cancel requested while a step is in flight');
  ctx.g.release('in', 2);
  answerCheck((await pending).body, 'the decided cancel');
  checkView(ctx, 'stopped after the step in flight');
  const done = s.boot();
  t.after(() => done.cleanup());
  const finished = await s.startAction(done);
  await s.wait(done, (state) => state.action.status === 'COMPLETED');
  checkView(done, 'completed');
  const late = await done.engine.execute(s.cancelCmd('cancel-key-0001', finished));
  assert.equal(late.body.outcome, 'CANCEL_TOO_LATE');
  answerCheck(late.body, 'too late');
  checkView(done, 'completed after a too-late cancel');
});

test('an interrupted action, its reconciliation and a cancel that raced the crash are accepted', async (t) => {
  for (const racing of [false, true]) {
    const first = s.boot();
    first.g.hold('in', 3);
    const actionId = await s.startAction(first);
    await first.g.reached('in', 3);
    if (racing) {
      first.engine.execute(s.cancelCmd('cancel-key-0001', actionId)).catch(() => null);
      await s.wait(first, (state) => Boolean(state.action.cancel));
    }
    await first.engine.close();
    const second = s.boot({ dir: first.dir });
    t.after(async () => { await second.cleanup(); await first.cleanup(); });
    assert.equal(second.engine.view().action.status, 'INTERRUPTED');
    checkView(second, `interrupted (cancel raced: ${racing})`);
    if (racing) answerCheck((await second.engine.execute(s.cancelCmd('cancel-key-0001', actionId))).body, 'the raced cancel replays as unknown');
    const settled = await second.engine.execute(s.reconcileCmd('reconcile-key-01', actionId));
    assert.equal(settled.body.determination, racing ? 'CANCEL_UNKNOWN' : 'INTERRUPTED_UNKNOWN');
    answerCheck(settled.body, 'reconcile answer');
    checkView(second, 'reconciled');
  }
});

test('every typed failure of the closed table is accepted, and the page-visible journal types are the engine entry types', () => {
  for (const code of Object.keys(C.failures)) assert.deepEqual(C.failureCheck(C.failure(code, {}).body), ok, code);
  assert.deepEqual([...C.JOURNAL_TYPES], [...R.ENTRY_TYPES]);
  assert.deepEqual(C.STATUSES, ['ACCEPTED', 'RUNNING', 'CANCEL_REQUESTED', 'COMPLETED', 'CANCELLED', 'INTERRUPTED', 'RECONCILED']);
});
