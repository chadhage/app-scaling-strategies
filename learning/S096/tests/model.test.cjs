'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('..\\model.js');

function fixture(overrides = {}) {
  return {
    topology: 'shared',
    productionWorkers: 1,
    candidateWorkers: 1,
    slots: 2,
    productionDemand: 70,
    warmDemand: 40,
    dependencyCapacity: 100,
    journeyBudgetMs: 120,
    warmupBudgetMs: 160,
    coverage: 'complete',
    ...overrides,
  };
}

test('slots never add compute to a shared plan', () => {
  const state = model.warm(model.createState(), fixture());
  assert.equal(state.current.metrics.totalComputeUnits, 100, 'Adding warming slots must not create compute');
});

const run = (overrides) => model.warm(model.createState(), fixture(overrides)).current;
const rejects = (operation, code) => assert.throws(operation, (error) => error.code === code);

test('default competing slots overload shared production and count slow 200s as interruptions', () => {
  const result = run();
  assert.equal(result.verdict, 'failure');
  assert.equal(result.verification, 'fail');
  assert.equal(result.metrics.productionPlanDemand, 150);
  assert.equal(result.metrics.productionHeadroom, -50);
  assert.equal(result.metrics.addedComputeUnits, 0);
  assert.equal(result.metrics.slotAddedComputeUnits, 0);
  assert.deepEqual(result.productionTrace.map((row) => row.latencyMs), [180, 184, 188, 192]);
  assert.ok(result.productionTrace.every((row) => row.httpStatus === 200 && row.retainedState && row.effectCount === 1));
  assert.deepEqual(result.production, { attempted: 4, successful: 0, interrupted: 4, unknown: 0 });
  assert.equal(result.warming.notReady, 2);
  assert.equal(result.impact, 'interrupted-production');
  assert.equal(result.admission, 'blocked-before-exposure');
});

test('only explicitly added shared workers provide more compute and overlap headroom', () => {
  const result = run({ productionWorkers: 2 });
  assert.equal(result.verdict, 'success');
  assert.equal(result.metrics.totalComputeUnits, 200);
  assert.equal(result.metrics.addedComputeUnits, 100);
  assert.equal(result.metrics.productionHeadroom, 50);
  assert.deepEqual(result.productionTrace.map((row) => row.latencyMs), [80, 84, 88, 92]);
  assert.equal(result.warming.ready, 2);
  assert.equal(result.impact, 'production-preserved-no-transition');
});

test('separate candidate compute isolates production but still has its own competing slots', () => {
  const result = run({ topology: 'separate' });
  assert.equal(result.verdict, 'success');
  assert.equal(result.metrics.productionCapacityUnits, 100);
  assert.equal(result.metrics.candidateCapacityUnits, 100);
  assert.equal(result.metrics.totalComputeUnits, 200);
  assert.equal(result.metrics.addedComputeUnits, 100);
  assert.equal(result.metrics.productionHeadroom, 30);
  assert.equal(result.metrics.candidateHeadroom, 20);
  assert.equal(result.metrics.dependencyHeadroom, 20);
  assert.deepEqual(result.warmTrace.map((row) => row.latencyMs), [100, 103]);
});

test('unused candidate worker control cannot manufacture compute in shared placement', () => {
  assert.equal(run({ candidateWorkers: 3 }).metrics.totalComputeUnits, 100);
  assert.equal(run({ candidateWorkers: 3 }).metrics.candidateCapacityUnits, 0);
  assert.equal(run({ topology: 'separate', candidateWorkers: 3 }).metrics.totalComputeUnits, 400);
});

test('separate plans cannot hide a shared dependency bottleneck', () => {
  const result = run({ topology: 'separate', dependencyCapacity: 60 });
  assert.equal(result.metrics.dependencyDemand, 80);
  assert.equal(result.metrics.dependencyHeadroom, -20);
  assert.equal(result.gates.compute, 'pass');
  assert.equal(result.gates.dependency, 'fail');
  assert.equal(result.verdict, 'failure');
  assert.deepEqual(result.production, { attempted: 4, successful: 1, interrupted: 3, unknown: 0 });
  assert.deepEqual(result.productionTrace.map((row) => row.latencyMs), [120, 124, 128, 132]);
  assert.equal(result.warming.ready, 0);
});

