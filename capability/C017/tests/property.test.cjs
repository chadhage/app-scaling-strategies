'use strict';

// Stateful property test (L-0119): seeded random sequences over an operation alphabet that INCLUDES the recovery operations
// (crash and restart over the same journal, replayed commands, new epochs, typed failures, reconcile). A global invariant set is
// checked after EVERY operation, against an oracle that reads only the raw journal entries.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const R = require('../reconcile.cjs');
const C = require('../contract.js');

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function stepper() {
  const queue = [];
  const gate = () => () => new Promise((resolve) => queue.push(resolve));
  return { gates: { beforeStep: gate(), inStep: gate(), inCompensation: gate() }, queue };
}
const settle = async () => { for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setImmediate(resolve)); };
const weights = [['advance', 30], ['cancel', 15], ['cancelReplay', 8], ['cancelWrong', 6], ['start', 10], ['startReplay', 4], ['reconcile', 6], ['reconcileReplay', 2], ['crash', 6], ['garbage', 3], ['read', 10]];

function pick(random) {
  let roll = random() * weights.reduce((sum, [, w]) => sum + w, 0);
  for (const [name, w] of weights) { roll -= w; if (roll < 0) return name; }
  return 'read';
}

// Independent oracle over raw entries (never imports reconcile.cjs logic).
function oracleOutcome(list) {
  const effects = list.filter((e) => e.type === 'step-effect').map((e) => e.step);
  const reversed = list.filter((e) => e.type === 'compensation-effect').map((e) => e.step);
  if (list.some((e) => e.type === 'action-completed')) return 'CANCEL_TOO_LATE';
  if (effects.length && reversed.length === effects.length) return 'COMPENSATED';
  if (!list.some((e) => e.type === 'step-intent')) return 'CANCELLED_BEFORE_EFFECT';
  return 'CANCELLED_PARTIAL';
}

function checkJournal(seed, ctx, snapshot, boots) {
  const state = ctx.engine.view();
  assert.equal(state.journalStatus, 'READABLE', `seed ${seed}: the journal became unreadable`);
  const entries = state.journal;
  assert.doesNotThrow(() => R.derive(entries), `seed ${seed}: derive`);
  assert.deepEqual(entries.slice(0, snapshot.length), snapshot, `seed ${seed}: the journal is append-only`);
  assert.equal(entries.filter((e) => e.type === 'boot').length, boots, `seed ${seed}: one boot per engine instance`);
  const accepted = entries.filter((e) => e.type === 'action-accepted');
  accepted.forEach((a, i) => assert.equal(a.epoch, i + 1, `seed ${seed}: epochs are contiguous`));
  accepted.forEach((a, i) => {
    const own = entries.filter((e) => e.actionId === a.actionId);
    const count = (type) => own.filter((e) => e.type === type).length;
    const steps = own.filter((e) => e.type === 'step-effect').map((e) => e.step);
    assert.deepEqual(steps, steps.map((_, k) => k + 1), `seed ${seed}: no step took effect twice or out of order`);
    for (const type of ['cancel-requested', 'cancel-decided', 'reconciled', 'action-completed']) assert.ok(count(type) <= 1, `seed ${seed}: at most one ${type}`);
    const decided = own.find((e) => e.type === 'cancel-decided');
    if (decided) assert.equal(decided.outcome, oracleOutcome(own.slice(0, own.indexOf(decided))), `seed ${seed}: the decision equals the raw-journal oracle`);
    if (i < accepted.length - 1) assert.ok(count('cancel-decided') + count('reconciled') + count('action-completed') >= 1, `seed ${seed}: only the last action may be unsettled`);
  });
  return entries;
}

