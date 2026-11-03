'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../antiforgery.js');

function run(overrides = {}, initial = model.createState()) {
  return model.submit(model.cutOver(model.loadForm(initial, { ...model.DEFAULTS, ...overrides })));
}

test('compatible v2 accepts a valid token issued with the old v1 form exactly once', () => {
  const state = run();
  const { result, trace } = state.history[0];
  assert.equal(state.phase, 'complete');
  assert.equal(trace.length, 3);
  assert.equal(result.submission, 'accepted');
  assert.equal(result.status, 'success');
  assert.equal(result.continuity, 'preserved');
  assert.deepEqual(result.metrics, { accepted: 1, rejected: 0, unknown: 0, effects: 1 });
  assert.ok(Object.values(result.checks).every((check) => check === 'pass'));
});

for (const token of ['forged', 'missing-cookie', 'foreign-pair']) {
  test(`compatible v2 rejects ${token} without effects or claiming valid-prior continuity`, () => {
    const { result } = run({ token }).history[0];
    assert.equal(result.submission, 'rejected');
    assert.equal(result.status, 'success');
    assert.equal(result.continuity, 'not-tested');
    assert.deepEqual(result.metrics, { accepted: 0, rejected: 1, unknown: 0, effects: 0 });
    assert.ok(result.failedChecks.length > 0);
  });
}

for (const [configuration, failedCheck] of [
  ['retired-key', 'oldKeyReadable'], ['changed-application', 'application']
]) {
  test(`a valid prior form fails under ${configuration}; validation is not weakened`, () => {
    const { result } = run({ configuration }).history[0];
    assert.equal(result.submission, 'rejected');
    assert.equal(result.status, 'failure');
    assert.equal(result.continuity, 'interrupted');
    assert.deepEqual(result.failedChecks, [failedCheck]);
    assert.equal(result.metrics.effects, 0);
  });
}

test('missing observations stay unknown with no fabricated acceptance or effect measurements', () => {
  const { result } = run({ observation: 'missing' }).history[0];
  assert.equal(result.submission, 'unknown');
  assert.equal(result.status, 'unknown');
  assert.equal(result.continuity, 'unknown');
  assert.ok(Object.values(result.checks).every((check) => check === 'unknown'));
  assert.deepEqual(result.metrics, { accepted: null, rejected: null, unknown: 1, effects: null });
});

test('all 24 configuration/condition/observation combinations obey strict validation deterministically', () => {
  let combinations = 0;
  for (const configuration of ['compatible', 'retired-key', 'changed-application']) {
    for (const token of ['valid-prior', 'forged', 'missing-cookie', 'foreign-pair']) {
      for (const observation of ['observed', 'missing']) {
        const config = { configuration, token, observation };
        const first = run(config);
        assert.deepEqual(first, run(config));
        const { result } = first.history[0];
        if (observation === 'missing') {
          assert.equal(result.status, 'unknown');
          assert.equal(result.httpStatus, null);
          assert.equal(result.metrics.effects, null);
        } else {
          const accepted = configuration === 'compatible' && token === 'valid-prior';
          assert.equal(result.submission, accepted ? 'accepted' : 'rejected');
          assert.equal(result.httpStatus, accepted ? 200 : 400);
          assert.equal(result.metrics.effects, Number(accepted));
          assert.equal(result.metrics.accepted + result.metrics.rejected, 1);
          assert.equal(result.status, token === 'valid-prior' && !accepted ? 'failure' : 'success');
          if (token !== 'valid-prior') assert.equal(result.continuity, 'not-tested');
        }
        combinations += 1;
      }
    }
  }
  assert.equal(combinations, 24);
});

