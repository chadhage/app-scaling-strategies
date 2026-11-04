'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');

function prepared() {
  const rehearsal = model.createRehearsal();
  rehearsal.act({ type: 'sample-offline' });
  rehearsal.act({ type: 'queue-changes' });
  rehearsal.act({ type: 'sample-online' });
  return rehearsal;
}

test('only the fictional sample client goes offline', () => {
  const rehearsal = model.createRehearsal();
  const state = rehearsal.act({ type: 'sample-offline' });
  assert.equal(state.sampleClientOnline, false);
  assert.equal(state.consoleAvailable, true);
  assert.equal(state.otherWorkersAvailable, true);
  assert.equal(state.phase, 'offline');
  assert.deepEqual(state.history.map((entry) => entry.action), ['sample-offline']);
});

test('clean synchronization confirms exactly two owned v2 effects', () => {
  const rehearsal = prepared();
  const state = rehearsal.act({
    type: 'synchronize', fixture: 'clean', timing: 'within-budget',
  });
  assert.equal(state.result.verdict, 'positive');
  assert.equal(state.result.verifier, 'PASS');
  assert.equal(state.result.userImpact, 'completed');
  assert.equal(state.result.metrics.totalEffects, 2);
  assert.equal(state.result.metrics.confirmedChanges, 2);
  assert.equal(state.pending.length, 0);
});

test('missing acknowledgment is unknown and retry does not duplicate the effect', () => {
  const rehearsal = prepared();
  const unresolved = rehearsal.act({
    type: 'synchronize', fixture: 'missing-ack', timing: 'within-budget',
  });
  assert.equal(unresolved.result.verdict, 'unknown');
  assert.equal(unresolved.pending.length, 1);
  const confirmed = rehearsal.act({ type: 'retry-ack' });
  assert.equal(confirmed.result.verdict, 'positive');
  assert.equal(confirmed.result.metrics.totalEffects, 2);
  assert.equal(confirmed.observation.operations[0].attempts, 2);
  assert.equal(confirmed.pending.length, 0);
  assert.equal(confirmed.history.at(-2).result.verdict, 'unknown');
});

test('premature synchronization is rejected without state changes', () => {
  const rehearsal = model.createRehearsal();
  const before = rehearsal.snapshot();
  assert.throws(() => rehearsal.act({
    type: 'synchronize', fixture: 'clean', timing: 'within-budget',
  }), { code: 'ERR_STATE_GUARD' });
  assert.deepEqual(rehearsal.snapshot(), before);
});

test('operator inspection works offline without reconnecting or touching queued data', () => {
  const rehearsal = model.createRehearsal();
  rehearsal.act({ type: 'sample-offline' });
  const queued = rehearsal.act({ type: 'queue-changes' });
  const inspected = rehearsal.act({ type: 'inspect-console' });
  assert.equal(inspected.sampleClientOnline, false);
  assert.equal(inspected.consoleAvailable, true);
  assert.equal(inspected.otherWorkersAvailable, true);
  assert.equal(inspected.consoleInspections, 1);
  assert.deepEqual(inspected.pending, queued.pending);
  assert.deepEqual(inspected.observation, queued.observation);
  assert.equal(inspected.history.at(-1).action, 'inspect-console');
});

for (const [fixture, effects, pending, reason] of [
  ['conflict', 1, 'change-136-2', /conflict; no merge or success inferred/],
  ['missing-effect', 1, 'change-136-2', /no confirmed effect/],
  ['duplicate-effect', 3, 'change-136-1', /duplicate effects/],
  ['identity-rejected', 1, 'change-136-2', /authenticated ownership mismatch/],
]) {
  test(`${fixture} is negative and retains the actual unresolved change`, () => {
    const rehearsal = prepared();
    const state = rehearsal.act({ type: 'synchronize', fixture, timing: 'within-budget' });
    assert.equal(state.result.verdict, 'negative');
    assert.equal(state.result.verifier, 'FAIL');
    assert.equal(state.result.userImpact, 'interrupted');
    assert.equal(state.result.metrics.totalEffects, effects);
    assert.equal(state.result.metrics.confirmedChanges, 1);
    assert.deepEqual(state.pending.map((change) => change.id), [pending]);
    assert.match(state.result.reasons.join(' '), reason);
    const before = rehearsal.snapshot();
    assert.throws(() => rehearsal.act({ type: 'retry-ack' }), { code: 'ERR_STATE_GUARD' });
    assert.deepEqual(rehearsal.snapshot(), before);
  });
}

