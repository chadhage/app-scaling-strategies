'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
const choice = {
  gaSelector: 'build-1-only', previewSelector: 'build-2-only',
  routing: 'cohort-gateway', fixture: 'compatible',
};
const command = (action, overrides = {}) => ({ action, ...choice, ...overrides });
const run = (overrides = {}, actions = ['inspect', 'route', 'verify']) =>
  actions.reduce((state, action) => model.transition(state, command(action, overrides)), model.createState());
const copy = (value) => JSON.parse(JSON.stringify(value));
const typed = (code) => (failure) => failure instanceof TypeError && failure.code === code;

test('version-qualified GA and preview selectors independently pass inspection', () => {
  const baseline = model.createState();
  const inspected = model.transition(baseline, {
    action: 'inspect', gaSelector: 'build-1-only', previewSelector: 'build-2-only',
    routing: 'cohort-gateway', fixture: 'compatible',
  });
  assert.equal(inspected.topology.status, 'passed');
  assert.equal(inspected.traffic.status, 'unknown');
  assert.equal(inspected.journeys.status, 'unknown');
  assert.equal(inspected.authorization.status, 'unknown');
  assert.equal(baseline.history.length, 0);
});

test('complete finite rehearsal preserves separate software builds and the same API contract', () => {
  const state = run();
  assert.deepEqual(state.traffic.receipts.map((receipt) => receipt.observedSoftwareVersion), ['build-1', 'build-2']);
  assert.deepEqual(state.journeys.items.map((item) => item.responseApiContract), ['profile-v1', 'profile-v1']);
  for (const journey of state.journeys.items) {
    assert.equal(journey.principalBefore, journey.principalAfter);
    assert.equal(journey.sessionBefore, journey.sessionAfter);
    assert.equal(journey.stateAfter, 'cart:3');
    assert.deepEqual(journey.payload, { displayName: 'Fictional Learner', cartItems: 3 });
    assert.equal(journey.effectCount, 1);
    assert.equal(journey.completed, true);
    assert.equal(journey.originalBudgetMs, 400);
    assert.ok(journey.elapsedMs <= journey.originalBudgetMs);
    assert.deepEqual(journey.steps.map((step) => step.status), Array(5).fill('passed'));
  }
  assert.equal(state.authorization.probes.length, 8);
  assert.deepEqual(state.authorization.probes.filter((probe) => probe.audience === 'GA')
    .map((probe) => [probe.observedHttpStatus, probe.candidateReached]), Array(4).fill([403, false]));
  assert.deepEqual(state.authorization.probes.filter((probe) => probe.audience === 'preview')
    .map((probe) => [probe.observedHttpStatus, probe.candidateReached]), Array(4).fill([200, true]));
  assert.equal(model.summarize(state).status, 'passed');
  assert.equal(model.summarize(state).attempts, 2);
  assert.equal(model.summarize(state).passed, 2);
});

test('selection and route receipts never imply complete journeys or authorization', () => {
  const state = run({}, ['inspect', 'route']);
  assert.equal(state.traffic.status, 'passed');
  assert.equal(state.journeys.status, 'unknown');
  assert.equal(state.authorization.status, 'unknown');
  assert.equal(model.summarize(state).status, 'unknown');
  assert.equal(model.summarize(state).attempts, 0);
});

for (const [field, value] of [
  ['gaSelector', 'app-only'], ['previewSelector', 'app-only'],
  ['gaSelector', 'build-2-only'], ['previewSelector', 'build-1-only'],
  ['gaSelector', 'no-match'], ['previewSelector', 'no-match'],
]) {
  test(`${field}=${value} is a measured failed selector, never a success`, () => {
    const state = run({ [field]: value });
    assert.equal(state.topology.status, 'failed');
    assert.equal(model.summarize(state).status, 'failed');
    const service = state.topology.services[field === 'gaSelector' ? 0 : 1];
    if (value === 'app-only') {
      assert.equal(service.matchedPods.length, 4);
      assert.deepEqual(service.matchedBuilds, ['build-1', 'build-2']);
      assert.match(service.note, /mixes GA and private preview/);
    }
    if (value === 'no-match') assert.equal(service.matchedPods.length, 0);
  });
}

test('mixed GA selector cannot conceal observed private-preview leakage', () => {
  const state = run({ gaSelector: 'app-only' });
  assert.equal(state.traffic.receipts[0].observedSoftwareVersion, 'build-2');
  assert.equal(state.traffic.receipts[0].observedService, 'fictional-GA-service');
  assert.equal(state.traffic.status, 'failed');
  assert.equal(state.authorization.routeLeak, true);
  assert.equal(state.authorization.status, 'failed');
  assert.equal(state.journeys.items[0].authorized, false);
});

