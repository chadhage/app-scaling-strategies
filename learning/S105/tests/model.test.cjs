'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');

test('ordinary application values move but destination-specific identity, network and settings do not', () => {
  const initial = model.createState();
  const swapped = model.transition(initial, {
    type: 'swap', fixture: 'matched', prediction: 'destination-bound',
  });
  const observed = model.transition(swapped, { type: 'observe' });
  const result = model.summarize(observed);
  assert.equal(result.current.after.destination.application.DISPLAY_LABEL, 'candidate-v2');
  assert.equal(result.current.after.sender.application.DISPLAY_LABEL, 'serving-v1');
  assert.equal(result.current.after.destination.bound.DATA_ALIAS, 'dataset-cedar');
  assert.equal(result.current.after.destination.bound.identity, 'principal-cedar');
  assert.equal(result.current.after.destination.bound.network, 'network-cedar');
  assert.deepEqual(result.current.before.destination.bound, result.current.after.destination.bound);
  assert.deepEqual(result.current.before.sender.bound, result.current.after.sender.bound);
  assert.equal(result.current.result, 'positive');
  assert.equal(model.summarize(initial).attempted, 0);
});

const swap = (state, fixture = 'matched', prediction = 'destination-bound') => model.transition(state, {
  type: 'swap', fixture, prediction,
});
const observe = (state) => model.transition(state, { type: 'observe' });
const complete = (state, fixture, prediction) => observe(swap(state, fixture, prediction));
const code = (expected) => (error) => error.name === 'LessonError' && error.code === expected;

test('a swap is a pending attempt, never an access observation or positive result', () => {
  const view = model.summarize(swap(model.createState()));
  assert.equal(view.phase, 'pending-observation');
  assert.equal(view.attempted, 1);
  assert.equal(view.observed, 0);
  assert.equal(view.pending, 1);
  assert.deepEqual(view.counts, { positive: 0, negative: 0, unknown: 0 });
  assert.equal(view.current.access.observed, false);
  assert.equal(view.current.access.outcome, 'unknown');
  assert.equal(view.current.predictionCorrect, null);
});

for (const fixture of model.constants.fixtures) {
  for (const prediction of model.constants.predictions) {
    test(`${fixture.id} / ${prediction} uses the destination's fixed permission and path`, () => {
      const state = complete(model.createState(), fixture.id, prediction);
      const view = model.summarize(state);
      const access = view.current.access;
      const accessResult = fixture.id === 'matched' ? 'positive' : fixture.id === 'unobserved' ? 'unknown' : 'negative';
      const result = prediction === 'all-follow-sender' ? 'negative' : accessResult;
      assert.equal(access.permission, fixture.permission);
      assert.equal(access.network, fixture.network);
      assert.equal(access.outcome, accessResult);
      assert.equal(access.subject, 'principal-cedar');
      assert.equal(access.resource, 'dataset-cedar');
      assert.equal(access.via, 'network-cedar');
      assert.equal(access.observed, true);
      assert.equal(view.current.predictionCorrect, prediction === 'destination-bound');
      assert.equal(view.current.result, result);
      assert.equal(view.counts[result], 1);
      assert.equal(view.attempted, 1);
      assert.equal(view.observed, 1);
      assert.equal(view.pending, 0);
      assert.equal(view.history.length, 2);
      assert.equal(view.history[0].snapshot.access.observed, false);
    });
  }
}

test('an all-properties-move mistake is negative even when the separate access observation is positive', () => {
  const view = model.summarize(complete(model.createState(), 'matched', 'all-follow-sender'));
  assert.equal(view.current.result, 'negative');
  assert.equal(view.current.access.outcome, 'positive');
  assert.equal(view.current.predictionCorrect, false);
  assert.equal(view.counts.positive, 0);
  assert.equal(view.counts.negative, 1);
  assert.notEqual(view.current.after.destination.bound.identity, view.current.before.sender.bound.identity);
});

