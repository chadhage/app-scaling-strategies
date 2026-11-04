'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('../admission.js');
const { candidate, command, adapterId } = require('./fixtures.cjs');

function deeplyFrozen(value) {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(deeplyFrozen);
  }
}

test('session config is explicit, closed, bounded and has no state-adoption fields', () => {
  for (const value of [undefined, null, [], {}, { sessionId: '' }, { sessionId: ' session-001' },
    { sessionId: 'session-001', state: { eligible: true } }, { sessionId: 1 }]) {
    assert.throws(() => model.createSession(value), { code: 'INVALID_CONFIG' });
  }
  assert.throws(() => model.createSession({ sessionId: 'session-001' }, {}), { code: 'INVALID_CONFIG' });
  const config = Object.assign(Object.create(null), { sessionId: 'session-null-prototype' });
  assert.equal(model.createSession(config).read().active, null);
});

test('caller accessors are not invoked while rejecting config or command', () => {
  let invoked = 0;
  const config = {};
  Object.defineProperty(config, 'sessionId', { enumerable: true, get() { invoked++; return 'session-forged'; } });
  assert.throws(() => model.createSession(config), { code: 'INVALID_CONFIG' });
  const session = model.createSession({ sessionId: 'session-accessors' });
  const input = command(session, 'admit', candidate());
  Object.defineProperty(input, 'candidateJSON', { enumerable: true, get() { invoked++; return JSON.stringify(candidate()); } });
  assert.equal(session.dispatch(input).code, 'INVALID_COMMAND');
  assert.equal(invoked, 0);
  assert.equal(session.read().counts.modeledEffectApplications, 0);
  assert.equal(session.read().history.length, 1);
});

for (const [name, mutate] of [
  ['custom prototype', (v) => Object.setPrototypeOf(v, { trusted: true })],
  ['symbol field', (v) => { v[Symbol('verdict')] = true; }],
  ['non-enumerable field', (v) => { Object.defineProperty(v, 'hidden', { value: true }); }],
  ['cycle', (v) => { v.extra = v; }],
  ['sparse array', (v) => { v.extra = Array(2); }],
  ['array extra field', (v) => { v.extra = [1]; v.extra.verdict = 'eligible'; }],
  ['custom array prototype', (v) => { v.extra = []; Object.setPrototypeOf(v.extra, {}); }],
  ['nonfinite number', (v) => { v.expectedRevision = Infinity; }],
  ['negative zero', (v) => { v.expectedRevision = -0; }],
  ['function value', (v) => { v.extra = () => true; }],
  ['undefined field', (v) => { v.extra = undefined; }],
  ['deep structure', (v) => { let tail = v; for (let i = 0; i < 15; i++) { tail.extra = {}; tail = tail.extra; } }]
]) {
  test(`${name} rejects without admission/effect`, () => {
    const session = model.createSession({ sessionId: 'session-own-data' });
    const input = command(session, 'admit', candidate());
    mutate(input);
    assert.equal(session.dispatch(input).code, 'INVALID_COMMAND');
    const state = session.read();
    assert.equal(state.active, null);
    assert.equal(state.counts.modeledEffectApplications, 0);
    assert.equal(state.counts.rejections, 1);
  });
}

