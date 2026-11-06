'use strict';

// Initial behavioral tests for the driver against the real fixture and a silent server (written before any implementation).
// Retained as a snapshot; run against the RED stubs with C028_RED_SUBJECT.
const assert = require('node:assert/strict');
const http2 = require('node:http2');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const subjectRoot = process.env.C028_RED_SUBJECT ? path.resolve(process.env.C028_RED_SUBJECT) : root;
const { createGrpcServer } = require(path.join(subjectRoot, 'grpc-server.cjs'));
const { connect } = require(path.join(subjectRoot, 'driver.cjs'));
const WATCH = '/acme.ticker.v1.Ticker/Watch';
const safety = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());
// event-loop turns, bounded only as a safety net: a passing run never waits on the clock
async function until(predicate, limitMs = 3000) {
  const end = Date.now() + limitMs;
  while (!predicate() && Date.now() < end) await new Promise((resolve) => setImmediate(resolve));
}

async function withDriver(options, fn) {
  const server = createGrpcServer(options.server);
  await server.start();
  const client = await connect(server.origin, options.client);
  try { await fn(client, server); } finally { client.close(); await server.close(); }
}

test('the driver reports ordered messages, OK trailers and ok true only with real evidence', () => withDriver({}, async (client) => {
  const result = await client.call(WATCH, { topic: 'alpha', count: 5 }, { timeoutMs: 5000 }).result;
  assert.equal(result.ok, true);
  assert.deepEqual(result.messages.map((message) => message.seq), [1, 2, 3, 4, 5]);
  assert.deepEqual(result.messages.map((message) => message.topic), Array(5).fill('alpha'));
  assert.deepEqual(result.status, { code: 0, name: 'OK', message: '', origin: 'server-trailers' });
  assert.equal(result.trailers['grpc-status'], '0');
  assert.equal(result.httpStatus, 200);
  assert.equal(result.trailersOnly, false);
  assert.deepEqual(result.violations, []);
}));

test('an unknown method is reported as a Trailers-Only UNIMPLEMENTED failure, never as success', () => withDriver({}, async (client) => {
  const result = await client.call('/acme.ticker.v1.Ticker/Nope', { topic: 'alpha', count: 1 }, { timeoutMs: 5000 }).result;
  assert.equal(result.ok, false);
  assert.equal(result.trailersOnly, true);
  assert.equal(result.status.code, 12);
  assert.equal(result.status.name, 'UNIMPLEMENTED');
  assert.deepEqual(result.messages, []);
}));

test('an invalid request field is INVALID_ARGUMENT with the server message', () => withDriver({}, async (client) => {
  const result = await client.call(WATCH, { topic: 'ALPHA!', count: 2 }, { timeoutMs: 5000 }).result;
  assert.equal(result.ok, false);
  assert.equal(result.status.code, 3);
  assert.ok(result.status.message.length > 0);
}));

test('a driver cancel after three messages is CANCELLED from the client and the server saw it', () => withDriver({}, async (client, server) => {
  const finished = new Promise((resolve) => server.on('call-finished', resolve));
  const call = client.call(WATCH, { topic: 'alpha', count: 10000 }, { timeoutMs: 20000 });
  const order = [];
  for await (const message of call.messages()) {
    order.push(message.seq);
    if (order.length === 3) call.cancel();
  }
  const result = await call.result;
  assert.equal(result.ok, false);
  assert.deepEqual(result.status, { code: 1, name: 'CANCELLED', message: result.status.message, origin: 'client-cancel' });
  assert.deepEqual(order.slice(0, 3), [1, 2, 3]);
  await Promise.race([finished, safety(3000)]);
  assert.equal(server.calls[0]?.outcome, 'CANCELLED');
}));

test('a client deadline against a silent server is DEADLINE_EXCEEDED from the client and resets the stream', async () => {
  const silent = http2.createServer();
  const sessions = new Set();
  const seen = { rstCode: null, path: null, timeout: null };
  silent.on('session', (session) => sessions.add(session));
  silent.on('stream', (stream, headers) => {
    seen.path = headers[':path'];
    seen.timeout = headers['grpc-timeout'];
    stream.on('error', () => undefined);
    stream.on('close', () => { seen.rstCode = stream.rstCode; });
    stream.resume();
  });
  await new Promise((resolve) => silent.listen(0, '127.0.0.1', resolve));
  const pending = [];
  const timers = {
    setTimeout: (fn, ms) => { const timer = { fn, ms, cleared: false }; pending.push(timer); return timer; },
    clearTimeout: (timer) => { if (timer) timer.cleared = true; }
  };
  const client = await connect(`http://127.0.0.1:${silent.address().port}`, { timers });
  try {
    const call = client.call(WATCH, { topic: 'alpha', count: 2 }, { timeoutMs: 100 });
    await until(() => seen.path !== null);
    assert.equal(seen.timeout, '100m', 'the deadline travels as grpc-timeout');
    const deadline = pending.find((timer) => timer.ms === 100 && !timer.cleared);
    assert.ok(deadline, 'the driver armed its own deadline timer');
    deadline.fn();
    const result = await call.result;
    assert.equal(result.ok, false);
    assert.deepEqual(result.status, { code: 4, name: 'DEADLINE_EXCEEDED', message: result.status.message, origin: 'client-deadline' });
    await until(() => seen.rstCode !== null);
    assert.equal(seen.rstCode, http2.constants.NGHTTP2_CANCEL);
  } finally {
    client.close();
    for (const session of sessions) session.destroy();
    await new Promise((resolve) => silent.close(resolve));
  }
});
