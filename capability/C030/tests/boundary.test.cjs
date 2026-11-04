'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const detector = require('..\\detector.js');
const ledger = require('..\\..\\C023\\ledger.js');
const fixture = (id = 'control-one') => JSON.parse(detector.sourceJson(id)).payload;
const invalid = (result) => {
  assert.equal(result.valid, false);
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.eligibleForLiveRun, false);
};
for (const [name, change] of [
  ['missing effect', (plan) => plan.effects.pop()],
  ['extra effect', (plan) => plan.effects.push(structuredClone(plan.effects[0]))],
  ['duplicate key', (plan) => { plan.effects[1].key = plan.effects[0].key; }],
  ['wrong work identity', (plan) => { plan.workId += '-other'; }],
  ['wrong job identity', (plan) => { plan.jobId = 'job-other'; }],
  ['unsupported work version', (plan) => { plan.workVersion = 'profile-effects/2'; }],
  ['wrong profile identity', (plan) => { plan.profileId = 'synthetic-001'; }],
  ['wrong effect profile value', (plan) => { plan.effects[0].value.profileId = 'synthetic-001'; }],
  ['wrong implementation stamp', (plan) => { plan.source.stamp.implementationVersion = '24.0.0'; }],
  ['wrong business profile', (plan) => { plan.source.profile.displayName = 'Altered'; }],
  ['wrong effect ordering', (plan) => plan.effects.reverse()],
  ['caller eligibility', (plan) => { plan.eligible = true; }]
]) {
  test(`complete expected plan rejects ${name}`, () => {
    const copy = fixture();
    change(copy.plan);
    invalid(detector.inspectFiction(copy));
  });
}
for (const [name, change] of [
  ['missing original', (copy) => { copy.originals = []; }],
  ['duplicate original ID', (copy) => { copy.originals.push(structuredClone(copy.originals[0])); }],
  ['missing application receipt', (copy) => { copy.originals[0].applications.pop(); }],
  ['unknown effect key', (copy) => { copy.originals[0].applications[0].effectKey += '-other'; }],
  ['same receipt ID with conflicting key', (copy) => { copy.originals[0].applications[1].id = copy.originals[0].applications[0].id; }],
  ['checkpoint key mismatch', (copy) => { copy.originals[0].checkpoints[0].afterEffectKey = copy.plan.effects[1].key; }],
  ['checkpoint gap', (copy) => { copy.originals[0].checkpoints.splice(0, 1); }],
  ['absence plus same application', (copy) => { copy.originals[0].absences = [copy.plan.effects[0].key]; }],
  ['unsupported with receipts', (copy) => { copy.originals[0].support = 'unsupported'; }],
  ['caller verdict', (copy) => { copy.originals[0].verdict = 'PASS'; }],
  ['caller authority', (copy) => { copy.provenance = 'actual'; }],
  ['nonboolean closure', (copy) => { copy.originals[0].closure = true; }]
]) {
  test(`strict observation contract: ${name}`, () => {
    const copy = fixture();
    change(copy);
    const result = detector.inspectFiction(copy);
    if (name === 'missing application receipt') {
      assert.equal(result.valid, true);
      assert.equal(result.decision, 'HOLD');
      assert.equal(result.currentCounts.missingObservations, 1);
      assert.equal(result.currentCounts.confirmedAbsences, 0);
    } else invalid(result);
  });
}
for (const id of ['model-clean', 'control-one', 'history-closed', 'control-duplicate-application']) {
  test(`strict exact-copy binding and no adoption: ${id}`, () => {
    const text = detector.sourceJson(id);
    const before = detector.inspectSource(id);
    assert.deepEqual(detector.inspectCandidate(text, id), before);
    const copy = JSON.parse(text);
    copy.eligible = true;
    const rejected = detector.inspectCandidate(JSON.stringify(copy), id);
    invalid(rejected);
    assert.equal(rejected.counts.originals, before.counts.originals);
    assert.equal(rejected.counts.pass, 0);
    assert.deepEqual(rejected.retainedImmutableSourceCounts, before.counts);
    assert.deepEqual(detector.inspectSource(id), before);
    const other = JSON.parse(text);
    other.id = 'control-one';
    if (id !== 'control-one') invalid(detector.inspectCandidate(JSON.stringify(other), id));
  });
}
test('known duplicate cannot become a native C023 application source', () => {
  const copy = fixture('control-duplicate-application');
  const model = JSON.parse(detector.sourceJson('model-clean')).payload;
  model.view.applications.push(structuredClone(model.view.applications[0]));
  invalid(detector.inspectModel(model));
  assert.equal(detector.inspectFiction(copy).sourceBinding, 'unbound-mathematical-observations-only');
});
test('coherent unbound identities never acquire closed source authority', () => {
  const state = ledger.create({ jobId: 'job-other', workVersion: 'profile-effects/1', profileId: 'synthetic-002', implementation: 'v1' });
  const copy = fixture();
  const oldKeys = copy.plan.effects.map((effect) => effect.key);
  copy.plan = structuredClone(state.plan);
  const newKeys = copy.plan.effects.map((effect) => effect.key);
  for (const original of copy.originals) {
    for (const kind of ['applications', 'deliveries']) for (const record of original[kind]) record.effectKey = newKeys[oldKeys.indexOf(record.effectKey)];
    for (const checkpoint of original.checkpoints) checkpoint.afterEffectKey = newKeys[checkpoint.nextIndex - 1];
  }
  const result = detector.inspectFiction(copy);
  assert.equal(result.valid, true);
  assert.match(result.sourceBinding, /^unbound/);
  assert.equal(result.actualClientEffectAssociation, false);
  const bound = JSON.parse(detector.sourceJson('control-one'));
  bound.payload = copy;
  invalid(detector.inspectCandidate(JSON.stringify(bound), 'control-one'));
});
for (const [name, make] of [
  ['NaN', () => NaN], ['Infinity', () => Infinity], ['minus zero', () => -0],
  ['unsafe integer', () => Number.MAX_SAFE_INTEGER + 1], ['undefined', () => undefined],
  ['function', () => function () {}], ['bigint', () => 1n], ['date', () => new Date()],
  ['sparse array', () => new Array(2)], ['custom prototype', () => Object.create({ field: true })],
  ['symbol field', () => ({ [Symbol('field')]: true })], ['cycle', () => { const object = {}; object.self = object; return object; }]
]) {
  test(`strict finite own-data rejects ${name}`, () => invalid(detector.inspectFiction(make())));
}
test('own data validation never invokes a caller getter', () => {
  let invoked = 0;
  const copy = fixture();
  Object.defineProperty(copy.plan, 'jobId', { enumerable: true, get() { invoked++; return 'job-evil'; } });
  invalid(detector.inspectFiction(copy));
  assert.equal(invoked, 0);
});
for (const text of ['{"a":1,"a":2}', '{"plan":{"jobId":1,"jobId":2}}', '{"a":NaN}', '{"a":1e999}',
  '{"__proto__":{}}', '{"a":-0}', '[] trailing', '', '{"schema":"C030-fictional-observations/1","verdict":"PASS"}']) {
  test(`strict JSON rejects ${JSON.stringify(text)}`, () => invalid(detector.inspectFictionJson(text)));
}
test('duplicate JSON source copy retains known source denominator and failure', () => {
  const result = detector.inspectCandidate('{"id":"control-one","id":"healthy"}', 'control-duplicate-application');
  invalid(result);
  assert.equal(result.code, 'DUPLICATE_FIELD');
  assert.equal(result.counts.originals, 1);
  assert.equal(result.retainedImmutableSourceCounts.fail, 1);
  assert.equal(detector.inspectSource('control-duplicate-application').decision, 'FAIL');
});
test('an original known violation remains FAIL even when another dimension is unknown', () => {
  const copy = fixture('control-duplicate-application');
  copy.originals[0].unknownAcks = [copy.plan.effects[1].key];
  copy.originals[0].closure = 'open';
  const result = detector.inspectFiction(copy);
  assert.equal(result.decision, 'FAIL');
  assert.equal(result.currentCounts.unknownAcknowledgements, 1);
  assert.equal(result.currentCounts.extraApplications, 1);
});
test('open observation and checkpoint records cannot fabricate effect receipts', () => {
  const copy = fixture('control-deliveries-only');
  copy.originals[0].checkpoints = fixture().originals[0].checkpoints;
  const result = detector.inspectFiction(copy);
  assert.equal(result.decision, 'HOLD');
  assert.equal(result.currentCounts.checkpointPosition, 3);
  assert.equal(result.currentCounts.confirmedApplications, 0);
  const positive = fixture();
  positive.originals[0].closure = 'open';
  assert.equal(detector.inspectFiction(positive).decision, 'HOLD');
});
test('repeated delivery observation is not another delivery attempt', () => {
  const copy = fixture();
  copy.originals[0].deliveries.push(structuredClone(copy.originals[0].deliveries[0]));
  const result = detector.inspectFiction(copy);
  assert.equal(result.decision, 'PASS');
  assert.equal(result.currentCounts.deliveryAttempts, 3);
  assert.equal(result.currentCounts.repeatedDeliveryObservations, 1);
});
test('sixteen originals are retained and seventeenth rejects instead of truncating', () => {
  const copy = fixture();
  copy.originals = Array.from({ length: 16 }, (_, index) => ({ ...structuredClone(copy.originals[0]),
    id: `original-${String(index + 1).padStart(3, '0')}` }));
  assert.equal(detector.inspectFiction(copy).counts.originals, 16);
  copy.originals.push({ ...structuredClone(copy.originals[0]), id: 'original-017' });
  invalid(detector.inspectFiction(copy));
});
test('128 observation bound is explicit, repeated records cannot evade it', () => {
  const copy = fixture();
  const record = copy.originals[0].applications[0];
  copy.originals[0].applications = Array.from({ length: 128 }, () => structuredClone(record));
  assert.equal(detector.inspectFiction(copy).valid, true);
  copy.originals[0].applications.push(structuredClone(record));
  invalid(detector.inspectFiction(copy));
});
test('retained cumulative application/delivery/checkpoint history cannot be rewritten', () => {
  const copy = fixture('control-absence-retry');
  copy.originals[1].applications.splice(0, 1);
  invalid(detector.inspectFiction(copy));
  const other = fixture('control-retry');
  other.originals[1].deliveries[0].id = 'delivery-099';
  invalid(detector.inspectFiction(other));
});
test('C029 sixteen-command bound rejects a longer valid C023 journal without losing it', () => {
  let state = ledger.create({ jobId: 'job-long', workVersion: 'profile-effects/1', profileId: 'synthetic-001', implementation: 'v1' });
  state = ledger.apply(state, { type: 'run', interruption: 'unknown-ack', effectIndex: 0 });
  for (let index = 0; index < 16; index++) state = ledger.apply(state, {
    type: 'reconcile', effectKey: state.plan.effects[0].key, observation: 'still-unknown'
  });
  const saved = JSON.stringify(state);
  assert.equal(detector.inspectModel(state).code, 'MODEL_HISTORY_LIMIT_RETAINED');
  assert.equal(JSON.stringify(state), saved);
  assert.equal(ledger.inspect(state).attempts.length, 1);
});
test('all inspection outputs are detached recursively immutable data', () => {
  const copy = fixture();
  const result = detector.inspectFiction(copy);
  const saved = JSON.stringify(result);
  copy.originals[0].applications.pop();
  assert.equal(JSON.stringify(result), saved);
  assert.throws(() => { result.originals[0].effects[0].status = 'actual'; }, TypeError);
  assert.throws(() => result.originals.push({}), TypeError);
});
test('public APIs reject additional verdict/provenance/eligibility arguments', () => {
  invalid(detector.inspectSource('control-one', true));
  invalid(detector.inspectFiction(fixture(), { eligible: true }));
  invalid(detector.inspectModel({}, true));
  invalid(detector.inspectFictionJson('{}', true));
  invalid(detector.inspectCandidate('{}', 'control-one', { provenance: 'actual' }));
  invalid(detector.compare('control-retry', true));
  assert.throws(() => detector.sourceJson('control-one', true), /NO_SOURCE_OVERRIDES/);
});
test('paths, URLs, no selection and unsupported schemas cannot select a source', () => {
  for (const id of ['', '..\\C023\\ledger.js', 'https://example.invalid/', 'control-healthy', null]) invalid(detector.inspectSource(id));
  const copy = fixture();
  copy.schema = 'native-external-receipts/1';
  invalid(detector.inspectFiction(copy));
});