for (const [name, mutate] of [
  ['supplied verdict', (v) => { v.verdict = 'eligible'; }],
  ['supplied provenance', (v) => { v.provenance = { trusted: true }; }],
  ['supplied inspection permit', (v) => { v.inspectionPermit = 'eligible'; }],
  ['supplied private state', (v) => { v.state = { admissions: 9 }; }],
  ['unknown command schema', (v) => { v.schema = 'C048/command/2'; }],
  ['unknown operation', (v) => { v.type = 'force-expand'; }],
  ['missing revision', (v) => { delete v.expectedRevision; }],
  ['coerced revision', (v) => { v.expectedRevision = '0'; }],
  ['boolean revision', (v) => { v.expectedRevision = false; }],
  ['null revision', (v) => { v.expectedRevision = null; }],
  ['fractional revision', (v) => { v.expectedRevision = 0.5; }],
  ['negative revision', (v) => { v.expectedRevision = -1; }],
  ['excessive revision', (v) => { v.expectedRevision = 65; }],
  ['missing request identity', (v) => { delete v.requestId; }],
  ['untrimmed request identity', (v) => { v.requestId = ' request-1'; }],
  ['candidate object instead of explicit JSON string', (v) => { v.candidateJSON = candidate(); }]
]) {
  test(`${name} cannot authorize a transition`, () => {
    const session = model.createSession({ sessionId: 'session-command' });
    const input = command(session, 'admit', candidate());
    mutate(input);
    const result = session.dispatch(input);
    assert.equal(result.outcome, 'rejected');
    assert.equal(result.code, 'INVALID_COMMAND');
    assert.equal(session.read().counts.admissions, 0);
    assert.equal(session.read().counts.modeledEffectApplications, 0);
  });
}

test('multiple dispatch arguments are a recorded rejection, not a state override', () => {
  const session = model.createSession({ sessionId: 'session-extra-argument' });
  assert.equal(session.dispatch(command(session, 'admit', candidate()), { eligible: true }).code, 'INVALID_COMMAND');
  assert.equal(session.read().history.length, 1);
  assert.equal(session.read().active, null);
});

test('inspection is read-only to admission and a stale inspection/revision is never a permit', () => {
  const session = model.createSession({ sessionId: 'session-stale' });
  const stale = command(session, 'admit', candidate(), 'request-stale');
  assert.equal(session.dispatch(command(session, 'inspect', candidate())).outcome, 'inspected');
  assert.equal(session.read().counts.admissions, 0);
  assert.equal(session.read().counts.modeledEffectApplications, 0);
  assert.equal(session.dispatch(stale).code, 'STALE_REVISION');
  const changed = candidate();
  changed.data.apiContract = 'getProfile/2';
  assert.equal(session.dispatch(command(session, 'admit', changed)).code, 'DATA_INCOMPATIBLE');
  assert.equal(session.read().active, null);
  changed.data.adapterId = adapterId;
  assert.equal(session.dispatch(command(session, 'admit', changed)).outcome, 'admitted');
  const state = session.read();
  assert.equal(state.counts.rejections, 2);
  assert.equal(state.history[0].result.outcome, 'inspected');
  assert.equal(state.history[1].result.code, 'STALE_REVISION');
  assert.equal(state.history[2].result.code, 'DATA_INCOMPATIBLE');
  assert.equal(state.counts.modeledEffectApplications, 3);
});

test('a replayed request ID is rejected even when its earlier command admitted', () => {
  const session = model.createSession({ sessionId: 'session-request-replay' });
  const input = command(session, 'admit', candidate(), 'request-unique');
  session.dispatch(input);
  const prior = session.read().active;
  assert.equal(session.dispatch({ ...input, expectedRevision: session.read().revision }).code, 'REQUEST_REPLAY');
  assert.deepEqual(session.read().active, prior);
  assert.equal(session.read().counts.admissions, 1);
  assert.equal(session.read().counts.modeledEffectApplications, 3);
});

test('private exported snapshots are detached frozen inspection only, not resumable input', () => {
  const session = model.createSession({ sessionId: 'session-private' });
  session.dispatch(command(session, 'admit', candidate()));
  const original = session.read();
  deeplyFrozen(original);
  assert.throws(() => { original.active.stage = 'expanded'; }, TypeError);
  const forged = JSON.parse(JSON.stringify(original));
  forged.active.stage = 'expanded';
  forged.counts.expansions = 1;
  assert.throws(() => session.read(forged), { code: 'READ_ONLY_SNAPSHOT' });
  assert.equal(session.dispatch(forged).code, 'INVALID_COMMAND');
  assert.deepEqual(session.read().active, original.active);
  assert.equal(session.read().counts.expansions, 0);
  assert.equal(session.restore, undefined);
  assert.equal(session.adopt, undefined);
  const next = session.read();
  assert.notEqual(next, original);
  assert.notEqual(next.active.job, original.active.job);
  deeplyFrozen(next);
});

