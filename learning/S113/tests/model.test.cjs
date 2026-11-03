'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const model = require('../model.js');

test('cold destination is measured negative, never approved warm capacity', () => {
  let state = model.createState();
  state = model.step(state, { action: 'begin', fixtureId: 'cold' });
  state = model.step(state, { action: 'warm' });
  assert.equal(state.current.capacity.result, 'negative');
});

const act = (state, action) => model.step(state, { action });
const begin = (fixtureId, state = model.createState()) => model.step(state, { action: 'begin', fixtureId });
const prerequisites = (fixtureId, state) => act(act(begin(fixtureId, state), 'warm'), 'sync');
const finish = (fixtureId, state) => {
  const handoff = act(prerequisites(fixtureId, state), 'handoff');
  return handoff.phase === 'migrate' ? act(handoff, 'migrate') : handoff;
};
const rejectsUnchanged = (state, input, code) => {
  const snapshot = JSON.stringify(state);
  assert.throws(() => model.step(state, input), (error) => error instanceof model.LessonError && error.code === code);
  assert.equal(JSON.stringify(state), snapshot);
};

test('initial and begun fixture separate declared baseline from unknown measured readiness', () => {
  const initial = model.createState();
  assert.equal(initial.current, null);
  assert.deepEqual(initial.history, []);
  assert.deepEqual(model.controls(initial), { begin: true, fixture: true, warm: false,
    sync: false, handoff: false, migrate: false, reset: true });
  const state = begin('ready', initial);
  assert.equal(state.phase, 'warm');
  assert.equal(state.current.owner, 'region-amber');
  assert.equal(state.current.ownerEpoch, 7);
  assert.equal(state.current.evacuation, 'UNVERIFIED');
  assert.equal(state.current.evacuated, false);
  for (const gate of ['capacity', 'state', 'fence', 'routes', 'journeys']) assert.equal(state.current[gate], null);
  assert.equal(state.history[0].result, 'unknown');
  assert.equal(state.current.sourceRetained, true);
  assert.equal(initial.runCount, 0);
});

test('capacity and required state precede one fenced destination writer and then traffic', () => {
  let state = begin('ready');
  state = act(state, 'warm');
  assert.equal(state.current.capacity.result, 'positive');
  assert.equal(state.current.capacity.units, 4);
  assert.equal(state.current.owner, 'region-amber');
  state = act(state, 'sync');
  assert.equal(state.current.state.checkpoint, 42);
  assert.equal(state.current.state.sessions, true);
  assert.equal(state.current.state.result, 'positive');
  assert.equal(state.current.owner, 'region-amber');
  state = act(state, 'handoff');
  assert.equal(state.current.fence.result, 'positive');
  assert.equal(state.current.fence.sourceFenced, true);
  assert.equal(state.current.fence.destinationEpoch, 8);
  assert.equal(state.current.fence.eligibleWriters, 1);
  assert.equal(state.current.owner, 'region-violet');
  assert.equal(state.current.ownerEpoch, 8);
  assert.equal(state.current.handoff, 'approved');
  assert.equal(state.current.evacuation, 'UNVERIFIED');
  assert.equal(state.current.sourceRetained, true);
  assert.equal(state.current.routes, null);
  assert.equal(state.current.journeys, null);
  const previous = state;
  state = act(state, 'migrate');
  assert.equal(state.current.routes.result, 'positive');
  assert.equal(state.current.routes.observed, 2);
  assert.equal(state.current.journeys.result, 'positive');
  assert.equal(state.current.journeys.successful, 2);
  assert.equal(state.current.journeys.interrupted, 0);
  assert.equal(state.current.journeys.unknown, 0);
  assert.equal(state.current.journeys.effects, 1);
  assert.equal(state.current.evacuated, true);
  assert.equal(state.current.evacuation, 'VERIFIED');
  assert.equal(state.current.sourceRetained, false);
  assert.deepEqual(state.history.slice(0, 4), previous.history);
  assert.equal(previous.current.routes, null);
});

for (const [fixtureId, gate, observed] of [['cold', 'capacity', 1], ['stale', 'state', 40]]) {
  test(`${fixtureId} prerequisites block even fictional fencing and migration`, () => {
    const state = finish(fixtureId);
    assert.equal(state.current[gate].result, 'negative');
    assert.equal(state.current[gate][gate === 'capacity' ? 'units' : 'checkpoint'], observed);
    assert.equal(state.current.fence.result, 'unknown');
    assert.equal(state.current.fence.sourceFenced, null);
    assert.equal(state.current.fence.eligibleWriters, null);
    assert.equal(state.current.owner, 'region-amber');
    assert.equal(state.current.ownerEpoch, 7);
    assert.equal(state.current.handoff, 'blocked');
    assert.equal(state.current.evacuation, 'BLOCKED');
    assert.equal(state.current.evacuated, false);
    assert.equal(state.current.sourceRetained, true);
    assert.equal(state.current.routes, null);
    assert.equal(state.current.journeys, null);
    assert.equal(state.history.at(-1).result, 'negative');
    rejectsUnchanged(state, { action: 'migrate' }, 'ERR_S113_ORDER');
  });
}