test('saturated candidate plan safely blocks admission while production is preserved', () => {
  const result = run({ topology: 'separate', slots: 4, dependencyCapacity: 200 });
  assert.equal(result.metrics.candidateHeadroom, -60);
  assert.equal(result.metrics.productionHeadroom, 30);
  assert.equal(result.production.successful, 4);
  assert.equal(result.verdict, 'failure');
  assert.equal(result.impact, 'safe-abort-before-exposure');
  assert.equal(result.warming.notReady, 4);
});

test('capacity is observed, not inferred from configured compute', () => {
  const result = run({ topology: 'separate', coverage: 'missing-capacity' });
  assert.equal(result.metrics.configuredTotalComputeUnits, 200);
  for (const key of ['totalComputeUnits', 'addedComputeUnits', 'productionCapacityUnits', 'candidateCapacityUnits', 'productionHeadroom', 'candidateHeadroom', 'dependencyCapacityUnits', 'dependencyHeadroom']) {
    assert.equal(result.metrics[key], null);
  }
  assert.equal(result.verdict, 'unknown');
  assert.equal(result.verification, 'unverified');
  assert.equal(result.production.successful, 4);
  assert.equal(result.warming.unknown, 2);
  assert.match(result.gaps.join(' '), /configuration is not evidence/);
});

test('missing production observations remain four unknown attempts', () => {
  const result = run({ topology: 'separate', coverage: 'missing-journeys' });
  assert.equal(result.verdict, 'unknown');
  assert.deepEqual(result.production, { attempted: 4, successful: 0, interrupted: 0, unknown: 4 });
  assert.ok(result.productionTrace.every((row) => row.latencyMs === null && row.httpStatus === null && row.effectCount === null));
  assert.equal(result.admission, 'blocked-before-exposure');
});

test('missing warm-up observations cannot mark a candidate ready', () => {
  const result = run({ topology: 'separate', coverage: 'missing-warmup' });
  assert.equal(result.verdict, 'unknown');
  assert.equal(result.warming.unknown, 2);
  assert.equal(result.warming.ready, 0);
  assert.equal(result.gates.compute, 'pass');
  assert.equal(result.production.successful, 4);
});

test('known journey failure dominates missing capacity without deleting the uncertainty', () => {
  const result = run({ coverage: 'missing-capacity' });
  assert.equal(result.verdict, 'failure');
  assert.equal(result.gates.compute, 'unknown');
  assert.equal(result.production.interrupted, 4);
  assert.ok(result.gaps.length);
});

test('inclusive budgets and exact zero headroom pass but lower budgets interrupt', () => {
  const result = run({ topology: 'separate', productionDemand: 100, warmDemand: 50, dependencyCapacity: 80, journeyBudgetMs: 92, warmupBudgetMs: 103 });
  assert.equal(result.verdict, 'success');
  assert.equal(result.metrics.productionHeadroom, 0);
  assert.equal(result.metrics.candidateHeadroom, 0);
  assert.equal(result.metrics.dependencyHeadroom, 0);
  assert.equal(run({ topology: 'separate', journeyBudgetMs: 91 }).production.interrupted, 1);
  assert.equal(run({ topology: 'separate', warmupBudgetMs: 102 }).warming.notReady, 1);
});

test('production checks never count as migrated journeys or a 100-percent transition rate', () => {
  for (const overrides of [{}, { topology: 'separate' }, { topology: 'separate', coverage: 'missing-journeys' }]) {
    const result = run(overrides);
    assert.deepEqual(result.transitions, { attempted: 0, successful: 0, interrupted: 0, unknown: 0, rate: null });
    assert.ok(result.productionTrace.every((row) => !row.enteredCandidate));
  }
});

