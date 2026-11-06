'use strict';

// The driver port against the real fixture over real HTTP/2 sockets.
const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const { connect, checkOrigin, DriverError } = require('../driver.cjs');
const { createGrpcServer } = require('../grpc-server.cjs');
const { METHODS } = require('../service.cjs');
const { ManualTimers } = require('../timers.cjs');
const s = require('./support.cjs');

test('the report lists the wire events in order and says ok only for a clean conversation', () => s.withDriver({}, async (client) => {
  const call = client.call(s.WATCH, { topic: 'alpha', count: 5 }, { metadata: { 'x-client-tag': 'demo' }, timeoutMs: 5000 });
  const report = await call.result;
  assert.equal(report.ok, true);
  assert.equal(report.outcome, 'ok');
  assert.equal(report.kind, 'server-streaming');
  assert.equal(report.path, s.WATCH);
  assert.deepEqual(report.events.map((event) => event.ev), ['request', 'request-message', 'headers', ...Array(5).fill('message'), 'trailers', 'end']);
  assert.deepEqual(report.events.map((event) => event.n), Array.from({ length: 10 }, (_, index) => index + 1));
  assert.deepEqual(report.events[0], { n: 1, ev: 'request', path: s.WATCH, metadata: { 'x-client-tag': 'demo' }, timeout: '5000m' });
  assert.equal(report.headers['x-echo-client-tag'], 'demo');
  assert.equal(report.headers['x-fixture-scope'], 'synthetic-loopback-only');
  assert.equal(report.rstCode, 0);
  assert.equal(report.messageCount, 5);
  assert.deepEqual(report.messages.map((message) => message.body), ['tick-1', 'tick-2', 'tick-3', 'tick-4', 'tick-5']);
  assert.equal(await call.result, report, 'the same frozen report every time');
  assert.equal(Object.isFrozen(report), true);
}));

test('a bidirectional call interleaves writes and echoes and ends cleanly when the caller half-closes', () => s.withDriver({}, async (client) => {
  const call = client.call(METHODS.Chat.path, undefined, {});
  const iterator = call.messages()[Symbol.asyncIterator]();
  for (const [index, text] of ['one', 'two', 'three'].entries()) {
    assert.equal(call.write({ text }), true);
    const next = await iterator.next();
    assert.deepEqual(next.value, { text: `echo: ${text}`, seq: index + 1, received: index + 1 });
  }
  call.end();
  const report = await call.result;
  assert.equal(report.ok, true);
  assert.equal(report.kind, 'bidirectional');
  assert.equal(report.events.filter((event) => event.ev === 'request-message').length, 3);
  call.end();
}));

test('an unknown method, an invalid argument and a draining server are honest non-OK reports', () => s.withDriver({}, async (client, server) => {
  const unknown = await client.call('/acme.ticker.v1.Ticker/Nope', { topic: 'alpha', count: 1 }).result;
  assert.deepEqual([unknown.ok, unknown.trailersOnly, unknown.status.code, unknown.outcome, unknown.messageCount], [false, true, 12, 'server-error', 0]);
  assert.match(unknown.status.message, /unknown method/);
  const invalid = await client.call(s.WATCH, { topic: 'BAD!', count: 1 }).result;
  assert.deepEqual([invalid.ok, invalid.status.code, invalid.trailersOnly], [false, 3, true]);
  await server.drain();
  const draining = await client.call(s.WATCH, { topic: 'alpha', count: 1 }).result;
  assert.deepEqual([draining.ok, draining.status.code, draining.status.name], [false, 14, 'UNAVAILABLE']);
}));

