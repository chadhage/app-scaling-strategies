'use strict';

// Initial behavioral tests for deadlines, malformed metadata and client cancellation (written before any implementation).
// Retained as a snapshot; run against the RED stubs with C028_RED_SUBJECT.
const assert = require('node:assert/strict');
const http2 = require('node:http2');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const subjectRoot = process.env.C028_RED_SUBJECT ? path.resolve(process.env.C028_RED_SUBJECT) : root;
const { createGrpcServer } = require(path.join(subjectRoot, 'grpc-server.cjs'));
const WATCH = '/acme.ticker.v1.Ticker/Watch';

const varint = (n) => {
  const out = [];
  let value = n;
  while (value > 0x7f) { out.push((value & 0x7f) | 0x80); value = Math.floor(value / 128); }
  return Buffer.from([...out, value]);
};
const lenField = (no, bytes) => Buffer.concat([varint(no * 8 + 2), varint(bytes.length), bytes]);
// field numbers: 1 topic, 2 count, 3 interval_ms, 4 payload_bytes
const watchRequest = (topic, count, intervalMs = 0, payloadBytes = 0) => Buffer.concat([
  lenField(1, Buffer.from(topic)), varint(16), varint(count), varint(24), varint(intervalMs), varint(32), varint(payloadBytes)]);
const frame = (payload) => {
  const prefix = Buffer.alloc(5);
  prefix.writeUInt32BE(payload.length, 1);
  return Buffer.concat([prefix, payload]);
};
const nextTick = () => new Promise((resolve) => setImmediate(resolve));
const closed = (request) => new Promise((resolve) => request.once('close', resolve));
const safety = (ms) => new Promise((resolve) => setTimeout(resolve, ms).unref());
async function withServer(options, fn) {
  const server = createGrpcServer(options);
  await server.start();
  try { await fn(server); } finally { await server.close(); }
}
function open(origin, headers) {
  const session = http2.connect(origin);
  session.on('error', () => undefined);
  const request = session.request({ ':method': 'POST', ':path': WATCH, 'content-type': 'application/grpc', te: 'trailers', ...headers });
  request.on('error', () => undefined);
  return { session, request };
}

test('a malformed grpc-timeout is INVALID_ARGUMENT in Trailers-Only form', () => withServer({}, async (server) => {
  for (const bad of ['5s', '5', '', '123456789S', '-1S']) {
    const { session, request } = open(server.origin, { 'grpc-timeout': bad });
    let headers;
    request.on('response', (value) => { headers = value; });
    request.resume();
    request.end(frame(watchRequest('alpha', 2)));
    await closed(request);
    session.destroy();
    assert.equal(headers['grpc-status'], '3', `timeout ${JSON.stringify(bad)}`);
  }
}));

test('grpc-timeout expiry stops an endless-looking stream with DEADLINE_EXCEEDED trailers', () => withServer({}, async (server) => {
  const { session, request } = open(server.origin, { 'grpc-timeout': '100m' });
  let trailers;
  let received = 0;
  request.on('trailers', (value) => { trailers = value; });
  request.on('data', (chunk) => { received += chunk.length; });
  request.end(frame(watchRequest('alpha', 10000, 5)));
  await Promise.race([closed(request), safety(5000)]);
  session.destroy();
  assert.equal(trailers?.['grpc-status'], '4');
  assert.ok(received > 0, 'some messages arrived before the deadline');
  assert.ok(received < 10000 * 20, 'the 10000 messages never finished');
}));

test('a client reset mid-stream is observed by the server, which records CANCELLED and stops producing', () => withServer({}, async (server) => {
  const finished = new Promise((resolve) => server.on('call-finished', resolve));
  const { session, request } = open(server.origin, {});
  let received = 0;
  request.on('data', (chunk) => {
    received += chunk.length;
    if (received >= 3 * 25) request.close(http2.constants.NGHTTP2_CANCEL);
  });
  request.end(frame(watchRequest('alpha', 10000)));
  await closed(request);
  session.destroy();
  await Promise.race([finished, safety(3000)]);
  assert.equal(server.calls.length, 1);
  const call = server.calls[0];
  assert.equal(call.outcome, 'CANCELLED');
  assert.ok(call.produced >= 3 && call.produced < 10000, `produced ${call.produced}`);
  const frozen = call.produced;
  for (let turn = 0; turn < 20; turn += 1) await nextTick();
  assert.equal(server.calls[0].produced, frozen, 'nothing is produced after the reset');
  assert.equal(server.calls[0].writesAfterFinish, 0);
}));

test('a call over the concurrency cap is RESOURCE_EXHAUSTED and a draining server answers UNAVAILABLE', () => withServer({ limits: { maxActiveCalls: 1 } }, async (server) => {
  const first = open(server.origin, {});
  first.request.on('data', () => undefined);
  first.request.end(frame(watchRequest('alpha', 10000, 5)));
  await Promise.race([new Promise((resolve) => first.request.once('response', resolve)), safety(3000)]);
  const second = open(server.origin, {});
  let headers;
  second.request.on('response', (value) => { headers = value; });
  second.request.resume();
  second.request.end(frame(watchRequest('beta', 2)));
  await closed(second.request);
  assert.equal(headers?.['grpc-status'], '8');
  first.session.destroy();
  second.session.destroy();
  await server.drain();
  const third = open(server.origin, {});
  let draining;
  third.request.on('response', (value) => { draining = value; });
  third.request.resume();
  third.request.end(frame(watchRequest('gamma', 2)));
  await closed(third.request);
  third.session.destroy();
  assert.equal(draining?.['grpc-status'], '14');
}));