test('the initial and partial traces name old form origin separately from v2 routing', () => {
  const empty = model.createState();
  assert.deepEqual(model.currentTrace(empty), []);
  const loaded = model.loadForm(empty, model.DEFAULTS);
  assert.equal(model.currentTrace(loaded).length, 1);
  assert.match(model.currentTrace(loaded)[0], /^v1 rendered/);
  const cut = model.cutOver(loaded);
  assert.equal(model.currentTrace(cut).length, 2);
  assert.match(model.currentTrace(cut)[1], /Route v1 -> v2/);
  assert.deepEqual(model.currentTrace(model.submit(cut)), run().history[0].trace);
});

test('all transitions reject wrong phases without inventing a submission or changing state', () => {
  const empty = model.createState();
  const loaded = model.loadForm(empty, model.DEFAULTS);
  const cut = model.cutOver(loaded);
  const complete = model.submit(cut);
  for (const [state, action] of [
    [empty, () => model.cutOver(empty)], [empty, () => model.submit(empty)],
    [loaded, () => model.submit(loaded)], [loaded, () => model.loadForm(loaded, model.DEFAULTS)],
    [cut, () => model.cutOver(cut)], [cut, () => model.loadForm(cut, model.DEFAULTS)],
    [complete, () => model.submit(complete)], [complete, () => model.cutOver(complete)]
  ]) {
    const before = JSON.stringify(state);
    assert.throws(action, /requires phase/);
    assert.equal(JSON.stringify(state), before);
  }
  assert.equal(complete.history[0].result.metrics.effects, 1);
});

test('input guards reject coercions, missing and extra fields and non-plain records', () => {
  const bad = [
    null, undefined, [], true, 1, 'compatible', {},
    { ...model.DEFAULTS, extra: true }, { token: 'valid-prior', observation: 'observed' },
    { ...model.DEFAULTS, configuration: 'Compatible' },
    { ...model.DEFAULTS, configuration: 0 },
    { ...model.DEFAULTS, token: 'accepted' },
    { ...model.DEFAULTS, observation: false },
    Object.create(model.DEFAULTS),
    Object.assign(Object.create(null), model.DEFAULTS)
  ];
  for (const config of bad) {
    const initial = model.createState();
    assert.throws(() => model.loadForm(initial, config), TypeError);
    assert.deepEqual(initial, model.createState());
  }
});

test('accessor, symbol and non-enumerable fields reject without invoking a getter', () => {
  let getterCalls = 0;
  const getter = { ...model.DEFAULTS };
  Object.defineProperty(getter, 'token', { enumerable: true, get() { getterCalls += 1; return 'valid-prior'; } });
  const symbol = { ...model.DEFAULTS, [Symbol('extra')]: true };
  const hidden = { ...model.DEFAULTS };
  Object.defineProperty(hidden, 'extra', { value: true });
  const hiddenRequired = { ...model.DEFAULTS };
  Object.defineProperty(hiddenRequired, 'token', { value: 'valid-prior', enumerable: false });
  for (const config of [getter, symbol, hidden, hiddenRequired]) {
    assert.throws(() => model.loadForm(model.createState(), config), TypeError);
  }
  assert.equal(getterCalls, 0);
});

test('state guard recomputes results, metrics, identity, configuration and retained traces', () => {
  const mutations = [
    (state) => { state.extra = 1; },
    (state) => { state.phase = 'approved'; },
    (state) => { state.current.id = 2; },
    (state) => { state.current.config.configuration = 'retired-key'; },
    (state) => { state.current.trace[1] = 'invented cutover'; },
    (state) => { state.history[0].id = 0; },
    (state) => { state.history[0].config.token = 'forged'; },
    (state) => { state.history[0].result.status = 'failure'; },
    (state) => { state.history[0].result.metrics.effects = 20; },
    (state) => { state.history[0].result.checks.cookieBinding = 'unknown'; },
    (state) => { state.history[0].result.failedChecks.push('application'); },
    (state) => { state.history[0].trace[0] = 'invented'; },
    (state) => { state.history[0].trace.extra = true; },
    (state) => { delete state.history[0].trace[1]; },
    (state) => { state.history.extra = true; },
    (state) => { delete state.history[0]; },
    (state) => { state.history = Array(7).fill(state.history[0]); },
    (state) => { state.history = []; },
    (state) => { state.phase = 'empty'; },
    (state) => { Object.defineProperty(state, 'phase', { value: 'complete', enumerable: false }); }
  ];
  for (const mutate of mutations) {
    const state = JSON.parse(JSON.stringify(run()));
    mutate(state);
    assert.throws(() => model.resetCurrent(state));
    assert.throws(() => model.currentTrace(state));
  }
});

