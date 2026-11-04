'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const model = require('./model.js');

test('digest-pinned preparation does not imply initialization', () => {
  const state = model.next(model.createState('prepared', 'manual'), { action: 'prepare' });
  assert.equal(state.phase, 'prepared');
  assert.equal(state.initialized, false);
  assert.equal(state.production, 'teaching-v1');
});

function ready(fixture = 'prepared', path = 'manual') {
  let state = model.createState(fixture, path);
  state = model.next(state, { action: 'prepare' });
  return model.next(state, { action: 'initialize' });
}

function observed(fixture = 'prepared', path = 'manual') {
  const promoted = model.next(ready(fixture, path), { action: 'promote' });
  return model.next(promoted, { action: 'observe' });
}

test('manual and controlled pipeline paths measure started journeys, not a routing switch', () => {
  for (const path of ['manual', 'pipeline']) {
    const prepared = ready('prepared', path);
    assert.equal(prepared.phase, 'ready');
    assert.equal(prepared.metrics.attempted, 0);
    const promoted = model.next(prepared, { action: 'promote' });
    assert.equal(promoted.production, 'teaching-v2');
    assert.equal(promoted.verifier, 'unknown');
    assert.deepEqual(promoted.metrics, { attempted: 2, positive: 0, negative: 0, unknown: 2, ratio: 0 });
    assert.match(promoted.swapEffect, /former-production workers recycled/i);
    const result = model.next(promoted, { action: 'observe' });
    assert.equal(result.verifier, 'positive');
    assert.deepEqual(result.metrics, { attempted: 2, positive: 2, negative: 0, unknown: 0, ratio: 1 });
    assert.deepEqual(result.history.map((event) => event.action), ['prepare', 'initialize', 'promote', 'observe']);
    assert.deepEqual(result, observed('prepared', path));
  }
});

test('mutable reference and failed pull abort before exposure, with no empty-sample success', () => {
  for (const fixture of ['mutable-tag', 'pull-failed']) {
    const result = model.next(model.createState(fixture, 'manual'), { action: 'prepare' });
    assert.equal(result.phase, 'blocked');
    assert.equal(result.verifier, 'negative');
    assert.equal(result.production, 'teaching-v1');
    assert.equal(result.impact, 'safe abort before exposure');
    assert.equal(result.metrics.attempted, 0);
    assert.equal(result.metrics.ratio, null);
    assert.equal(result.history.length, 1);
    assert.throws(() => model.next(result, { action: 'initialize' }), /requires prepared/);
    assert.throws(() => model.next(result, { action: 'promote' }), /requires ready/);
  }
});

test('startup, explicit readiness and shared overlap failures cannot initialize or promote', () => {
  const cases = [
    ['wrong-port', 'negative', /listening port/],
    ['startup-failed', 'negative', /initialization failed/],
    ['startup-unknown', 'unknown', /initialization completion is unknown/],
    ['shallow-green', 'negative', /200.*not meaningful readiness/],
    ['no-headroom', 'negative', /11.*10.*extra slots add no compute/],
  ];
  for (const [fixture, verdict, message] of cases) {
    const result = ready(fixture);
    assert.equal(result.initialized, false);
    assert.equal(result.verifier, verdict);
    assert.match(result.message, message);
    assert.equal(result.phase, verdict === 'unknown' ? 'held' : 'blocked');
    assert.equal(result.production, 'teaching-v1');
    assert.equal(result.metrics.attempted, 0);
    assert.equal(result.metrics.ratio, null);
    assert.equal(result.history.length, 2);
    const before = JSON.stringify(result);
    assert.throws(() => model.next(result, { action: 'promote' }), /requires ready/);
    assert.equal(JSON.stringify(result), before);
  }
});

test('native auto-swap rejection is unsupported, retained and never exposes a candidate', () => {
  for (const initial of [model.createState('prepared', 'manual'), ready()]) {
    const rejected = model.next(initial, { action: 'reject-auto-swap' });
    assert.equal(rejected.phase, initial.phase);
    assert.equal(rejected.production, 'teaching-v1');
    assert.equal(rejected.verifier, 'unsupported');
    assert.equal(rejected.metrics.attempted, 0);
    assert.match(rejected.message, /unsupported.*Linux.*Web App for Containers/);
    assert.equal(rejected.history.at(-1).classification, 'unsupported');
    if (rejected.phase === 'ready') {
      assert.equal(model.next(rejected, { action: 'promote' }).phase, 'promoted');
    }
  }
  assert.throws(() => model.createState('prepared', 'native-auto-swap'), /promotion path/);
  assert.equal(model.fixtures.prepared.platform.nativeAutoSwapSupported, false);
});

