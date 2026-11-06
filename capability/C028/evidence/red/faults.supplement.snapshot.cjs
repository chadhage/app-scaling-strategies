'use strict';

// Supplement to faults.initial.snapshot.cjs. Two of its twelve fault tests proved mis-specified when the implementation
// first ran against them, so they are replaced here (the originals stay untouched and archived):
//  - "promises too much" declared 100 bytes while the same test configured a 64 byte limit, so the correct finding is
//    MESSAGE_TOO_LARGE; the honest truncation case promises fewer bytes than the limit but sends fewer than it promised.
//  - "resets the stream" closed the stream one event-loop turn after writing: Node's http2 ends the stream gracefully
//    first, so the client really saw a clean END_STREAM. A reset that reaches the client is issued in the same turn.
// Retained as a snapshot; run against the RED stubs with C028_RED_SUBJECT (it must fail there for behavioral reasons).
const assert = require('node:assert/strict');
const http2 = require('node:http2');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const subjectRoot = process.env.C028_RED_SUBJECT ? path.resolve(process.env.C028_RED_SUBJECT) : root;
const { connect } = require(path.join(subjectRoot, 'driver.cjs'));
const WATCH = '/acme.ticker.v1.Ticker/Watch';
const GRPC = { ':status': 200, 'content-type': 'application/grpc' };
const frame = (payload) => {
  const prefix = Buffer.alloc(5);
  prefix.writeUInt32BE(payload.length, 1);
  return Buffer.concat([prefix, payload]);
};
const tick = (seq) => Buffer.concat([Buffer.from('0a05616c706861', 'hex'), Buffer.from([0x10, seq]), Buffer.from('1a047469636b', 'hex')]);

async function against(behavior, clientOptions = {}) {
  const server = http2.createServer();
  const sessions = new Set();
  server.on('session', (session) => { sessions.add(session); session.on('error', () => undefined); });
  server.on('sessionError', () => undefined);
  server.on('stream', (stream) => { stream.on('error', () => undefined); stream.resume(); behavior(stream); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const client = await connect(`http://127.0.0.1:${server.address().port}`, clientOptions);
  try {
    const timer = new Promise((resolve) => setTimeout(() => resolve({ ok: 'TIMED_OUT' }), 6000).unref());
    return await Promise.race([client.call(WATCH, { topic: 'alpha', count: 3 }, { timeoutMs: 5000 }).result, timer]);
  } finally {
    client.close();
    for (const session of sessions) session.destroy();
    await new Promise((resolve) => server.close(resolve));
  }
}

test('supplement: a prefix that promises more than arrives, within the size limit, is TRUNCATED_MESSAGE', async () => {
  const result = await against((stream) => {
    stream.respond(GRPC, { waitForTrailers: true });
    stream.on('wantTrailers', () => stream.sendTrailers({ 'grpc-status': '0' }));
    stream.end(Buffer.concat([Buffer.from('000000003c', 'hex'), tick(1)]));
  }, { maxMessageBytes: 64 });
  assert.equal(result.ok, false, 'ok must be false');
  assert.ok(result.violations?.some((violation) => violation.code === 'TRUNCATED_MESSAGE'), 'violation TRUNCATED_MESSAGE');
  assert.notEqual(result.status?.code, 0);
});

test('supplement: a prefix that promises more than the limit is MESSAGE_TOO_LARGE before any payload is read', async () => {
  const result = await against((stream) => {
    stream.respond(GRPC, { waitForTrailers: true });
    stream.on('wantTrailers', () => stream.sendTrailers({ 'grpc-status': '0' }));
    stream.end(Buffer.concat([Buffer.from('0000000064', 'hex'), tick(1)]));
  }, { maxMessageBytes: 64 });
  assert.equal(result.ok, false);
  assert.ok(result.violations?.some((violation) => violation.code === 'MESSAGE_TOO_LARGE'), 'violation MESSAGE_TOO_LARGE');
  assert.equal(result.status?.code, 8);
});

test('supplement: a stream reset that reaches the client is STREAM_RESET with the HTTP/2 error mapped to a status', async () => {
  const result = await against((stream) => {
    stream.respond(GRPC);
    stream.write(frame(tick(1)));
    stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR);
  });
  assert.equal(result.ok, false);
  assert.ok(result.violations?.some((violation) => violation.code === 'STREAM_RESET'), 'violation STREAM_RESET');
  assert.equal(result.status?.code, 13);
  assert.equal(result.rstCode, http2.constants.NGHTTP2_INTERNAL_ERROR);
});

test('supplement: a refused stream is UNAVAILABLE and a server cancel is CANCELLED, never success', async () => {
  const refused = await against((stream) => stream.close(http2.constants.NGHTTP2_REFUSED_STREAM));
  assert.equal(refused.ok, false);
  assert.equal(refused.status?.code, 14);
  assert.ok(refused.violations?.some((violation) => violation.code === 'STREAM_RESET'));
  const cancelled = await against((stream) => stream.close(http2.constants.NGHTTP2_CANCEL));
  assert.equal(cancelled.ok, false);
  assert.equal(cancelled.status?.code, 1);
});
