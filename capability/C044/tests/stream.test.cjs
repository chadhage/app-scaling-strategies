'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const cursors = require('../cursor.js');
const { startHost, openStream, rawConnect, startProxy, settle } = require('./support.cjs');

const runId = 'synthetic-run-001';
const idOf = (seq, run = runId, epoch = 3) => cursors.format(run, epoch, seq);
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);

async function withHost(options, body) {
  const host = await startHost(options);
  try {
    return await body(host);
  } finally {
    await host.close();
  }
}

function produce(host, count) {
  for (let step = 0; step < count; step++) host.run.produce();
}

test('a stream carries server-owned ids with run, epoch and sequence and strictly increasing order', async () => {
  await withHost({}, async (host) => {
    const client = await openStream(host.origin);
    assert.equal(client.status, 200);
    assert.match(client.headers['content-type'], /^text\/event-stream/);
    assert.match(client.headers['cache-control'], /no-store/);
    assert.match(client.headers['content-security-policy'], /connect-src 'self'/);
    assert.equal(client.headers['access-control-allow-origin'], undefined);
    assert.equal(client.headers['x-c044-cursor-source'], 'none');
    await client.waitFor((value) => value.comments.includes(': connected'), 'connected comment');
    assert.equal(client.retry, 1000);
    host.scheduler.advance(3000);
    await client.waitFor((value) => value.events.length === 3, 'three events');
    assert.deepEqual(client.events.map((event) => event.event), ['run-started', 'step-completed', 'step-completed']);
    assert.deepEqual(client.ids(), [1, 2, 3].map((seq) => idOf(seq)));
    for (const event of client.events) {
      assert.deepEqual([event.data.runId, event.data.epoch], [runId, 3]);
      assert.equal(event.id, idOf(event.data.seq));
    }
    client.destroy();
  });
});

test('a fresh stream replays the bounded window and then continues live without gaps', async () => {
  await withHost({}, async (host) => {
    produce(host, 12);
    const client = await openStream(host.origin);
    await client.waitFor((value) => value.events.length === 8, 'replayed window');
    assert.deepEqual(client.seqs(), range(5, 12));
    produce(host, 2);
    await client.waitFor((value) => value.events.length === 10, 'live events');
    assert.deepEqual(client.seqs(), range(5, 14));
    client.destroy();
  });
});

test('Last-Event-ID resumes at the next event and never re-sends an acknowledged event', async () => {
  await withHost({}, async (host) => {
    produce(host, 10);
    const client = await openStream(host.origin, '/stream', { 'Last-Event-ID': idOf(6) });
    assert.equal(client.headers['x-c044-cursor-source'], 'header');
    await client.waitFor((value) => value.events.length === 4, 'resumed events');
    assert.deepEqual(client.seqs(), [7, 8, 9, 10]);
    assert.equal(host.run.counters.resumes, 1);
    client.destroy();
  });
});

test('the query cursor resumes the same way and the header wins over a stale query cursor', async () => {
  await withHost({}, async (host) => {
    produce(host, 10);
    const byQuery = await openStream(host.origin, `/stream?lastEventId=${encodeURIComponent(idOf(8))}`);
    assert.equal(byQuery.headers['x-c044-cursor-source'], 'query');
    await byQuery.waitFor((value) => value.events.length === 2, 'query resume');
    assert.deepEqual(byQuery.seqs(), [9, 10]);
    const both = await openStream(host.origin, `/stream?lastEventId=${encodeURIComponent(idOf(2))}`, { 'Last-Event-ID': idOf(9) });
    assert.equal(both.headers['x-c044-cursor-source'], 'header');
    await both.waitFor((value) => value.events.length === 1, 'header wins');
    assert.deepEqual(both.seqs(), [10]);
    byQuery.destroy();
    both.destroy();
  });
});

test('a cursor equal to the head is valid: nothing is replayed and the next live event is head + 1', async () => {
  await withHost({}, async (host) => {
    produce(host, 5);
    const client = await openStream(host.origin, '/stream', { 'Last-Event-ID': idOf(5) });
    await client.waitFor((value) => value.comments.includes(': connected'), 'open');
    assert.deepEqual(client.events, []);
    produce(host, 1);
    await client.waitFor((value) => value.events.length === 1, 'next live event');
    assert.deepEqual(client.seqs(), [6]);
    client.destroy();
  });
});

