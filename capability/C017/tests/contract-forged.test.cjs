'use strict';

// F3: every way an answer or view can contradict itself is refused with its own fixed sentence. Each forgery starts from a real answer or view
// of the real engine, so a refusal is caused by the one change made and never by a malformed fixture.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const C = require('../contract.js');

const asHttp = (view) => ({ ...view, journalOmitted: 0, journalEntries: view.journal.length });
const checks = { view: C.viewCheck, start: C.startCheck, reconcile: C.reconcileCheck, failure: C.failureCheck, cancel: C.claimCheck };

async function artifacts(t) {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  ctx.g.hold('before', 3);
  const start = (await ctx.engine.execute(s.startCmd('start-key-0001'))).body;
  await ctx.g.reached('before', 3);
  const running = asHttp(ctx.engine.view());
  const cancel = (await ctx.engine.execute(s.cancelCmd('cancel-key-0001', start.action.actionId))).body;
  const stopped = asHttp(ctx.engine.view());
  const done = s.boot();
  t.after(() => done.cleanup());
  await s.startAction(done);
  await s.wait(done, (state) => state.action.status === 'COMPLETED');
  const completed = asHttp(done.engine.view());
  const first = s.boot();
  first.g.hold('in', 3);
  const id = await s.startAction(first);
  await first.g.reached('in', 3);
  await first.engine.close();
  const second = s.boot({ dir: first.dir });
  t.after(async () => { await second.cleanup(); await first.cleanup(); });
  const reconcile = (await second.engine.execute(s.reconcileCmd('reconcile-key-01', id))).body;
  return { start, running, cancel, stopped, completed, reconcile, reconciled: asHttp(second.engine.view()), failure: C.failure('STALE_EPOCH', {}).body, actionId: start.action.actionId };
}

