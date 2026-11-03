'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createRun, act, inspect } = require('./model.js');
const clone = (value) => JSON.parse(JSON.stringify(value));
const step = (state, type, extra = {}) => act(state, { type, ...extra });
const actions = (state, types) => types.reduce((current, type) => step(current, type), state);
const ready = (tenant = 'alpha') => actions(createRun({ tenant }), ['create', 'sync', 'transfer', 'route']);
const last = (state) => state.trace.at(-1);
const data = (state) => clone({ owners: state.owners, routes: state.routes, expected: state.expected, cells: state.cells });

test('loadable model starts with no migrated sample and an honest unknown result', () => {
  const state = createRun();
  assert.equal(state.tenant, 'alpha');
  assert.equal(state.targetCreated, false);
  assert.equal(inspect(state).verdict, 'unknown');
  assert.equal(inspect(state).attempts, 0);
});

test('adds an isolated cell with distinct capacity before any tenant routing', () => {
  const source = createRun();
  const state = step(source, 'create');
  assert.equal(state.targetCreated, true);
  assert.equal(source.targetCreated, false);
  assert.deepEqual(state.cells.B, { alpha: [], beta: [] });
  assert.deepEqual(state.routes, { alpha: 'A', beta: 'A' });
  assert.deepEqual(inspect(state).capacity, {
    allocatedRps: 200, readyRps: 200, workers: ['A-1', 'A-2', 'B-1', 'B-2']
  });
  assert.equal(inspect(state).verdict, 'unknown');
});

test('routing is blocked before target creation, synchronization and exclusive ownership', () => {
  let state = createRun();
  for (const type of ['route', 'create', 'route', 'sync', 'route']) {
    const before = data(state);
    state = step(state, type);
    if (type === 'route') {
      assert.equal(last(state).status, 'blocked');
      assert.deepEqual(data(state), before);
    }
  }
  assert.equal(inspect(state).blocked, 3);
  assert.equal(state.routes.alpha, 'A');
});

test('a late source write invalidates a copied snapshot until resynchronization', () => {
  let state = actions(createRun(), ['create', 'sync', 'sourceWrite']);
  assert.deepEqual(state.cells.B.alpha, [1, 2]);
  assert.deepEqual(state.expected.alpha, [1, 2, 3]);
  state = step(state, 'transfer');
  assert.equal(last(state).status, 'blocked');
  assert.equal(state.owners.alpha.cell, 'A');
  state = actions(state, ['sync', 'transfer', 'route', 'fence', 'journey']);
  assert.equal(inspect(state).verdict, 'success');
  assert.deepEqual(state.cells.B.alpha, [1, 2, 3, 4]);
  assert.deepEqual(state.expected.alpha, [1, 2, 3, 4]);
});

test('safe handoff preserves selected writes and unaffected service with exclusive epoch ownership', () => {
  const state = actions(ready(), ['fence', 'journey']);
  assert.deepEqual(state.owners, { alpha: { cell: 'B', epoch: 2 }, beta: { cell: 'A', epoch: 1 } });
  assert.deepEqual(state.routes, { alpha: 'B', beta: 'A' });
  assert.deepEqual(state.cells.B.alpha, state.expected.alpha);
  assert.deepEqual(state.cells.A.beta, state.expected.beta);
  assert.deepEqual(state.cells.B.beta, []);
  assert.equal(inspect(state).verdict, 'success');
  assert.equal(inspect(state).successful, 2);
  assert.equal(inspect(state).failed, 0);
  assert.equal(inspect(state).unknown, 0);
  assert.equal(inspect(state).fenceChecks, 1);
  assert.equal(inspect(state).completedBatches, 1);
});

test('old epoch writer is rejected without adding an acknowledged write or clobbering target data', () => {
  const current = step(ready(), 'journey');
  const before = data(current);
  const state = step(current, 'fence');
  assert.deepEqual(data(state), before);
  assert.equal(last(state).status, 'applied');
  assert.match(last(state).detail, /epoch 1.*rejected/i);
  assert.equal(inspect(state).fenceChecks, 1);
});