const failures = [
  ['older than the replay window', () => idOf(2), 410, 'CURSOR_EXPIRED', 'resync-from-snapshot'],
  ['beyond the head of the run', () => idOf(99), 409, 'CURSOR_FROM_FUTURE', 'confirm-operator-review'],
  ['attributed to another run', () => idOf(5, 'synthetic-run-002'), 409, 'CURSOR_RUN_MISMATCH', 'confirm-operator-review'],
  ['attributed to another epoch', () => idOf(5, runId, 2), 409, 'CURSOR_EPOCH_MISMATCH', 'resync-from-snapshot'],
  ['attributed to a later epoch', () => idOf(5, runId, 4), 409, 'CURSOR_EPOCH_MISMATCH', 'resync-from-snapshot'],
  ['malformed', () => 'not-a-cursor', 400, 'CURSOR_MALFORMED', 'resync-from-snapshot'],
  ['non-canonical (leading zero)', () => `${runId}:3:07`, 400, 'CURSOR_MALFORMED', 'resync-from-snapshot'],
  ['empty', () => '', 400, 'CURSOR_MALFORMED', 'resync-from-snapshot'],
];
for (const [name, make, status, code, action] of failures) {
  test(`a cursor ${name} is the typed failure ${code} on both transports and opens no stream`, async () => {
    await withHost({ run: { replayWindow: 4 } }, async (host) => {
      produce(host, 10);
      for (const [route, headers] of [['/stream', { 'Last-Event-ID': make() }], [`/stream?lastEventId=${encodeURIComponent(make())}`, {}], [`/cursor?lastEventId=${encodeURIComponent(make())}`, {}]]) {
        const client = await openStream(host.origin, route, headers);
        assert.equal(client.status, status);
        assert.match(client.headers['content-type'], /^application\/json/);
        const body = await client.json();
        assert.equal(body.error.code, code);
        assert.deepEqual(client.events, []);
        assert.equal(cursors.inspectFailure(body).error.code, code, 'the page-side validator recognizes the server failure');
        assert.ok(body.allowedActions.some((item) => item.action === action));
        assert.deepEqual(body.context.headSeq, 10);
        assert.equal(body.context.firstRetainedSeq, 7);
      }
      assert.equal(host.run.counters.clientsAttached, 0);
      assert.equal(host.run.counters.rejectedCursors, 3);
    });
  });
}

test('ambiguous duplicate query cursors and unknown query keys are explicit failures', async () => {
  await withHost({}, async (host) => {
    produce(host, 3);
    const twice = await openStream(host.origin, `/stream?lastEventId=${idOf(1)}&lastEventId=${idOf(2)}`);
    assert.equal(twice.status, 400);
    assert.equal((await twice.json()).error.code, 'CURSOR_MALFORMED');
    const unknown = await openStream(host.origin, '/stream?after=1');
    assert.equal(unknown.status, 400);
    assert.equal((await unknown.json()).error.code, 'INVALID_QUERY');
    const joined = await openStream(host.origin, '/stream', { 'Last-Event-ID': `${idOf(1)}, ${idOf(2)}` });
    assert.equal(joined.status, 400);
    assert.equal((await joined.json()).error.code, 'CURSOR_MALFORMED');
  });
});

test('the cursor probe accepts a correct cursor without opening a stream', async () => {
  await withHost({}, async (host) => {
    produce(host, 4);
    const ok = await openStream(host.origin, `/cursor?lastEventId=${encodeURIComponent(idOf(3))}`);
    assert.equal(ok.status, 200);
    assert.deepEqual(await ok.json(), {
      schemaVersion: 1, ok: true, source: 'query', afterSeq: 3, runComplete: false, headSeq: 4, businessData: 'synthetic', localOnly: true,
    });
    assert.equal(host.run.counters.clientsTotal, 0);
  });
});