test('only authentic immutable state and valid phase permit a warm action', () => {
  const ready = model.createState();
  const measured = model.warm(ready, fixture());
  for (const fake of [null, undefined, {}, { ...ready }, { ...measured }, 42, []]) {
    rejects(() => model.warm(fake, fixture()), 'ERR_STATE');
    rejects(() => model.reset(fake), 'ERR_STATE');
    rejects(() => model.totals(fake), 'ERR_STATE');
  }
  rejects(() => model.warm(measured, fixture()), 'ERR_STATE');
  assert.equal(measured.history.length, 1);
  assert.equal(ready.history.length, 0);
  assert.throws(() => { measured.phase = 'ready'; }, TypeError);
  assert.throws(() => { measured.current.metrics.totalComputeUnits = 999; }, TypeError);
  assert.throws(() => { measured.history.pop(); }, TypeError);
});

test('malformed schemas, accessors and unexpected fields cannot become evidence', () => {
  const ready = model.createState();
  const omitted = fixture(); delete omitted.slots;
  const accessor = fixture();
  Object.defineProperty(accessor, 'slots', { get() { throw new Error('Getter must not execute'); }, enumerable: true });
  const hidden = fixture(); Object.defineProperty(hidden, 'slots', { value: 2, enumerable: false });
  const symbol = fixture(); symbol[Symbol('extra')] = 1;
  for (const config of [null, undefined, [], 'shared', Object.create(null), Object.create(fixture()), omitted, accessor, hidden, symbol, fixture({ extra: 1 }), fixture({ topology: '<script>' }), fixture({ coverage: 'live-azure' })]) {
    rejects(() => model.warm(ready, config), 'ERR_INPUT');
    assert.equal(ready.history.length, 0);
  }
});

test('every numeric input enforces integer type and both declared bounds', () => {
  for (const [key, [minimum, maximum]] of Object.entries(model.limits)) {
    for (const invalid of [minimum - 1, maximum + 1, 1.5, NaN, Infinity, '1', true, null, undefined, Number.MAX_SAFE_INTEGER]) {
      rejects(() => run({ [key]: invalid }), 'ERR_INPUT');
    }
    assert.equal(run({ [key]: minimum }).config[key], minimum);
    assert.equal(run({ [key]: maximum }).config[key], maximum);
  }
});

test('configuration is copied and complete traces are deeply frozen', () => {
  const input = fixture();
  const state = model.warm(model.createState(), input);
  input.slots = 4;
  assert.equal(state.current.config.slots, 2);
  assert.throws(() => { state.current.config.slots = 4; }, TypeError);
  assert.throws(() => { state.current.productionTrace[0].outcome = 'successful'; }, TypeError);
  assert.throws(() => { model.defaults.slots = 999; }, TypeError);
});

test('reset preserves failed and unknown history, budgets and the six-run allowance', () => {
  let state = model.createState();
  for (const overrides of [{}, { topology: 'separate' }, { topology: 'separate', coverage: 'missing-journeys' }]) {
    state = model.warm(state, fixture(overrides));
    state = model.reset(state);
    assert.equal(state.current, null);
    assert.equal(state.phase, 'ready');
  }
  assert.deepEqual(state.history.map((item) => item.verdict), ['failure', 'success', 'unknown']);
  assert.deepEqual(model.totals(state), { runs: 3, attempted: 12, successful: 4, interrupted: 4, unknown: 4, successfulTransitions: 0 });
  assert.equal(state.history[0].config.journeyBudgetMs, 120);
  while (state.history.length < model.MAX_RUNS) state = model.reset(model.warm(state, fixture({ topology: 'separate' })));
  const before = JSON.stringify(state);
  rejects(() => model.warm(state, fixture()), 'ERR_LIMIT');
  assert.equal(JSON.stringify(state), before);
  assert.equal(state.history.length, 6);
  assert.equal(model.totals(state).interrupted, 4);
  assert.equal(model.totals(state).unknown, 4);
});

test('all bounded placement and coverage fixtures conserve production and warming outcomes', () => {
  for (const topology of ['shared', 'separate']) {
    for (const coverage of ['complete', 'missing-capacity', 'missing-journeys', 'missing-warmup']) {
      for (const slots of [1, 4]) {
        const result = run({ topology, coverage, slots });
        const p = result.production;
        const w = result.warming;
        assert.equal(p.attempted, p.successful + p.interrupted + p.unknown);
        assert.equal(w.attempted, w.ready + w.notReady + w.unknown);
        if (coverage !== 'complete') assert.notEqual(result.verdict, 'success');
      }
    }
  }
});