test('split writer evidence remains two unfenced writers and never becomes exclusive success', () => {
  const state = finish('split');
  assert.equal(state.current.capacity.result, 'positive');
  assert.equal(state.current.state.result, 'positive');
  assert.equal(state.current.fence.result, 'negative');
  assert.equal(state.current.fence.sourceFenced, false);
  assert.equal(state.current.fence.eligibleWriters, 2);
  assert.equal(state.current.owner, 'region-amber');
  assert.equal(state.current.handoff, 'blocked');
  assert.equal(state.current.evacuation, 'BLOCKED');
  assert.equal(state.current.journeys, null);
  rejectsUnchanged(state, { action: 'migrate' }, 'ERR_S113_ORDER');
});

test('missing observations stay null and unknown with no handoff, journey or inferred zero', () => {
  const state = finish('missing');
  for (const gate of ['capacity', 'state', 'fence']) assert.equal(state.current[gate].result, 'unknown');
  assert.equal(state.current.capacity.units, null);
  assert.equal(state.current.capacity.warm, null);
  assert.equal(state.current.state.checkpoint, null);
  assert.equal(state.current.state.sessions, null);
  assert.equal(state.current.fence.sourceFenced, null);
  assert.equal(state.current.fence.destinationEpoch, null);
  assert.equal(state.current.fence.eligibleWriters, null);
  assert.equal(state.current.owner, 'region-amber');
  assert.equal(state.current.handoff, 'unverified');
  assert.equal(state.current.evacuation, 'UNVERIFIED');
  assert.equal(state.current.sourceRetained, true);
  assert.equal(state.current.journeys, null);
  assert.ok(state.history.every((event) => event.result === 'unknown'));
});

test('exclusive writer and successful journeys cannot excuse a sampled source route', () => {
  const state = finish('route-lag');
  assert.equal(state.current.fence.result, 'positive');
  assert.equal(state.current.fence.eligibleWriters, 1);
  assert.equal(state.current.routes.result, 'negative');
  assert.equal(state.current.journeys.result, 'positive');
  assert.equal(state.current.journeys.samples[0].route, 'region-amber');
  assert.equal(state.current.journeys.samples[1].route, 'region-violet');
  assert.equal(state.current.journeys.successful, 2);
  assert.equal(state.current.journeys.interrupted, 0);
  assert.equal(state.current.journeys.effects, 1);
  assert.equal(state.current.evacuation, 'BLOCKED');
  assert.equal(state.current.sourceRetained, true);
  assert.equal(state.current.owner, 'region-violet');
});

test('failed mutating journey is interrupted and zero-effect despite converged prerequisites/routes', () => {
  const state = finish('journey-failure');
  for (const gate of ['capacity', 'state', 'fence', 'routes']) assert.equal(state.current[gate].result, 'positive');
  assert.equal(state.current.journeys.result, 'negative');
  assert.equal(state.current.journeys.successful, 1);
  assert.equal(state.current.journeys.interrupted, 1);
  assert.equal(state.current.journeys.unknown, 0);
  assert.equal(state.current.journeys.effects, 0);
  const failed = state.current.journeys.samples[1];
  assert.equal(failed.response, 'failed');
  assert.equal(failed.latencyMs, 145);
  assert.equal(failed.session, false);
  assert.equal(failed.effects, 0);
  assert.equal(failed.result, 'negative');
  assert.equal(state.current.owner, 'region-violet');
  assert.equal(state.current.ownerEpoch, 8);
  assert.equal(state.current.fence.sourceFenced, true);
  assert.equal(state.current.sourceRetained, true);
  assert.equal(state.current.evacuated, false);
  assert.match(state.history.at(-1).detail, /Do not automatically restore a fenced source writer/);
});

test('independent deterministic runs retain earlier positive/negative/unknown history within seven runs', () => {
  let state = model.createState();
  let previous = [];
  for (const { id } of model.FIXTURES) {
    state = finish(id, state);
    assert.deepEqual(state.history.slice(0, previous.length), previous);
    previous = structuredClone(state.history);
  }
  assert.equal(state.runCount, 7);
  assert.equal(state.history.length, 31);
  assert.ok(state.history.length <= model.CONTRACT.maxHistoryEvents);
  assert.deepEqual([...new Set(state.history.map((event) => event.result))].sort(), ['negative', 'positive', 'unknown']);
  assert.deepEqual(state.history.map((event) => event.index), Array.from({ length: 31 }, (_, index) => index + 1));
  assert.equal(model.controls(state).begin, false);
  assert.equal(model.controls(state).fixture, false);
  assert.equal(model.controls(state).reset, true);
  rejectsUnchanged(state, { action: 'begin', fixtureId: 'ready' }, 'ERR_S113_BUDGET');
  assert.deepEqual(finish('ready'), finish('ready'));
  const reset = model.createState();
  assert.equal(reset.runCount, 0);
  assert.equal(reset.history.length, 0);
  assert.equal(state.history.length, 31);
});

