'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const ledger = require('../ledger.js');
const c020 = require('../../C020/contract.js');
const { getProfileV1, getProfileV2 } = require('../../C020/profiles.cjs');
const config = Object.freeze({
  jobId: 'job-001', workVersion: 'profile-effects/1',
  profileId: 'synthetic-001', implementation: 'v1'
});
const command = (type, interruption = 'none', effectIndex = null) => ({ type, interruption, effectIndex });
const fresh = (overrides = {}) => ledger.create({ ...config, ...overrides });
const clone = (value) => JSON.parse(JSON.stringify(value));
const interrupted = () => ledger.apply(fresh(), command('run', 'after-commit', 0));
function frozenTree(value) {
  if (value && typeof value === 'object') {
    assert.equal(Object.isFrozen(value), true);
    Object.values(value).forEach(frozenTree);
  }
}
function assertComplete(state) {
  const view = ledger.inspect(state);
  assert.equal(view.status, 'complete');
  assert.equal(view.checkpointNext, 3);
  assert.equal(view.counters.committedEffects, 3);
  assert.equal(view.counters.effectApplications, 3);
  assert.equal(view.counters.unknownEffects, 0);
  assert.equal(new Set(view.ledger.map((entry) => entry.effectKey)).size, 3);
  assert.equal(new Set(view.applications.map((entry) => entry.effectKey)).size, 3);
  assert.deepEqual(view.ledger.map((entry) => entry.effectKey), state.plan.effects.map((effect) => effect.key));
  return view;
}

for (const profileId of c020.profiles.map((profile) => profile.id)) {
  for (const [implementation, getProfile] of [['v1', getProfileV1], ['v2', getProfileV2]]) {
    test(`reuses actual unchanged C020 ${profileId} ${implementation} business data and stamps`, () => {
      const state = fresh({ profileId, implementation });
      const actual = getProfile({ profileId });
      assert.equal(state.schema, 'C023/1');
      assert.equal(state.plan.workVersion, config.workVersion);
      assert.equal(state.plan.source.cardId, 'C020');
      assert.deepEqual(clone(state.plan.source.profile), clone(actual.profile));
      assert.deepEqual(clone(state.plan.source.stamp), clone(actual.stamp));
      assert.equal(state.plan.source.apiContract, actual.apiContract);
      assert.equal(state.plan.source.observation, 'bundled-immutable-catalog-not-new-HTTP-observation');
      assert.notEqual(state.plan.source.profile, c020.profiles.find((item) => item.id === profileId));
      assert.equal(ledger.inspect(state).counters.committedEffects, 0);
      assertComplete(ledger.apply(state, command('run')));
    });
  }
}

test('creation, effects and full execution are deterministic without clocks or randomness', () => {
  assert.deepEqual(fresh(), fresh());
  assert.deepEqual(ledger.apply(fresh(), command('run')), ledger.apply(fresh(), command('run')));
  const plan1 = fresh().plan;
  const plan2 = fresh({ implementation: 'v2' }).plan;
  assert.deepEqual(plan1.effects, plan2.effects, 'compatible implementation stamp is not a new business effect identity');
  assert.equal(plan1.workId, plan2.workId);
  assert.notDeepEqual(plan1.source.stamp, plan2.source.stamp);
  assert.equal(new Set(plan1.effects.map((effect) => effect.key)).size, 3);
  assert.ok(plan1.effects.every((effect) => effect.key.includes(plan1.workVersion)));
});