test('zero GA traffic selection to preview does not authorize private callback access', () => {
  const state = run({ fixture: 'private-preview-leak' });
  assert.equal(state.topology.status, 'passed');
  assert.equal(state.traffic.status, 'passed');
  assert.equal(state.traffic.receipts[0].observedSoftwareVersion, 'build-1');
  assert.equal(state.journeys.status, 'passed');
  assert.equal(state.authorization.status, 'failed');
  const leak = state.authorization.probes.find((probe) => probe.entryPath === 'preview-callback' && probe.audience === 'GA');
  assert.equal(leak.observedHttpStatus, 200);
  assert.equal(leak.candidateReached, true);
  assert.equal(leak.status, 'failed');
  assert.equal(model.summarize(state).status, 'failed');
});

for (const fixture of ['contract-break', 'state-loss', 'slow-200']) {
  test(`${fixture}: correct build and HTTP 200 cannot certify a complete journey`, () => {
    const state = run({ fixture });
    const preview = state.journeys.items[1];
    assert.equal(state.traffic.status, 'passed');
    assert.equal(preview.observedSoftwareVersion, 'build-2');
    assert.equal(preview.httpStatus, 200);
    assert.equal(preview.status, 'failed');
    assert.equal(state.authorization.status, 'passed');
    assert.equal(model.summarize(state).passed, 1);
    assert.equal(model.summarize(state).failed, 1);
    if (fixture === 'contract-break') {
      assert.equal(preview.responseApiContract, 'profile-v2-breaking');
      assert.equal(Object.hasOwn(preview.payload, 'displayName'), false);
      assert.equal(preview.payload.fullName, 'Fictional Learner');
      assert.equal(preview.steps.find((step) => step.step === 'profile').status, 'failed');
    }
    if (fixture === 'state-loss') assert.equal(preview.stateAfter, 'cart:0');
    if (fixture === 'slow-200') assert.equal(preview.elapsedMs, 450);
  });
}

for (const fixture of ['incomplete-journey', 'unobserved-route']) {
  test(`${fixture}: both attempts remain counted and missing completion is unknown`, () => {
    const state = run({ fixture });
    const summary = model.summarize(state);
    assert.equal(summary.status, 'unknown');
    assert.deepEqual([summary.attempts, summary.passed, summary.failed, summary.unknown], [2, 1, 0, 1]);
    assert.equal(state.journeys.items[1].completed, null);
    if (fixture === 'incomplete-journey') assert.equal(state.traffic.receipts[1].httpStatus, 200);
    else {
      assert.equal(state.traffic.receipts[1].desiredService, 'fictional-preview-service');
      assert.equal(state.traffic.receipts[1].observedSoftwareVersion, null);
      assert.equal(state.traffic.receipts[1].observedPod, null);
    }
  });
}

test('missing one private-path authorization observation cannot pass', () => {
  const state = run({ fixture: 'authorization-unknown' });
  assert.equal(state.journeys.status, 'passed');
  assert.equal(state.authorization.probes.length, 8);
  assert.equal(state.authorization.status, 'unknown');
  assert.equal(state.authorization.probes.filter((probe) => probe.status === 'unknown').length, 1);
  assert.equal(model.summarize(state).status, 'unknown');
});

test('actual wrong backend is not replaced by the desired preview destination', () => {
  const state = run({ fixture: 'wrong-backend' });
  assert.equal(state.traffic.receipts[1].desiredService, 'fictional-preview-service');
  assert.equal(state.traffic.receipts[1].observedService, 'fictional-GA-service');
  assert.equal(state.traffic.receipts[1].observedSoftwareVersion, 'build-1');
  assert.equal(state.traffic.status, 'failed');
  assert.equal(model.summarize(state).status, 'failed');
});

for (const [routing, expected] of [['deployments-only', 'failed'], ['unverified-gateway', 'unknown']]) {
  test(`${routing} cannot invent observed weighted or cohort routing`, () => {
    const state = run({ routing });
    assert.equal(state.topology.capability.status, expected);
    assert.equal(state.traffic.status, 'unknown');
    assert.ok(state.traffic.receipts.every((receipt) => receipt.observedPod === null));
    assert.equal(model.summarize(state).status, expected);
    if (routing === 'deployments-only') assert.match(state.topology.capability.note, /alone do not supply weighted/);
  });
}

test('premature valid actions retain failed holds with recovery guidance', () => {
  let state = model.transition(model.createState(), command('verify'));
  assert.equal(state.history.length, 1);
  assert.equal(state.history[0].held, true);
  assert.equal(model.summarize(state).status, 'failed');
  assert.match(state.history[0].note, /inspect these exact controls first/);
  for (const action of ['inspect', 'route', 'verify']) state = model.transition(state, command(action));
  assert.equal(model.summarize(state).status, 'passed');
  assert.equal(state.history[0].stageStatus, 'failed');
});

test('changed controls require reinspection and never reuse stale positive results', () => {
  let state = run();
  const previous = copy(state.history);
  state = model.transition(state, command('route', { fixture: 'state-loss' }));
  assert.equal(state.history.at(-1).held, true);
  assert.equal(model.summarize(state).status, 'failed');
  state = model.transition(state, command('inspect', { fixture: 'state-loss' }));
  assert.equal(state.traffic.status, 'unknown');
  assert.equal(state.journeys.status, 'unknown');
  assert.equal(state.authorization.status, 'unknown');
  assert.deepEqual(state.history.slice(0, 3), previous);
});