for (const [timing, reason] of [
  ['offline-over-budget', /offlineMs 6000 ms exceeds 5000 ms/],
  ['recovery-over-budget', /recoveryMs 250 ms exceeds 200 ms/],
]) {
  test(`${timing} is interrupted even with two correct effects and receipts`, () => {
    const state = prepared().act({ type: 'synchronize', fixture: 'clean', timing });
    assert.equal(state.result.verdict, 'negative');
    assert.equal(state.result.userImpact, 'interrupted');
    assert.equal(state.result.metrics.totalEffects, 2);
    assert.equal(state.result.metrics.confirmedChanges, 2);
    assert.equal(state.pending.length, 0);
    assert.match(state.result.reasons.join(' '), reason);
  });
}

test('explicit budget equality passes, but exceeding either boundary fails', () => {
  const observation = structuredClone(model.makeObservation('clean', 'within-budget'));
  observation.timing = { offlineMs: 5000, recoveryMs: 200 };
  assert.equal(model.evaluate(observation).verdict, 'positive');
  observation.timing.offlineMs = 5001;
  assert.equal(model.evaluate(observation).verdict, 'negative');
  observation.timing = { offlineMs: 5000, recoveryMs: 201 };
  assert.equal(model.evaluate(observation).verdict, 'negative');
});

for (const [name, alter] of [
  ['destination v1', (o) => { o.deployment = 'v1'; }],
  ['incompatible protocol', (o) => { o.protocol = 'unsupported/v0'; }],
  ['different queued identity', (o) => { o.identity = 'fictional-other-user-136'; }],
  ['different receipt owner', (o) => { o.operations[0].ack.identity = 'fictional-other-user-136'; }],
  ['cross-operation receipt', (o) => { o.operations[0].ack.id = 'change-136-2'; }],
  ['v1 acknowledgment', (o) => { o.operations[0].ack.deployment = 'v1'; }],
  ['wrong resulting value', (o) => { o.operations[0].observedValue = 'remote-red'; }],
  ['wrong queued revision', (o) => { o.operations[0].baseRevision = 6; }],
]) {
  test(`known ${name} cannot be called successful synchronization`, () => {
    const observation = structuredClone(model.makeObservation('clean', 'within-budget'));
    alter(observation);
    const result = model.evaluate(observation);
    assert.equal(result.verdict, 'negative');
    assert.equal(result.userImpact, 'interrupted');
    assert.ok(result.confirmedIds.length < 2);
  });
}

for (const [name, alter] of [
  ['elapsed time', (o) => { o.timing.recoveryMs = null; }],
  ['protocol', (o) => { o.protocol = null; }],
  ['destination', (o) => { o.deployment = null; }],
  ['identity', (o) => { o.identity = null; }],
  ['authentication', (o) => { o.operations[0].authenticated = null; }],
  ['effect count', (o) => { o.operations[0].effectCount = null; }],
  ['resulting value', (o) => { o.operations[0].observedValue = null; }],
  ['revision', (o) => { o.operations[0].revision = null; }],
  ['receipt owner', (o) => { o.operations[0].ack.identity = null; }],
]) {
  test(`unobserved ${name} remains unknown, not invented success`, () => {
    const observation = structuredClone(model.makeObservation('clean', 'within-budget'));
    alter(observation);
    const result = model.evaluate(observation);
    assert.equal(result.verdict, 'unknown');
    assert.equal(result.verifier, 'INCONCLUSIVE');
    assert.equal(result.userImpact, 'unresolved');
    assert.match(result.reasons.join(' '), /not observed/);
    if (name === 'effect count') {
      assert.equal(result.metrics.totalEffects, null);
      assert.equal(result.metrics.knownEffects, 1);
      assert.equal(result.metrics.unknownEffectCounts, 1);
    }
  });
}