async function sequence(seed, length) {
  const random = prng(seed);
  const made = s.scratch('p');
  let counter = 0;
  let boots = 1;
  const open = () => {
    const st = stepper();
    return { st, engine: require('../engine.cjs').createEngine({ dir: made.dir, steps: 4, unitsPerStep: 5, gates: st.gates, ids: s.sequence(), now: s.clock() }) };
  };
  let ctx = open();
  const sent = [];
  const key = (prefix) => `${prefix}-${String((counter += 1)).padStart(5, '0')}`;
  const send = (kind, command) => {
    const record = { kind, command, done: false, checked: false, result: null, before: ctx.engine.view().journal.length };
    record.promise = ctx.engine.execute(command).then((result) => { record.done = true; record.result = result; return result; });
    sent.push(record);
    return record;
  };
  const statuses = () => { const a = ctx.engine.view().action; return a ? a.status : null; };
  let snapshot = [];
  try {
    for (let i = 0; i < length; i += 1) {
      const op = pick(random);
      const view = ctx.engine.view();
      const action = view.action;
      const live = action ? { actionId: action.actionId, epoch: action.epoch } : { actionId: 'act-1-ffffffff', epoch: 1 };
      const before = view.journal.length;
      const statusBefore = statuses();
      const cmdOf = {
        cancel: () => s.cancelCmd(key('prop-cancel'), live.actionId, live.epoch, random() < 0.5),
        start: () => s.startCmd(key('prop-start'), view.epoch),
        reconcile: () => s.reconcileCmd(key('prop-rec'), live.actionId, live.epoch),
      };
      let refusedOp = false;
      if (op === 'advance') { const release = ctx.st.queue.pop(); ctx.st.queue.length = 0; if (release) release(); } else if (['cancel', 'start', 'reconcile'].includes(op)) send(op, cmdOf[op]());
      else if (op === 'cancelReplay' || op === 'startReplay' || op === 'reconcileReplay') {
        const pool = sent.filter((r) => r.kind === op.replace('Replay', '') && !r.replay);
        if (pool.length) { const r = send(op.replace('Replay', ''), pool[Math.floor(random() * pool.length)].command); r.replay = true; }
      } else if (op === 'cancelWrong') {
        const mutations = [{ leaseId: 'lease-other-0001' }, { runId: 'synthetic-run-002' }, { userId: 'user-other-0001' }, { epoch: live.epoch + 1 }, { epoch: live.epoch + 7 }, { actionId: 'act-9-ffffffff' }, { outcome: 'COMPENSATED' }];
        const r = send('wrong', { ...s.cancelCmd(key('prop-wrong'), live.actionId, live.epoch), ...mutations[Math.floor(random() * mutations.length)] });
        refusedOp = r;
      } else if (op === 'garbage') {
        refusedOp = send('garbage', [null, 'x', [], { kind: 'cancel' }, { ...s.cancelCmd(key('prop-bad'), live.actionId), epoch: 1.5 }][Math.floor(random() * 5)]);
      } else if (op === 'crash') {
        const live1 = ['ACCEPTED', 'RUNNING', 'CANCEL_REQUESTED'].includes(statusBefore);
        snapshot = ctx.engine.view().journal;
        await ctx.engine.close();
        await settle();
        ctx = open();
        boots += 1;
        const after = ctx.engine.view().action;
        if (live1) assert.equal(after.status, 'INTERRUPTED', `seed ${seed}: an action live at the crash is INTERRUPTED, never silently settled`);
        else if (statusBefore) assert.equal(after.status, statusBefore, `seed ${seed}: a settled action is unchanged by a restart`);
      }
      await settle();
      const entries = checkJournal(seed, ctx, snapshot.length > view.journal.length ? view.journal : view.journal, boots);
      snapshot = entries;
      if (refusedOp) assert.equal(entries.length, before, `seed ${seed}: a refused command wrote to the journal`);
      for (const record of sent.filter((r) => r.done && !r.checked)) {
        record.checked = true;
        const { status, body } = record.result;
        if (body.kind === 'C017-cancel-result') {
          assert.equal(status, C.HTTP_STATUS[body.outcome], `seed ${seed}: status follows the outcome`);
          s.assertHonest(assert, body, entries);
        } else if (body.kind === 'C017-typed-failure') {
          assert.deepEqual([body.outcome, body.effectClaimed, body.journalWritten], [undefined, false, false], `seed ${seed}: a failure claims nothing`);
        }
        if (record.kind === 'cancel' && body.kind === 'C017-cancel-result' && !body.idempotentReplay && body.outcome !== 'CANCEL_UNKNOWN') {
          assert.ok(entries.some((e) => e.type === 'cancel-requested' && e.key === record.command.key), `seed ${seed}: an answered cancel is in the journal`);
        }
        if (body.kind === 'C017-cancel-result' && body.outcome === 'CANCEL_UNKNOWN') {
          assert.deepEqual([body.effective, body.actionStopped, body.nothingUndone], [false, null, null], `seed ${seed}: unknown claims nothing`);
        }
        const sentKey = record.command && record.command.key;
        if (['wrong', 'garbage'].includes(record.kind) && typeof sentKey === 'string') assert.equal(entries.some((e) => e.key === sentKey), false, `seed ${seed}: a refused key is never journaled`);
      }
      for (const record of sent.filter((r) => r.replay && r.done && r.kind === 'cancel')) {
        const original = sent.find((r) => !r.replay && r.command === record.command);
        if (original && original.done && original.result.body.kind === 'C017-cancel-result' && record.result.body.kind === 'C017-cancel-result') {
          assert.deepEqual({ ...record.result.body, idempotentReplay: 0 }, { ...original.result.body, idempotentReplay: 0 }, `seed ${seed}: a replayed cancel answers exactly like the original`);
        }
      }
    }
    const delivered = sent.length;
    const answered = sent.filter((r) => r.done).length;
    const open1 = sent.filter((r) => !r.done).length;
    assert.equal(answered + open1, delivered, `seed ${seed}: every delivered command is answered or still pending`);
    return { operations: length, sent: delivered, entries: ctx.engine.view().journal.length };
  } finally {
    await ctx.engine.close();
    made.remove();
  }
}

