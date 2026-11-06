'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const R = require('../reconcile.cjs');
const { build } = require('./scenarios.cjs');

const journals = {};
test.before(async () => {
  for (const name of ['completed', 'partial', 'before', 'compensated', 'failedCompensation', 'interrupted', 'interruptedCancel', 'reconciled']) journals[name] = await build(name);
});
const entries = (name) => structuredClone(journals[name].journal);
const states = (name) => R.actionView(R.derive(entries(name)).action);

test('derive accepts every journal the engine wrote and reports the status each scenario proves', () => {
  const expected = { completed: 'COMPLETED', partial: 'CANCELLED', before: 'CANCELLED', compensated: 'CANCELLED', failedCompensation: 'CANCELLED', interrupted: 'INTERRUPTED', interruptedCancel: 'INTERRUPTED', reconciled: 'RECONCILED' };
  for (const [name, status] of Object.entries(expected)) assert.equal(states(name).status, status, name);
  assert.equal(R.ENTRY_TYPES.length, 11);
});

test('step states are derived from the journal alone', () => {
  const of = (name) => states(name).steps.map((x) => x.state);
  assert.deepEqual(of('completed'), ['STANDS', 'STANDS', 'STANDS', 'STANDS']);
  assert.deepEqual(of('partial'), ['STANDS', 'STANDS', 'NOT_RUN', 'NOT_RUN']);
  assert.deepEqual(of('compensated'), ['REVERSED', 'REVERSED', 'NOT_RUN', 'NOT_RUN']);
  assert.deepEqual(of('failedCompensation'), ['STANDS', 'REVERSED', 'NOT_RUN', 'NOT_RUN']);
  assert.deepEqual(of('interrupted'), ['STANDS', 'STANDS', 'UNKNOWN', 'NOT_RUN']);
  const live = entries('interrupted').slice(0, -1);
  const view = R.actionView(R.derive(live).action);
  assert.equal(view.status, 'RUNNING');
  assert.deepEqual(view.steps.map((x) => x.state), ['STANDS', 'STANDS', 'IN_FLIGHT', 'PENDING']);
  assert.deepEqual([view.live, view.stepsPending, view.stepsNotRun, view.unknownSteps], [true, [4], [], []]);
});

test('an undecided request on a live action has no answer, on a completed action it is too late, on an interrupted one it is unknown', () => {
  const pending = R.derive(entries('partial').slice(0, -1)).action;
  assert.equal(R.statusOf(pending), 'CANCEL_REQUESTED');
  assert.equal(R.outcomeOf(pending), null);
  assert.throws(() => R.cancelResult(pending, 'k', false), /not decided yet/);
  const lateWindow = R.derive(entries('completed').slice(0, -1)).action;
  assert.equal(R.outcomeOf(lateWindow), 'CANCEL_TOO_LATE');
  assert.equal(R.cancelResult(lateWindow, 'build-cancel-01', true).idempotentReplay, true);
  const raced = R.derive(entries('interruptedCancel')).action;
  assert.equal(R.outcomeOf(raced), 'CANCEL_UNKNOWN');
  assert.equal(R.determinationOf(raced), 'CANCEL_UNKNOWN');
  assert.equal(R.determinationOf(R.derive(entries('interrupted')).action), 'INTERRUPTED_UNKNOWN');
  const known = entries('interrupted');
  known.splice(-2, 1);
  assert.equal(R.determinationOf(R.derive(known).action), 'INTERRUPTED_KNOWN');
  const answer = R.cancelResult(raced, 'build-cancel-01', false);
  assert.deepEqual([answer.outcome, answer.effective, answer.actionStopped, answer.nothingUndone], ['CANCEL_UNKNOWN', false, null, null]);
});

test('compensation states are IN_PROGRESS, INTERRUPTED, COMPLETE, FAILED, NOT_ATTEMPTED or NOT_REQUESTED', () => {
  const mid = entries('compensated').slice(0, 9);
  assert.equal(R.compensationOf(R.derive(mid).action), 'IN_PROGRESS');
  assert.equal(R.compensationOf(R.derive([...mid, { ...mid[0], bootId: 'later' }]).action), 'INTERRUPTED');
  assert.equal(R.compensationOf(R.derive(entries('compensated')).action), 'COMPLETE');
  assert.equal(R.compensationOf(R.derive(entries('failedCompensation')).action), 'FAILED');
  assert.equal(R.compensationOf(R.derive(entries('partial')).action), 'NOT_REQUESTED');
  assert.equal(R.compensationOf(R.derive(entries('completed')).action), 'NOT_REQUESTED');
});

test('the unreadable answer has null facts, never an empty list that would claim nothing stands', () => {
  const answer = R.unreadableCancelResult('some-key-0001');
  assert.equal(answer.outcome, 'CANCEL_UNKNOWN');
  assert.deepEqual(Object.values(answer.facts).filter((v) => v !== null), [false]);
  assert.equal(answer.facts.effectsStanding, null);
  assert.match(answer.statement, /cannot be read/);
});