test('caller mutation after dispatch cannot alter retained candidate, verdict, job or history', () => {
  const session = model.createSession({ sessionId: 'session-alias' });
  const input = command(session, 'admit', candidate());
  const result = session.dispatch(input);
  const prior = session.read();
  input.candidateJSON = '{}';
  input.requestId = 'request-forged';
  assert.deepEqual(session.read(), prior);
  deeplyFrozen(result);
  assert.throws(() => { result.eligibility.status = 'blocked'; }, TypeError);
});

test('all negative lifecycle operations refuse expansion without effects', () => {
  const session = model.createSession({ sessionId: 'session-lifecycle' });
  assert.equal(session.dispatch(command(session, 'expand', candidate())).code, 'ADMISSION_REQUIRED');
  assert.equal(session.read().counts.modeledEffectApplications, 0);
  session.dispatch(command(session, 'admit', candidate()));
  const prior = session.read().active;
  const another = candidate();
  another.releaseId = 'release-002';
  assert.equal(session.dispatch(command(session, 'expand', another)).code, 'RELEASE_IDENTITY_MISMATCH');
  another.releaseId = 'release-001';
  another.profileId = 'synthetic-002';
  assert.equal(session.dispatch(command(session, 'expand', another)).code, 'RELEASE_IDENTITY_MISMATCH');
  assert.equal(session.dispatch(command(session, 'admit', candidate())).code, 'ACTIVE_ADMISSION');
  assert.deepEqual(session.read().active, prior);
  assert.equal(session.dispatch(command(session, 'expand', candidate())).outcome, 'expanded');
  assert.equal(session.dispatch(command(session, 'expand', candidate())).code, 'ALREADY_EXPANDED');
  assert.equal(session.read().counts.admissions, 1);
  assert.equal(session.read().counts.expansions, 1);
  assert.equal(session.read().counts.modeledEffectApplications, 3);
});

test('reset archives actual jobs and preserves rejected/inspection history and work identities', () => {
  const session = model.createSession({ sessionId: 'session-reset' });
  session.dispatch(command(session, 'inspect', candidate()));
  session.dispatch(command(session, 'admit', candidate()));
  const bad = candidate();
  bad.event.evidence = 'unknown';
  session.dispatch(command(session, 'expand', bad));
  const prior = session.read();
  const result = session.dispatch(command(session, 'reset'));
  assert.equal(result.outcome, 'reset');
  const archived = session.read();
  assert.equal(archived.active, null);
  assert.deepEqual(archived.archives[0], prior.active);
  assert.deepEqual(archived.history.slice(0, 3), prior.history);
  assert.equal(archived.counts.modeledEffectApplications, 3);
  assert.equal(session.dispatch(command(session, 'admit', candidate())).code, 'RELEASE_REPLAY');
  const fresh = candidate();
  fresh.releaseId = 'release-002';
  assert.equal(session.dispatch(command(session, 'admit', fresh)).outcome, 'admitted');
  assert.equal(session.read().counts.modeledEffectApplications, 6);
  assert.deepEqual(session.read().archives[0], prior.active);
});

test('history bound records one terminal refusal without truncation, state adoption or reset bypass', () => {
  const session = model.createSession({ sessionId: 'session-history-bound' });
  const value = candidate();
  value.event.evidence = 'unknown';
  for (let index = 0; index < model.rules.maximumOperations; index++) {
    assert.equal(session.dispatch(command(session, 'inspect', value)).code, 'EVENT_EVIDENCE_UNKNOWN');
  }
  const prior = session.read();
  const limit = session.dispatch(command(session, 'admit', candidate()));
  assert.equal(limit.code, 'HISTORY_LIMIT');
  assert.equal(session.read().history.length, 64);
  assert.deepEqual(session.read().history, prior.history);
  assert.deepEqual(session.read().terminalRejection, limit);
  assert.deepEqual(session.dispatch(command(session, 'reset')), limit);
  assert.equal(session.read().counts.modeledEffectApplications, 0);
  assert.equal(session.read().active, null);
  assert.equal(session.read().revision, 64);
});