for (const boundary of ['before-commit', 'after-commit', 'before-checkpoint', 'after-checkpoint']) {
  for (const effectIndex of [0, 1, 2]) {
    test(`resume after ${boundary} at index ${effectIndex} preserves known effects and original interruption`, () => {
      const start = fresh();
      const cut = ledger.apply(start, command('run', boundary, effectIndex));
      const originalBytes = JSON.stringify(cut);
      const before = ledger.inspect(cut);
      assert.equal(before.status, 'interrupted');
      const commitCount = effectIndex + (boundary === 'before-commit' ? 0 : 1);
      const checkpoint = effectIndex + (boundary === 'after-checkpoint' ? 1 : 0);
      assert.equal(before.counters.committedEffects, commitCount);
      assert.equal(before.counters.effectApplications, commitCount);
      assert.equal(before.checkpointNext, checkpoint);
      assert.equal(before.counters.checkpoints, checkpoint);
      assert.equal(before.attempts[0].outcome, 'interrupted');
      assert.deepEqual(clone(before.attempts[0].interruption), { boundary, index: effectIndex });
      const done = ledger.apply(cut, command('resume'));
      const after = assertComplete(done);
      assert.equal(after.counters.duplicateSuppressions, ['after-commit', 'before-checkpoint'].includes(boundary) ? 1 : 0);
      assert.equal(after.attempts.length, 2);
      assert.equal(after.attempts[1].outcome, 'complete');
      assert.deepEqual(done.journal[0], cut.journal[0]);
      assert.deepEqual(after.attempts[0], before.attempts[0]);
      assert.deepEqual(after.ledger.slice(0, before.ledger.length), before.ledger);
      assert.deepEqual(after.applications.slice(0, before.applications.length), before.applications);
      assert.equal(JSON.stringify(cut), originalBytes);
      assert.equal(start.view.counters.committedEffects, 0);
      frozenTree(done);
    });
  }
}

test('multiple interruptions can repeatedly suppress a known effect without losing or counting it twice', () => {
  const cut = interrupted();
  const second = ledger.apply(cut, command('resume', 'before-checkpoint', 0));
  assert.equal(second.view.counters.committedEffects, 1);
  assert.equal(second.view.counters.effectApplications, 1);
  assert.equal(second.view.counters.duplicateSuppressions, 1);
  assert.equal(second.view.checkpointNext, 0);
  const done = ledger.apply(second, command('resume'));
  assert.equal(assertComplete(done).counters.duplicateSuppressions, 2);
  assert.deepEqual(done.view.attempts.map((attempt) => attempt.outcome), ['interrupted', 'interrupted', 'complete']);
  const sequences = done.journal.flatMap((record) => record.events.map((event) => event.sequence));
  assert.deepEqual(sequences, sequences.map((_, index) => index + 1));
});

test('after-commit and before-checkpoint cuts distinguish the acknowledgment boundary', () => {
  const after = interrupted().journal[0].events.map((event) => event.type);
  const before = ledger.apply(fresh(), command('run', 'before-checkpoint', 0)).journal[0].events.map((event) => event.type);
  assert.equal(after.includes('effect-acknowledged'), false);
  assert.equal(before.includes('effect-acknowledged'), true);
  assert.equal(after.includes('checkpoint-recorded'), false);
  assert.equal(before.includes('checkpoint-recorded'), false);
});

for (const effectIndex of [0, 1, 2]) {
  for (const observation of ['observed-committed', 'observed-absent']) {
    test(`unknown index ${effectIndex} remains explicit until synthetic ${observation} reconciliation`, () => {
      const unknown = ledger.apply(fresh(), command('run', 'unknown-ack', effectIndex));
      assert.equal(unknown.view.status, 'needs-reconcile');
      assert.equal(unknown.view.counters.unknownEffects, 1);
      assert.equal(unknown.view.counters.committedEffects, effectIndex);
      assert.equal(unknown.view.checkpointNext, effectIndex);
      assert.equal(unknown.view.attempts[0].outcome, 'unknown');
      assert.throws(() => ledger.apply(unknown, command('resume')), { code: 'NEEDS_RECONCILIATION' });
      assert.throws(() => ledger.apply(unknown, command('run')), { code: 'NEEDS_RECONCILIATION' });
      const effectKey = unknown.view.pendingUnknown.effectKey;
      const still = ledger.apply(unknown, { type: 'reconcile', effectKey, observation: 'still-unknown' });
      assert.equal(still.view.status, 'needs-reconcile');
      assert.equal(still.view.counters.committedEffects, effectIndex);
      assert.throws(() => ledger.apply(still, command('resume')), { code: 'NEEDS_RECONCILIATION' });
      const resolved = ledger.apply(still, { type: 'reconcile', effectKey, observation });
      assert.equal(resolved.view.status, 'interrupted');
      assert.equal(resolved.view.pendingUnknown, null);
      assert.equal(resolved.view.counters.committedEffects, effectIndex + (observation === 'observed-committed' ? 1 : 0));
      assert.equal(resolved.view.checkpointNext, effectIndex);
      assert.throws(() => ledger.apply(resolved, { type: 'reconcile', effectKey, observation }), { code: 'INVALID_STATE_TRANSITION' });
      const done = ledger.apply(resolved, command('resume'));
      const view = assertComplete(done);
      assert.equal(view.attempts[0].outcome, 'unknown');
      assert.equal(view.counters.reconciliationObservations, 2);
      assert.equal(view.counters.duplicateSuppressions, observation === 'observed-committed' ? 1 : 0);
      assert.deepEqual(done.journal.slice(0, unknown.journal.length), unknown.journal);
      if (observation === 'observed-committed') {
        assert.equal(view.ledger[effectIndex].origin, 'synthetic-reconciliation');
        assert.equal(view.applications[effectIndex].origin, 'synthetic-reconciliation');
      }
    });
  }
}