test('failed, unknown and pending attempts are retained without denominator deletion', () => {
  let state = complete(model.createState(), 'identity-denied');
  const first = model.summarize(state).history;
  state = complete(state, 'unobserved');
  state = complete(state, 'matched');
  state = swap(state, 'network-denied');
  const view = model.summarize(state);
  assert.equal(view.attempted, 4);
  assert.equal(view.observed, 3);
  assert.equal(view.pending, 1);
  assert.deepEqual(view.counts, { positive: 1, negative: 1, unknown: 1 });
  assert.equal(view.counts.positive + view.counts.negative + view.counts.unknown + view.pending, view.attempted);
  assert.deepEqual(view.history.slice(0, 2), first);
  assert.deepEqual(view.history.map((event) => event.step), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(view.history[2].snapshot.before.sender.application.DISPLAY_LABEL, 'candidate-v2');
});

test('six independent rehearsals and twelve events are a hard limit until explicit reset', () => {
  let state = model.createState();
  for (let run = 0; run < 6; run++) state = complete(state, 'matched');
  const original = JSON.stringify(state);
  assert.equal(model.summarize(state).history.length, 12);
  assert.equal(model.summarize(state).remaining, 0);
  assert.throws(() => swap(state), code('RUN_LIMIT'));
  assert.throws(() => observe(state), code('OBSERVE_ORDER'));
  assert.equal(JSON.stringify(state), original);
  const reset = model.transition(state, { type: 'reset' });
  assert.deepEqual(reset, model.createState());
  assert.equal(model.summarize(reset).phase, 'initial');
  assert.equal(model.summarize(reset).current, null);
  assert.equal(model.summarize(reset).history.length, 0);
  assert.equal(model.summarize(swap(reset)).attempted, 1);
});

test('observation cannot be fabricated, repeated or skipped', () => {
  const initial = model.createState();
  assert.throws(() => observe(initial), code('OBSERVE_ORDER'));
  const pending = swap(initial);
  assert.throws(() => swap(pending), code('SWAP_ORDER'));
  assert.equal(model.summarize(pending).pending, 1);
  assert.throws(() => observe(observe(pending)), code('OBSERVE_ORDER'));
});

test('command records use exact fields and no type coercion', () => {
  const initial = model.createState();
  const invalid = [
    [null, 'COMMAND_TYPE'], [false, 'COMMAND_TYPE'], [[], 'COMMAND_TYPE'], ['swap', 'COMMAND_TYPE'],
    [{}, 'COMMAND_TYPE'], [{ type: 1 }, 'COMMAND_TYPE'], [{ type: new String('swap') }, 'COMMAND_TYPE'],
    [{ type: 'deploy' }, 'COMMAND_TYPE'], [{ type: 'observe', fixture: 'matched' }, 'COMMAND_SHAPE'],
    [{ type: 'reset', keepHistory: true }, 'COMMAND_SHAPE'],
    [{ type: 'swap', fixture: 'matched' }, 'COMMAND_SHAPE'],
    [{ type: 'swap', fixture: 'matched', prediction: 'destination-bound', identity: 'other' }, 'COMMAND_SHAPE'],
    [{ type: 'swap', fixture: 'matched', prediction: 'destination-bound', network: 'other' }, 'COMMAND_SHAPE'],
    [{ type: 'swap', fixture: 'matched', prediction: 'destination-bound', authorization: true }, 'COMMAND_SHAPE'],
    [{ type: 'swap', fixture: 'matched', prediction: 'destination-bound', [Symbol('hidden')]: true }, 'COMMAND_SHAPE'],
  ];
  for (const [action, expected] of invalid) {
    assert.throws(() => model.transition(initial, action), code(expected));
  }
  for (const fixture of ['', 'MATCHED', ' matched', 'matched ', 'toString', '__proto__', '<script>', 1, true, null, [], {}, new String('matched')]) {
    assert.throws(() => swap(initial, fixture), code('FIXTURE'));
  }
  for (const prediction of ['', 'destination-bound ', 'all', 0, false, null, [], {}, new String('destination-bound')]) {
    assert.throws(() => swap(initial, 'matched', prediction), code('PREDICTION'));
  }
  assert.deepEqual(initial.events, []);
});

test('inherited fields and accessors are rejected without invoking getters', () => {
  let reads = 0;
  const getterType = Object.defineProperty({}, 'type', { get() { reads++; return 'swap'; }, enumerable: true });
  const getterFixture = { type: 'swap', prediction: 'destination-bound' };
  Object.defineProperty(getterFixture, 'fixture', { get() { reads++; return 'matched'; }, enumerable: true });
  const getterState = { version: 1 };
  Object.defineProperty(getterState, 'events', { get() { reads++; return []; }, enumerable: true });
  const getterEvents = new Array(1);
  Object.defineProperty(getterEvents, '0', { get() { reads++; return { type: 'observe' }; }, enumerable: true });
  assert.throws(() => model.transition(model.createState(), getterType), code('COMMAND_TYPE'));
  assert.throws(() => model.transition(model.createState(), getterFixture), code('COMMAND_SHAPE'));
  assert.throws(() => model.summarize(getterState), code('STATE_SHAPE'));
  assert.throws(() => model.summarize({ version: 1, events: getterEvents }), code('STATE_HISTORY'));
  assert.throws(() => model.transition(model.createState(), Object.create({ type: 'observe' })), code('COMMAND_TYPE'));
  assert.throws(() => model.transition(model.createState(), Object.assign(Object.create({ extra: true }), { type: 'observe' })), code('COMMAND_SHAPE'));
  assert.equal(reads, 0);
});

test('state guards reject forged shape, version, history, order and materialized success', () => {
  const validSwap = { type: 'swap', fixture: 'matched', prediction: 'destination-bound' };
  const invalid = [
    [null, 'STATE_SHAPE'], [[], 'STATE_SHAPE'], [{}, 'STATE_SHAPE'],
    [{ version: '1', events: [] }, 'STATE_VERSION'], [{ version: NaN, events: [] }, 'STATE_VERSION'],
    [{ version: 2, events: [] }, 'STATE_VERSION'],
    [{ version: 1, events: [], result: 'positive' }, 'STATE_SHAPE'],
    [{ version: 1, events: null }, 'STATE_HISTORY'],
    [{ version: 1, events: {} }, 'STATE_HISTORY'],
    [{ version: 1, events: new Array(1) }, 'STATE_HISTORY'],
    [{ version: 1, events: Array.from({ length: 13 }, () => validSwap) }, 'STATE_HISTORY'],
    [{ version: 1, events: [{ type: 'observe' }] }, 'STATE_ORDER'],
    [{ version: 1, events: [validSwap, validSwap] }, 'STATE_ORDER'],
    [{ version: 1, events: [{ type: 'reset' }] }, 'STATE_EVENT'],
    [{ version: 1, events: [{ ...validSwap, permission: 'allowed' }] }, 'STATE_EVENT'],
    [{ version: 1, events: [{ ...validSwap, fixture: 'arbitrary' }] }, 'STATE_EVENT'],
  ];
  for (const [state, expected] of invalid) {
    assert.throws(() => model.summarize(state), code(expected));
    assert.throws(() => model.transition(state, { type: 'reset' }), code(expected));
  }
  const withExtra = [];
  withExtra.extra = true;
  assert.throws(() => model.summarize({ version: 1, events: withExtra }), code('STATE_HISTORY'));
  assert.throws(() => model.summarize(Object.assign(Object.create({}), { version: 1, events: [] })), code('STATE_SHAPE'));
});

test('state, derived observations and fixed data are deeply immutable and replay is deterministic', () => {
  const state = complete(model.createState(), 'network-denied');
  const view = model.summarize(state);
  assert.throws(() => { state.events[0].fixture = 'matched'; }, TypeError);
  assert.throws(() => state.events.pop(), TypeError);
  assert.throws(() => { view.current.after.destination.bound.identity = 'principal-copper'; }, TypeError);
  assert.throws(() => { view.counts.positive = 100; }, TypeError);
  assert.throws(() => { model.constants.fixtures[0].permission = 'denied'; }, TypeError);
  const serialized = JSON.stringify(state);
  for (let repeat = 0; repeat < 20; repeat++) {
    assert.deepEqual(model.summarize(JSON.parse(serialized)), view);
  }
  assert.equal(JSON.stringify(state), serialized);
});
