'use strict';

// Streams on real HTTP/2 sockets: pacing and deadlines on manual time, cancel, backpressure, parallelism, bidirectional chat.
const assert = require('node:assert/strict');
const http2 = require('node:http2');
const net = require('node:net');
const { test } = require('node:test');
const { ManualTimers } = require('../timers.cjs');
const s = require('./support.cjs');

const turns = async (count) => { for (let index = 0; index < count; index += 1) await new Promise((resolve) => setImmediate(resolve)); };

test('a grpc-timeout expires exactly when manual time reaches it: three ticks, then DEADLINE_EXCEEDED trailers', async () => {
  const timers = new ManualTimers();
  await s.withServer({ timers }, async (server) => {
    const stream = s.openStream(server.origin, { 'grpc-timeout': '100m' });
    stream.request.end(s.frame(s.watchRequest('alpha', 1000, 25)));
    for (let step = 1; step <= 3; step += 1) {
      await timers.whenPending(2);
      timers.advance(25);
      assert.equal(await s.until(() => stream.collector.frames.length === step), true);
    }
    await timers.whenPending(2);
    timers.advance(25);
    await stream.closed;
    assert.equal(stream.seen.trailers['grpc-status'], '4');
    assert.deepEqual(stream.collector.frames.map((frame) => s.fields(frame.payload)[2]), [1, 2, 3]);
    assert.deepEqual(['outcome', 'finishedBy', 'produced'].map((key) => server.calls[0][key]), ['DEADLINE_EXCEEDED', 'deadline', 3]);
    assert.equal(timers.pending, 0, 'the paced sleep and the deadline timer are both cleared');
    stream.session.destroy();
  });
});

test('a valid but enormous grpc-timeout is clamped to the largest timer delay, never wrapped to one millisecond', async () => {
  const timers = new ManualTimers();
  await s.withServer({ timers }, async (server) => {
    const stream = s.openStream(server.origin, { 'grpc-timeout': '99999999H' });
    stream.request.end(s.frame(s.watchRequest('alpha', 3, 25)));
    for (let step = 1; step <= 3; step += 1) {
      await timers.whenPending(2);
      timers.advance(25);
      assert.equal(await s.until(() => stream.collector.frames.length === step), true);
    }
    await stream.closed;
    assert.equal(stream.seen.trailers['grpc-status'], '0', 'the deadline did not fire after 1 ms');
    const long = s.openStream(server.origin, { 'grpc-timeout': '99999999H' });
    long.request.end(s.frame(s.watchRequest('alpha', 3, 10000)));
    await timers.whenPending(2);
    timers.advance(2147483647);
    await long.closed;
    assert.equal(long.seen.trailers['grpc-status'], '4', 'the clamp is exactly the largest delay Node can schedule');
    stream.session.destroy();
    long.session.destroy();
  });
});

test('a zero timeout is an immediate DEADLINE_EXCEEDED, delivered as Trailers-Only or as trailers', async () => {
  const timers = new ManualTimers();
  await s.withServer({ timers }, async (server) => {
    const stream = s.openStream(server.origin, { 'grpc-timeout': '0m' });
    stream.request.end(s.frame(s.watchRequest('alpha', 5, 25)));
    await timers.whenPending(1);
    timers.advance(0);
    await stream.closed;
    assert.equal((stream.seen.trailers ?? stream.seen.headers)['grpc-status'], '4');
    assert.equal(stream.collector.frames.length, 0);
    assert.equal(server.calls[0].outcome, 'DEADLINE_EXCEEDED');
    stream.session.destroy();
  });
});

test('a client reset after two ticks is CANCELLED on the server, which stops, clears its timer and writes nothing more', async () => {
  const timers = new ManualTimers();
  await s.withServer({ timers }, async (server) => {
    const stream = s.openStream(server.origin);
    stream.request.end(s.frame(s.watchRequest('alpha', 1000, 25)));
    for (let step = 1; step <= 2; step += 1) {
      await timers.whenPending(1);
      timers.advance(25);
      await s.until(() => stream.collector.frames.length === step);
    }
    const finished = s.once(server, 'call-finished');
    stream.request.close(http2.constants.NGHTTP2_CANCEL);
    const [record] = await finished;
    assert.deepEqual(['outcome', 'finishedBy', 'produced', 'writesAfterFinish'].map((key) => record[key]), ['CANCELLED', 'client-reset', 2, 0]);
    assert.equal(await s.until(() => timers.pending === 0), true, 'the sleeping generator was woken and its timer cleared');
    await turns(5);
    assert.equal(record.produced, 2);
    stream.session.destroy();
  });
});

