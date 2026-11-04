'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('./model.js');

test('shared slots consume one unchanged fictional compute pool after extra content', () => {
  let state = model.transition(model.initialState(), {
    type: 'compare', strategy: 'shared-slots', fixture: 'healthy',
  });
  assert.equal(model.project(state).phase, 'compared');
  assert.equal(model.project(state).totalComputeUnits, 24);
  state = model.transition(state, { type: 'add-placement' });
  const result = model.project(state);
  assert.equal(result.planCount, 1);
  assert.equal(result.workers, 2);
  assert.equal(result.totalComputeUnits, 24);
  assert.equal(result.fictionalCostUnits, 2);
  assert.equal(result.placements, 3);
});

test('separate plans provide two compute pools, not automatic fault-domain qualification', () => {
  const state = model.transition(model.initialState(), {
    type: 'compare', strategy: 'separate-plans', fixture: 'healthy',
  });
  const result = model.project(state);
  assert.equal(result.phase, 'compared');
  assert.equal(result.planCount, 2);
  assert.equal(result.totalComputeUnits, 48);
  assert.equal(result.computeIsolated, true);
  assert.equal(result.independentDependencies, false);
  assert.equal(result.independentFaultDomains, 'unverified');
});

const compare = (strategy = 'separate-plans', fixture = 'healthy') => model.transition(model.initialState(), {
  type: 'compare', strategy, fixture,
});
const step = (state, type) => model.transition(state, { type });
const routed = (strategy = 'separate-plans', fixture = 'healthy') => model.transition(
  step(compare(strategy, fixture), 'warm'), { type: 'route', percent: 100 },
);

test('extra content in either existing plan preserves capacity, billing units and isolation claims', () => {
  for (const strategy of model.STRATEGIES) {
    const before = model.project(compare(strategy));
    const after = model.project(step(compare(strategy), 'add-placement'));
    assert.equal(after.workers, before.workers);
    assert.equal(after.planCount, before.planCount);
    assert.equal(after.totalComputeUnits, before.totalComputeUnits);
    assert.equal(after.fictionalCostUnits, before.fictionalCostUnits);
    assert.equal(after.placements, 3);
    assert.equal(after.latestData.addedComputeUnits, 0);
    assert.equal(after.independentDependencies, false);
    assert.equal(after.independentFaultDomains, 'unverified');
    assert.equal(after.slotLabels.length, strategy === 'shared-slots' ? 3 : 0);
  }
});

test('the same overlap exceeds the shared pool but fits two independent compute pools', () => {
  const shared = model.project(step(step(compare('shared-slots', 'overlap'), 'add-placement'), 'warm'));
  assert.equal(shared.phase, 'held');
  assert.equal(shared.warmUp, 'failed');
  assert.equal(shared.safeAborts, 1);
  assert.equal(shared.attempted, 0);
  assert.equal(shared.requestedPercent, 0);
  assert.equal(shared.classification, 'negative');
  assert.match(shared.message, /28 exceeds 24/);
  const separate = model.project(step(compare('separate-plans', 'overlap'), 'warm'));
  assert.equal(separate.phase, 'ready');
  assert.equal(separate.warmUp, 'passed');
  assert.equal(separate.latestData.blueDemandUnits, 18);
  assert.equal(separate.latestData.candidateWarmDemandUnits, 10);
});

for (const strategy of model.STRATEGIES) {
  test(`${strategy}: HTTP 200 without initialized candidate safely blocks all exposure`, () => {
    const state = step(compare(strategy, 'warmup-only'), 'warm');
    const result = model.project(state);
    assert.equal(result.latestData.httpStatus, 200);
    assert.equal(result.latestData.initialized, false);
    assert.equal(result.phase, 'held');
    assert.equal(result.userOutcome, 'Safe abort before exposure');
    assert.equal(result.attempted, 0);
    assert.throws(() => model.transition(state, { type: 'route', percent: 100 }), /meaningful warm-up/);
  });
}

test('shared native recycling interrupts existing work even though old content is retained', () => {
  const state = routed('shared-slots');
  const result = model.project(state);
  assert.equal(result.phase, 'exposed-held');
  assert.equal(result.classification, 'negative');
  assert.equal(result.requestedPercent, 100);
  assert.equal(result.effectivePercent, 100);
  assert.deepEqual([result.attempted, result.passed, result.failed, result.unknown], [4, 2, 2, 0]);
  assert.equal(result.latestData.nativeSwapRecycling, true);
  assert.match(result.receipts[2].reason, /recycling abandoned existing work despite retained slot/);
  assert.equal(result.drainComplete, false);
  const retained = JSON.stringify(state);
  assert.throws(() => step(state, 'drain'), /not an application-controlled drain/);
  assert.throws(() => step(state, 'retain'), /completed drain/);
  assert.throws(() => step(state, 'retire'), /completed drain/);
  assert.equal(JSON.stringify(state), retained);
});

