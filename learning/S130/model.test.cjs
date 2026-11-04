'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('./model.js');
const clone = (value) => JSON.parse(JSON.stringify(value));
const load = (state, presetId) => model.execute(state, { type: 'load', presetId, version: 'v2' });
const run = (presetId, state = model.createState()) => model.execute(model.execute(load(state, presetId), { type: 'inspect' }), { type: 'measure' });
function rejectsWithoutMutation(state, command, code) {
  const before = JSON.stringify(state);
  assert.throws(() => model.execute(state, command), (error) => error.code === code);
  assert.equal(JSON.stringify(state), before);
}

test('an explicit typed trace load advances to loaded without certifying a journey', () => {
  const initial = model.createState();
  const state = model.execute(initial, { type: 'load', presetId: 'multi-compatible', version: 'v2' });
  assert.equal(state.phase, 'loaded');
  assert.equal(state.runs.length, 0);
  assert.equal(initial.phase, 'empty');
});

test('inspection is separate from both nominal load and measured journey completion', () => {
  let state = load(model.createState(), 'multi-compatible');
  assert.equal(model.view(state).inspected, false);
  assert.equal(model.view(state).result, null);
  assert.equal(model.view(state).fixture.fleetUpdateCompletion, 'unknown');
  state = model.execute(state, { type: 'inspect' });
  assert.equal(state.phase, 'inspected');
  assert.equal(state.runs.length, 0);
  assert.equal(model.view(state).inspected, true);
  assert.equal(model.view(state).result, null);
});

const expected = {
  'single-compatible': [2, 1, 0, 'interrupted'],
  'multi-compatible': [3, 0, 0, 'uninterrupted sample'],
  'multi-incompatible': [1, 2, 0, 'interrupted'],
  'multi-starved': [1, 2, 0, 'interrupted'],
  'multi-grace-expired': [2, 1, 0, 'interrupted'],
  'multi-grace-unknown': [2, 0, 1, 'unknown'],
  'multi-platform-restart': [2, 1, 0, 'interrupted'],
  'multi-recreate': [0, 3, 0, 'interrupted'],
};
for (const [presetId, [uninterrupted, interrupted, unknown, outcome]] of Object.entries(expected)) {
  test(`${presetId}: all three attempted journeys retain their positive, negative and unknown results`, () => {
    const state = run(presetId);
    const result = model.view(state).result;
    assert.deepEqual([result.uninterrupted, result.interrupted, result.unknown, result.outcome], [uninterrupted, interrupted, unknown, outcome]);
    assert.equal(result.attempted, 3);
    assert.equal(uninterrupted + interrupted + unknown, result.attempted);
    assert.equal(result.fleetUpdateCompletion, 'unknown');
    assert.equal(result.certification, 'not certified');
    assert.equal(state.history.length, 3);
    assert.deepEqual(result.journeys.map((row) => row.id), ['user-A', 'user-B', 'user-C']);
  });
}

test('same single/multi journeys distinguish polling downtime from execution completion and preserve failures', () => {
  const single = run('single-compatible');
  const multiple = run('multi-compatible', single);
  const first = single.runs[0];
  assert.equal(first.journeys.every((row) => row.execution === 'completed'), true);
  assert.equal(first.journeys[1].outcome, 'interrupted');
  assert.match(first.journeys[1].reasons.join('; '), /polling error 503/);
  assert.equal(model.PRESETS['single-compatible'].trace[1].readyUnits, 0);
  assert.equal(model.PRESETS['multi-compatible'].trace[1].readyUnits >= 3, true);
  assert.deepEqual(multiple.runs[0], first);
  assert.deepEqual(model.view(multiple).totals, { runs: 2, attempted: 6, uninterrupted: 5, interrupted: 1, unknown: 0 });
  assert.equal(multiple.runs[1].fleetUpdateCompletion, 'unknown');
});

test('mixed-version state loss and duplicate effects fail even with 200 responses and three instances', () => {
  const result = run('multi-incompatible').runs[0];
  assert.equal(result.journeys.every((row) => row.pollingStatus === 200), true);
  assert.match(result.journeys[1].reasons.join('; '), /state lost/);
  assert.match(result.journeys[2].reasons.join('; '), /2 business effects/);
  assert.equal(result.interrupted, 2);
});

