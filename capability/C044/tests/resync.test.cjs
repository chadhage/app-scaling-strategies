'use strict';

// Review fix F1 (reducer): Resync must never make an already applied id appear again. Specification: C044-resync.feature.
const assert = require('node:assert/strict');
const test = require('node:test');
const cursors = require('../cursor.js');
const reducer = require('../reducer.js');

const run = 'synthetic-run-001';
const id = (seq, epoch = 3) => cursors.format(run, epoch, seq);
const delivery = (seq, epoch = 3) => ({
  type: 'event', id: id(seq, epoch), event: seq === 1 ? 'run-started' : 'step-completed',
  data: { runId: run, epoch, seq, step: seq - 1, of: 500, note: `n${seq}` },
});
const apply = (state, ...actions) => actions.reduce((current, action) => reducer.reduce(current, action), state);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const window = (from, to, epoch = 3) => range(from, to).map((seq) => delivery(seq, epoch));
const typed = (code, headSeq, replayWindow, epoch = 3) => JSON.parse(JSON.stringify(cursors.failure(code, {
  runId: run, epoch, headSeq, firstRetainedSeq: Math.max(1, headSeq - replayWindow + 1), replayWindow,
}, id(2))));
const shown = (state) => state.events.map((event) => event.id);

test('F1: Resync after a rewound re-request replays the window as 35 counted duplicates and applies only 74..78', () => {
  let state = apply(reducer.initial(), { type: 'open' }, ...window(1, 73));
  state = apply(state, { type: 'disconnect', by: 'user' }, { type: 'reconnect', cursor: id(13), rewound: 60, automatic: false },
    { type: 'failure', failure: typed('CURSOR_EXPIRED', 73, 40) }, { type: 'resync' });
  state = apply(state, ...window(39, 78));
  assert.deepEqual(shown(state), range(1, 78).map((seq) => id(seq)), 'every id is shown once, in order');
  assert.equal(state.counts.applied, 78);
  assert.equal(state.counts.duplicates, 35);
  assert.equal(state.droppedTotal, 35);
  assert.deepEqual(state.dropped.map((entry) => entry.id), range(39, 73).map((seq) => id(seq)));
  assert.ok(state.dropped.every((entry) => entry.display === 'dropped duplicate'));
  assert.deepEqual(state.gaps, [], 'nothing was skipped');
  assert.deepEqual([state.counts.outOfOrder, state.counts.rejected, state.counts.resyncs], [0, 0, 1]);
  assert.deepEqual([state.epoch, state.lastSeq, state.lastId], [3, 78, id(78)]);
  assert.equal(state.marker.kind, 'resynced');
  assert.equal(state.marker.outcome, 'overlap');
});

test('the watermark survives the Resync action itself and the marker waits for the first delivery', () => {
  const before = apply(reducer.initial(), ...window(1, 20), { type: 'failure', failure: typed('CURSOR_EXPIRED', 60, 40) });
  const state = reducer.reduce(before, { type: 'resync' });
  assert.deepEqual([state.epoch, state.lastSeq, state.lastId], [3, 20, id(20)]);
  assert.equal(state.connection, 'connecting');
  assert.equal(state.marker.outcome, 'pending');
  assert.equal(state.marker.fromId, id(20));
  assert.deepEqual(state.gaps, [], 'no gap is recorded before any event shows that something was skipped');
  assert.equal(state.counts.resyncs, 1);
});

test('a retained window that starts after lastSeq + 1 records a gap that names the exact skipped range', () => {
  let state = apply(reducer.initial(), ...window(1, 13), { type: 'failure', failure: typed('CURSOR_EXPIRED', 79, 40) }, { type: 'resync' });
  state = apply(state, ...window(40, 44));
  assert.deepEqual(state.gaps.map((gap) => [gap.epoch, gap.afterSeq, gap.skippedFrom, gap.skippedTo]), [[3, 13, 14, 39]]);
  assert.deepEqual([state.marker.outcome, state.marker.skippedFrom, state.marker.skippedTo], ['gap', 14, 39]);
  assert.deepEqual(state.events.map((event) => event.seq), [...range(1, 13), ...range(40, 44)]);
  assert.deepEqual([state.counts.applied, state.counts.duplicates, state.counts.outOfOrder], [18, 0, 0]);
  assert.equal(apply(state, delivery(40)).counts.duplicates, 1, 'a later arrival of an applied id is a counted duplicate');
});