test('separate external routing completes old work before rollback retention and retirement', () => {
  let state = routed();
  let result = model.project(state);
  assert.equal(result.phase, 'exposed');
  assert.equal(result.outstandingWork, 2);
  assert.equal(result.classification, 'positive');
  assert.equal(result.userOutcome, 'In progress: old work remains');
  assert.deepEqual([result.attempted, result.passed, result.failed, result.unknown], [2, 2, 0, 0]);
  assert.throws(() => step(state, 'retire'), /completed drain/);
  state = step(state, 'drain');
  result = model.project(state);
  assert.equal(result.phase, 'retained');
  assert.equal(result.outstandingWork, 0);
  assert.equal(result.pinnedSessions, 0);
  assert.equal(result.drainComplete, true);
  assert.deepEqual([result.attempted, result.passed, result.failed, result.unknown], [4, 4, 0, 0]);
  assert.throws(() => step(state, 'retire'), /rollback-retention gates/);
  state = step(step(state, 'retain'), 'retire');
  result = model.project(state);
  assert.equal(result.phase, 'retired');
  assert.equal(result.userOutcome, 'Uninterrupted synthetic transition');
  assert.equal(result.retentionObserved, true);
  assert.equal(result.independentFaultDomains, 'unverified');
  assert.equal(result.independentDependencies, false);
  assert.equal(result.history.length, 6);
  for (const item of result.receipts) {
    assert.equal(item.sessionPreserved, true);
    assert.equal(item.businessState, model.DATA.expectedState);
    assert.equal(item.effectCount, 1);
    assert.equal(item.completed, true);
    assert.equal(item.latencyMs <= model.DATA.journeyBudgetMs, true);
    assert.equal(item.classification, 'positive');
  }
  assert.throws(() => step(state, 'retire'), /completed drain/);
});

const failures = [
  ['session-loss', 'negative', [2, 1, 1, 0], /required session/, 'sessionPreserved', false],
  ['missing-receipt', 'unknown', [2, 1, 0, 1], /receipt is missing/, 'observed', false],
  ['pinned-client', 'unknown', [2, 1, 0, 1], /blue success is not green migration/, 'observedEndpoint', model.DATA.blueEndpoint],
  ['dependency-outage', 'negative', [4, 0, 4, 0], /Shared dependency failure/, 'dependencyAvailable', false],
  ['platform-restart', 'negative', [4, 2, 2, 0], /cannot prevent a platform restart/, 'completed', false],
];
for (const [fixture, classification, counts, message, field, value] of failures) {
  test(`${fixture}: measured failed or unknown receipts cannot become uninterrupted completion`, () => {
    const state = routed('separate-plans', fixture);
    const result = model.project(state);
    assert.equal(result.classification, classification);
    assert.equal(result.phase, 'exposed-held');
    assert.deepEqual([result.attempted, result.passed, result.failed, result.unknown], counts);
    assert.match(result.message, message);
    assert.equal(result.receipts.some((item) => item[field] === value), true);
    assert.equal(result.computeIsolated, true);
    assert.equal(result.independentDependencies, false);
    assert.equal(result.independentFaultDomains, 'unverified');
    assert.throws(() => step(state, 'drain'), /without failed or unknown/);
    assert.throws(() => step(state, 'retire'), /completed drain/);
    assert.equal(model.project(state).history.at(-1).classification, classification);
  });
}

test('pending old work remains unknown, with no fabricated completion or retirement', () => {
  const state = step(routed('separate-plans', 'drain-pending'), 'drain');
  const result = model.project(state);
  assert.equal(result.classification, 'unknown');
  assert.equal(result.phase, 'exposed');
  assert.equal(result.outstandingWork, 2);
  assert.equal(result.drainComplete, false);
  assert.equal(result.latestData.completionObserved, false);
  assert.deepEqual([result.attempted, result.passed, result.failed, result.unknown], [2, 2, 0, 0]);
  assert.throws(() => step(state, 'retain'), /completed drain/);
  assert.throws(() => step(state, 'retire'), /completed drain/);
});

test('fixed choices cannot change mid-run and misplaced lifecycle commands do not mutate history', () => {
  const state = compare();
  const before = JSON.stringify(state);
  for (const command of [
    { type: 'compare', strategy: 'shared-slots', fixture: 'healthy' },
    { type: 'route', percent: 100 }, { type: 'drain' }, { type: 'retain' }, { type: 'retire' },
  ]) assert.throws(() => model.transition(state, command), RangeError);
  assert.equal(JSON.stringify(state), before);
  const extra = step(state, 'add-placement');
  assert.throws(() => step(extra, 'add-placement'), /Only one fixed extra/);
});