test('heartbeats are comments, not events, and a stream lifetime ends the response while the run continues', async () => {
  await withHost({ server: { heartbeatMs: 5000, streamLifetimeMs: 12000 } }, async (host) => {
    const client = await openStream(host.origin);
    host.scheduler.advance(5000);
    await client.waitFor((value) => value.comments.includes(': heartbeat'), 'heartbeat comment');
    assert.deepEqual(client.events.map((event) => event.data.seq), range(1, 5).slice(0, client.events.length));
    assert.equal(host.run.counters.heartbeats, 1);
    host.scheduler.advance(7000);
    await client.waitFor((value) => value.ended, 'bounded lifetime end');
    await settle(() => host.run.counters.clientsAttached === 0, 'detach after lifetime');
    const produced = host.run.counters.produced;
    host.scheduler.advance(3000);
    assert.equal(host.run.counters.produced, produced + 3);
    assert.equal(host.run.snapshot().run.producerActive, true);
    const resumed = await openStream(host.origin, '/stream', { 'Last-Event-ID': client.events.at(-1).id });
    await resumed.waitFor((value) => value.events.length === produced + 3 - client.events.length, 'resume after lifetime');
    assert.deepEqual(resumed.seqs(), range(client.events.length + 1, produced + 3));
    resumed.destroy();
  });
});

test('completion ends streams after run-completed and a cursor at the head then answers 204 completed', async () => {
  await withHost({ run: { totalSteps: 3, replayWindow: 16 } }, async (host) => {
    const live = await openStream(host.origin);
    host.scheduler.advance(5000);
    await live.waitFor((value) => value.ended, 'stream end after completion');
    assert.deepEqual(live.events.map((event) => event.event), ['run-started', 'step-completed', 'step-completed', 'step-completed', 'run-completed']);
    assert.equal(host.run.snapshot().run.status, 'completed');
    const done = await openStream(host.origin, '/stream', { 'Last-Event-ID': idOf(5) });
    assert.equal(done.status, 204);
    assert.equal(done.headers['x-c044-run-status'], 'completed');
    const replay = await openStream(host.origin, '/stream', { 'Last-Event-ID': idOf(3) });
    await replay.waitFor((value) => value.ended, 'replay of the remainder, then end');
    assert.deepEqual(replay.seqs(), [4, 5]);
    await settle(() => host.scheduler.activeJobs() === 0, 'timers released');
    assert.equal(host.scheduler.activeJobs(), 0, 'the finished run left no producer or heartbeat timer behind');
  });
});

test('the number of concurrent streams is bounded with a typed capacity failure', async () => {
  await withHost({ server: { maxStreams: 2 } }, async (host) => {
    const first = await openStream(host.origin);
    const second = await openStream(host.origin);
    await first.waitFor((value) => value.comments.length > 0, 'first open');
    await second.waitFor((value) => value.comments.length > 0, 'second open');
    const third = await openStream(host.origin);
    assert.equal(third.status, 503);
    assert.equal((await third.json()).error.code, 'STREAM_CAPACITY');
    first.destroy();
    await settle(() => host.run.counters.clientsAttached === 1, 'slot released');
    const again = await openStream(host.origin);
    assert.equal(again.status, 200);
    again.destroy();
    second.destroy();
  });
});

async function detachedGap(host, cursorId, ticks) {
  const before = host.run.counters.produced;
  const jobs = host.scheduler.activeJobs();
  host.scheduler.advance(host.run.intervalMs * ticks);
  assert.equal(host.run.counters.produced - before, ticks, 'the run kept producing while no client was attached');
  assert.equal(host.run.counters.clientsAttached, 0);
  assert.equal(host.run.snapshot().run.producerActive, true);
  assert.equal(host.scheduler.activeJobs(), jobs, 'no producer or timer was cancelled by the loss');
  const after = Number(cursorId.split(':')[2]);
  const head = host.run.view().headSeq;
  const resumed = await openStream(host.origin, '/stream', { 'Last-Event-ID': cursorId });
  await resumed.waitFor((value) => value.events.length === head - after, 'every event after the cursor');
  assert.deepEqual(resumed.seqs(), range(after + 1, head), 'every event after the cursor arrives exactly once, in order');
  resumed.destroy();
  return resumed;
}

