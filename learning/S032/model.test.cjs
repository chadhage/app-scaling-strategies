'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const model = require('./model.js');
const replay = (state) => model.apply(state, { type: 'replay' });
const reassign = (state, clientId, result = 'complete') =>
  model.apply(state, { type: 'reassign', clientId, result });

test('loadable initial fixture is unknown, never unobserved success', () => {
  const view = model.inspect(model.create());
  assert.equal(view.verdict, 'unknown');
  assert.equal(view.attempted, 0);
  assert.equal(view.migrated, 0);
});

test('100 percent nominal still observes two blue pins; zero of two migrated', () => {
  const view = model.inspect(replay(model.create()));
  assert.deepEqual(view.clients.map((client) => client.observed), ['blue', 'blue', 'green', 'green']);
  assert.equal(view.completed, 4);
  assert.equal(view.migrated, 0);
  assert.equal(view.verdict, 'unknown');
  assert.equal(view.retirement.state, 'blocked');
});

test('green cookie overrides zero percent; deterministic unpinned client follows allocation', () => {
  const state = model.apply(model.create(), { type: 'weight', greenPercent: 0 });
  const view = model.inspect(replay(state));
  assert.deepEqual(view.clients.map((client) => client.observed), ['blue', 'blue', 'green', 'blue']);
  assert.equal(view.greenPercent, 0);
});

test('controlled reassignment counts only the originally blue-pinned client', () => {
  const state = reassign(replay(model.create()), 'pinned-a');
  const view = model.inspect(state);
  assert.equal(view.migrated, 1);
  assert.equal(view.clients[0].cookie, 'green');
  assert.equal(view.clients[0].observed, 'green');
  assert.equal(view.retirement.state, 'blocked');
  assert.equal(view.attempted, 5);
});

test('fresh complete migration permits guarded retirement, not merely a nominal percentage', () => {
  let state = replay(model.create());
  state = reassign(reassign(state, 'pinned-a'), 'pinned-b');
  assert.equal(model.inspect(state).migrated, 2);
  assert.equal(model.inspect(state).retirement.state, 'ready');
  assert.equal(model.inspect(state).verdict, 'success');
  state = model.apply(state, { type: 'retire' });
  assert.equal(model.inspect(state).blueRetired, true);
  assert.equal(model.inspect(state).retirement.state, 'retired');
});

test('missing reassignment reply remains unknown and blocks retirement', () => {
  const state = reassign(replay(model.create()), 'pinned-a', 'unknown');
  const view = model.inspect(state);
  assert.equal(view.unknown, 1);
  assert.equal(view.migrated, 0);
  assert.equal(view.verdict, 'unknown');
  assert.equal(view.retirement.state, 'blocked');
  assert.equal(view.clients[0].cookie, 'green');
  assert.equal(view.clients[0].observed, null);
});

test('interruption survives recovery as a cumulative failure, never a successful migration run', () => {
  let state = reassign(replay(model.create()), 'pinned-a', 'interrupted');
  assert.equal(model.inspect(state).verdict, 'failure');
  state = reassign(replay(state), 'pinned-b');
  const view = model.inspect(state);
  assert.equal(view.migrated, 2);
  assert.equal(view.interrupted, 1);
  assert.equal(view.retirement.state, 'ready');
  assert.equal(view.verdict, 'failure');
  assert.equal(view.requests.filter((request) => request.status === 503).length, 1);
});

test('blocked retirement is a measured safety guard, not a user interruption', () => {
  const state = model.apply(replay(model.create()), { type: 'retire' });
  const view = model.inspect(state);
  assert.equal(view.timeline.length, 2);
  assert.equal(view.timeline[1].outcome, 'blocked');
  assert.equal(view.blueRetired, false);
  assert.equal(view.interrupted, 0);
  assert.equal(view.verdict, 'unknown');
});

test('returned states and views are immutable deterministic independent snapshots', () => {
  const first = model.create();
  const before = JSON.stringify(first);
  const second = replay(first);
  assert.equal(JSON.stringify(first), before);
  assert.notEqual(first, second);
  assert.ok(Object.isFrozen(second.events[0]));
  const view = model.inspect(second);
  assert.ok(Object.isFrozen(view.clients[0]));
  assert.throws(() => { view.clients[0].cookie = 'green'; }, TypeError);
  assert.deepEqual(model.inspect(replay(model.create())), view);
});

test('reassignment before a current-epoch inspection is rejected without changing state', () => {
  const state = model.create();
  const before = JSON.stringify(state);
  assert.throws(() => reassign(state, 'pinned-a'), /Replay the cohort/);
  assert.equal(JSON.stringify(state), before);
});

