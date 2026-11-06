'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const cursors = require('../cursor.js');
const reducer = require('../reducer.js');

const run = 'synthetic-run-001';
const id = (seq, runId = run, epoch = 3) => cursors.format(runId, epoch, seq);
const delivery = (seq, extra = {}) => ({
  type: 'event', id: id(seq), event: seq === 1 ? 'run-started' : 'step-completed',
  data: { runId: run, epoch: 3, seq, step: seq - 1, of: 40, note: `n${seq}` }, ...extra,
});
const apply = (state, ...actions) => actions.reduce((current, action) => reducer.reduce(current, action), state);

test('events are applied in strict sequence and the state is immutable', () => {
  let state = reducer.initial();
  assert.equal(Object.isFrozen(state) && Object.isFrozen(state.events) && Object.isFrozen(state.counts), true);
  state = apply(state, { type: 'connect' }, { type: 'open' }, delivery(1), delivery(2), delivery(3));
  assert.deepEqual(state.events.map((event) => event.seq), [1, 2, 3]);
  assert.equal(state.lastId, id(3));
  assert.deepEqual([state.runId, state.epoch, state.lastSeq], [run, 3, 3]);
  assert.equal(state.counts.applied, 3);
  assert.equal(state.connection, 'open');
  assert.throws(() => { state.events.push(1); }, TypeError);
  const before = state;
  const unchanged = reducer.reduce(state, { type: 'nonsense' });
  assert.equal(unchanged, before);
  assert.equal(reducer.reduce(state, null), before);
  assert.equal(reducer.reduce(state, 'event'), before);
});

test('the first delivery sets the baseline whatever its sequence is', () => {
  const state = apply(reducer.initial(), delivery(9), delivery(10));
  assert.deepEqual(state.events.map((event) => event.seq), [9, 10]);
  assert.equal(state.counts.outOfOrder, 0);
});

test('a duplicate delivery is dropped by id, counted and shown as dropped, never as a new event', () => {
  const state = apply(reducer.initial(), delivery(1), delivery(2), delivery(2), delivery(1));
  assert.deepEqual(state.events.map((event) => event.seq), [1, 2]);
  assert.equal(state.counts.duplicates, 2);
  assert.equal(state.counts.applied, 2);
  assert.deepEqual(state.dropped.map((entry) => [entry.reason, entry.display, entry.id]), [
    ['duplicate', 'dropped duplicate', id(2)], ['duplicate', 'dropped duplicate', id(1)],
  ]);
  assert.equal(state.droppedTotal, 2);
  assert.equal(state.lastSeq, 2, 'a duplicate never moves the cursor backwards');
});

test('an out-of-order delivery that skips ahead is dropped and counted, and the cursor stays at the last applied event', () => {
  const state = apply(reducer.initial(), delivery(1), delivery(2), delivery(5));
  assert.deepEqual(state.events.map((event) => event.seq), [1, 2]);
  assert.equal(state.counts.outOfOrder, 1);
  assert.equal(state.dropped[0].display, 'dropped out-of-order (expected sequence 3)');
  assert.equal(state.lastId, id(2));
  const healed = apply(state, delivery(3));
  assert.deepEqual(healed.events.map((event) => event.seq), [1, 2, 3]);
});

test('foreign, malformed and mis-attributed deliveries are rejected and counted, not applied', () => {
  const base = apply(reducer.initial(), delivery(1));
  const rejections = {
    'malformed-id': { ...delivery(2), id: 'nonsense' },
    'unknown-event': { ...delivery(2), event: 'steal-credentials' },
    'attribution-mismatch': { ...delivery(2), data: { runId: run, epoch: 3, seq: 99 } },
    'attribution-mismatch ': { ...delivery(2), data: null },
    'foreign-run': { ...delivery(2), id: id(2, 'synthetic-run-002'), data: { runId: 'synthetic-run-002', epoch: 3, seq: 2 } },
    'foreign-epoch': { ...delivery(2), id: id(2, run, 4), data: { runId: run, epoch: 4, seq: 2 } },
  };
  for (const [reason, action] of Object.entries(rejections)) {
    const state = reducer.reduce(base, action);
    assert.equal(state.counts.rejected, 1, reason);
    assert.equal(state.counts.applied, 1, reason);
    assert.equal(state.dropped[0].reason, reason.trim());
    assert.equal(state.events.length, 1);
  }
  const symbolId = reducer.reduce(base, { ...delivery(2), id: Symbol('x') });
  assert.equal(symbolId.dropped[0].id, null);
  const long = reducer.reduce(base, { ...delivery(2), id: `${'x'.repeat(500)}` });
  assert.equal(long.dropped[0].id.length, 80);
});