test('an abrupt socket close in the middle of an event never stops the run and the gap resumes exactly once', async () => {
  await withHost({ run: { note: (seq) => (seq === 3 ? 'n'.repeat(400000) : 'small') } }, async (host) => {
    const raw = await rawConnect(host.port);
    host.scheduler.advance(2000);
    await raw.waitFor((state) => state.received.includes(`id: ${idOf(2)}\n`), 'two complete events');
    const complete = raw.received.length;
    host.run.produce();
    await raw.waitFor((state) => state.received.includes(`id: ${idOf(3)}\n`) && state.received.length > complete, 'first bytes of the big event');
    assert.equal(raw.received.endsWith('\n\n'), false, 'the cut really is in the middle of an event frame');
    raw.socket.destroy();
    await settle(() => host.run.counters.clientsAttached === 0, 'server noticed the abrupt close');
    assert.equal(host.run.counters.disconnects, 1);
    const resumed = await detachedGap(host, idOf(2), 4);
    assert.equal(resumed.events[0].data.note.length, 400000, 'the interrupted event is re-sent whole because it was never acknowledged');
  });
});

test('a slow reader that never drains is dropped by the server while the run keeps producing', async () => {
  const options = { run: { replayWindow: 64, intervalMs: 3600000, note: () => 'p'.repeat(100000) }, server: { slowReaderMs: 250 } };
  await withHost(options, async (host) => {
    const raw = await rawConnect(host.port, '/stream', {}, { pause: true });
    await settle(() => host.run.counters.clientsAttached === 1, 'slow reader attached');
    for (let step = 0; step < 40 && host.run.counters.slowReaderDrops === 0; step++) {
      host.run.produce();
      await new Promise((resolve) => setImmediate(resolve));
      host.scheduler.advance(250);
    }
    await settle(() => host.run.counters.slowReaderDrops === 1, 'slow reader drop');
    await settle(() => host.run.counters.clientsAttached === 0, 'slow reader detached');
    assert.equal(host.run.snapshot().run.producerActive, true);
    const head = host.run.view().headSeq;
    await detachedGap(host, idOf(head), 3);
    raw.socket.destroy();
  });
});

test('a reader that holds more than the hard memory bound is dropped at once while the run continues', async () => {
  const options = { run: { replayWindow: 64, intervalMs: 3600000, note: () => 'p'.repeat(100000) }, server: { maxBufferedBytes: 1024 } };
  await withHost(options, async (host) => {
    const raw = await rawConnect(host.port, '/stream', {}, { pause: true });
    await settle(() => host.run.counters.clientsAttached === 1, 'reader attached');
    host.run.produce();
    await settle(() => host.run.counters.slowReaderDrops === 1, 'hard bound drop');
    await settle(() => host.run.counters.clientsAttached === 0, 'reader detached');
    assert.equal(host.run.counters.produced, 1);
    assert.equal(host.run.snapshot().run.producerActive, true);
    raw.socket.destroy();
  });
});

test('a reader that drains in time is not dropped even when a frame exceeds the write buffer', async () => {
  const options = { run: { replayWindow: 64, intervalMs: 3600000, note: () => 'p'.repeat(100000) }, server: { slowReaderMs: 250 } };
  await withHost(options, async (host) => {
    const client = await openStream(host.origin);
    host.run.produce();
    await client.waitFor((value) => value.events.length === 1, 'big frame delivered');
    host.scheduler.advance(250);
    host.run.produce();
    await client.waitFor((value) => value.events.length === 2, 'second big frame delivered');
    assert.equal(host.run.counters.slowReaderDrops, 0);
    client.destroy();
  });
});

test('a proxy-style idle drop never stops the run and the client resumes without a gap or duplicate', async () => {
  await withHost({}, async (host) => {
    const proxy = await startProxy(host.port);
    try {
      const client = await openStream(`http://127.0.0.1:${proxy.port}`, '/stream', { Host: `127.0.0.1:${host.port}` });
      host.scheduler.advance(3000);
      await client.waitFor((value) => value.events.length === 3, 'events through the proxy');
      proxy.dropAll();
      await client.waitFor((value) => value.closed, 'client noticed the drop');
      await settle(() => host.run.counters.clientsAttached === 0, 'server noticed the drop');
      await detachedGap(host, client.events.at(-1).id, 5);
    } finally {
      await proxy.close();
    }
  });
});