test('reconciliation cannot identify a different effect or invent receipt evidence', () => {
  const state = ledger.apply(fresh(), command('run', 'unknown-ack', 0));
  const effectKey = state.view.pendingUnknown.effectKey;
  assert.throws(() => ledger.apply(state, { type: 'reconcile', effectKey: 'foreign', observation: 'observed-committed' }), { code: 'RECONCILIATION_KEY_MISMATCH' });
  for (const bad of [
    { type: 'reconcile', effectKey, observation: 'success' },
    { type: 'reconcile', effectKey, observation: 'observed-committed', receipt: 'cloud-proof' },
    { type: 'reconcile', effectKey, observation: true },
    { type: 'reconcile', effectKey, observation: 'unknown' }
  ]) assert.throws(() => ledger.apply(state, bad), { code: 'INVALID_COMMAND' });
});

for (const [name, value, code] of [
  ['missing config', undefined, 'INVALID_CONFIG'],
  ['null config', null, 'INVALID_CONFIG'],
  ['array config', [], 'INVALID_CONFIG'],
  ['extra field', { ...config, effectCount: 0 }, 'INVALID_CONFIG'],
  ['missing version', { jobId: 'job-001', profileId: 'synthetic-001', implementation: 'v1' }, 'INVALID_CONFIG'],
  ['empty ID', { ...config, jobId: '' }, 'INVALID_JOB_ID'],
  ['whitespace ID', { ...config, jobId: ' job-001' }, 'INVALID_JOB_ID'],
  ['markup ID', { ...config, jobId: 'job-<script>' }, 'INVALID_JOB_ID'],
  ['oversize ID', { ...config, jobId: 'job-' + 'a'.repeat(29) }, 'INVALID_JOB_ID'],
  ['numeric ID', { ...config, jobId: 1 }, 'INVALID_JOB_ID'],
  ['unsupported work version', { ...config, workVersion: 'profile-effects/2' }, 'UNSUPPORTED_WORK_VERSION'],
  ['coerced version', { ...config, workVersion: 1 }, 'UNSUPPORTED_WORK_VERSION'],
  ['unknown profile', { ...config, profileId: 'synthetic-999' }, 'UNKNOWN_PROFILE'],
  ['wrong profile type', { ...config, profileId: 1 }, 'UNKNOWN_PROFILE'],
  ['unknown implementation', { ...config, implementation: 'v3' }, 'UNKNOWN_IMPLEMENTATION'],
  ['inherited implementation', { ...config, implementation: 'toString' }, 'UNKNOWN_IMPLEMENTATION'],
  ['object implementation', { ...config, implementation: {} }, 'UNKNOWN_IMPLEMENTATION']
]) {
  test(`invalid configuration rejects ${name} without fallback`, () => assert.throws(() => ledger.create(value), { code }));
}