test('unhealthy target blocks synchronization and ownership, and source service remains usable', () => {
  let state = step(step(createRun(), 'create'), 'observe', { value: 'unready' });
  state = actions(state, ['sync', 'transfer', 'route', 'journey']);
  assert.equal(inspect(state).blocked, 3);
  assert.equal(inspect(state).successful, 2);
  assert.equal(inspect(state).capacity.readyRps, 100);
  assert.equal(inspect(state).capacity.allocatedRps, 200);
  assert.equal(inspect(state).verdict, 'unknown');
  assert.equal(state.owners.alpha.cell, 'A');
});

test('missing target observation is unknown, never a successful journey, and remains cumulative', () => {
  let state = step(ready(), 'observe', { value: 'unknown' });
  state = actions(state, ['fence', 'journey']);
  assert.equal(inspect(state).unknown, 1);
  assert.equal(inspect(state).successful, 1);
  assert.equal(inspect(state).failed, 0);
  assert.equal(inspect(state).capacity.readyRps, null);
  assert.equal(state.journeys[0].httpStatus, null);
  state = step(step(state, 'observe', { value: 'healthy' }), 'journey');
  assert.equal(inspect(state).verdict, 'unknown');
  assert.equal(inspect(state).unknown, 1);
  assert.equal(state.journeys.length, 4);
});

for (const [condition, status] of [['unready', 503], ['wrong-state', 200]]) {
  test(`${condition} is a measured user failure even after a later healthy journey`, () => {
    let state = step(ready(), 'observe', { value: condition });
    state = actions(state, ['fence', 'journey']);
    assert.equal(state.journeys[0].classification, 'failure');
    assert.equal(state.journeys[0].httpStatus, status);
    assert.equal(state.journeys[1].classification, 'success');
    state = step(step(state, 'observe', { value: 'healthy' }), 'journey');
    assert.equal(inspect(state).verdict, 'failure');
    assert.equal(inspect(state).failed, 1);
    assert.equal(inspect(state).successful, 3);
  });
}

test('a deliberate ownership-to-routing gap is a visible HTTP 409 journey failure, not a success', () => {
  let state = actions(createRun(), ['create', 'sync', 'transfer', 'journey']);
  assert.equal(state.journeys[0].httpStatus, 409);
  assert.equal(state.journeys[0].classification, 'failure');
  assert.equal(state.journeys[1].classification, 'success');
  state = actions(state, ['route', 'fence', 'journey']);
  assert.equal(inspect(state).verdict, 'failure');
  assert.equal(inspect(state).failed, 1);
});

test('beta can be selected without moving alpha or copying cross-tenant state into B', () => {
  const state = actions(ready('beta'), ['fence', 'journey']);
  assert.equal(state.routes.alpha, 'A');
  assert.equal(state.owners.alpha.cell, 'A');
  assert.equal(state.routes.beta, 'B');
  assert.deepEqual(state.cells.B.alpha, []);
  assert.deepEqual(state.cells.B.beta, state.expected.beta);
  assert.equal(inspect(state).verdict, 'success');
});

test('several journey batches preserve every acknowledged write in contiguous order', () => {
  let state = actions(ready(), ['fence', 'journey', 'journey', 'journey']);
  assert.deepEqual(state.expected.alpha, [1, 2, 3, 4, 5]);
  assert.deepEqual(state.cells.B.alpha, state.expected.alpha);
  assert.deepEqual(state.expected.beta, [1, 2, 3, 4]);
  assert.deepEqual(state.cells.A.beta, state.expected.beta);
  state = step(state, 'sync');
  assert.equal(last(state).status, 'blocked');
  assert.deepEqual(state.cells.B.alpha, [1, 2, 3, 4, 5]);
});