for (const [name, alter] of [
  ['string effect count', (o) => { o.operations[0].effectCount = '1'; }],
  ['string authentication', (o) => { o.operations[0].authenticated = 'true'; }],
  ['fractional time', (o) => { o.timing.offlineMs = 1.5; }],
  ['negative time', (o) => { o.timing.offlineMs = -1; }],
  ['negative zero time', (o) => { o.timing.offlineMs = -0; }],
  ['infinite time', (o) => { o.timing.offlineMs = Infinity; }],
  ['NaN time', (o) => { o.timing.offlineMs = NaN; }],
  ['oversized time', (o) => { o.timing.offlineMs = 10001; }],
  ['missing operation', (o) => { o.operations.pop(); }],
  ['duplicate queued ID', (o) => { o.operations[1].id = 'change-136-1'; }],
  ['sparse evidence', (o) => { delete o.operations[0]; }],
  ['extra array field', (o) => { o.operations.extra = true; }],
  ['extra observation field', (o) => { o.unapprovedData = true; }],
  ['extra receipt field', (o) => { o.operations[0].ack.success = true; }],
  ['changed intended value', (o) => { o.operations[0].expectedValue = 'remote-red'; }],
  ['string attempt count', (o) => { o.operations[0].attempts = '1'; }],
]) {
  test(`strict observation guard rejects ${name}`, () => {
    const observation = structuredClone(model.makeObservation('clean', 'within-budget'));
    alter(observation);
    assert.throws(() => model.evaluate(observation), { code: 'ERR_OBSERVATION_INPUT' });
  });
}

test('accessor-backed evidence is rejected without executing the accessor', () => {
  const observation = structuredClone(model.makeObservation('clean', 'within-budget'));
  let called = false;
  Object.defineProperty(observation.operations, '0', { get() { called = true; return {}; }, configurable: true });
  assert.throws(() => model.evaluate(observation), { code: 'ERR_OBSERVATION_INPUT' });
  assert.equal(called, false);
});

for (const [name, action] of [
  ['null', null], ['missing', undefined], ['boolean', true], ['number', 1],
  ['string', 'sample-offline'], ['array', []], ['empty object', {}],
  ['unknown action', { type: 'disconnect-machine' }],
  ['extra fields', { type: 'sample-offline', allWorkers: true }],
  ['typed fixture boolean', { type: 'synchronize', fixture: true, timing: 'within-budget' }],
  ['unknown fixture', { type: 'synchronize', fixture: 'merge-anything', timing: 'within-budget' }],
  ['missing timing', { type: 'synchronize', fixture: 'clean' }],
  ['unknown timing', { type: 'synchronize', fixture: 'clean', timing: 'Infinity' }],
  ['null prototype', Object.assign(Object.create(null), { type: 'sample-offline' })],
]) {
  test(`strict action guard rejects ${name} atomically`, () => {
    const rehearsal = model.createRehearsal();
    const before = rehearsal.snapshot();
    assert.throws(() => rehearsal.act(action), { code: 'ERR_ACTION_INPUT' });
    assert.deepEqual(rehearsal.snapshot(), before);
  });
}

test('accessor and symbol action fields cannot bypass the typed input guard', () => {
  const rehearsal = model.createRehearsal();
  let called = false;
  const getter = { get type() { called = true; return 'sample-offline'; } };
  assert.throws(() => rehearsal.act(getter), { code: 'ERR_ACTION_INPUT' });
  assert.equal(called, false);
  assert.throws(() => rehearsal.act({ type: 'sample-offline', [Symbol('extra')]: true }), { code: 'ERR_ACTION_INPUT' });
  assert.equal(rehearsal.snapshot().history.length, 0);
});

test('all phase guards reject unsafe ordering and repeated actions atomically', () => {
  const rehearsal = model.createRehearsal();
  function denied(type) {
    const before = rehearsal.snapshot();
    const action = type === 'synchronize' ? { type, fixture: 'clean', timing: 'within-budget' } : { type };
    assert.throws(() => rehearsal.act(action), { code: 'ERR_STATE_GUARD' });
    assert.deepEqual(rehearsal.snapshot(), before);
  }
  for (const type of ['queue-changes', 'sample-online', 'retry-ack']) denied(type);
  rehearsal.act({ type: 'sample-offline' });
  for (const type of ['sample-offline', 'sample-online', 'synchronize']) denied(type);
  rehearsal.act({ type: 'queue-changes' });
  for (const type of ['queue-changes', 'sample-offline', 'synchronize']) denied(type);
  rehearsal.act({ type: 'sample-online' });
  for (const type of ['sample-online', 'queue-changes']) denied(type);
  rehearsal.act({ type: 'synchronize', fixture: 'clean', timing: 'within-budget' });
  for (const type of ['synchronize', 'retry-ack', 'sample-offline']) denied(type);
});