test('delivery data is copied and bounded: oversize or non-JSON data is a rejected delivery', () => {
  const base = apply(reducer.initial(), delivery(1));
  const huge = reducer.reduce(base, { ...delivery(2), data: { runId: run, epoch: 3, seq: 2, note: 'x'.repeat(5000) } });
  assert.equal(huge.dropped[0].reason, 'attribution-mismatch');
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal(reducer.reduce(base, { ...delivery(2), data: cyclic }).counts.rejected, 1);
  assert.equal(reducer.reduce(base, { ...delivery(2), data: undefined }).counts.rejected, 1);
  const source = { runId: run, epoch: 3, seq: 2, note: 'copy' };
  const copied = reducer.reduce(base, { ...delivery(2), data: source });
  source.note = 'changed later';
  assert.equal(copied.events[1].data.note, 'copy');
});

test('disconnect and reconnect carry a visible marker and the server counters measure the gap', () => {
  let state = apply(reducer.initial(), { type: 'connect' }, { type: 'open' }, delivery(1), delivery(2), delivery(3));
  state = apply(state, { type: 'disconnect', by: 'user' }, { type: 'counters', phase: 'disconnect', produced: 3 });
  assert.equal(state.connection, 'disconnected');
  assert.equal(state.detachedBy, 'user');
  assert.equal(state.counts.disconnects, 1);
  assert.equal(reducer.reduce(state, { type: 'disconnect', by: 'user' }), state, 'a second disconnect while detached is not counted');
  assert.deepEqual(state.detached, { producedAtDisconnect: 3, producedAtReconnect: null, advanced: null });
  state = apply(state, { type: 'counters', phase: 'reconnect', produced: 9 }, { type: 'reconnect', cursor: id(3), rewound: 0, automatic: false });
  assert.deepEqual(state.detached, { producedAtDisconnect: 3, producedAtReconnect: 9, advanced: 6 });
  assert.deepEqual(state.marker, { kind: 'reconnected', fromId: id(3), fromSeq: 3, rewound: 0, automatic: false });
  assert.equal(state.counts.reconnects, 1);
  assert.equal(state.connection, 'connecting');
  state = apply(state, delivery(4), delivery(5));
  assert.deepEqual(state.events.map((event) => event.seq), [1, 2, 3, 4, 5], 'the gap events arrive exactly once');
  assert.equal(reducer.reduce(state, { type: 'counters', phase: 'reconnect', produced: 20 }).detached.advanced, 6, 'a measurement is taken once');
  assert.equal(reducer.reduce(reducer.initial(), { type: 'counters', phase: 'reconnect', produced: 20 }).detached, null);
  for (const bad of [-1, 1.5, '3', undefined]) {
    assert.equal(reducer.reduce(state, { type: 'counters', phase: 'disconnect', produced: bad }), state);
  }
  assert.equal(reducer.reduce(state, { type: 'counters', phase: 'other', produced: 1 }), state);
});

test('a re-request after a reconnect shows duplicates as dropped and reports the rewind in the marker', () => {
  let state = apply(reducer.initial(), { type: 'open' }, delivery(1), delivery(2), delivery(3), delivery(4));
  state = apply(state, { type: 'disconnect' }, { type: 'reconnect', cursor: id(1), rewound: 3, automatic: true });
  assert.equal(state.detachedBy, 'network');
  assert.deepEqual([state.marker.rewound, state.marker.automatic, state.marker.fromSeq], [3, true, 1]);
  state = apply(state, delivery(2), delivery(3), delivery(4), delivery(5));
  assert.equal(state.counts.duplicates, 3);
  assert.deepEqual(state.events.map((event) => event.seq), [1, 2, 3, 4, 5]);
  const fresh = reducer.reduce(reducer.initial(), { type: 'reconnect', cursor: null, rewound: -4, automatic: 'yes' });
  assert.deepEqual(fresh.marker, { kind: 'reconnected', fromId: null, fromSeq: null, rewound: 0, automatic: false });
  assert.equal(reducer.reduce(reducer.initial(), { type: 'reconnect', cursor: 'junk' }).marker.fromId, null);
});