test('a cancel before the first tick and a client that vanishes both end CANCELLED with nothing produced', async () => {
  const timers = new ManualTimers();
  await s.withServer({ timers }, async (server) => {
    const early = s.openStream(server.origin);
    early.request.end(s.frame(s.watchRequest('alpha', 10, 25)));
    await timers.whenPending(1);
    const first = s.once(server, 'call-finished');
    early.request.close(http2.constants.NGHTTP2_CANCEL);
    assert.equal((await first)[0].produced, 0);
    const gone = s.openStream(server.origin);
    gone.request.end(s.frame(s.watchRequest('alpha', 10, 25)));
    await s.until(() => timers.pending >= 1);
    const second = s.once(server, 'call-finished');
    gone.session.destroy();
    const [record] = await second;
    assert.equal(record.outcome, 'CANCELLED');
    assert.ok(['client-reset', 'connection-closed'].includes(record.finishedBy), record.finishedBy);
    assert.equal(record.produced, 0);
    early.session.destroy();
  });
});

test('a slow consumer makes the server wait for drain: it stops producing, then every message arrives once and in order', async () => {
  await s.withServer({}, async (server) => {
    const waiting = s.once(server, 'backpressure');
    const stream = s.openStream(server.origin);
    stream.request.pause();
    stream.request.end(s.frame(s.watchRequest('alpha', 200, 0, 16384)));
    const [record] = await waiting;
    await turns(20);
    const stalledAt = record.produced;
    assert.ok(stalledAt < 20, `the server stopped at ${stalledAt} of 200 messages`);
    await turns(20);
    assert.equal(record.produced, stalledAt, 'nothing more is produced while the consumer is stalled');
    assert.equal(server.active, 1);
    stream.request.resume();
    await stream.closed;
    assert.equal(stream.seen.trailers['grpc-status'], '0');
    assert.deepEqual(stream.collector.frames.map((frame) => s.fields(frame.payload)[2]), Array.from({ length: 200 }, (_, index) => index + 1));
    assert.ok(server.calls[0].backpressureWaits >= 1);
    assert.equal(server.calls[0].produced, 200);
    stream.session.destroy();
  });
});

test('eight parallel streams on one session and eight concurrent clients never see each other\'s messages', async () => {
  await s.withServer({}, async (server) => {
    const session = http2.connect(server.origin);
    session.on('error', () => undefined);
    const streams = Array.from({ length: 8 }, (_, index) => {
      const request = session.request({ ':method': 'POST', ':path': s.WATCH, 'content-type': 'application/grpc' });
      request.on('error', () => undefined);
      const collector = s.frameCollector(request);
      const closed = new Promise((resolve) => request.once('close', resolve));
      request.end(s.frame(s.watchRequest(`topic-${index}`, 25)));
      return { collector, closed, index };
    });
    await Promise.all(streams.map((stream) => stream.closed));
    for (const { collector, index } of streams) {
      const messages = collector.frames.map((frame) => s.fields(frame.payload));
      assert.deepEqual(messages.map((message) => message[2]), Array.from({ length: 25 }, (_, step) => step + 1));
      assert.deepEqual(new Set(messages.map((message) => message[1])), new Set([`topic-${index}`]));
    }
    session.destroy();
    const results = await Promise.all(Array.from({ length: 8 }, (_, index) => s.rawCall(server.origin, { body: [s.frame(s.watchRequest(`client-${index}`, 25))] })));
    results.forEach((result, index) => {
      const messages = s.splitFrames(result.data).map((frame) => s.fields(frame.payload));
      assert.deepEqual(messages.map((message) => message[2]), Array.from({ length: 25 }, (_, step) => step + 1));
      assert.deepEqual(new Set(messages.map((message) => message[1])), new Set([`client-${index}`]));
      assert.equal(result.trailers['grpc-status'], '0');
    });
    assert.equal(server.calls.length, 16);
  });
});

test('bidirectional chat answers each note as it arrives with a server-owned sequence, then ends with OK trailers', async () => {
  await s.withServer({}, async (server) => {
    const stream = s.openStream(server.origin, {}, s.CHAT);
    for (const [index, text] of ['one', 'two', 'three'].entries()) {
      stream.request.write(s.frame(s.noteMessage(text)));
      assert.equal(await s.until(() => stream.collector.frames.length === index + 1), true, `echo ${index + 1} arrives before the next note is sent`);
    }
    stream.request.end();
    await stream.closed;
    assert.deepEqual(stream.collector.frames.map((frame) => s.fields(frame.payload)), [
      { 1: 'echo: one', 2: 1, 3: 1 }, { 1: 'echo: two', 2: 2, 3: 2 }, { 1: 'echo: three', 2: 3, 3: 3 }]);
    assert.equal(stream.seen.trailers['grpc-status'], '0');
    assert.equal(server.calls[0].received, 3);
    stream.session.destroy();
  });
});

