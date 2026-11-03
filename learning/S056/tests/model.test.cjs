'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');
const model = require(process.env.S056_MODEL_PATH || path.join(__dirname, '..', 'model.js'));

function checked(config = {}, state = model.createState()) {
  let next = model.start(state, { ...model.DEFAULTS, ...config });
  for (let index = 0; index < 4; index += 1) next = model.step(next);
  return next;
}

test('complete compatible overlap introduces the new producer only after four checks', () => {
  const ready = checked();
  const decided = model.decide(ready);
  assert.equal(decided.introduced, true, 'complete compatible overlap must unlock the synthetic introduction');
  assert.equal(model.summarize(decided).outcome, 'success');
  assert.equal(model.summarize(decided).expectedCents, 7500);
  assert.equal(model.summarize(decided).observedCents, 7500);
  assert.equal(decided.history.length, 1);
});

test('all four independent producer-consumer cells retain exact intended integer-cent effects', () => {
  const state = checked();
  assert.deepEqual(state.rows.map((row) => `${row.producer}->${row.consumer}`),
    ['old->old', 'old->new', 'new->old', 'new->new']);
  assert.deepEqual(state.rows.map((row) => row.expectedCents), [1250, 1250, 2500, 2500]);
  assert.deepEqual(state.rows.map((row) => row.appliedCents), [1250, 1250, 2500, 2500]);
  assert.equal(model.summarize(state).oldConsumerCoverage, 2);
  assert.equal(model.summarize(state).newConsumerCoverage, 2);
  assert.equal(model.summarize(state).measuredEffects, 4);
  assert.equal(state.introduced, false, 'preflight success is not itself introduction');
});

test('renamed fields fail old readers while successful new readers never erase that failure', () => {
  let state = model.start(model.createState(), { ...model.DEFAULTS, schema: 'renamed' });
  state = model.step(model.step(model.step(state)));
  assert.equal(state.rows[2].interpretable, false);
  assert.equal(state.rows[2].appliedCents, 0);
  assert.equal(model.summarize(state).outcome, 'failure');
  state = model.step(state);
  assert.equal(state.rows[3].outcome, 'success');
  assert.equal(model.summarize(state).outcome, 'failure');
  const final = model.decide(state);
  assert.equal(final.introduced, false);
  assert.equal(final.history[0].outcome, 'failure');
});

test('integer-shaped dollar/cents drift fails business-effect assertions, not interpretation', () => {
  const state = model.decide(checked({ schema: 'unit-drift' }));
  const result = model.summarize(state);
  assert.equal(result.interpretable, 4);
  assert.equal(result.incorrectEffects, 2);
  assert.equal(result.observedCents, 2550);
  assert.equal(result.expectedCents, 7500);
  assert.equal(result.outcome, 'failure');
  assert.equal(state.introduced, false);
  assert.equal(state.rows[2].payload.amountCents, 25);
  assert.match(state.rows[2].reason, /intended 2500, observed 25/);
});

test('strict old readers reject additive fields before introduction', () => {
  const state = model.decide(checked({ oldReader: 'strict' }));
  assert.equal(state.rows[0].outcome, 'success');
  assert.equal(state.rows[2].outcome, 'failure');
  assert.equal(state.rows[3].outcome, 'success');
  assert.equal(state.introduced, false);
});

test('shape-only, new-only and absent old receipts remain explicitly unknown', () => {
  for (const config of [{ checks: 'shape-only' }, { checks: 'new-only' }, { observation: 'withhold-old' },
    { schema: 'unit-drift', checks: 'shape-only' }, { schema: 'renamed', checks: 'new-only' }]) {
    const state = model.decide(checked(config));
    const result = model.summarize(state);
    assert.equal(result.outcome, 'unknown', JSON.stringify(config));
    assert.equal(state.introduced, false);
    assert.ok(result.unknown > 0);
    assert.ok(result.measuredEffects < 4);
    if (config.checks === 'shape-only') {
      assert.equal(result.measuredEffects, 0);
      assert.equal(result.observedCents, 0);
      assert.ok(state.rows.every((row) => row.appliedCents === null));
    } else assert.equal(result.oldConsumerCoverage, 0);
  }
});

test('all 36 allowed configurations match a separate compatibility-gate oracle', () => {
  let count = 0;
  for (const schema of model.CHOICES.schema) for (const oldReader of model.CHOICES.oldReader) {
    for (const checks of model.CHOICES.checks) for (const observation of model.CHOICES.observation) {
      const config = { schema, oldReader, checks, observation };
      const oldObserved = checks !== 'new-only' && observation === 'complete';
      const interpretationFailure = oldObserved && (schema === 'renamed' || oldReader === 'strict');
      const effectFailure = schema === 'unit-drift' && checks !== 'shape-only';
      const completeSuccess = schema === 'additive' && oldReader === 'tolerant'
        && checks === 'contracts-effects' && observation === 'complete';
      const expected = interpretationFailure || effectFailure ? 'failure' : completeSuccess ? 'success' : 'unknown';
      const final = model.decide(checked(config));
      assert.equal(model.summarize(final).outcome, expected, JSON.stringify(config));
      assert.equal(final.introduced, expected === 'success', JSON.stringify(config));
      count += 1;
    }
  }
  assert.equal(count, 36);
});