test('reobserving routes invalidates prior journey/access evidence, with retained history', () => {
  const state = model.transition(run(), command('route'));
  assert.equal(state.history.length, 4);
  assert.equal(state.history[2].measured.journeys, 'passed');
  assert.equal(state.journeys.status, 'unknown');
  assert.equal(state.authorization.status, 'unknown');
  assert.equal(model.summarize(state).status, 'unknown');
});

test('all twelve actions stay retained; the thirteenth is typed and nonmutating', () => {
  let state = model.createState();
  for (let i = 0; i < 12; i++) state = model.transition(state, command('inspect'));
  const before = copy(state);
  assert.equal(state.history.length, 12);
  assert.deepEqual(state.history.map((event) => event.sequence), Array.from({ length: 12 }, (_, i) => i + 1));
  assert.throws(() => model.transition(state, command('inspect')), typed('ERR_LIMIT'));
  assert.deepEqual(copy(state), before);
  assert.equal(model.createState().history.length, 0);
});

test('immutable deterministic outputs can be replayed without trusting supplied status', () => {
  const state = run();
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.history[0].command));
  assert.ok(Object.isFrozen(model.DATA.SELECTORS['app-only']));
  assert.throws(() => { state.journeys.status = 'passed'; }, TypeError);
  assert.deepEqual(model.summarize(copy(state)), model.summarize(state));
  assert.deepEqual(run(), run());
});

test('exact command tokens, fields and types reject coercion and arbitrary selectors', () => {
  const invalid = [
    null, undefined, true, 1, [], 'inspect',
    { ...command('inspect'), action: 'Inspect' }, { ...command('inspect'), action: 'deploy' },
    { ...command('inspect'), gaSelector: 'app=profile-lesson' },
    { ...command('inspect'), gaSelector: ' app-only' },
    { ...command('inspect'), previewSelector: '__proto__' },
    { ...command('inspect'), fixture: 'compatible ' }, { ...command('inspect'), routing: 1 },
    { ...command('inspect'), fixture: new String('compatible') },
    { ...command('inspect'), identity: 'anything' }, { ...command('inspect'), routing: undefined },
    Object.create(command('inspect')), Object.assign(Object.create(null), command('inspect')),
  ];
  const state = run({}, ['inspect']);
  const before = copy(state);
  for (const candidate of invalid) {
    assert.throws(() => model.transition(state, candidate), typed('ERR_INPUT'));
    assert.deepEqual(copy(state), before);
  }
  const missing = command('inspect');
  delete missing.fixture;
  assert.throws(() => model.transition(state, missing), typed('ERR_INPUT'));
});

test('getters, hidden/symbol fields and cycles are rejected without executing accessors', () => {
  let reads = 0;
  const getter = command('inspect');
  Object.defineProperty(getter, 'fixture', { enumerable: true, get() { reads++; return 'compatible'; } });
  const hidden = command('inspect');
  Object.defineProperty(hidden, 'extra', { value: 'hidden' });
  const symbol = { ...command('inspect'), [Symbol('extra')]: 'hidden' };
  const cycle = command('inspect');
  cycle.fixture = cycle;
  for (const candidate of [getter, hidden, symbol, cycle]) {
    assert.throws(() => model.transition(model.createState(), candidate), typed('ERR_INPUT'));
  }
  const badState = copy(run());
  Object.defineProperty(badState, 'traffic', { enumerable: true, get() { reads++; return {}; } });
  assert.throws(() => model.summarize(badState), typed('ERR_STATE'));
  assert.equal(reads, 0);
});

test('forged state, observed data and history fail strict deterministic replay', () => {
  const state = run();
  const mutations = [
    (value) => { value.schemaVersion = '1'; },
    (value) => { value.extra = true; },
    (value) => { value.history[0].sequence = 2; },
    (value) => { value.history[0].stageStatus = 'unknown'; },
    (value) => { value.history[2].command.fixture = 'state-loss'; },
    (value) => { value.traffic.receipts[0].observedSoftwareVersion = 'build-2'; },
    (value) => { value.journeys.items[1].elapsedMs = 1; },
    (value) => { value.authorization.probes[0].candidateReached = true; },
    (value) => { value.history.pop(); },
    (value) => { delete value.history[1]; },
    (value) => { value.history.extra = 1; },
    (value) => { Object.setPrototypeOf(value, { extra: 1 }); },
  ];
  for (const mutate of mutations) {
    const bad = copy(state);
    mutate(bad);
    assert.throws(() => model.transition(bad, command('inspect')), typed('ERR_STATE'));
    assert.throws(() => model.summarize(bad), typed('ERR_STATE'));
  }
  for (const bad of [null, undefined, {}, [], NaN, Infinity, { schemaVersion: 1, history: [] }]) {
    assert.throws(() => model.summarize(bad), typed('ERR_STATE'));
  }
});