test('deduplicated acknowledgment retry is bounded to one attempt and original timing', () => {
  const rehearsal = prepared();
  const unresolved = rehearsal.act({ type: 'synchronize', fixture: 'missing-ack', timing: 'within-budget' });
  const confirmed = rehearsal.act({ type: 'retry-ack' });
  assert.deepEqual(confirmed.observation.timing, unresolved.observation.timing);
  assert.deepEqual(confirmed.observation.operations.map((op) => op.id), unresolved.observation.operations.map((op) => op.id));
  assert.deepEqual(confirmed.observation.operations.map((op) => op.effectCount), [1, 1]);
  assert.throws(() => rehearsal.act({ type: 'retry-ack' }), { code: 'ERR_STATE_GUARD' });
  const late = prepared();
  late.act({ type: 'synchronize', fixture: 'missing-ack', timing: 'recovery-over-budget' });
  assert.throws(() => late.act({ type: 'retry-ack' }), { code: 'ERR_STATE_GUARD' });
});

test('snapshots, fixture data and public methods cannot be mutated into false success', () => {
  const rehearsal = prepared();
  const state = rehearsal.snapshot();
  assert.throws(() => { state.sampleClientOnline = false; }, TypeError);
  assert.throws(() => { state.pending[0].expectedValue = 'remote-red'; }, TypeError);
  assert.throws(() => { state.history.push({}); }, TypeError);
  assert.throws(() => { rehearsal.act = () => ({ result: { verdict: 'positive' } }); }, TypeError);
  assert.throws(() => { model.CHANGES[0].id = 'other'; }, TypeError);
  const observation = model.makeObservation('clean', 'within-budget');
  const before = structuredClone(observation);
  model.evaluate(observation);
  assert.deepEqual(observation, before);
});

test('reset clears active state, retains unknown history and permits a new clean run', () => {
  const rehearsal = prepared();
  rehearsal.act({ type: 'synchronize', fixture: 'missing-ack', timing: 'within-budget' });
  const reset = rehearsal.act({ type: 'reset' });
  assert.equal(reset.phase, 'ready');
  assert.equal(reset.sampleClientOnline, true);
  assert.equal(reset.consoleAvailable, true);
  assert.equal(reset.otherWorkersAvailable, true);
  assert.equal(reset.consoleInspections, 0);
  assert.deepEqual(reset.pending, []);
  assert.equal(reset.observation, null);
  assert.equal(reset.result, null);
  assert.equal(reset.fixture, null);
  assert.equal(reset.timing, null);
  assert.equal(reset.history.at(-2).result.verdict, 'unknown');
  assert.equal(reset.history.at(-1).previousResult.verdict, 'unknown');
  rehearsal.act({ type: 'sample-offline' });
  rehearsal.act({ type: 'queue-changes' });
  rehearsal.act({ type: 'sample-online' });
  assert.equal(rehearsal.act({ type: 'synchronize', fixture: 'clean', timing: 'within-budget' }).result.verdict, 'positive');
});

test('bounded journal reports omissions explicitly and reset remains usable at its bound', () => {
  const rehearsal = model.createRehearsal();
  for (let i = 0; i < 40; i += 1) rehearsal.act({ type: 'inspect-console' });
  const inspected = rehearsal.snapshot();
  assert.equal(inspected.history.length, model.MAX_HISTORY);
  assert.equal(inspected.omittedEntries, 8);
  assert.equal(inspected.history[0].sequence, 9);
  assert.equal(inspected.consoleInspections, 40);
  const reset = rehearsal.act({ type: 'reset' });
  assert.equal(reset.history.length, 32);
  assert.equal(reset.omittedEntries, 9);
  assert.equal(reset.history.at(-1).action, 'reset');
  assert.equal(reset.consoleInspections, 0);
  assert.ok(reset.allowedActions.includes('sample-offline'));
});
