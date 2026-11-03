'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createState, apply, FIXTURES, LIMITS } = require('../model.js');
const changed = (fixture = 'converged') => apply(createState(), { type: 'propagate', fixture });
const sampled = (fixture) => apply(changed(fixture), { type: 'sample' });
const completed = (fixture) => apply(sampled(fixture), { type: 'check' });

test('nominal 100 percent configuration cannot prove observed propagation or drain', () => {
  const initial = createState();
  const changed = apply(initial, { type: 'propagate', fixture: 'converged' });
  assert.equal(changed.active.desiredEpoch, 2);
  assert.equal(changed.active.desiredPercent, 100);
  assert.equal(changed.active.gates.propagation, 'unknown',
    'Nominal configuration is not observed propagation evidence.');
  assert.equal(changed.active.gates.drain, 'unknown');
  assert.equal(changed.active.result, 'unknown');
  assert.equal(changed.active.oldOrigin, 'retained');
  assert.deepEqual(initial, createState(), 'A command must not mutate its input state.');
});

test('a nominal-only check is unknown, retains the origin, and survives a later positive result', () => {
  const pending = changed();
  const checked = apply(pending, { type: 'check' });
  assert.equal(checked.active.decision, 'unverified');
  assert.equal(checked.active.result, 'unknown');
  assert.equal(checked.active.oldOrigin, 'retained');
  assert.equal(checked.active.phase, 'changed');
  assert.equal(checked.active.metrics.attempted, 0);
  assert.equal(checked.active.metrics.pending, 3);
  const observed = apply(checked, { type: 'sample' });
  assert.equal(observed.active.result, 'positive');
  assert.equal(observed.active.oldOrigin, 'retained', 'Sampling alone does not retire anything.');
  const done = apply(observed, { type: 'check' });
  assert.equal(done.active.oldOrigin, 'retired');
  assert.equal(done.active.decision, 'retired');
  assert.equal(done.history.length, 4);
  assert.deepEqual(done.history.slice(0, 2), checked.history);
  assert.equal(done.history[1].snapshot.decision, 'unverified');
});

const cases = [
  ['converged', 'positive', 'positive', 'positive', 'positive', 0, 3, 0, 0, 3, 'retired'],
  ['partial', 'negative', 'negative', 'positive', 'negative', 1, 3, 0, 0, 2, 'retained'],
  ['missing', 'unknown', 'unknown', 'unknown', 'unknown', null, 2, 0, 1, 2, 'retained'],
  ['draining', 'positive', 'negative', 'positive', 'negative', 2, 3, 0, 0, 3, 'retained'],
  ['slow', 'positive', 'positive', 'negative', 'negative', 0, 2, 1, 0, 3, 'retained'],
  ['failed', 'positive', 'positive', 'negative', 'negative', 0, 2, 1, 0, 3, 'retained'],
];
for (const [fixture, propagation, drain, journeys, result, work, successes, interruptions, unknown, migrated, origin] of cases) {
  test(`${fixture}: observed gates, user counts and old-origin retention are independent`, () => {
    const done = completed(fixture);
    assert.deepEqual(done.active.gates, { propagation, drain, journeys });
    assert.equal(done.active.result, result);
    assert.equal(done.active.oldOrigin, origin);
    assert.equal(done.active.oldWork, work);
    assert.equal(done.active.phase, 'complete');
    assert.equal(done.active.samples.length, 3);
    assert.deepEqual(done.active.metrics, {
      attempted: 3, observed: 3 - unknown, successful: successes,
      interrupted: interruptions, unknown, pending: 0, migrated,
    });
    assert.equal(successes + interruptions + unknown, done.active.metrics.attempted);
    assert.equal(done.history[0].snapshot.oldWork, null);
    assert.equal(done.history[0].snapshot.oldOrigin, 'retained');
    assert.equal(done.history[1].snapshot.oldOrigin, 'retained');
    assert.equal(done.history.length, 3);
  });
}

test('successful requests on an old effective route are not completed migration', () => {
  const active = completed('partial').active;
  assert.equal(active.desiredPercent, 100);
  assert.equal(active.metrics.successful, 3);
  assert.equal(active.metrics.interrupted, 0);
  assert.equal(active.metrics.migrated, 2);
  assert.equal(active.samples[1].effectiveEpoch, 1);
  assert.equal(active.samples[1].effectiveOrigin, 'origin-v1');
  assert.equal(active.gates.propagation, 'negative');
});

test('200 responses over the original budget still count as interruptions', () => {
  const active = completed('slow').active;
  assert.equal(active.samples[1].response, 200);
  assert.equal(active.samples[1].latencyMs, 180);
  assert.equal(LIMITS.latencyBudgetMs, 120);
  assert.equal(active.metrics.interrupted, 1);
  assert.equal(active.oldOrigin, 'retained');
});

test('six runs and at most 24 deterministic events retain all prior outcomes', () => {
  let state = createState();
  for (const fixture of Object.keys(FIXTURES)) {
    const previous = structuredClone(state.history);
    state = apply(state, { type: 'propagate', fixture });
    state = apply(state, { type: 'check' });
    state = apply(state, { type: 'sample' });
    state = apply(state, { type: 'check' });
    assert.deepEqual(state.history.slice(0, previous.length), previous);
  }
  assert.equal(state.runs, 6);
  assert.equal(state.history.length, 24);
  const before = structuredClone(state);
  assert.throws(() => apply(state, { type: 'propagate', fixture: 'converged' }), RangeError);
  assert.deepEqual(state, before);
  assert.equal(state.history[3].snapshot.result, 'positive');
  assert.equal(state.history[11].snapshot.result, 'unknown');
  assert.equal(state.history[23].snapshot.metrics.interrupted, 1);
});