test('partial checking, ordering and repeat actions cannot bypass the introduction gate', () => {
  const initial = model.createState();
  assert.equal(model.summarize(initial).outcome, 'unknown');
  assert.throws(() => model.step(initial), /phase/);
  assert.throws(() => model.decide(initial), /phase/);
  assert.throws(() => model.another(initial), /phase/);
  assert.throws(() => model.predict(initial, 'success'), /phase/);
  let state = model.start(initial, model.DEFAULTS);
  const pinned = JSON.stringify(state);
  assert.throws(() => model.start(state, model.DEFAULTS), /phase/);
  assert.throws(() => model.decide(state), /phase/);
  assert.equal(JSON.stringify(state), pinned);
  for (let index = 0; index < 3; index += 1) {
    state = model.step(state);
    assert.equal(model.summarize(state).outcome, 'unknown');
    assert.equal(state.introduced, false);
    assert.throws(() => model.decide(state), /phase/);
  }
  state = model.step(state);
  assert.throws(() => model.step(state), /phase/);
  state = model.decide(state);
  assert.throws(() => model.decide(state), /phase/);
  assert.throws(() => model.step(state), /phase/);
});

test('exact configuration inputs reject unsupported, extra, missing and accessor properties', () => {
  const initial = model.createState();
  const original = JSON.stringify(initial);
  for (const input of [null, [], 'additive', {}, { ...model.DEFAULTS, extra: true },
    { ...model.DEFAULTS, schema: 'Additive' }, { ...model.DEFAULTS, checks: 1 },
    { ...model.DEFAULTS, oldReader: ' tolerant ' }, { ...model.DEFAULTS, observation: undefined }]) {
    assert.throws(() => model.start(initial, input), /input/);
    assert.equal(JSON.stringify(initial), original);
  }
  let accessed = false;
  const accessor = { ...model.DEFAULTS };
  Object.defineProperty(accessor, 'schema', { get() { accessed = true; return 'additive'; } });
  assert.throws(() => model.start(initial, accessor), /input/);
  assert.equal(accessed, false);
  const inherited = Object.create(model.DEFAULTS);
  assert.throws(() => model.start(initial, inherited), /input/);
});

test('forged receipts, stale configurations, history, prototypes and sparse arrays fail without mutation', () => {
  const good = model.decide(checked());
  const attacks = [
    (state) => { state.extra = 1; },
    (state) => { state.version = 2; },
    (state) => { state.rows[2].appliedCents = 1; },
    (state) => { state.rows[1].outcome = 'failure'; },
    (state) => { state.config.schema = 'renamed'; },
    (state) => { state.history[0].introduced = false; },
    (state) => { state.history[0].outcome = 'unknown'; },
    (state) => { state.history[0].id = 2; },
    (state) => { state.history[0].rows.pop(); },
    (state) => { state.history = []; },
    (state) => { delete state.rows[0]; },
    (state) => { state.rows.extra = 'tamper'; },
    (state) => { state.prediction = { choice: 'failure', verdict: 'PASS' }; },
    (state) => { Object.setPrototypeOf(state, { unsafe: true }); },
    (state) => { state.config = state; },
  ];
  for (const attack of attacks) {
    const state = JSON.parse(JSON.stringify(good));
    attack(state);
    assert.throws(() => model.summarize(state), /Invalid (state|input)/);
    assert.throws(() => model.another(state), /Invalid (state|input)/);
  }
  assert.equal(model.summarize(good).outcome, 'success');
  let accessed = false;
  const accessor = JSON.parse(JSON.stringify(good));
  Object.defineProperty(accessor.rows, '0', { get() { accessed = true; return good.rows[0]; } });
  assert.throws(() => model.summarize(accessor), /state/);
  assert.equal(accessed, false, 'state array accessors must not execute during validation');
  assert.ok(Object.isFrozen(good.history[0].rows[2].payload));
  assert.throws(() => { good.rows[0].outcome = 'failure'; }, TypeError);
});

test('prediction accuracy is separate, single-use and retained for every outcome', () => {
  for (const [config, outcome] of [[{}, 'success'], [{ schema: 'renamed' }, 'failure'],
    [{ checks: 'new-only' }, 'unknown']]) {
    const decided = model.decide(checked(config));
    assert.throws(() => model.predict(decided, ''), /input/);
    const predicted = model.predict(decided, outcome);
    assert.equal(predicted.prediction.verdict, 'PASS');
    assert.deepEqual(predicted.history[0].prediction, predicted.prediction);
    assert.equal(model.summarize(predicted).outcome, outcome);
    assert.equal(predicted.introduced, outcome === 'success');
    assert.throws(() => model.predict(predicted, 'failure'), /one prediction/);
    const wrong = model.predict(decided, outcome === 'success' ? 'unknown' : 'success');
    assert.equal(wrong.prediction.verdict, 'FAIL');
    assert.equal(model.summarize(wrong).outcome, outcome);
  }
});

test('eight bounded attempts retain independent configurations, receipts and failures until explicit reset', () => {
  let state = model.createState();
  for (let index = 0; index < model.LIMIT; index += 1) {
    state = model.decide(checked({ schema: index % 2 ? 'renamed' : 'additive' }, state));
    state = model.predict(state, index % 2 ? 'failure' : 'success');
    assert.equal(state.history.length, index + 1);
    if (index < model.LIMIT - 1) state = model.another(state);
  }
  const retained = JSON.stringify(state.history);
  const next = model.another(state);
  assert.equal(next.phase, 'ready');
  assert.equal(JSON.stringify(next.history), retained);
  assert.throws(() => model.start(next, model.DEFAULTS), /eight attempts/);
  assert.equal(JSON.stringify(next.history), retained);
  assert.equal(model.createState().history.length, 0);
  assert.equal(model.summarize(model.createState()).outcome, 'unknown');
});

test('identical inputs yield identical receipts, outcomes and history with no clock or randomness', () => {
  const conduct = () => model.predict(model.decide(checked({ schema: 'unit-drift' })), 'failure');
  assert.deepEqual(conduct(), conduct());
  assert.deepEqual(model.DEFAULTS, { schema: 'additive', oldReader: 'tolerant',
    checks: 'contracts-effects', observation: 'complete' });
});