const rows = [
  ['view', 'running', 'a wrong kind', (v) => { v.kind = 'x'; }, 'not a state view'],
  ['view', 'running', 'a wrong schema version', (v) => { v.schemaVersion = 2; }, 'not a state view'],
  ['view', 'running', 'a journal status outside the closed two', (v) => { v.journalStatus = 'MAYBE'; }, 'journal status is not closed'],
  ['view', 'running', 'a lease that is not the server lease', (v) => { v.lease.leaseId = 'x'; }, 'not a lease of this server'],
  ['view', 'running', 'an epoch that is a string', (v) => { v.epoch = '1'; }, 'epoch is not valid'],
  ['view', 'running', 'a journal that is not a list', (v) => { v.journal = 'nope'; }, 'journal window is malformed'],
  ['view', 'running', 'a journal entry of an unknown type', (v) => { v.journal.push({ type: 'zzz' }); }, 'journal window is malformed'],
  ['view', 'running', 'a negative omitted count', (v) => { v.journalOmitted = -1; }, 'journal window is malformed'],
  ['view', 'running', 'a journal entry with a step out of range', (v) => { v.journal.push({ type: 'boot', step: 99 }); }, 'journal window is malformed'],
  ['view', 'running', 'a journal entry with an outcome outside the five', (v) => { v.journal.push({ type: 'boot', outcome: 'X' }); }, 'journal window is malformed'],
  ['view', 'running', 'a journal entry with a determination outside the three', (v) => { v.journal.push({ type: 'boot', determination: 'Y' }); }, 'journal window is malformed'],
  ['view', 'running', 'a journal entry with a bad action id', (v) => { v.journal.push({ type: 'boot', actionId: 'bad' }); }, 'journal window is malformed'],
  ['view', 'running', 'an unreadable journal that still shows an action', (v) => { v.journalStatus = 'UNREADABLE'; }, 'unreadable journal cannot come with an action'],
  ['view', 'running', 'a missing action', (v) => { delete v.action; }, 'action is missing or malformed'],
  ['view', 'running', 'a pending list on a live action that must hold the quiet list only', (v) => { v.action.stepsNotRun = [3]; }, 'incomplete or malformed'],
  ['view', 'running', 'fewer steps than the total', (v) => { v.action.steps.pop(); }, 'incomplete or malformed'],
  ['view', 'running', 'an action id outside the pattern', (v) => { v.action.actionId = 'bad'; }, 'cannot have'],
  ['view', 'running', 'a run id outside the pattern', (v) => { v.action.runId = 'synthetic-run-9'; }, 'cannot have'],
  ['view', 'running', 'an epoch of zero', (v) => { v.action.epoch = 0; }, 'epoch or the sizing'],
  ['view', 'running', 'units per step of zero', (v) => { v.action.unitsPerStep = 0; }, 'epoch or the sizing'],
  ['view', 'stopped', 'a status outside the closed seven', (v) => { v.action.status = 'WEIRD'; }, 'status is not a closed status'],
  ['view', 'running', 'live contradicting the status', (v) => { v.action.live = false; }, 'status is not a closed status'],
  ['view', 'running', 'a step listed twice', (v) => { v.action.stepsPending = [3, 3]; }, 'do not partition'],
  ['view', 'running', 'two steps missing from every list', (v) => { v.action.stepsPending = []; }, 'do not partition'],
  ['view', 'running', 'a standing step listed twice', (v) => { v.action.effectsStanding.push({ step: 1, units: 5 }); }, 'do not partition'],
  ['view', 'running', 'a step shown as reversed that stands', (v) => { v.action.steps[0].state = 'REVERSED'; }, 'state its facts contradict'],
  ['view', 'running', 'a step with other units', (v) => { v.action.steps[0].units = 9; }, 'state its facts contradict'],
  ['view', 'running', 'standing units of zero', (v) => { v.action.standingUnits = 0; }, 'standing units do not add up'],
  ['view', 'running', 'a standing effect with other units', (v) => { v.action.effectsStanding[0].units = 3; }, 'standing units do not add up'],
  ['view', 'running', 'inexact units without an unknown step', (v) => { v.action.standingUnitsExact = false; }, 'exactness'],
  ['view', 'running', 'a compensation state outside the closed six', (v) => { v.action.compensation = 'MAYBE'; }, 'compensation state is not closed'],
  ['view', 'running', 'a failed compensation without its failure', (v) => { v.action.compensation = 'FAILED'; }, 'compensation state is not closed'],
  ['view', 'running', 'a compensation failure without a failed compensation', (v) => { v.action.compensationFailure = { step: 1, reason: 'x' }; }, 'compensation state is not closed'],
  ['view', 'running', 'an empty cancel summary', (v) => { v.action.cancel = {}; }, 'cancel summary is malformed'],
  ['view', 'running', 'a cancel summary that is a string', (v) => { v.action.cancel = 'x'; }, 'cancel summary is malformed'],
  ['view', 'running', 'a cancel summary on a running action', (v) => { v.action.cancel = { key: 'k', compensate: true, decided: false, outcome: null }; }, 'status contradicts the cancel summary'],
  ['view', 'running', 'a reconciliation on a running action', (v) => { v.action.reconciliation = { key: 'k', determination: 'INTERRUPTED_KNOWN' }; }, 'reconciliation contradicts the status'],
  ['view', 'completed', 'a completed action with a step missing', (v) => { v.action.effectsStanding.pop(); v.action.stepsNotRun = [4]; v.action.steps[3].state = 'NOT_RUN'; v.action.standingUnits = 15; }, 'must show every step standing'],
  ['view', 'reconciled', 'a reconciliation outside the closed three', (v) => { v.action.reconciliation.determination = 'WEIRD'; }, 'reconciliation contradicts the status'],
  ['view', 'reconciled', 'a reconciled status without a reconciliation', (v) => { v.action.reconciliation = null; }, 'reconciliation contradicts the status'],
  ['view', 'stopped', 'an outcome the facts do not prove', (v) => { v.action.cancel.outcome = 'COMPENSATED'; }, 'do not prove'],
  ['view', 'stopped', 'an outcome that does not end a cancelled action', (v) => { v.action.cancel.outcome = 'CANCEL_TOO_LATE'; }, 'status contradicts the cancel summary'],
  ['view', 'stopped', 'an outcome outside the closed five', (v) => { v.action.cancel.outcome = 'NOPE'; }, 'cancel summary is malformed'],
  ['view', 'stopped', 'a journal line deciding another outcome', (v) => { v.journal.push({ type: 'cancel-decided', actionId: v.action.actionId, outcome: 'COMPENSATED' }); }, 'journal shows a decision'],
  ['view', 'stopped', 'a journal line reconciling an action that was not reconciled', (v) => { v.journal.push({ type: 'reconciled', actionId: v.action.actionId, determination: 'INTERRUPTED_KNOWN' }); }, 'journal shows a decision'],
  ['start', 'start', 'a wrong kind', (b) => { b.kind = 'x'; }, 'not an accepted start'],
  ['start', 'start', 'an outcome that is not ACTION_ACCEPTED', (b) => { b.outcome = 'DONE'; }, 'not an accepted start'],
  ['start', 'start', 'a replay flag that is not a boolean', (b) => { b.idempotentReplay = 'no'; }, 'not an accepted start'],
  ['start', 'start', 'no action', (b) => { b.action = null; }, 'action is missing or malformed'],
  ['start', 'start', 'an epoch that is a string', (b) => { b.action.epoch = '1; claim cancelled'; }, 'epoch or the sizing'],
  ['reconcile', 'reconcile', 'a wrong kind', (b) => { b.kind = 'x'; }, 'not a reconcile result'],
  ['reconcile', 'reconcile', 'a determination outside the closed three', (b) => { b.determination = 'CANCELLED'; }, 'not a reconcile result'],
  ['reconcile', 'reconcile', 'no facts', (b) => { delete b.facts; }, 'not a reconcile result'],
  ['reconcile', 'reconcile', 'a lease outside the pattern', (b) => { b.leaseId = 'x'; }, 'cannot have'],
  ['reconcile', 'reconcile', 'an unknown step that vanished from the facts', (b) => { b.facts.unknownSteps = []; }, 'do not partition'],
  ['reconcile', 'reconcile', 'standing units of zero', (b) => { b.facts.standingUnits = 0; }, 'standing units do not add up'],
  ['reconcile', 'reconcile', 'exact units next to an unknown step', (b) => { b.facts.standingUnitsExact = true; }, 'exactness'],
  ['reconcile', 'reconcile', 'a known determination next to an unknown step', (b) => { b.determination = 'INTERRUPTED_KNOWN'; }, 'determination contradicts'],
  ['reconcile', 'reconcile', 'an unknown determination without an unknown step', (b) => { b.facts.unknownSteps = []; b.facts.stepsNotRun = [3, 4]; b.facts.standingUnitsExact = true; }, 'determination contradicts'],
  ['reconcile', 'reconcile', 'a statement the facts do not allow', (b) => { b.statement = 'Everything was cancelled and rolled back; all effects were undone.'; }, 'statement is not the one'],
  ['failure', 'failure', 'a wrong kind', (b) => { b.kind = 'x'; }, 'not a typed failure'],
  ['failure', 'failure', 'a code outside the table', (b) => { b.error.code = 'NOPE'; }, 'not a typed failure'],
  ['failure', 'failure', 'a prototype name as code', (b) => { b.error.code = '__proto__'; }, 'not a typed failure'],
  ['failure', 'failure', 'a reason of its own', (b) => { b.error.reason = 'The action was cancelled and rolled back successfully.'; }, 'reason or the group'],
  ['failure', 'failure', 'another group', (b) => { b.error.group = 'x'; }, 'reason or the group'],
  ['failure', 'failure', 'allowed actions of its own', (b) => { b.allowedActions = ['x']; }, 'allowed actions'],
  ['failure', 'failure', 'no allowed actions', (b) => { delete b.allowedActions; }, 'allowed actions'],
  ['failure', 'failure', 'a claimed effect', (b) => { b.effectClaimed = true; }, 'claim no effect'],
  ['failure', 'failure', 'a claimed journal write', (b) => { b.journalWritten = true; }, 'claim no effect'],
];