test('seeded random sequences with crash, restart, replay, epoch change, typed failure and reconcile keep every invariant after every operation', async () => {
  let totals = { operations: 0, sent: 0, entries: 0 };
  for (let seed = 1; seed <= 40; seed += 1) {
    const result = await sequence(seed, 60);
    totals = { operations: totals.operations + result.operations, sent: totals.sent + result.sent, entries: totals.entries + result.entries };
  }
  assert.equal(totals.operations, 2400);
  assert.ok(totals.sent > 800 && totals.entries > 500, JSON.stringify(totals));
});

test('the operation alphabet really reaches the recovery states (so the invariants are not vacuous)', async () => {
  const seen = new Set();
  for (let seed = 1; seed <= 40; seed += 1) {
    const made = s.scratch('v');
    try {
      const random = prng(seed);
      const st = stepper();
      let engine = require('../engine.cjs').createEngine({ dir: made.dir, gates: st.gates, ids: s.sequence(), now: s.clock() });
      for (let i = 0; i < 60; i += 1) {
        const op = pick(random);
        const a = engine.view().action;
        if (op === 'start') engine.execute(s.startCmd(`vac-start-${seed}-${i}`, engine.view().epoch));
        else if (op === 'advance') { const r = st.queue.pop(); st.queue.length = 0; if (r) r(); } else if (op === 'cancel' && a) engine.execute(s.cancelCmd(`vac-cancel-${seed}-${i}`, a.actionId, a.epoch, random() < 0.5));
        else if (op === 'crash') { await engine.close(); st.queue.length = 0; engine = require('../engine.cjs').createEngine({ dir: made.dir, gates: stepper().gates, ids: s.sequence(), now: s.clock() }); } else if (op === 'reconcile' && a) engine.execute(s.reconcileCmd(`vac-rec-${seed}-${i}`, a.actionId, a.epoch));
        await settle();
        const now = engine.view().action;
        if (now) { seen.add(now.status); if (now.cancel) seen.add(`outcome:${now.cancel.outcome}`); if (now.unknownSteps.length) seen.add('unknown-step'); if (now.compensation === 'FAILED') seen.add('compensation-failed'); }
      }
      await engine.close();
    } finally { made.remove(); }
  }
  for (const state of ['RUNNING', 'CANCELLED', 'COMPLETED', 'INTERRUPTED', 'RECONCILED', 'unknown-step', 'outcome:CANCELLED_PARTIAL', 'outcome:COMPENSATED', 'outcome:CANCEL_TOO_LATE', 'outcome:CANCEL_UNKNOWN']) {
    assert.ok(seen.has(state), `the random sequences never reached ${state}: ${[...seen]}`);
  }
});