test('the run limit is enforced even when the event limit has not been reached', () => {
  let state = createState();
  for (let run = 0; run < 6; run++) {
    state = apply(state, { type: 'propagate', fixture: 'converged' });
    state = apply(apply(state, { type: 'sample' }), { type: 'check' });
  }
  assert.equal(state.history.length, 18);
  assert.throws(() => apply(state, { type: 'propagate', fixture: 'partial' }), /six-run limit/);
});

test('out-of-order and repeated commands reject without mutation', () => {
  const pending = changed();
  const observed = sampled('converged');
  const done = completed('converged');
  const premature = apply(pending, { type: 'check' });
  for (const [state, command] of [
    [createState(), { type: 'sample' }],
    [createState(), { type: 'check' }],
    [pending, { type: 'propagate', fixture: 'partial' }],
    [observed, { type: 'sample' }],
    [done, { type: 'sample' }],
    [done, { type: 'check' }],
    [premature, { type: 'check' }],
  ]) {
    const before = structuredClone(state);
    assert.throws(() => apply(state, command));
    assert.deepEqual(state, before);
  }
});

test('commands use exact types and fields, not coercion or truthiness', () => {
  const bad = [
    undefined, null, true, false, 2, 'propagate', [], {},
    { type: true }, { type: 'SAMPLE' }, { type: 'retire' },
    { type: 'propagate' }, { type: 'propagate', fixture: 1 },
    { type: 'propagate', fixture: 'true' }, { type: 'propagate', fixture: '' },
    { type: 'propagate', fixture: 'converged', allConverged: true },
    { type: 'sample', fixture: 'converged' }, { type: 'check', force: true },
    Object.assign(Object.create(null), { type: 'propagate', fixture: 'converged' }),
  ];
  for (const command of bad) assert.throws(() => apply(createState(), command), TypeError);
  const accessor = { type: 'propagate' };
  Object.defineProperty(accessor, 'fixture', { enumerable: true, get() { throw new Error('Getter must not run.'); } });
  assert.throws(() => apply(createState(), accessor), TypeError);
  const symbolic = { type: 'propagate', fixture: 'converged', [Symbol('extra')]: 1 };
  assert.throws(() => apply(createState(), symbolic), TypeError);
});

test('forged optimistic state, snapshots, commands and counts cannot authorize retirement', () => {
  const state = sampled('missing');
  const forgeries = [
    (s) => { s.active.oldWork = 0; },
    (s) => { s.active.result = 'positive'; },
    (s) => { s.active.gates.propagation = 'positive'; },
    (s) => { s.active.samples[2].effectiveOrigin = 'origin-v2'; },
    (s) => { s.active.metrics.unknown = 0; },
    (s) => { s.history[0].snapshot.oldOrigin = 'retired'; },
    (s) => { s.history[1].command.type = 'check'; },
    (s) => { s.history[0].seq = 99; },
    (s) => { s.runs = true; },
    (s) => { s.version = '1'; },
    (s) => { s.extra = 'ignored'; },
    (s) => { s.history.reverse(); },
    (s) => { s.history = []; },
  ];
  for (const forge of forgeries) {
    const corrupt = structuredClone(state);
    forge(corrupt);
    const before = structuredClone(corrupt);
    assert.throws(() => apply(corrupt, { type: 'check' }));
    assert.deepEqual(corrupt, before);
  }
});

test('state data rejects accessors, hidden fields, symbols, cycles, sparse arrays and wrong primitives', () => {
  for (const state of [undefined, null, false, 'state', 1, [], { version: 1, runs: 0, active: null, history: '[]' }]) {
    assert.throws(() => apply(state, { type: 'check' }), TypeError);
  }
  const bad = [
    (s) => { s.history = new Array(1); },
    (s) => { s.history.extra = 1; },
    (s) => { s.active = s; },
    (s) => { s.runs = NaN; },
    (s) => { s.active = new Date(0); },
    (s) => { s[Symbol('extra')] = 1; },
    (s) => { Object.defineProperty(s, 'runs', { enumerable: true, get() { throw new Error('Do not execute state getters.'); } }); },
    (s) => { Object.defineProperty(s, 'extra', { value: true, enumerable: false }); },
  ];
  for (const corrupt of bad) {
    const state = createState();
    corrupt(state);
    assert.throws(() => apply(state, { type: 'check' }), TypeError);
  }
});

test('outputs and retained snapshots do not alias caller commands or frozen fictional data', () => {
  const command = { type: 'propagate', fixture: 'partial' };
  const before = createState();
  const next = apply(before, command);
  command.fixture = 'converged';
  assert.equal(next.history[0].command.fixture, 'partial');
  const observed = apply(next, { type: 'sample' });
  observed.active.samples[0].latencyMs = 999;
  assert.equal(observed.history[1].snapshot.samples[0].latencyMs, 85);
  assert.equal(FIXTURES.partial.samples[0].latencyMs, 85);
  assert.equal(next.active.samples.length, 0);
  assert.deepEqual(before, createState());
  assert.throws(() => { FIXTURES.partial.oldWork = 0; }, TypeError);
  assert.throws(() => { FIXTURES.converged.samples[0].effectiveEpoch = 1; }, TypeError);
});

test('JSON round-trip and property reordering preserve legitimate deterministic state', () => {
  const state = sampled('partial');
  const reordered = { history: state.history, active: state.active, runs: state.runs, version: state.version };
  assert.deepEqual(apply(JSON.parse(JSON.stringify(reordered)), { type: 'check' }), completed('partial'));
});