test('parallel clients with different cursors each see exactly the events after their own cursor', async () => {
  await withHost({ run: { replayWindow: 32 } }, async (host) => {
    produce(host, 12);
    const cursorsUsed = [3, 9, 12, null];
    const clients = await Promise.all(cursorsUsed.map((cursor) => openStream(host.origin, '/stream', cursor === null ? {} : { 'Last-Event-ID': idOf(cursor) })));
    produce(host, 3);
    await Promise.all(clients.map((client, index) => client.waitFor((value) => value.events.length === 15 - (cursorsUsed[index] ?? 0), `client ${index}`)));
    clients.forEach((client, index) => assert.deepEqual(client.seqs(), range((cursorsUsed[index] ?? 0) + 1, 15)));
    assert.equal(host.run.counters.clientsAttached, 4);
    clients.forEach((client) => client.destroy());
    await settle(() => host.run.counters.clientsAttached === 0, 'all detached');
  });
});

test('a client reconnecting twice with the same cursor receives the same events each time, once per connection', async () => {
  await withHost({ run: { replayWindow: 32 } }, async (host) => {
    produce(host, 9);
    const first = await openStream(host.origin, '/stream', { 'Last-Event-ID': idOf(4) });
    const second = await openStream(host.origin, '/stream', { 'Last-Event-ID': idOf(4) });
    produce(host, 2);
    await Promise.all([first, second].map((client) => client.waitFor((value) => value.events.length === 7, 'replay plus live')));
    assert.deepEqual(first.seqs(), range(5, 11));
    assert.deepEqual(second.seqs(), range(5, 11));
    assert.deepEqual(first.ids(), second.ids());
    first.destroy();
    second.destroy();
  });
});

test('a reconnect storm leaves no attached client behind and every worker sees a gap-free ordered sequence', async () => {
  await withHost({ run: { replayWindow: 64, totalSteps: 200 } }, async (host) => {
    produce(host, 3);
    const workers = await Promise.all(range(1, 5).map(async (worker) => {
      const seen = [];
      for (let cycle = 0; cycle < 8; cycle++) {
        const after = seen.at(-1) ?? 0;
        produce(host, 1 + (worker % 3));
        const head = host.run.view().headSeq;
        const client = await openStream(host.origin, '/stream', after === 0 ? {} : { 'Last-Event-ID': idOf(after) });
        await client.waitFor((value) => value.events.length >= head - after, `worker ${worker} cycle ${cycle}`);
        const received = client.seqs();
        assert.equal(received[0], after + 1, 'resume starts at the next event');
        received.forEach((seq, index) => assert.equal(seq, after + 1 + index, 'contiguous, no gap, no duplicate'));
        seen.push(...received);
        client.destroy();
        await client.waitFor((value) => value.closed, 'storm client closed');
      }
      return seen;
    }));
    await settle(() => host.run.counters.clientsAttached === 0, 'storm detached');
    workers.forEach((seen) => seen.forEach((seq, index) => assert.equal(seq, index + 1)));
    assert.equal(host.run.counters.clientsTotal, 40);
    assert.equal(host.run.counters.disconnects, 40);
    assert.equal(host.run.snapshot().run.producerActive, true);
  });
});

test('the real client reducer over real sockets applies the gap once and drops a racing second connection as duplicates', async () => {
  const reducer = require('../reducer.js');
  await withHost({ run: { replayWindow: 64 } }, async (host) => {
    let state = reducer.initial();
    const feed = (event) => { state = reducer.reduce(state, { type: 'event', id: event.id, event: event.event, data: event.data }); };
    produce(host, 5);
    const first = await openStream(host.origin);
    await first.waitFor((value) => value.events.length === 5, 'first five events');
    first.events.forEach(feed);
    first.destroy();
    await settle(() => host.run.counters.clientsAttached === 0, 'first client detached');
    produce(host, 4);
    const a = await openStream(host.origin, '/stream', { 'Last-Event-ID': state.lastId });
    const b = await openStream(host.origin, '/stream', { 'Last-Event-ID': state.lastId });
    await Promise.all([a, b].map((client) => client.waitFor((value) => value.events.length === 4, 'gap events')));
    for (let index = 0; index < 4; index++) {
      feed(a.events[index]);
      feed(b.events[index]);
    }
    assert.deepEqual(state.events.map((event) => event.seq), range(1, 9), 'the gap events are shown exactly once, in order');
    assert.equal(state.counts.applied, 9);
    assert.equal(state.counts.duplicates, 4, 'the racing second delivery is counted, not shown');
    assert.deepEqual(state.dropped.map((entry) => entry.display), Array(4).fill('dropped duplicate'));
    assert.equal(state.lastId, idOf(9));
    a.destroy();
    b.destroy();
  });
});