test('every forgery of an answer or a view is refused with its own sentence, and the unmodified artifacts are accepted', async (t) => {
  const a = await artifacts(t);
  for (const [kind, key] of [['view', 'running'], ['view', 'stopped'], ['view', 'completed'], ['view', 'reconciled'], ['start', 'start'], ['reconcile', 'reconcile'], ['failure', 'failure'], ['cancel', 'cancel']]) {
    assert.deepEqual(checks[kind](structuredClone(a[key])), { ok: true, problems: [] }, `${key} unmodified`);
  }
  for (const [kind, key, name, mutate, fragment] of rows) {
    const body = structuredClone(a[key]);
    mutate(body);
    const verdict = checks[kind](body);
    assert.equal(verdict.ok, false, `${key}: ${name} was accepted`);
    assert.ok(verdict.problems.some((problem) => problem.includes(fragment)), `${key}: ${name}: expected "${fragment}" in ${JSON.stringify(verdict.problems)}`);
    assert.ok(verdict.problems.every((problem) => /^[a-z ]/.test(problem) && !problem.includes(')')), `${key}: ${name}: a problem must be a fixed sentence without parentheses`);
  }
  for (const nothing of [null, undefined, 5, 'x', [], () => 1]) {
    for (const kind of ['view', 'start', 'reconcile', 'failure']) assert.equal(checks[kind](nothing).ok, false, `${kind} ${String(nothing)}`);
  }
});

test('the wording a cancel answer may carry is derived from its own facts, and the unreadable-journal answer has no facts to list', async (t) => {
  const a = await artifacts(t);
  assert.equal(C.statementOf(a.cancel), a.cancel.statement);
  const unknown = { outcome: 'CANCEL_UNKNOWN', facts: { effectsStanding: null } };
  assert.equal(C.statementOf(unknown), C.describe('CANCEL_UNKNOWN', null));
});