test('configured instance count is not measured ready capacity or latency continuity', () => {
  const fixed = model.PRESETS['multi-starved'];
  assert.equal(fixed.instancesBefore, 3);
  assert.equal(fixed.trace[1].readyUnits, 1);
  assert.equal(fixed.trace[1].demandUnits, 3);
  const result = run(fixed.id).runs[0];
  assert.equal(result.journeys.every((row) => row.execution === 'completed'), true);
  assert.match(result.journeys[2].reasons.join('; '), /1400 ms exceeds original 900 ms/);
});

test('rolling, platform-update and recreate grace meanings cannot be interchanged', () => {
  const rolling = model.PRESETS['multi-grace-expired'];
  const platform = model.PRESETS['multi-platform-restart'];
  const recreate = model.PRESETS['multi-recreate'];
  assert.equal(rolling.observedGraceSeconds, 3600);
  assert.equal(rolling.journeys[1].remainingSeconds, 3700);
  assert.equal(platform.observedGraceSeconds, 600);
  assert.equal(platform.journeys[1].remainingSeconds, 780);
  assert.equal(platform.journeys[1].remainingSeconds < 3600, true);
  assert.match(platform.graceContext, /do not borrow/);
  assert.equal(recreate.documentedGraceSeconds, null);
  assert.equal(recreate.observedGraceSeconds, 0);
  for (const id of [rolling.id, platform.id, recreate.id]) {
    assert.match(run(id).runs[0].journeys[1].reasons.join('; '), /execution terminated/);
  }
});

test('unknown observed grace, execution, effects and version stay unknown despite a documented maximum', () => {
  const state = run('multi-grace-unknown');
  assert.equal(model.view(state).fixture.documentedGraceSeconds, 3600);
  assert.equal(model.view(state).fixture.observedGraceSeconds, null);
  const row = state.runs[0].journeys[1];
  assert.equal(row.outcome, 'unknown');
  assert.equal(row.pollingStatus, 200);
  assert.match(row.reasons.join('; '), /completion unknown/);
  assert.match(row.reasons.join('; '), /observed grace unknown/);
  assert.equal(state.runs[0].attempted, 3);
});

for (const command of [
  null, true, 'load', 2, [], {}, { type: 1 }, { type: 'Load' }, { type: 'load' },
  { type: 'load', presetId: 'multi-compatible', version: true },
  { type: 'load', presetId: 'multi-compatible', version: ' v2' },
  { type: 'load', presetId: 'multi-compatible', version: 'v2 ' },
  { type: 'load', presetId: 'multi-compatible', version: 'V2' },
  { type: 'load', presetId: 3, version: 'v2' },
  { type: 'load', presetId: 'constructor', version: 'v2' },
  { type: 'load', presetId: '<script>', version: 'v2' },
  { type: 'load', presetId: 'multi-compatible', version: 'v2', instances: 100 },
  { type: 'inspect', verified: true }, { type: 'measure', certify: true },
]) {
  test(`strict command rejection: ${JSON.stringify(command)}`, () => {
    rejectsWithoutMutation(model.createState(), command, 'ERR_INPUT');
  });
}

test('command accessors, symbols, hidden fields and custom prototypes are rejected without executing getters', () => {
  let calls = 0;
  const accessor = { presetId: 'multi-compatible', version: 'v2' };
  Object.defineProperty(accessor, 'type', { enumerable: true, get() { calls++; return 'load'; } });
  const versionAccessor = { type: 'load', presetId: 'multi-compatible' };
  Object.defineProperty(versionAccessor, 'version', { enumerable: true, get() { calls++; return 'v2'; } });
  const symbol = { type: 'inspect', [Symbol('extra')]: true };
  const hidden = { type: 'inspect' };
  Object.defineProperty(hidden, 'other', { value: true });
  const inherited = Object.assign(Object.create({ trusted: true }), { type: 'inspect' });
  for (const command of [accessor, versionAccessor, symbol, hidden, inherited, Object.assign(Object.create(null), { type: 'inspect' })]) {
    rejectsWithoutMutation(model.createState(), command, 'ERR_INPUT');
  }
  assert.equal(calls, 0);
});