test('typed admission input accepts only the exact 100 string and number command', () => {
  assert.equal(model.parsePercent('100'), 100);
  for (const input of [100, null, undefined, {}, [], true, '', '100.0', ' 100', '100 ', '+100', '1e2', '99', '100x']) {
    assert.throws(() => model.parsePercent(input), TypeError, `Rejected ${String(input)}`);
  }
  const state = step(compare(), 'warm');
  for (const percent of ['100', 100.1, 0, -100, NaN, Infinity, null, true, new Number(100)]) {
    assert.throws(() => model.transition(state, { type: 'route', percent }), TypeError);
  }
  assert.equal(model.project(state).phase, 'ready');
});

test('closed commands reject arbitrary configuration, identifiers, actions and coerced inputs', () => {
  const invalid = [
    null, undefined, [], 'warm', { type: 'swap' }, { type: 'warm', native: true },
    { type: 'compare', strategy: 'shared-slots', fixture: 'healthy', compute: 500 },
    { type: 'compare', strategy: 'separate-plans', fixture: '__proto__' },
    { type: 'compare', strategy: 'separate-plans', fixture: 'constructor' },
    { type: 'compare', strategy: true, fixture: 'healthy' },
    { type: 'compare', strategy: 'https://example.invalid', fixture: 'healthy' },
    { type: 'compare', strategy: 'shared-slots', fixture: 'healthy', endpoint: 'live' },
    Object.assign(Object.create(null), { type: 'warm' }),
  ];
  for (const input of invalid) assert.throws(() => model.transition(model.initialState(), input), TypeError);
  let invoked = false;
  const accessor = { get type() { invoked = true; return 'warm'; } };
  assert.throws(() => model.transition(model.initialState(), accessor), TypeError);
  const symbolic = { type: 'warm', [Symbol('permission')]: true };
  assert.throws(() => model.transition(model.initialState(), symbolic), TypeError);
  assert.equal(invoked, false);
});

test('replay validates every state field and causal command, rejecting forged counters and accessor history', () => {
  for (const invalid of [
    null, [], { schemaVersion: '1', commands: [] }, { schemaVersion: 1, commands: [], failed: 0 },
    { schemaVersion: 1, commands: [{ type: 'retire' }] },
    { schemaVersion: 1, commands: [null] }, { schemaVersion: 1, commands: new Array(1) },
    { schemaVersion: 1, commands: [{ type: 'compare', strategy: 'separate-plans', fixture: 'healthy' }, { type: 'route', percent: 100 }] },
  ]) assert.throws(() => model.project(invalid));
  let invoked = false;
  const commands = [];
  Object.defineProperty(commands, '0', { get() { invoked = true; return { type: 'warm' }; } });
  assert.throws(() => model.project({ schemaVersion: 1, commands }), TypeError);
  const extras = [];
  extras.fake = true;
  assert.throws(() => model.project({ schemaVersion: 1, commands: extras }), TypeError);
  assert.equal(invoked, false);
});

test('fixtures, state and projected evidence are immutable and replay is deterministic', () => {
  const first = step(step(routed(), 'drain'), 'retain');
  const second = step(step(routed(), 'drain'), 'retain');
  assert.deepEqual(first, second);
  assert.deepEqual(model.project(first), model.project(second));
  assert.throws(() => { model.FIXTURES.healthy.blueDemand = 0; }, TypeError);
  assert.throws(() => { model.DATA.sharedPlans.push('live'); }, TypeError);
  assert.throws(() => { first.commands.push({ type: 'retire' }); }, TypeError);
  assert.throws(() => { model.project(first).history[0].classification = 'positive'; }, TypeError);
  assert.deepEqual(model.initialState(), { schemaVersion: 1, commands: [] });
});

test('bounded repeated incomplete observations retain all history and stop precisely at 24 actions', () => {
  let state = routed('separate-plans', 'drain-pending');
  while (state.commands.length < model.MAX_ACTIONS) state = step(state, 'drain');
  const result = model.project(state);
  assert.equal(result.history.length, 24);
  assert.equal(result.history[0].command.type, 'compare');
  assert.equal(result.history.at(-1).classification, 'unknown');
  assert.equal(result.outstandingWork, 2);
  assert.throws(() => step(state, 'drain'), /24-action limit/);
  const invalid = { schemaVersion: 1, commands: [...state.commands, { type: 'drain' }] };
  assert.throws(() => model.project(invalid), TypeError);
});

test('all declared fixed conditions preserve complete receipt accounting and no qualification', () => {
  for (const strategy of model.STRATEGIES) {
    for (const fixture of Object.keys(model.FIXTURES)) {
      let state = step(compare(strategy, fixture), 'warm');
      if (model.project(state).phase === 'ready') state = model.transition(state, { type: 'route', percent: 100 });
      const result = model.project(state);
      assert.equal(result.attempted, result.passed + result.failed + result.unknown);
      assert.equal(result.receipts.length, result.attempted);
      assert.equal(result.independentFaultDomains, 'unverified');
      assert.equal(result.independentDependencies, false);
      assert.equal(result.history.every((item, index) => item.step === index + 1), true);
    }
  }
});