test('percentages require bounded actual integers, not coercions or negative zero', () => {
  const state = model.create();
  for (const value of [-1, 101, 0.5, '100', '', null, undefined, true, NaN, Infinity, -Infinity, -0, {}, []]) {
    assert.throws(() => model.apply(state, { type: 'weight', greenPercent: value }), /integer/);
  }
  for (const value of [0, 1, 75, 76, 99, 100]) {
    assert.equal(model.inspect(model.apply(state, { type: 'weight', greenPercent: value })).greenPercent, value);
  }
  assert.equal(state.events.length, 0);
});

test('action schemas reject missing and extra fields and unsupported clients or replies', () => {
  const state = replay(model.create());
  for (const action of [
    null, [], {}, { type: 'retire', force: true }, { type: 'replay', result: 'complete' },
    { type: 'weight' }, { type: 'weight', greenPercent: 100, extra: 1 },
    { type: 'reassign', clientId: 'green-c', result: 'complete' },
    { type: 'reassign', clientId: 'new-d', result: 'complete' },
    { type: 'reassign', clientId: 'pinned-a', result: 'success' },
    { type: 'reassign', clientId: 'pinned-a' },
    { type: 'reassign', clientId: '<script>', result: 'complete' },
    { type: 'force-retire' }
  ]) assert.throws(() => model.apply(state, action), /Invalid lesson input\/state/);
  assert.equal(model.inspect(state).attempted, 4);
});

test('state schemas reject forged derived results, bad versions and impossible run accounting', () => {
  const clone = () => JSON.parse(JSON.stringify(replay(model.create())));
  for (const state of [null, [], Object.create(null),
    { ...clone(), migrated: 2 }, { ...clone(), schemaVersion: 2 },
    { ...clone(), run: 2 }, { ...clone(), evicted: 1 },
    { ...clone(), events: [{ type: 'reassign', clientId: 'pinned-a', result: 'complete' }] }
  ]) {
    assert.throws(() => model.inspect(state), /Invalid lesson input\/state/);
    assert.throws(() => model.reset(state), /Invalid lesson input\/state/);
    assert.throws(() => replay(state), /Invalid lesson input\/state/);
  }
});

test('sparse arrays, custom array fields, record accessors and symbols are rejected without invoking getters', () => {
  let getterCalls = 0;
  const getter = {};
  Object.defineProperty(getter, 'type', { enumerable: true, get() { getterCalls += 1; return 'retire'; } });
  assert.throws(() => model.apply(model.create(), getter), /data fields/);
  const accessorState = { ...model.create() };
  Object.defineProperty(accessorState, 'events', { enumerable: true, get() { getterCalls += 1; return []; } });
  assert.throws(() => model.inspect(accessorState), /data fields/);
  const sparse = { ...model.create(), events: Array(1) };
  assert.throws(() => model.inspect(sparse), /bounded dense array|holes/);
  const array = [];
  array.extra = 1;
  assert.throws(() => model.inspect({ ...model.create(), events: array }), /bounded dense array/);
  const symbolAction = { type: 'replay', [Symbol('extra')]: true };
  assert.throws(() => model.apply(model.create(), symbolAction), /data fields/);
  assert.equal(getterCalls, 0);
});

test('applying allocation invalidates all old observations even when the percentage is unchanged', () => {
  let state = reassign(reassign(replay(model.create()), 'pinned-a'), 'pinned-b');
  state = model.apply(state, { type: 'weight', greenPercent: 100 });
  let view = model.inspect(state);
  assert.equal(view.epoch, 2);
  assert.equal(view.migrated, 0);
  assert.equal(view.inspected, false);
  assert.ok(view.clients.every((client) => !client.fresh));
  assert.equal(view.retirement.state, 'blocked');
  assert.throws(() => reassign(state, 'pinned-a'), /Replay the cohort/);
  view = model.inspect(replay(state));
  assert.equal(view.migrated, 2);
  assert.equal(view.retirement.state, 'ready');
  assert.equal(view.verdict, 'success');
});

test('unknown reply remains in cumulative impact after current destination evidence recovers', () => {
  let state = reassign(replay(model.create()), 'pinned-a', 'unknown');
  const missing = model.inspect(state).requests.at(-1);
  assert.equal(missing.requested, 'green');
  assert.equal(missing.observed, null);
  assert.equal(missing.status, null);
  state = reassign(replay(state), 'pinned-b');
  const view = model.inspect(state);
  assert.equal(view.retirement.state, 'ready');
  assert.equal(view.migrated, 2);
  assert.equal(view.unknown, 1);
  assert.equal(view.verdict, 'unknown');
  assert.deepEqual(view.requests[4], missing);
});

test('the unpinned bucket threshold is exact while the green pin ignores allocation', () => {
  for (const [percent, target] of [[0, 'blue'], [75, 'blue'], [76, 'green'], [100, 'green']]) {
    const view = model.inspect(replay(model.apply(model.create(), { type: 'weight', greenPercent: percent })));
    assert.equal(view.clients[2].observed, 'green');
    assert.equal(view.clients[3].observed, target);
  }
});