test('data validation does not execute caller accessors or accept symbols, custom prototypes or non-JSON values', () => {
  let getterCalls = 0;
  const accessor = { ...config };
  Object.defineProperty(accessor, 'jobId', { enumerable: true, get() { getterCalls++; return 'job-001'; } });
  const values = [
    accessor, Object.assign(Object.create(config), {}),
    { ...config, [Symbol('field')]: true }, { ...config, hidden: undefined },
    { ...config, implementation: () => 'v1' }, { ...config, jobId: new String('job-001') },
    { ...config, profileId: new Date() }, { ...config, workVersion: NaN }
  ];
  const hidden = { ...config };
  Object.defineProperty(hidden, 'extra', { value: 1 });
  values.push(hidden);
  for (const value of values) assert.throws(() => ledger.create(value), { code: 'INVALID_CONFIG' });
  assert.equal(getterCalls, 0);
});

for (const [name, value] of [
  ['missing command', undefined], ['null command', null], ['array command', []],
  ['missing type', { interruption: 'none', effectIndex: null }],
  ['unknown command', { type: 'commit', interruption: 'none', effectIndex: null }],
  ['extra override', { ...command('run'), effectCount: 0 }],
  ['missing index', { type: 'run', interruption: 'none' }],
  ['string index', command('run', 'after-commit', '0')],
  ['fractional index', command('run', 'after-commit', 0.1)],
  ['negative zero index', command('run', 'after-commit', -0)],
  ['negative index', command('run', 'after-commit', -1)],
  ['out of range index', command('run', 'after-commit', 3)],
  ['none with index', command('run', 'none', 0)],
  ['unknown boundary', command('run', 'cloud-crash', 0)],
  ['null boundary', command('run', null, 0)]
]) {
  test(`invalid command rejects ${name} without changing original evidence`, () => {
    const state = fresh();
    const before = JSON.stringify(state);
    assert.throws(() => ledger.apply(state, value), { code: 'INVALID_COMMAND' });
    assert.equal(JSON.stringify(state), before);
  });
}

test('strict lifecycle and unreachable interruption handling never reruns a completed job', () => {
  assert.throws(() => ledger.apply(fresh(), command('resume')), { code: 'INVALID_STATE_TRANSITION' });
  const done = ledger.apply(fresh(), command('run'));
  for (const type of ['run', 'resume']) assert.throws(() => ledger.apply(done, command(type)), { code: 'INVALID_STATE_TRANSITION' });
  const after = interrupted();
  assert.throws(() => ledger.apply(after, command('run')), { code: 'INVALID_STATE_TRANSITION' });
  for (const boundary of ['before-commit', 'after-commit', 'unknown-ack']) {
    assert.throws(() => ledger.apply(after, command('resume', boundary, 0)), { code: 'UNREACHABLE_INTERRUPTION' });
  }
  const checkpointed = ledger.apply(fresh(), command('run', 'after-checkpoint', 1));
  assert.throws(() => ledger.apply(checkpointed, command('resume', 'before-checkpoint', 0)), { code: 'INVALID_INTERRUPTION_TARGET' });
});

for (const [name, mutate] of [
  ['committed count', (state) => { state.view.counters.committedEffects = 0; }],
  ['application count', (state) => { state.view.counters.effectApplications++; }],
  ['lost ledger', (state) => { state.view.ledger = []; }],
  ['lost effect', (state) => { state.view.applications = []; }],
  ['duplicate effect', (state) => { state.view.applications.push(clone(state.view.applications[0])); }],
  ['forged checkpoint', (state) => { state.view.checkpointNext = 1; }],
  ['source profile change', (state) => { state.plan.source.profile.displayName = 'forged'; }],
  ['source stamp change', (state) => { state.plan.source.stamp.fixtureRevision = 'C020-forged'; }],
  ['work version change', (state) => { state.plan.workVersion = 'profile-effects/2'; }],
  ['plan effect key change', (state) => { state.plan.effects[0].key += 'forged'; }],
  ['projection success', (state) => { state.view.status = 'complete'; }],
  ['original outcome rewritten', (state) => { state.view.attempts[0].outcome = 'complete'; }],
  ['history event removed', (state) => { state.journal[0].events.splice(1, 1); }],
  ['history event sequence change', (state) => { state.journal[0].events[0].sequence = 8; }],
  ['history command edited', (state) => { state.journal[0].command.interruption = 'before-commit'; }],
  ['history ordinal edited', (state) => { state.journal[0].ordinal = 7; }],
  ['history removed without projection', (state) => { state.journal = []; }],
  ['extra state field', (state) => { state.receipt = 'cloud'; }],
  ['unknown schema', (state) => { state.schema = 'C023/2'; }],
  ['sparse history', (state) => { state.journal.length = 2; }],
  ['extra array property', (state) => { state.journal.extra = true; }],
  ['nonfinite field', (state) => { state.view.lastEvent = Infinity; }],
  ['unsafe integer', (state) => { state.view.lastEvent = Number.MAX_SAFE_INTEGER + 1; }],
  ['cyclic state', (state) => { state.cycle = state; }]
]) {
  test(`snapshot validation rejects ${name} before resume`, () => {
    const candidate = clone(interrupted());
    mutate(candidate);
    assert.throws(() => ledger.apply(candidate, command('resume')), { code: 'INVALID_STATE' });
    assert.throws(() => ledger.inspect(candidate), { code: 'INVALID_STATE' });
  });
}