test('success needs migrated journeys and the explicit stale writer check, not just a changed route', () => {
  assert.equal(inspect(ready()).verdict, 'unknown');
  assert.equal(inspect(step(ready(), 'fence')).verdict, 'unknown');
  assert.equal(inspect(step(ready(), 'journey')).verdict, 'unknown');
  assert.equal(inspect(actions(ready(), ['journey', 'fence'])).verdict, 'success');
});

test('strict action and configuration guards reject unknown fields, values and types without mutation', () => {
  const state = createRun();
  const before = clone(state);
  for (const command of [null, [], {}, 'create', { type: 'surprise' }, { type: 'create', extra: 1 },
    { type: 'observe', value: 'Healthy' }, { type: 'observe', value: '<script>' },
    { type: 'select', tenant: 'gamma' }, { type: 'select', tenant: 1 }]) {
    assert.throws(() => act(state, command), /Invalid/);
    assert.deepEqual(state, before);
  }
  for (const input of [null, [], { tenant: 'gamma' }, { run: 0 }, { run: 10000 }, { run: 1.5 },
    { extra: true }, { tenant: 'alpha', run: '1' }]) {
    assert.throws(() => createRun(input), /Invalid/);
  }
});

test('malformed state, duplicate ownership, broken journals and cross-tenant target data are rejected', () => {
  for (const modify of [
    (state) => { state.extra = 1; },
    (state) => { state.owners.alpha = { cell: 'B', epoch: 1 }; },
    (state) => { state.owners.beta.cell = 'B'; },
    (state) => { state.cells.A.alpha = [1, 3]; },
    (state) => { state.cells.B.beta = [1]; },
    (state) => { state.routes.alpha = 'C'; },
    (state) => { state.journeys = [{}]; },
    (state) => { state.trace = [{ step: 9, action: 'create', status: 'applied', detail: 'x' }]; }
  ]) {
    const state = clone(createRun());
    modify(state);
    assert.throws(() => step(state, 'create'), /Invalid state/);
  }
  assert.throws(() => inspect(null), /Invalid state/);
});

test('state is deeply frozen and reducers never mutate prior snapshots', () => {
  const initial = createRun();
  const before = clone(initial);
  assert.ok(Object.isFrozen(initial));
  assert.ok(Object.isFrozen(initial.cells.A.alpha));
  assert.throws(() => initial.expected.alpha.push(3), TypeError);
  const state = actions(initial, ['create', 'sync', 'transfer', 'route', 'fence', 'journey']);
  assert.deepEqual(initial, before);
  assert.notDeepEqual(state.expected, initial.expected);
  assert.ok(Object.isFrozen(state.journeys[0]));
});

test('eight journey batches and forty-eight actions are enforced without truncating retained evidence', () => {
  let state = actions(ready(), ['fence']);
  for (let count = 0; count < 8; count += 1) state = step(state, 'journey');
  assert.equal(state.journeys.length, 16);
  assert.throws(() => step(state, 'journey'), /8 journey batches/);
  while (state.trace.length < 48) state = step(state, 'fence');
  const before = clone(state);
  assert.throws(() => step(state, 'fence'), /48 actions/);
  assert.deepEqual(state, before);
});

test('selection closes on the first action and observation requires a created cell', () => {
  let state = step(createRun(), 'select', { tenant: 'beta' });
  assert.equal(state.tenant, 'beta');
  assert.equal(state.trace.length, 0);
  state = step(state, 'observe', { value: 'unknown' });
  assert.equal(last(state).status, 'blocked');
  assert.equal(state.observation, 'healthy');
  state = step(state, 'select', { tenant: 'alpha' });
  assert.equal(last(state).status, 'blocked');
  assert.equal(state.tenant, 'beta');
});

test('identical bounded inputs produce byte-identical results without clocks, randomness or I/O', () => {
  const conduct = () => actions(createRun({ tenant: 'beta', run: 7 }), [
    'route', 'create', 'sync', 'sourceWrite', 'transfer', 'sync', 'transfer', 'route', 'fence', 'journey'
  ]);
  assert.equal(JSON.stringify(conduct()), JSON.stringify(conduct()));
});