test('out-of-order, mid-flight replacement and repeated measurement are guarded without history mutation', () => {
  const initial = model.createState();
  rejectsWithoutMutation(initial, { type: 'inspect' }, 'ERR_STATE');
  rejectsWithoutMutation(initial, { type: 'measure' }, 'ERR_STATE');
  const loaded = load(initial, 'single-compatible');
  rejectsWithoutMutation(loaded, { type: 'measure' }, 'ERR_STATE');
  rejectsWithoutMutation(loaded, { type: 'load', presetId: 'multi-compatible', version: 'v2' }, 'ERR_STATE');
  const measured = run('multi-compatible');
  rejectsWithoutMutation(measured, { type: 'measure' }, 'ERR_STATE');
  rejectsWithoutMutation(measured, { type: 'inspect' }, 'ERR_STATE');
});

test('serialized state replays exactly, and forged phase, successes, unknowns and history are rejected', () => {
  const valid = run('multi-grace-unknown');
  const serialized = clone(valid);
  assert.deepEqual(load(serialized, 'single-compatible'), load(valid, 'single-compatible'));
  const variants = [
    { ...serialized, phase: 'empty' }, { ...serialized, schemaVersion: '1' },
    { ...serialized, presetId: 'multi-compatible' }, { ...serialized, extra: true },
    { ...serialized, history: [] }, { ...serialized, runs: [] },
  ];
  const fakeSuccess = clone(valid);
  fakeSuccess.runs[0].uninterrupted = 3;
  fakeSuccess.runs[0].unknown = 0;
  variants.push(fakeSuccess);
  const fakeCompletion = clone(valid);
  fakeCompletion.runs[0].fleetUpdateCompletion = 'complete';
  variants.push(fakeCompletion);
  const reordered = clone(valid);
  reordered.history.reverse();
  variants.push(reordered);
  for (const state of variants) assert.throws(() => model.execute(state, { type: 'load', presetId: 'multi-compatible', version: 'v2' }));
  assert.equal(valid.runs[0].unknown, 1);
});

test('state rejects sparse/accessor/extra arrays, cycles, symbols, nonfinite numbers and hidden data', () => {
  const valid = clone(run('single-compatible'));
  const sparse = clone(valid);
  delete sparse.history[1];
  const arrayExtra = clone(valid);
  arrayExtra.history.extra = 'unsafe';
  const cycle = clone(valid);
  cycle.runs[0].self = cycle;
  const nonfinite = clone(valid);
  nonfinite.runs[0].attempted = Infinity;
  const symbol = clone(valid);
  symbol[Symbol('extra')] = true;
  const hidden = clone(valid);
  Object.defineProperty(hidden.runs[0], 'extra', { value: true });
  let calls = 0;
  const accessor = clone(valid);
  Object.defineProperty(accessor.history, '0', { enumerable: true, get() { calls++; return valid.history[0]; } });
  for (const state of [sparse, arrayExtra, cycle, nonfinite, symbol, hidden, accessor, null, [], Object.create(valid)]) {
    assert.throws(() => model.view(state), (error) => error.code === 'ERR_STATE');
  }
  assert.equal(calls, 0);
});

test('four bounded runs preserve all negative and unknown history; reset does not mutate earlier state', () => {
  let state = model.createState();
  for (const id of ['single-compatible', 'multi-grace-unknown', 'multi-compatible', 'multi-incompatible']) state = run(id, state);
  assert.equal(state.history.length, 12);
  assert.equal(state.runs.length, 4);
  assert.deepEqual(model.view(state).totals, { runs: 4, attempted: 12, uninterrupted: 8, interrupted: 3, unknown: 1 });
  rejectsWithoutMutation(state, { type: 'load', presetId: 'multi-compatible', version: 'v2' }, 'ERR_HISTORY');
  const reset = model.createState();
  assert.equal(reset.history.length, 0);
  assert.equal(reset.runs.length, 0);
  assert.equal(state.history.length, 12);
});

test('deterministic outputs and all nested fixed DATA remain immutable', () => {
  assert.deepEqual(run('multi-compatible'), run('multi-compatible'));
  const state = run('single-compatible');
  for (const value of [model.PRESETS, model.PRESETS['single-compatible'], model.PRESETS['single-compatible'].journeys[0], state, state.history, state.runs[0], state.runs[0].journeys[0].reasons]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => { model.PRESETS['multi-compatible'].observedGraceSeconds = Infinity; }, TypeError);
  assert.throws(() => { state.runs[0].interrupted = 0; }, TypeError);
});