test('inputs the driver can refuse locally never reach the network and are reported as client errors', () => s.withDriver({}, async (client, server) => {
  const refusals = [
    ['an invalid request value', client.call(s.WATCH, { topic: 5, count: 1 }, {})],
    ['an unknown request field', client.call(s.WATCH, { topic: 'a', count: 1, extra: 1 }, {})],
    ['reserved metadata', client.call(s.WATCH, { topic: 'alpha', count: 1 }, { metadata: { 'grpc-timeout': '1S' } })],
    ['a bad metadata value', client.call(s.WATCH, { topic: 'alpha', count: 1 }, { metadata: { x: 'line\nbreak' } })],
    ['a negative timeout', client.call(s.WATCH, { topic: 'alpha', count: 1 }, { timeoutMs: -1 })],
    ['a fractional timeout', client.call(s.WATCH, { topic: 'alpha', count: 1 }, { timeoutMs: 1.5 })]
  ];
  for (const [name, call] of refusals) {
    const report = await call.result;
    assert.deepEqual([report.ok, report.outcome, report.status.code, report.status.origin, report.rstCode, report.events.at(-1).ev], [false, 'client-error', 3, 'client-validation', null, 'end'], name);
    assert.deepEqual(await call.messages().next(), { value: undefined, done: true }, name);
    call.cancel();
    call.end();
  }
  assert.equal(server.calls.length, 0, 'nothing was sent');
  const chat = client.call(METHODS.Chat.path, undefined, {});
  assert.equal(chat.write({ text: 5 }), false);
  const report = await chat.result;
  assert.deepEqual([report.status.code, report.status.origin, report.ok], [3, 'client-validation', false]);
}));

test('only a plain http://127.0.0.1:<port> origin is accepted, and nothing is opened for any other', async () => {
  for (const bad of ['http://example.com:80', 'https://127.0.0.1:443', 'http://127.0.0.1', 'http://127.0.0.1:80', 'http://127.0.0.1:1234/path', 'http://127.0.0.1:1234/?q=1',
    'http://127.0.0.1:1234/#x', 'http://user:pw@127.0.0.1:1234', 'http://user@127.0.0.1:1234', 'http://localhost:1234', 'http://[::1]:1234', 'http://127.0.0.2:1234',
    'not a url', '', 'ftp://127.0.0.1:21', 'http://0.0.0.0:1234']) {
    await assert.rejects(connect(bad), (error) => error instanceof DriverError && error.code === 'ORIGIN_REFUSED', bad);
  }
  assert.equal(checkOrigin('http://127.0.0.1:4321'), 'http://127.0.0.1:4321');
  assert.equal(checkOrigin('http://127.0.0.1:4321/'), 'http://127.0.0.1:4321');
});

test('connecting to a closed port rejects with the connection error instead of returning a client', async () => {
  const probe = net.createServer();
  await new Promise((resolve) => probe.listen(0, '127.0.0.1', resolve));
  const { port } = probe.address();
  await new Promise((resolve) => probe.close(resolve));
  await assert.rejects(connect(`http://127.0.0.1:${port}`), (error) => error.code === 'ECONNREFUSED');
});

test('a call on a closed client is a transport failure with ok false, never a thrown error', () => s.withDriver({}, async (client) => {
  client.close();
  assert.equal(await s.until(() => client.closed), true);
  const report = await client.call(s.WATCH, { topic: 'alpha', count: 1 }).result;
  assert.deepEqual([report.ok, report.outcome, report.status.code, report.status.origin], [false, 'transport-failure', 14, 'transport']);
  assert.equal(report.violations[0].code, 'TRANSPORT_CLOSED');
}));

test('a consumer that has not read yet stalls the stream by backlog; reading later delivers everything in order', () => s.withDriver({}, async (client, server) => {
  const waiting = s.once(server, 'backpressure');
  const call = client.call(s.WATCH, { topic: 'alpha', count: 100, payload_bytes: 2000 });
  await waiting;
  const seen = [];
  for await (const message of call.messages()) seen.push(message.seq);
  assert.deepEqual(seen, Array.from({ length: 100 }, (_, index) => index + 1));
  const report = await call.result;
  assert.equal(report.ok, true);
  assert.equal(report.messageCount, 100);
}));

test('cancel drops the unread backlog and settles CANCELLED; the same call object keeps one frozen report', () => s.withDriver({}, async (client, server) => {
  const finished = s.once(server, 'call-finished');
  const call = client.call(s.WATCH, { topic: 'alpha', count: 10000 });
  const seen = [];
  for await (const message of call.messages()) {
    seen.push(message.seq);
    if (seen.length === 3) call.cancel();
  }
  assert.deepEqual(seen, [1, 2, 3]);
  const report = await call.result;
  assert.deepEqual([report.ok, report.outcome, report.status.code, report.status.origin], [false, 'cancelled', 1, 'client-cancel']);
  assert.ok(report.events.some((event) => event.ev === 'cancel'));
  assert.equal((await finished)[0].outcome, 'CANCELLED');
  call.cancel();
  assert.equal(await call.result, report);
}));