test('typed action records reject malformed values, extra keys and unsupported fixtures without mutation', () => {
  const state = model.createState();
  const invalid = [null, undefined, true, false, 1, 'begin', [], Object.create(null),
    { action: true }, { action: 1 }, { action: null }, { action: ['begin'] },
    { action: 'BEGIN', fixtureId: 'ready' }, { action: ' begin ', fixtureId: 'ready' },
    { action: 'reset' }, { action: 'begin' }, { action: 'begin', fixtureId: true },
    { action: 'begin', fixtureId: 1 }, { action: 'begin', fixtureId: null },
    { action: 'begin', fixtureId: {} }, { action: 'begin', fixtureId: [] },
    { action: 'begin', fixtureId: 'Ready' }, { action: 'begin', fixtureId: ' ready ' },
    { action: 'begin', fixtureId: '__proto__' }, { action: 'begin', fixtureId: 'constructor' },
    { action: 'begin', fixtureId: 'toString' }, { action: 'begin', fixtureId: 'unknown' },
    { action: 'begin', fixtureId: 'ready', units: 999 },
    { action: 'warm', fixtureId: 'ready' }, { action: 'migrate', override: true },
    Object.assign(Object.create({ action: 'begin' }), { fixtureId: 'ready' }),
    { action: 'begin', fixtureId: 'ready', [Symbol('override')]: true }];
  for (const input of invalid) rejectsUnchanged(state, input, 'ERR_S113_INPUT');
  let getterCalls = 0;
  rejectsUnchanged(state, { get action() { getterCalls++; return 'begin'; }, fixtureId: 'ready' }, 'ERR_S113_INPUT');
  assert.equal(getterCalls, 0);
});

test('immutable issued-state guard refuses forged, cloned, inherited and primitive state', () => {
  const state = prerequisites('ready');
  for (const forged of [null, undefined, 0, false, 'state', {}, [], { ...state },
    structuredClone(state), Object.create(state), { ...state, phase: 'migrate', current: { owner: 'region-violet' } }]) {
    assert.throws(() => model.step(forged, { action: 'handoff' }), { code: 'ERR_S113_STATE' });
    assert.throws(() => model.controls(forged), { code: 'ERR_S113_STATE' });
  }
  assert.ok(Object.isFrozen(state));
  assert.ok(Object.isFrozen(state.current));
  assert.ok(Object.isFrozen(state.current.capacity));
  assert.ok(Object.isFrozen(state.history));
  assert.ok(Object.isFrozen(state.history[0]));
  assert.throws(() => { state.phase = 'migrate'; }, TypeError);
  assert.throws(() => { state.current.capacity.result = 'positive'; }, TypeError);
  assert.throws(() => state.history.push({ result: 'positive' }), TypeError);
  assert.throws(() => { model.CONTRACT.requiredCapacityUnits = 0; }, TypeError);
  assert.equal(state.phase, 'handoff');
  assert.equal(state.history.length, 3);
});

test('out-of-order and repeated actions cannot bypass any prerequisite', () => {
  let state = model.createState();
  for (const action of ['warm', 'sync', 'handoff', 'migrate']) rejectsUnchanged(state, { action }, 'ERR_S113_ORDER');
  state = begin('ready', state);
  rejectsUnchanged(state, { action: 'begin', fixtureId: 'cold' }, 'ERR_S113_ORDER');
  for (const action of ['sync', 'handoff', 'migrate']) rejectsUnchanged(state, { action }, 'ERR_S113_ORDER');
  state = act(state, 'warm');
  for (const action of ['warm', 'handoff', 'migrate']) rejectsUnchanged(state, { action }, 'ERR_S113_ORDER');
  state = act(state, 'sync');
  for (const action of ['warm', 'sync', 'migrate']) rejectsUnchanged(state, { action }, 'ERR_S113_ORDER');
  state = act(state, 'handoff');
  for (const action of ['warm', 'sync', 'handoff']) rejectsUnchanged(state, { action }, 'ERR_S113_ORDER');
  state = act(state, 'migrate');
  rejectsUnchanged(state, { action: 'migrate' }, 'ERR_S113_ORDER');
});