test('modeled recycling interruption retains the failed started journey and original budget', () => {
  const result = observed('journey-interrupted');
  assert.equal(result.verifier, 'negative');
  assert.equal(result.impact, 'interrupted synthetic transition');
  assert.deepEqual(result.metrics, { attempted: 2, positive: 1, negative: 1, unknown: 0, ratio: 0.5 });
  assert.equal(result.journeys[1].status, 503);
  assert.equal(result.journeys[1].latencyMs, 900);
  assert.equal(result.journeys[1].budgetMs, 500);
  assert.equal(result.journeys[1].effects, 0);
  assert.match(result.journeys[1].reason, /status.*latency.*effects/);
  assert.match(result.swapEffect, /active old request abandoned/);
  assert.equal(result.history.at(-1).classification, 'negative');
  assert.throws(() => model.next(result, { action: 'observe' }), /requires promoted/);
  assert.throws(() => model.next(result, { action: 'promote' }), /requires ready/);
});

test('unknown started outcomes stay in the denominator and cannot pass', () => {
  const result = observed('journey-unknown');
  assert.equal(result.verifier, 'unknown');
  assert.equal(result.impact, 'unverified synthetic transition');
  assert.deepEqual(result.metrics, { attempted: 2, positive: 1, negative: 0, unknown: 1, ratio: 0.5 });
  assert.equal(result.journeys[1].outcome, 'unknown');
  assert.equal(result.journeys[1].to, null);
  assert.equal(result.journeys[1].latencyMs, null);
  assert.equal(result.journeys[1].effects, null);
  assert.equal(result.history.at(-1).classification, 'unknown');
});

test('fixtures, paths and command shapes reject coercion, prototypes, hidden fields and accessors', () => {
  for (const value of [undefined, null, 123, true, {}, [], new String('prepared'), 'missing', '__proto__']) {
    assert.throws(() => model.createState(value, 'manual'), /fixture/);
    assert.throws(() => model.createState('prepared', value), /promotion path/);
  }
  const state = model.createState('prepared', 'manual');
  const badCommands = [
    null, [], 'prepare', 1, {}, { action: true }, { action: new String('prepare') },
    { action: 'unknown' }, { action: 'prepare', image: 'other' },
    Object.create({ action: 'prepare' }),
    Object.assign({ action: 'prepare' }, { [Symbol('hidden')]: 1 }),
    Object.defineProperty({ action: 'prepare' }, 'hidden', { value: 1 }),
  ];
  let getterRan = false;
  badCommands.push(Object.defineProperty({}, 'action', { enumerable: true, get() { getterRan = true; return 'prepare'; } }));
  for (const command of badCommands) {
    assert.throws(() => model.next(state, command), /command/);
  }
  assert.equal(getterRan, false);
  assert.equal(state.history.length, 0);
});

test('immutable complete states and history are replay validated, not trusted flags', () => {
  const original = observed();
  assert.equal(Object.isFrozen(original), true);
  assert.equal(Object.isFrozen(original.history), true);
  assert.equal(Object.isFrozen(original.journeys[0]), true);
  assert.equal(Object.isFrozen(model.fixtures.prepared.startup), true);
  assert.throws(() => { original.production = 'forged'; }, TypeError);
  assert.throws(() => { model.fixtures.prepared.image.digest = 'forged'; }, TypeError);
  assert.deepEqual(model.reset(JSON.parse(JSON.stringify(original))), model.createState('prepared', 'manual'));
  const corruptions = [
    (state) => { state.phase = 'ready'; },
    (state) => { state.production = 'teaching-v1'; },
    (state) => { state.initialized = false; },
    (state) => { state.metrics.positive = 0; },
    (state) => { state.journeys[0].effects = 2; },
    (state) => { state.history[0].message = 'forged'; },
    (state) => { state.history[0].action = 'promote'; },
    (state) => { state.history[0].step = 9; },
    (state) => { state.schemaVersion = 2; },
    (state) => { state.extra = true; },
    (state) => { state.history.extra = true; },
  ];
  for (const corrupt of corruptions) {
    const state = JSON.parse(JSON.stringify(original));
    corrupt(state);
    assert.throws(() => model.reset(state), /state/);
    assert.throws(() => model.next(state, { action: 'reject-auto-swap' }), /state/);
  }
  const hidden = JSON.parse(JSON.stringify(original));
  Object.defineProperty(hidden.metrics, 'ratio', { get() { throw new Error('getter must not run'); }, enumerable: true });
  assert.throws(() => model.reset(hidden), /state/);
});

test('strict ordering and 20-action bound preserve input and allow an explicit reset', () => {
  const initial = model.createState('prepared', 'manual');
  assert.throws(() => model.next(initial, { action: 'initialize' }), /requires prepared/);
  assert.throws(() => model.next(initial, { action: 'promote' }), /requires ready/);
  assert.throws(() => model.next(initial, { action: 'observe' }), /requires promoted/);
  let state = initial;
  for (let step = 1; step <= model.MAX_HISTORY; step += 1) {
    state = model.next(state, { action: 'reject-auto-swap' });
    assert.equal(state.history.at(-1).step, step);
  }
  assert.equal(state.history.length, 20);
  assert.throws(() => model.next(state, { action: 'reject-auto-swap' }), /20.*reset/i);
  assert.deepEqual(model.reset(state), initial);
  assert.equal(initial.history.length, 0);
});