const at = (list, type) => list.findIndex((e) => e.type === type);
const order = 'step intent is out of order';
const effect = 'step effect does not match its intent';
const forged = 'the recorded decision is not what the journal proves';
const sawState = 'cancel request does not match the state it saw';
const unfinished = 'decision before compensation finished';
const shape = 'fields are not exactly the closed set of the type';
const tampers = [
  ['an effect removed', 'completed', (l) => l.splice(3, 1), order],
  ['effects swapped', 'completed', (l) => { [l[3], l[5]] = [l[5], l[3]]; }, effect],
  ['units changed', 'completed', (l) => { l[3].units = 6; }, effect],
  ['standing total changed', 'completed', (l) => { l[3].standingUnits = 99; }, effect],
  ['decision forged as COMPENSATED', 'partial', (l) => { l[7].outcome = 'COMPENSATED'; }, forged],
  ['decision forged as BEFORE_EFFECT', 'partial', (l) => { l[7].outcome = 'CANCELLED_BEFORE_EFFECT'; }, forged],
  ['decision forged as TOO_LATE', 'partial', (l) => { l[7].outcome = 'CANCEL_TOO_LATE'; }, forged],
  ['decision claims an undo', 'partial', (l) => { l[7].undone = [{ step: 1, units: 5 }]; }, forged],
  ['decision hides a standing effect', 'partial', (l) => { l[7].effectsStanding = [1]; }, forged],
  ['decision with a foreign key', 'partial', (l) => { l[7].key = 'other-key-0001'; }, 'decision without a settled request'],
  ['duplicate cancel request', 'partial', (l) => l.splice(7, 0, structuredClone(l[6])), sawState],
  ['request that did not see the state', 'partial', (l) => { l[6].observedEffects = 0; }, sawState],
  ['intent after the cancel request', 'partial', (l) => l.splice(7, 0, { type: 'step-intent', at: 'x', actionId: l[1].actionId, step: 3 }), order],
  ['key reused from the start', 'partial', (l) => { l[6].key = l[1].startKey; l[7].key = l[1].startKey; }, 'a key may be journaled once'],
  ['compensating effects deleted, COMPENSATED kept', 'compensated', (l) => l.splice(7, 4), unfinished],
  ['decision before compensation finished', 'compensated', (l) => l.splice(9, 2), unfinished],
  ['compensation of the wrong step first', 'compensated', (l) => { l[7].step = 1; }, 'compensation is not allowed here'],
  ['compensation failure reason forged', 'failedCompensation', (l) => { l[10].reason = 'OTHER'; }, 'compensation failure does not match its intent'],
  ['completion too early', 'completed', (l) => l.splice(4, 0, l.splice(10, 1)[0]), 'completion does not match the effects'],
  ['entry of another action', 'completed', (l) => { l[3].actionId = 'act-9-ffffffff'; }, 'entry does not belong to the current action'],
  ['effect after a restart', 'interrupted', (l) => l.push({ type: 'step-effect', at: 'x', actionId: l[1].actionId, step: 3, units: 5, standingUnits: 15 }), effect],
  ['reconcile of a settled action', 'partial', (l) => l.push({ type: 'reconciled', at: 'x', actionId: l[1].actionId, key: 'rec-key-0001', commandSha256: 'a', determination: 'INTERRUPTED_KNOWN', effectsStanding: [1, 2], unknownSteps: [], stepsNotRun: [3, 4] }), 'only an interrupted action can be reconciled'],
  ['wrong determination', 'reconciled', (l) => { l[at(l, 'reconciled')].determination = 'INTERRUPTED_KNOWN'; }, 'the reconciliation is not what the journal proves'],
  ['forged unknown list', 'reconciled', (l) => { l[at(l, 'reconciled')].unknownSteps = []; }, 'the reconciliation is not what the journal proves'],
  ['new action before the previous settled', 'interrupted', (l) => l.push({ ...structuredClone(l[1]), epoch: 2, actionId: 'act-2-ffffffff', startKey: 'second-start-1' }), 'a new action began before the previous one settled'],
  ['wrong epoch numbering', 'completed', (l) => l.push({ ...structuredClone(l[1]), epoch: 3, actionId: 'act-3-ffffffff', startKey: 'third-start-01' }), 'epoch or sizing is not valid'],
  ['extra field', 'completed', (l) => { l[3].extra = 1; }, shape],
  ['missing field', 'completed', (l) => { delete l[3].units; }, shape],
  ['unknown entry type', 'completed', (l) => { l[3].type = 'step-undo'; }, 'unknown entry type'],
  ['proto key', 'completed', (l) => Object.defineProperty(l[3], '__proto__', { value: {}, enumerable: true, configurable: true, writable: true }), shape],
  ['non-string timestamp', 'completed', (l) => { l[3].at = 5; }, 'the timestamp is not a short string'],
  ['array field with a string', 'partial', (l) => { l[7].effectsStanding = ['x']; }, 'field effectsStanding has the wrong type'],
  ['not an object', 'completed', (l) => { l[3] = 7; }, 'unknown entry type'],
];
for (const [name, scenario, mutate, rule] of tampers) {
  test(`a forged or inconsistent journal is rejected for the right reason: ${name}`, () => {
    const list = entries(scenario);
    mutate(list);
    assert.throws(() => R.derive(list), (error) => error instanceof R.JournalInconsistent && error.code === 'JOURNAL_INCONSISTENT' && error.message.endsWith(rule) && /^journal entry \d+: /.test(error.message));
  });
}