test('unknown outcome cannot become known success by editing its projection', () => {
  const state = clone(ledger.apply(fresh(), command('run', 'unknown-ack', 0)));
  state.view.pendingUnknown = null;
  state.view.status = 'interrupted';
  state.view.counters.unknownEffects = 0;
  assert.throws(() => ledger.apply(state, command('resume')), { code: 'INVALID_STATE' });
});

test('snapshots restore by complete replay, detach mutable callers and stay deeply frozen', () => {
  const original = interrupted();
  const bytes = JSON.stringify(original);
  const restored = ledger.restore(bytes);
  assert.deepEqual(clone(restored), clone(original));
  assert.notEqual(restored, original);
  frozenTree(restored);
  frozenTree(ledger.inspect(restored));
  const callerCopy = clone(restored);
  const resumed = ledger.apply(callerCopy, command('resume'));
  callerCopy.plan.source.profile.preferences.topics.push('mutated caller');
  assert.equal(JSON.stringify(original), bytes);
  assert.equal(JSON.stringify(restored), bytes);
  assertComplete(resumed);
  assert.equal(c020.profiles[0].preferences.topics.includes('mutated caller'), false);
});

for (const text of ['', ' ', '{', '[]', 'null', 'true', '0', 'x'.repeat(524289)]) {
  test(`invalid saved JSON is rejected (${JSON.stringify(text.slice(0, 20))})`, () => {
    assert.throws(() => ledger.restore(text), (error) => ['INVALID_SNAPSHOT', 'INVALID_STATE'].includes(error.code));
  });
}

test('separate work identities and profiles remain isolated from resume and caller mutations', () => {
  const one = interrupted();
  const two = fresh({ jobId: 'job-002', profileId: 'synthetic-002', implementation: 'v2' });
  const before = JSON.stringify(two);
  const done = ledger.apply(one, command('resume'));
  assertComplete(done);
  assert.equal(JSON.stringify(two), before);
  assert.equal(two.view.counters.committedEffects, 0);
  assert.notEqual(one.plan.workId, two.plan.workId);
  assert.ok(one.plan.effects.every((effect) => !two.plan.effects.some((other) => other.key === effect.key)));
  assert.throws(() => { one.plan.source.profile.preferences.locale = 'changed'; }, TypeError);
  assert.throws(() => { done.view.ledger.push({}); }, TypeError);
});

test('bounded history stops explicitly without truncating prior unknown outcomes', () => {
  let state = ledger.apply(fresh(), command('run', 'unknown-ack', 0));
  const first = state.journal[0];
  for (let index = 1; index < ledger.contract.maximumRecords; index++) {
    state = ledger.apply(state, { type: 'reconcile', effectKey: state.view.pendingUnknown.effectKey, observation: 'still-unknown' });
  }
  const before = JSON.stringify(state);
  assert.equal(state.journal.length, 64);
  assert.deepEqual(state.journal[0], first);
  assert.equal(state.view.status, 'needs-reconcile');
  assert.throws(() => ledger.apply(state, { type: 'reconcile', effectKey: state.view.pendingUnknown.effectKey, observation: 'observed-absent' }), { code: 'HISTORY_LIMIT' });
  assert.equal(JSON.stringify(state), before);
  assert.equal(ledger.restore(before).view.attempts[0].outcome, 'unknown');
});