test('every API validates state before transitions, including null and impossible active identity', () => {
  const impossible = {
    phase: 'cutover', current: {
      id: '1', config: { ...model.DEFAULTS }, trace: run().history[0].trace.slice(0, 2)
    }, history: []
  };
  for (const state of [null, [], { phase: 'empty' }, impossible]) {
    for (const action of [
      () => model.loadForm(state, model.DEFAULTS), () => model.cutOver(state),
      () => model.submit(state), () => model.resetCurrent(state), () => model.currentTrace(state)
    ]) assert.throws(action);
  }
  assert.throws(() => model.resetCurrent({ phase: 'old-page', current: null, history: [] }));
  const skippedCutover = JSON.parse(JSON.stringify(model.loadForm(model.createState(), model.DEFAULTS)));
  skippedCutover.phase = 'cutover';
  assert.throws(() => model.submit(skippedCutover), /Current trace/);
});

test('configuration and returned snapshots are independent, recursively immutable and deterministic', () => {
  const config = { ...model.DEFAULTS };
  const loaded = model.loadForm(model.createState(), config);
  config.token = 'forged';
  assert.equal(loaded.current.config.token, 'valid-prior');
  const complete = model.submit(model.cutOver(loaded));
  assert.throws(() => { complete.history[0].result.metrics.effects = 10; }, TypeError);
  assert.throws(() => { complete.current.config.token = 'forged'; }, TypeError);
  assert.throws(() => complete.history.push({}), TypeError);
  assert.throws(() => { model.DEFAULTS.configuration = 'retired-key'; }, TypeError);
  const mutableInput = JSON.parse(JSON.stringify(complete));
  const reset = model.resetCurrent(mutableInput);
  mutableInput.history[0].trace[0] = 'changed after transition';
  assert.match(reset.history[0].trace[0], /^v1 rendered/);
});

test('reset preserves completed failure, success and unknown; partial reset adds no invented observation', () => {
  let state = run({ configuration: 'retired-key' });
  state = run({}, model.resetCurrent(state));
  state = run({ observation: 'missing' }, model.resetCurrent(state));
  const before = JSON.stringify(state.history);
  const reset = model.resetCurrent(state);
  assert.equal(reset.phase, 'empty');
  assert.equal(reset.current, null);
  assert.equal(JSON.stringify(reset.history), before);
  assert.deepEqual(reset.history.map((entry) => entry.result.status), ['failure', 'success', 'unknown']);
  const partial = model.cutOver(model.loadForm(reset, model.DEFAULTS));
  assert.deepEqual(model.resetCurrent(partial), reset);
});

test('six completed histories are retained without eviction and a seventh is explicitly blocked', () => {
  let state = model.createState();
  for (let id = 1; id <= 6; id += 1) {
    state = run({ token: id % 2 ? 'valid-prior' : 'forged' }, state);
    assert.equal(state.history.at(-1).id, id);
    state = model.resetCurrent(state);
  }
  const before = JSON.stringify(state);
  assert.equal(state.history.length, model.MAX_RUNS);
  assert.throws(() => model.loadForm(state, model.DEFAULTS), /Six completed/);
  assert.equal(JSON.stringify(state), before);
  const forgedActive = JSON.parse(before);
  forgedActive.phase = 'old-page';
  forgedActive.current = { id: 7, config: { ...model.DEFAULTS }, trace: run().history[0].trace.slice(0, 1) };
  assert.throws(() => model.cutOver(forgedActive), /identity/);
});