test('only a new epoch resets the watermark; the new epoch starts at its own beginning and the old epoch never returns', () => {
  const failure = typed('CURSOR_EPOCH_MISMATCH', 4, 40, 4);
  let state = apply(reducer.initial(), ...window(1, 20), { type: 'failure', failure }, { type: 'resync' });
  assert.deepEqual([state.epoch, state.lastSeq], [3, 20], 'the epoch is still the last applied one until the first delivery');
  state = apply(state, ...window(1, 3, 4));
  assert.deepEqual(shown(state), [...range(1, 20).map((seq) => id(seq)), ...range(1, 3).map((seq) => id(seq, 4))]);
  assert.deepEqual([state.epoch, state.lastSeq, state.counts.applied, state.counts.duplicates], [4, 3, 23, 0]);
  assert.deepEqual(state.gaps, []);
  assert.deepEqual(state.epochChanges.map((change) => [change.fromEpoch, change.toEpoch, change.afterId, change.firstId]), [[3, 4, id(20), id(1, 4)]]);
  assert.deepEqual([state.marker.outcome, state.marker.epoch], ['new-epoch', 4]);
  const stale = reducer.reduce(state, delivery(21, 3));
  assert.deepEqual([stale.counts.rejected, stale.dropped.at(-1).reason, stale.events.length], [1, 'foreign-epoch', 23]);
  assert.equal(reducer.reduce(state, delivery(3, 4)).counts.duplicates, 1);
  const unrelated = reducer.reduce(apply(state, { type: 'failure', failure }, { type: 'resync' }), delivery(1, 2));
  assert.equal(unrelated.counts.rejected, 1, 'an older epoch is rejected even while a resync is pending');
});

test('resync twice in a row keeps one watermark; every replayed window is counted again as duplicates', () => {
  const failure = typed('CURSOR_EXPIRED', 40, 8);
  let state = apply(reducer.initial(), ...window(1, 30), { type: 'failure', failure }, { type: 'resync' }, { type: 'failure', failure }, { type: 'resync' });
  assert.deepEqual([state.counts.resyncs, state.lastSeq, state.marker.outcome], [2, 30, 'pending']);
  state = apply(state, ...window(23, 32), { type: 'failure', failure }, { type: 'resync' }, ...window(25, 36));
  assert.deepEqual(shown(state), range(1, 36).map((seq) => id(seq)));
  assert.deepEqual([state.counts.applied, state.counts.duplicates, state.counts.resyncs], [36, 8 + 8, 3]);
  assert.deepEqual(state.gaps, []);
});

test('an empty window changes nothing and a window that ends before lastSeq is all duplicates', () => {
  const failure = typed('CURSOR_EXPIRED', 10, 4);
  let state = apply(reducer.initial(), ...window(1, 10), { type: 'failure', failure }, { type: 'resync' }, { type: 'open' });
  assert.deepEqual([state.lastSeq, state.counts.applied, state.events.length, state.marker.outcome], [10, 10, 10, 'pending']);
  state = apply(state, ...window(2, 6));
  assert.deepEqual([state.counts.duplicates, state.counts.applied, state.lastSeq, state.marker.outcome], [5, 10, 10, 'overlap']);
  assert.equal(apply(state, delivery(11)).counts.applied, 11);
  assert.equal(apply(state, delivery(15)).counts.outOfOrder, 1, 'after the first delivery a skipped sequence is dropped again, not a gap');
});

test('a resync that finds the stream continuing at the next event, or nothing applied yet, records no gap', () => {
  const failure = typed('CURSOR_MALFORMED', 20, 40);
  const continued = apply(reducer.initial(), ...window(1, 5), { type: 'failure', failure }, { type: 'resync' }, ...window(6, 8));
  assert.deepEqual([continued.marker.outcome, continued.gaps.length, continued.counts.applied], ['continued', 0, 8]);
  const fresh = apply(reducer.initial(), { type: 'failure', failure }, { type: 'resync' }, ...window(9, 10));
  assert.deepEqual([fresh.marker.outcome, fresh.gaps.length, fresh.counts.applied, fresh.lastSeq], ['fresh', 0, 2, 10]);
});

test('a cursor reconnect after a pending resync is a normal resume: a skipped sequence is out-of-order, not a gap', () => {
  const failure = typed('CURSOR_EXPIRED', 90, 40);
  let state = apply(reducer.initial(), ...window(1, 10), { type: 'failure', failure }, { type: 'resync' },
    { type: 'reconnect', cursor: id(10), rewound: 0, automatic: true }, delivery(14));
  assert.deepEqual([state.counts.outOfOrder, state.gaps.length, state.lastSeq], [1, 0, 10]);
  state = apply(state, delivery(11));
  assert.equal(state.counts.applied, 11);
});

test('a rejected first delivery after a resync does not settle it: the next valid one still decides', () => {
  const failure = typed('CURSOR_EXPIRED', 90, 40);
  let state = apply(reducer.initial(), ...window(1, 10), { type: 'failure', failure }, { type: 'resync' },
    { ...delivery(30), data: { runId: run, epoch: 3, seq: 31 } });
  assert.equal(state.counts.rejected, 1);
  assert.equal(state.marker.outcome, 'pending');
  state = apply(state, ...window(30, 31));
  assert.deepEqual(state.gaps.map((gap) => [gap.skippedFrom, gap.skippedTo]), [[11, 29]]);
});