test('even an all-green sample cannot retire blue below nominal 100 percent', () => {
  let state = replay(model.apply(model.create(), { type: 'weight', greenPercent: 99 }));
  state = reassign(reassign(state, 'pinned-a'), 'pinned-b');
  const view = model.inspect(state);
  assert.ok(view.clients.every((client) => client.observed === 'green'));
  assert.equal(view.migrated, 2);
  assert.equal(view.retirement.state, 'blocked');
  assert.match(view.retirement.blockers.join(' '), /new unpinned requests/);
});

test('retirement is terminal but archive and reset remains available', () => {
  let state = reassign(reassign(replay(model.create()), 'pinned-a'), 'pinned-b');
  state = model.apply(state, { type: 'retire' });
  for (const action of [{ type: 'retire' }, { type: 'replay' }, { type: 'weight', greenPercent: 0 },
    { type: 'reassign', clientId: 'pinned-a', result: 'complete' }]) {
    assert.throws(() => model.apply(state, action), /Blue is retired/);
  }
  assert.equal(model.inspect(model.reset(state)).blueRetired, false);
});

test('24-action hard bound retains all 96 attempted requests and rejects an extra event', () => {
  let state = model.create();
  for (let index = 0; index < model.limits.maxActions; index += 1) state = replay(state);
  const before = JSON.stringify(state);
  const view = model.inspect(state);
  assert.equal(view.actionsRemaining, 0);
  assert.equal(view.requests.length, 96);
  assert.throws(() => replay(state), /24-action limit/);
  assert.equal(JSON.stringify(state), before);
  assert.throws(() => model.inspect({ ...state, events: [...state.events, { type: 'replay' }] }), /bounded dense array/);
});

test('reset preserves complete failed run trace while restoring known current defaults', () => {
  const failed = reassign(replay(model.create()), 'pinned-a', 'interrupted');
  const before = model.inspect(failed);
  const reset = model.reset(failed);
  const view = model.inspect(reset);
  assert.equal(view.run, 2);
  assert.equal(view.verdict, 'unknown');
  assert.equal(view.attempted, 0);
  assert.equal(view.clients[0].cookie, 'blue');
  assert.equal(view.archives[0].summary.verdict, 'failure');
  assert.deepEqual(view.archives[0].requests, before.requests);
  assert.deepEqual(view.archives[0].events, failed.events);
  assert.ok(Object.isFrozen(reset.archives[0].events));
});

test('archive retention is bounded to three complete runs with explicit eviction accounting', () => {
  let state = model.create();
  for (let run = 1; run <= 4; run += 1) state = model.reset(replay(state));
  const view = model.inspect(state);
  assert.equal(view.run, 5);
  assert.equal(view.evicted, 1);
  assert.deepEqual(view.archives.map((archive) => archive.run), [2, 3, 4]);
  assert.ok(view.archives.every((archive) => archive.requests.length === 4));
});

test('empty reset is idempotent and never evicts or creates an empty archive', () => {
  const empty = model.create();
  assert.deepEqual(model.reset(empty), empty);
  const reset = model.reset(replay(empty));
  assert.deepEqual(model.reset(model.reset(reset)), reset);
});

test('archive corruption and impossible archived action sequences fail closed', () => {
  const good = model.reset(replay(model.create()));
  for (const archive of [
    { run: 9, events: [{ type: 'replay' }] }, { run: 1, events: [] },
    { run: 1, events: [{ type: 'reassign', clientId: 'pinned-a', result: 'complete' }] },
    { run: 1, events: [{ type: 'replay' }], verdict: 'success' }
  ]) assert.throws(() => model.inspect({ ...good, archives: [archive] }), /Invalid lesson input\/state/);
});

test('run lifetime is bounded without silently deleting retained proof at the boundary', () => {
  const state = {
    schemaVersion: 1, run: 1000, evicted: 996, events: [{ type: 'replay' }],
    archives: [997, 998, 999].map((run) => ({ run, events: [{ type: 'replay' }] }))
  };
  assert.equal(model.inspect(state).run, 1000);
  assert.throws(() => model.reset(state), /1000-run lifetime limit/);
  assert.throws(() => model.inspect({ ...state, run: 1001 }), /Run number/);
});

test('replaying state rejects appended actions after a retired destination', () => {
  let state = reassign(reassign(replay(model.create()), 'pinned-a'), 'pinned-b');
  state = model.apply(state, { type: 'retire' });
  const forged = { ...state, events: [...state.events, { type: 'replay' }] };
  assert.throws(() => model.inspect(forged), /Blue is retired/);
});