test('completion closes the console and later opens do not revive it', () => {
  let state = apply(reducer.initial(), { type: 'open' }, delivery(1), { ...delivery(2), event: 'run-completed' });
  assert.equal(state.completed, true);
  assert.equal(state.connection, 'complete');
  assert.equal(reducer.reduce(state, { type: 'open' }), state);
  state = apply(state, delivery(2));
  assert.equal(state.counts.duplicates, 1);
  assert.equal(reducer.reduce(apply(reducer.initial(), { type: 'stop' }), { type: 'open' }).connection, 'stopped');
});

test('typed failures are revalidated and offer only their allowed recovery actions', () => {
  const body = JSON.parse(JSON.stringify(cursors.failure('CURSOR_EXPIRED', { runId: run, epoch: 3, headSeq: 20, firstRetainedSeq: 13, replayWindow: 8 }, id(2))));
  let state = apply(reducer.initial(), delivery(1), delivery(2), { type: 'failure', failure: body });
  assert.equal(state.connection, 'failed');
  assert.equal(state.failure.error.code, 'CURSOR_EXPIRED');
  assert.equal(reducer.reduce(state, { type: 'notice', code: 'REVIEW_NEEDED_CONFIRMED' }), state, 'not an allowed action for an expired cursor');
  assert.equal(reducer.reduce(state, { type: 'notice', code: 'REINSPECTED' }).notice, 'REINSPECTED');
  const resynced = reducer.reduce(state, { type: 'resync' });
  assert.equal(resynced.connection, 'connecting');
  assert.equal(resynced.failure, null);
  assert.equal(resynced.notice, 'RESYNCED');
  assert.deepEqual([resynced.lastSeq, resynced.epoch, resynced.runId], [null, null, run]);
  assert.deepEqual(resynced.gaps, [{ afterId: id(2), afterSeq: 2 }]);
  assert.equal(resynced.events.length, 2, 'history is retained across a resync');
  assert.equal(resynced.marker.kind, 'resynced');
  const afterResync = apply(resynced, { ...delivery(40), id: id(40, run, 4), data: { runId: run, epoch: 4, seq: 40 } });
  assert.equal(afterResync.epoch, 4, 'a resync may adopt the new epoch');
  const future = JSON.parse(JSON.stringify(cursors.failure('CURSOR_FROM_FUTURE', { runId: run, epoch: 3, headSeq: 5, firstRetainedSeq: 1, replayWindow: 8 }, id(99))));
  const review = apply(reducer.initial(), { type: 'failure', failure: future });
  assert.equal(reducer.reduce(review, { type: 'resync' }), review, 'resync is not offered for a future cursor');
  assert.equal(reducer.reduce(review, { type: 'notice', code: 'REVIEW_NEEDED_CONFIRMED' }).notice, 'REVIEW_NEEDED_CONFIRMED');
  assert.equal(reducer.reduce(reducer.initial(), { type: 'notice', code: 'REVIEW_NEEDED_CONFIRMED' }).notice, null);
  assert.equal(reducer.reduce(reducer.initial(), { type: 'resync' }).notice, null);
  const forged = apply(reducer.initial(), { type: 'failure', failure: { ok: false, error: { code: 'CURSOR_EXPIRED' } } });
  assert.equal(forged.failure.error.code, 'UNRECOGNIZED_ERROR');
  assert.deepEqual(forged.failure.allowedActions.map((item) => item.action), ['confirm-operator-review', 'stop']);
  assert.equal(reducer.reduce(forged, { type: 'stop' }).notice, 'STOPPED');
});

test('the view and the dropped list are bounded without silently losing the count', () => {
  let state = reducer.initial();
  for (let seq = 1; seq <= reducer.viewLimit + 5; seq++) state = reducer.reduce(state, delivery(seq));
  assert.equal(state.events.length, reducer.viewLimit);
  assert.equal(state.eventsEvicted, 5);
  assert.equal(state.counts.applied, reducer.viewLimit + 5);
  assert.equal(state.events[0].seq, 6);
  for (let step = 0; step < reducer.dropLimit + 7; step++) state = reducer.reduce(state, delivery(1));
  assert.equal(state.dropped.length, reducer.dropLimit);
  assert.equal(state.droppedTotal, reducer.dropLimit + 7);
  assert.equal(state.droppedEvicted, 7);
  assert.equal(state.counts.duplicates, reducer.dropLimit + 7);
});
