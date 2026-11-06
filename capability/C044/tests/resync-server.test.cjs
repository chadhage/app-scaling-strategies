'use strict';

// Review fix F1 (end to end): REPRO 3 of the verdict with a real server, real sockets and the real reducer, no DOM.
const assert = require('node:assert/strict');
const test = require('node:test');
const cursors = require('../cursor.js');
const reducer = require('../reducer.js');
const { startHost, openStream, fixtureContext } = require('./support.cjs');

const run = 'synthetic-run-001';
const id = (seq, epoch = 3) => cursors.format(run, epoch, seq);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const feed = (state, events) => events.reduce((current, item) => reducer.reduce(current, { type: 'event', id: item.id, event: item.event, data: item.data }), state);
const apply = (state, ...actions) => actions.reduce((current, action) => reducer.reduce(current, action), state);
const produce = (host, count) => { for (let step = 0; step < count; step++) host.run.produce(); };

async function attachAndReceive(host, count) {
  const live = await openStream(host.origin);
  produce(host, count);
  await live.waitFor((client) => client.events.length === count, `${count} live events`);
  live.destroy();
  return live.events;
}

test('F1 end to end: the real server refuses the rewound cursor, Resync replays the window, only the new events are applied', async () => {
  const host = await startHost({ run: { replayWindow: 40, totalSteps: 500 } });
  try {
    let state = apply(reducer.initial(), { type: 'open' });
    state = feed(state, await attachAndReceive(host, 73));
    assert.equal(state.lastSeq, 73);
    const cursor = id(state.lastSeq - 60);
    state = apply(state, { type: 'disconnect', by: 'user' }, { type: 'reconnect', cursor, rewound: 60, automatic: false });
    const refused = await openStream(host.origin, `/stream?lastEventId=${encodeURIComponent(cursor)}`);
    assert.equal(refused.status, 410);
    const failure = await refused.json();
    assert.equal(failure.error.code, 'CURSOR_EXPIRED');
    state = apply(state, { type: 'failure', failure }, { type: 'resync' });
    produce(host, 5);
    const fresh = await openStream(host.origin);
    assert.equal(fresh.status, 200);
    await fresh.waitFor((client) => client.events.length === 40, 'the retained window');
    assert.deepEqual(fresh.seqs(), range(39, 78));
    fresh.destroy();
    state = feed(state, fresh.events);
    const ids = state.events.map((item) => item.id);
    assert.deepEqual(ids, range(1, 78).map((seq) => id(seq)), 'no id was applied twice');
    assert.equal(new Set(ids).size, ids.length);
    assert.deepEqual([state.counts.applied, state.counts.duplicates, state.counts.outOfOrder, state.counts.rejected], [78, 35, 0, 0]);
    assert.deepEqual(state.gaps, []);
    assert.equal(state.marker.outcome, 'overlap');
    assert.equal(state.lastSeq, host.run.view().headSeq, 'the console ends at the head of the run');
  } finally {
    await host.close();
  }
});

test('F1 end to end: a window that starts after the cursor is a named gap, applied once', async () => {
  const host = await startHost({ run: { replayWindow: 8, totalSteps: 500 } });
  try {
    let state = apply(reducer.initial(), { type: 'open' });
    state = feed(state, await attachAndReceive(host, 6));
    produce(host, 30);
    const cursor = id(state.lastSeq);
    const refused = await openStream(host.origin, `/stream?lastEventId=${encodeURIComponent(cursor)}`);
    assert.equal(refused.status, 410);
    state = apply(state, { type: 'failure', failure: await refused.json() }, { type: 'resync' });
    const fresh = await openStream(host.origin);
    await fresh.waitFor((client) => client.events.length === 8, 'the retained window');
    fresh.destroy();
    state = feed(state, fresh.events);
    assert.deepEqual(state.gaps.map((gap) => [gap.afterSeq, gap.skippedFrom, gap.skippedTo]), [[6, 7, 28]]);
    assert.deepEqual(state.events.map((item) => item.seq), [...range(1, 6), ...range(29, 36)]);
    assert.deepEqual([state.counts.applied, state.counts.duplicates], [14, 0]);
  } finally {
    await host.close();
  }
});

test('F1 end to end: after a restart under a new epoch the old cursor is a typed epoch failure and the new epoch starts at its beginning', async () => {
  const before = await startHost({ context: fixtureContext(run, 2), run: { replayWindow: 40, totalSteps: 500 } });
  let state = apply(reducer.initial(), { type: 'open' });
  try {
    state = feed(state, await attachAndReceive(before, 12));
  } finally {
    await before.close();
  }
  const after = await startHost({ context: fixtureContext(run, 3), run: { replayWindow: 40, totalSteps: 500 } });
  try {
    const cursor = id(12, 2);
    state = apply(state, { type: 'disconnect', by: 'network' }, { type: 'reconnect', cursor, rewound: 0, automatic: true });
    const refused = await openStream(after.origin, `/stream?lastEventId=${encodeURIComponent(cursor)}`);
    assert.equal(refused.status, 409);
    const failure = await refused.json();
    assert.equal(failure.error.code, 'CURSOR_EPOCH_MISMATCH');
    state = apply(state, { type: 'failure', failure }, { type: 'resync' });
    produce(after, 4);
    const fresh = await openStream(after.origin);
    await fresh.waitFor((client) => client.events.length === 4, 'the new epoch window');
    fresh.destroy();
    state = feed(state, fresh.events);
    assert.deepEqual(state.events.map((item) => item.id), [...range(1, 12).map((seq) => id(seq, 2)), ...range(1, 4).map((seq) => id(seq, 3))]);
    assert.deepEqual([state.epoch, state.lastSeq, state.counts.duplicates, state.gaps.length, state.epochChanges?.length], [3, 4, 0, 0, 1]);
    assert.equal(feed(state, [{ id: id(13, 2), event: 'step-completed', data: { runId: run, epoch: 2, seq: 13 } }]).counts.rejected, 1);
  } finally {
    await after.close();
  }
});
