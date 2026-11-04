'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { makeState, makePersisted } = require('..\\..\\C015\\contract.cjs');
const { inspect, projectError, projectContext } = require('..\\inspect.cjs');
const { RecoveryConsole, historyLimit, inspectionLimit } = require('..\\recovery.js');
const types = require('..\\errors.js');
let actual;
test.before(async () => {
  actual = await inspect(`test-${randomUUID()}`, { runId: 'synthetic-run-001', epoch: null, pendingStep: null });
  assert.equal(actual.error.code, 'STATE_MISSING');
});
function started(mode = 'historical-teaching', failure = actual) {
  const console = new RecoveryConsole(mode);
  assert.equal(console.observe(failure).accepted, true);
  return console;
}
function unchangedFailure(console, before) {
  assert.deepEqual(console.state.failure, before.failure);
  assert.deepEqual(console.state.history.slice(0, before.history.length), before.history);
  assert.equal(console.state.recoveryConfirmed, false);
  assert.equal(console.state.writesAuthorized, false);
}

test('original C015 error and explicit unknown epoch/pending context are retained', () => {
  const console = started();
  assert.deepEqual(console.state.failure, actual);
  assert.deepEqual(console.state.unknownContext, { runId: false, epoch: true, pendingStep: true });
  assert.equal(console.state.status, 'failed');
  assert.equal(console.state.operatorReviewNeeded, true);
});
test('only three closed read-only action identifiers exist', () => {
  assert.deepEqual(Object.keys(types.actions), ['reinspect', 'confirm-operator-review', 'stop']);
  assert.deepEqual(started().state.actions, Object.keys(types.actions));
  assert.deepEqual(new RecoveryConsole().state.actions, []);
});
test('all actual C015 typed codes are mapped without unknown/default success', () => {
  const codes = new Set();
  for (const file of ['store.cjs', 'contract.cjs', 'consent.cjs', 'paths.cjs', 'cli.cjs']) {
    const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'C015', file), 'utf8');
    for (const match of source.matchAll(/(?:fail|new FixtureError)\('([A-Z0-9_]+)'/g)) codes.add(match[1]);
  }
  assert.deepEqual([...codes].sort(), [...types.knownCodes].sort());
  for (const code of codes) assert.deepEqual(types.map[code].actions, Object.keys(types.actions));
  assert.deepEqual(types.map.UNRECOGNIZED_ERROR.actions, ['confirm-operator-review', 'stop']);
});
test('historical reinspection is bounded and never becomes real disk recovery', () => {
  const console = started();
  const before = console.state;
  for (let index = 0; index < inspectionLimit; index++) {
    const result = console.dispatch('reinspect', console.state.revision);
    assert.equal(result.accepted, true);
    assert.equal(result.code, 'HISTORICAL_REINSPECTION');
    assert.equal(console.state.mode, 'historical-teaching');
    assert.equal(console.state.inspectionCount, index + 1);
    unchangedFailure(console, before);
  }
  assert.equal(console.state.actions.includes('reinspect'), false);
  assert.equal(console.dispatch('reinspect', console.state.revision).code, 'READ_LIMIT');
  unchangedFailure(console, before);
});
test('stale revisions reject and append history without altering the original failure', () => {
  const console = started();
  const before = console.state;
  console.resetView();
  assert.equal(console.dispatch('stop', before.revision).code, 'STALE_ACTION');
  unchangedFailure(console, before);
  assert.equal(console.state.history.length, before.history.length + 2);
});
test('revision numbers are never coerced or rounded', () => {
  for (const revision of ['1', true, null, -0, NaN, 1.5, 1n, new Number(1)]) {
    const console = started();
    assert.equal(console.dispatch('stop', revision).code, 'STALE_ACTION');
    assert.equal(console.state.status, 'failed');
  }
});
test('repair, deletion, marker reclaim, rollback, initialize, undo, writes and approval reject', () => {
  const console = started();
  const before = console.state;
  for (const action of ['repair', 'delete-files', 'reclaim-marker', 'rollback', 'initialize',
    'undo', 'persist', 'write', 'approve', 'native.execute', 'accept-success']) {
    const result = console.dispatch(action, console.state.revision);
    assert.equal(result.accepted, false);
    assert.equal(result.code, 'ACTION_NOT_ALLOWED');
    assert.equal(console.state.history.at(-1).action, null);
    unchangedFailure(console, before);
  }
});
test('fabricated success fields cannot pass as an observation or a reinspection', () => {
  for (const value of [{ restored: true }, { acknowledged: true }, { outcome: 'success' },
    { ...actual, restored: true }, { ...actual, kind: 'C019-success' }]) {
    const console = started();
    const before = console.state;
    assert.equal(console.observe(value).accepted, false);
    assert.equal(console.dispatch('reinspect', console.state.revision, value).accepted, false);
    unchangedFailure(console, before);
  }
});
test('historical replay rejects substituted run, epoch, pending step, or provenance', () => {
  for (const edit of [
    (value) => { value.context.runId = 'synthetic-run-002'; },
    (value) => { value.context.epoch = 2; },
    (value) => { value.context.pendingStep = 'finish'; },
    (value) => { value.provenance = 'actual-C015-process'; },
  ]) {
    const console = started();
    const before = console.state;
    const replacement = structuredClone(actual);
    edit(replacement);
    assert.equal(console.dispatch('reinspect', console.state.revision, replacement).code, 'CONTEXT_MISMATCH');
    unchangedFailure(console, before);
  }
});
test('unknown run is actually rejected by C015 and is not guessed from a previous receipt', () => {
  let error;
  try { makeState('unlisted-synthetic-run', 1); } catch (observed) { error = observed; }
  assert.equal(error.code, 'UNKNOWN_RUN_ID');
  const prior = makePersisted(makeState('synthetic-run-001', 1), null).acknowledgment;
  const failure = projectError(error, { runId: 'unlisted-synthetic-run', epoch: null, pendingStep: null }, prior);
  const console = started('historical-teaching', failure);
  assert.equal(console.state.failure.context.runId, null);
  assert.equal(console.state.failure.priorAcknowledgment.runId, 'synthetic-run-001');
  assert.equal(console.state.unknownContext.runId, true);
  assert.equal(console.state.actions.includes('reinspect'), false);
});
test('unknown exception message, path, stack, details and code text are not retained', () => {
  const marker = 'untrusted-synthetic-marker';
  const error = Object.assign(new Error(marker), { code: marker, path: marker, details: [marker] });
  const failure = projectError(error, { runId: null, epoch: null, pendingStep: null }, null);
  const console = started('historical-teaching', failure);
  assert.equal(failure.error.code, 'UNRECOGNIZED_ERROR');
  assert.equal(failure.error.source, 'C019');
  assert.equal(failure.error.name, null);
  assert.equal(JSON.stringify(console.state).includes(marker), false);
  assert.deepEqual(console.state.actions, ['confirm-operator-review', 'stop']);
});
test('unknown error code accessors and conversion hooks are not executed', () => {
  let touched = 0;
  const error = new Error('Synthetic ignored exception.');
  Object.defineProperty(error, 'code', { get() { touched++; return 'STATE_MISSING'; } });
  projectError(error, { runId: null, epoch: null, pendingStep: null }, null);
  const console = started();
  console.dispatch({ toString() { touched++; return 'stop'; } }, console.state.revision);
  assert.equal(touched, 0);
});
test('missing, additional and unrecognized error fields are rejected without retaining their input', () => {
  const variants = [
    {}, { ...actual, unexpected: 'untrusted-synthetic-marker' },
    { ...actual, error: { ...actual.error, code: 'untrusted-synthetic-marker' } },
    { ...actual, context: { ...actual.context, epoch: '2' } },
    { ...actual, error: { ...actual.error, message: 'untrusted-synthetic-marker' } },
  ];
  for (const value of variants) {
    const console = started();
    const before = console.state;
    assert.equal(console.observe(value).code, 'INVALID_OBSERVATION');
    unchangedFailure(console, before);
    assert.equal(JSON.stringify(console.state).includes('untrusted-synthetic-marker'), false);
  }
});
test('data-property guards reject getters, hidden fields, symbols and class instances', () => {
  let touched = 0;
  const accessor = { ...actual };
  Object.defineProperty(accessor, 'error', { enumerable: true, get() { touched++; return actual.error; } });
  const hidden = { ...actual };
  Object.defineProperty(hidden, 'hidden', { value: true });
  const symbol = { ...actual, [Symbol('extra')]: true };
  class Shape { constructor() { Object.assign(this, actual); } }
  for (const value of [accessor, hidden, symbol, new Shape(), [], null]) {
    assert.equal(types.failure(value), null);
  }
  assert.equal(touched, 0);
});
test('context projection preserves known literal values and makes every missing value explicitly unknown', () => {
  assert.deepEqual(projectContext({ runId: 'synthetic-run-001', epoch: 2, pendingStep: 'advance' }),
    { runId: 'synthetic-run-001', epoch: 2, pendingStep: 'advance' });
  assert.deepEqual(projectContext({ runId: 'unknown', epoch: '2', pendingStep: 'unknown' }),
    { runId: null, epoch: null, pendingStep: null });
  assert.deepEqual(projectContext({}), { runId: null, epoch: null, pendingStep: null });
});
test('failure, prior receipt, state and history are immutable copies rather than caller references', () => {
  const input = structuredClone(actual);
  const console = started('historical-teaching', input);
  input.context.runId = 'synthetic-run-002';
  assert.equal(console.state.failure.context.runId, 'synthetic-run-001');
  assert.throws(() => { console.state.failure.error.code = 'CORRUPT_JSON'; }, TypeError);
  assert.throws(() => { console.state.history.pop(); }, TypeError);
  assert.throws(() => { console.state = {}; }, TypeError);
});
test('review-needed confirmation is not completed review or recovery', () => {
  const console = started();
  const before = console.state;
  const result = console.dispatch('confirm-operator-review', console.state.revision);
  assert.equal(result.code, 'REVIEW_NEEDED_CONFIRMED');
  assert.equal(console.state.operatorReviewAcknowledged, true);
  assert.equal(console.state.operatorReviewNeeded, true);
  assert.equal(console.state.status, 'failed');
  assert.equal(console.state.actions.includes('confirm-operator-review'), false);
  unchangedFailure(console, before);
});
test('stop preserves error, pending context, and all audit entries and rejects further inspection', () => {
  const console = started();
  const before = console.state;
  assert.equal(console.dispatch('stop', console.state.revision).accepted, true);
  assert.equal(console.state.status, 'stopped');
  assert.deepEqual(console.state.actions, []);
  assert.equal(console.observe(actual).accepted, false);
  assert.equal(console.dispatch('reinspect', console.state.revision).accepted, false);
  unchangedFailure(console, before);
});
test('presentation reset cannot clear unresolved error, pending context, review, reads, or history', () => {
  const console = started();
  console.dispatch('reinspect', console.state.revision);
  console.dispatch('confirm-operator-review', console.state.revision);
  const before = console.state;
  assert.equal(console.resetView().code, 'VIEW_RESET');
  assert.equal(console.state.status, before.status);
  assert.equal(console.state.inspectionCount, before.inspectionCount);
  assert.equal(console.state.operatorReviewAcknowledged, before.operatorReviewAcknowledged);
  unchangedFailure(console, before);
});
test('actual read-only error reinspection preserves the original failure separately from the inspection', () => {
  const console = started('actual-read-only');
  const before = console.state;
  const result = console.dispatch('reinspect', console.state.revision, actual);
  assert.equal(result.code, 'READ_ERROR_RETAINED');
  assert.equal(result.accepted, true);
  assert.deepEqual(console.state.lastInspection, actual);
  unchangedFailure(console, before);
});
test('actual inspection cannot use a receipt from another run or bypass the public receipt schema', () => {
  const console = started('actual-read-only');
  const before = console.state;
  const acknowledgment = makePersisted(makeState('synthetic-run-002', 1), null).acknowledgment;
  const data = { schemaVersion: 1, kind: 'C019-read-data', provenance: 'actual-C015-API',
    acknowledgment, writesPerformed: 0, recoveryConfirmed: false };
  assert.equal(console.dispatch('reinspect', console.state.revision, data).code, 'CONTEXT_MISMATCH');
  assert.equal(console.dispatch('reinspect', console.state.revision, { ...data, restored: true }).code, 'INVALID_REINSPECTION');
  assert.equal(console.dispatch('reinspect', console.state.revision, { ...data, recoveryConfirmed: true }).code, 'INVALID_REINSPECTION');
  unchangedFailure(console, before);
});
test('historical mode refuses actual-read data instead of promoting it to browser recovery', () => {
  const console = started();
  const acknowledgment = makePersisted(makeState('synthetic-run-001', 1), null).acknowledgment;
  assert.equal(console.dispatch('reinspect', console.state.revision, {
    schemaVersion: 1, kind: 'C019-read-data', provenance: 'actual-C015-API',
    acknowledgment, writesPerformed: 0, recoveryConfirmed: false,
  }).code, 'INVALID_REINSPECTION');
  assert.equal(console.state.status, 'failed');
});
test('48-entry history ceiling stops without evicting any evidence or hiding the failure', () => {
  const console = started();
  const first = console.state.history[0];
  for (let index = 0; index < historyLimit + 4; index++) console.reject('UNKNOWN_SELECTION');
  assert.equal(console.state.history.length, historyLimit);
  assert.deepEqual(console.state.history[0], first);
  assert.equal(console.state.history.at(-1).code, 'HISTORY_LIMIT');
  assert.equal(console.state.status, 'stopped');
  assert.equal(console.state.failure.error.code, 'STATE_MISSING');
  assert.equal(console.dispatch('stop', console.state.revision).accepted, false);
  assert.equal(console.resetView().accepted, false);
  assert.equal(console.state.history.length, historyLimit);
});
test('canonical state is stable and refuses non-JSON properties or unsafe numbers', () => {
  assert.equal(types.canonical({ b: 2, a: 1 }), '{"a":1,"b":2}');
  const console = started();
  assert.equal(types.canonical(JSON.parse(types.canonical(console.state))), types.canonical(console.state));
  const cycle = {};
  cycle.self = cycle;
  for (const value of [-0, 1.5, NaN, Infinity, 1n, undefined, cycle]) {
    assert.throws(() => types.canonical(value), TypeError);
  }
  assert.throws(() => types.canonical(Object.defineProperty({}, 'hidden', { value: true })), TypeError);
});
test('invalid constructor modes and absent explicit inspection context fail closed', async () => {
  for (const mode of ['success', 'live', null, false]) assert.throws(() => new RecoveryConsole(mode), TypeError);
  await assert.rejects(inspect(`test-${randomUUID()}`, {}), TypeError);
});