test('chat refuses an oversized note and a malformed note mid-stream with INVALID_ARGUMENT trailers', async () => {
  await s.withServer({}, async (server) => {
    const big = s.openStream(server.origin, {}, s.CHAT);
    big.request.end(s.frame(s.noteMessage('x'.repeat(1025))));
    await big.closed;
    assert.equal(big.seen.trailers['grpc-status'], '3');
    assert.equal(server.calls[0].finishedBy, 'handler');
    const bad = s.openStream(server.origin, {}, s.CHAT);
    bad.request.write(s.frame(s.noteMessage('fine')));
    await s.until(() => bad.collector.frames.length === 1);
    bad.request.end(s.frame(Buffer.from('0a05ff', 'hex')));
    await bad.closed;
    assert.equal(bad.collector.frames.length, 1);
    assert.equal(bad.seen.trailers['grpc-status'], '3');
    assert.equal(server.calls[1].finishedBy, 'bad-request');
    big.session.destroy();
    bad.session.destroy();
  });
});

test('chat applies backpressure to the request side too: 120 notes queue while the reader is stalled, none is lost or reordered', async () => {
  await s.withServer({}, async (server) => {
    const waiting = s.once(server, 'backpressure');
    const stream = s.openStream(server.origin, {}, s.CHAT);
    stream.request.pause();
    for (let index = 1; index <= 120; index += 1) stream.request.write(s.frame(s.noteMessage(`${index}:${'n'.repeat(990)}`)));
    stream.request.end();
    await waiting;
    await turns(20);
    stream.request.resume();
    await stream.closed;
    assert.equal(stream.collector.frames.length, 120);
    assert.deepEqual(stream.collector.frames.map((frame) => s.fields(frame.payload)[2]), Array.from({ length: 120 }, (_, index) => index + 1));
    assert.equal(stream.collector.frames[119].payload.includes(Buffer.from('120:')), true);
    assert.equal(stream.seen.trailers['grpc-status'], '0');
    stream.session.destroy();
  });
});

test('abort() ends in-flight calls with UNAVAILABLE trailers that still reach a reading client', async () => {
  const timers = new ManualTimers();
  await s.withServer({ timers }, async (server) => {
    const stream = s.openStream(server.origin);
    stream.request.end(s.frame(s.watchRequest('alpha', 10, 25)));
    await timers.whenPending(1);
    timers.advance(25);
    await s.until(() => stream.collector.frames.length === 1);
    server.abort();
    await stream.closed;
    assert.equal(stream.seen.trailers['grpc-status'], '14');
    assert.deepEqual(['outcome', 'finishedBy', 'produced'].map((key) => server.calls[0][key]), ['UNAVAILABLE', 'abort', 1]);
    assert.equal(server.active, 0);
    stream.session.destroy();
  });
});

test('drain() waits for in-flight calls while new calls are refused, and close() is idempotent', async () => {
  const timers = new ManualTimers();
  await s.withServer({ timers }, async (server) => {
    await server.drain();
    server.draining = false;
    const stream = s.openStream(server.origin);
    stream.request.end(s.frame(s.watchRequest('alpha', 2, 25)));
    await timers.whenPending(1);
    let drained = false;
    const draining = server.drain().then(() => { drained = true; });
    await turns(10);
    assert.equal(drained, false, 'drain is still waiting for the call in flight');
    const refused = await s.rawCall(server.origin, { body: [s.frame(s.watchRequest('beta', 1))] });
    assert.equal(refused.headers['grpc-status'], '14');
    for (let step = 0; step < 2; step += 1) {
      await timers.whenPending(1);
      timers.advance(25);
    }
    await draining;
    assert.equal(drained, true);
    await stream.closed;
    assert.equal(stream.seen.trailers['grpc-status'], '0');
    stream.session.destroy();
    await server.close();
    await server.close();
  });
});

test('close() cuts a connection that is still silent once the grace period has passed', async () => {
  const server = require('../grpc-server.cjs').createGrpcServer({ limits: { closeGraceMs: 30, firstByteTimeoutMs: 60000 } });
  await server.start();
  const socket = net.connect(server.port, '127.0.0.1');
  socket.on('error', () => undefined);
  await new Promise((resolve) => socket.once('connect', resolve));
  const closed = new Promise((resolve) => socket.once('close', resolve));
  await server.close();
  await closed;
  assert.equal(socket.destroyed, true);
});

test('a reset that is not CANCEL or NO_ERROR is still a CANCELLED call and never crashes the server', async () => {
  await s.withServer({}, async (server) => {
    const stream = s.openStream(server.origin);
    stream.request.end(s.frame(s.watchRequest('alpha', 1000, 0, 100)));
    await s.until(() => stream.collector.frames.length >= 1);
    const finished = s.once(server, 'call-finished');
    stream.request.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
    assert.equal((await finished)[0].outcome, 'CANCELLED');
    const next = await s.rawCall(server.origin, { body: [s.frame(s.watchRequest('alpha', 1))] });
    assert.equal(next.trailers['grpc-status'], '0');
    stream.session.destroy();
  });
});