test('a client deadline on manual time cancels the stream and the server records CANCELLED', async () => {
  const serverTimers = new ManualTimers();
  const clientTimers = new ManualTimers();
  await s.withServer({ timers: serverTimers }, async (server) => {
    const client = await connect(server.origin, { timers: clientTimers });
    try {
      const finished = s.once(server, 'call-finished');
      const call = client.call(s.WATCH, { topic: 'alpha', count: 10, interval_ms: 25 }, { timeoutMs: 100 });
      await serverTimers.whenPending(2);
      clientTimers.advance(100);
      const report = await call.result;
      assert.deepEqual([report.ok, report.outcome, report.status.code, report.status.origin], [false, 'deadline-exceeded', 4, 'client-deadline']);
      assert.deepEqual(report.events.map((event) => event.ev).slice(-2), ['deadline', 'end']);
      assert.equal((await finished)[0].outcome, 'CANCELLED');
    } finally {
      client.close();
    }
  });
});

test('a server deadline on manual time reaches the driver as DEADLINE_EXCEEDED trailers with the ticks it did get', async () => {
  const serverTimers = new ManualTimers();
  await s.withServer({ timers: serverTimers }, async (server) => {
    const client = await connect(server.origin, { timers: new ManualTimers() });
    try {
      const call = client.call(s.WATCH, { topic: 'alpha', count: 10, interval_ms: 25 }, { timeoutMs: 100 });
      const iterator = call.messages()[Symbol.asyncIterator]();
      for (let step = 0; step < 3; step += 1) {
        await serverTimers.whenPending(2);
        serverTimers.advance(25);
        await iterator.next();
      }
      await serverTimers.whenPending(2);
      serverTimers.advance(25);
      const report = await call.result;
      assert.deepEqual([report.ok, report.outcome, report.status.code, report.status.origin, report.messageCount], [false, 'deadline-exceeded', 4, 'server-trailers', 3]);
    } finally {
      client.close();
    }
  });
});

test('more concurrent calls than the server allows are refused by HTTP/2 and reported UNAVAILABLE, never ok, never hung', () => s.withDriver({}, async (client, server) => {
  const calls = Array.from({ length: 80 }, (_, index) => client.call(s.WATCH, { topic: `t${index}`, count: 30, payload_bytes: 2000 }, { timeoutMs: 20000 }));
  const reports = await Promise.all(calls.map((call) => call.result));
  const clean = reports.filter((report) => report.ok);
  const refused = reports.filter((report) => !report.ok);
  assert.equal(clean.length + refused.length, 80);
  assert.ok(refused.length >= 1, 'the surplus streams were refused');
  assert.ok(clean.length >= 1, 'the streams inside the limit ran');
  for (const report of clean) assert.deepEqual(report.messages.map((message) => message.seq), Array.from({ length: 30 }, (_, index) => index + 1));
  for (const report of refused) {
    assert.deepEqual([report.status.code, report.status.origin, report.rstCode, report.violations[0].code], [14, 'server-reset', 7, 'STREAM_RESET']);
    assert.equal(report.messageCount, 0);
  }
  assert.equal(server.calls.length, clean.length, 'a refused stream never reaches the handler');
  assert.equal(server.active, 0);
}));

test('a huge client timeout is clamped as well: it does not expire early and it expires at the largest timer delay', async () => {
  const silent = await s.evilServer(() => undefined);
  const timers = new ManualTimers();
  const client = await connect(silent.origin, { timers });
  try {
    const call = client.call(s.WATCH, { topic: 'alpha', count: 1 }, { timeoutMs: 99999999 * 3600000 });
    timers.advance(1000);
    let settled = false;
    call.result.then(() => { settled = true; });
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(settled, false);
    timers.advance(2147483647);
    const report = await call.result;
    assert.deepEqual([report.status.code, report.status.origin], [4, 'client-deadline']);
  } finally {
    client.close();
    await silent.close();
  }
});

test('a method descriptor object is accepted and the default maxMessageBytes is the gRPC default of 4 MiB', async () => {
  const server = createGrpcServer({ limits: { closeGraceMs: 50 } });
  await server.start();
  const client = await connect(server.origin);
  try {
    const report = await client.call(METHODS.Watch, { topic: 'alpha', count: 2 }).result;
    assert.equal(report.ok, true);
    assert.equal(client.origin, server.origin);
    assert.equal(require('../driver.cjs').DEFAULT_MAX_MESSAGE_BYTES, 4194304);
  } finally {
    client.close();
    await server.close();
  }
});
