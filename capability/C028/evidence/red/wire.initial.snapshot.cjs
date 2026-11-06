'use strict';

// Initial behavioral tests for the gRPC server over a real HTTP/2 socket (written before any implementation).
// Retained as a snapshot; run against the RED stubs with C028_RED_SUBJECT. The helpers below deliberately do not
// use the production codec, so the expectations are independent of the code under test.
const assert = require('node:assert/strict');
const http2 = require('node:http2');
const net = require('node:net');
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
const watchRequest = (topic, count, extra = []) => Buffer.concat([lenField(1, Buffer.from(topic)), varint(16), varint(count), ...extra]);
const frame = (payload, flag = 0) => {
  const prefix = Buffer.alloc(5);
  prefix[0] = flag;
  prefix.writeUInt32BE(payload.length, 1);
  return Buffer.concat([prefix, payload]);
};
function splitFrames(buffer) {
  const out = [];
  let offset = 0;
  while (offset < buffer.length) {
    assert.ok(buffer.length - offset >= 5, 'a whole 5-byte prefix');
    const length = buffer.readUInt32BE(offset + 1);
    assert.ok(buffer.length - offset - 5 >= length, 'the whole payload the prefix promised');
    out.push({ flag: buffer[offset], payload: buffer.subarray(offset + 5, offset + 5 + length) });
    offset += 5 + length;
  }
  return out;
}
function tick(payload) {
  const found = {};
  let offset = 0;
  while (offset < payload.length) {
    const tag = payload[offset++];
    if ((tag & 7) === 2) {
      const length = payload[offset++];
      found[tag >> 3] = payload.subarray(offset, offset + length).toString();
      offset += length;
    } else {
      found[tag >> 3] = payload[offset++];
    }
  }
  return found;
}

function rawCall(origin, { path: target = WATCH, method = 'POST', headers = {}, body = [] } = {}) {
  return new Promise((resolve, reject) => {
    const session = http2.connect(origin);
    const timer = setTimeout(() => { session.destroy(); reject(new Error('rawCall timed out')); }, 8000);
    session.on('error', (error) => { clearTimeout(timer); reject(error); });
    const request = session.request({ ':method': method, ':path': target, 'content-type': 'application/grpc', te: 'trailers', ...headers }, { endStream: method === 'GET' });
    const seen = { headers: null, trailers: null, chunks: [], trailersEvents: 0 };
    request.on('response', (value) => { seen.headers = value; });
    request.on('trailers', (value) => { seen.trailers = value; seen.trailersEvents += 1; });
    request.on('data', (chunk) => seen.chunks.push(chunk));
    request.on('error', () => undefined);
    request.on('close', () => {
      clearTimeout(timer);
      session.destroy();
      resolve({ ...seen, data: Buffer.concat(seen.chunks), rstCode: request.rstCode });
    });
    if (method !== 'GET') { for (const piece of body) request.write(piece); request.end(); }
  });
}
async function withServer(options, fn) {
  const server = createGrpcServer(options);
  await server.start();
  try { await fn(server); } finally { await server.close(); }
}

test('a watch is HTTP/2 200 application/grpc, ordered prefixed messages, then OK trailers', () => withServer({}, async (server) => {
  const result = await rawCall(server.origin, { body: [frame(watchRequest('alpha', 5))] });
  assert.equal(result.headers[':status'], 200);
  assert.match(result.headers['content-type'], /^application\/grpc/);
  assert.equal(result.headers['grpc-status'], undefined, 'a streaming reply is not Trailers-Only');
  const messages = splitFrames(result.data);
  assert.deepEqual(messages.map((message) => message.flag), [0, 0, 0, 0, 0]);
  assert.deepEqual(messages.map((message) => tick(message.payload)[2]), [1, 2, 3, 4, 5]);
  assert.deepEqual(messages.map((message) => tick(message.payload)[1]), Array(5).fill('alpha'));
  assert.equal(result.trailers['grpc-status'], '0');
  assert.equal(result.trailersEvents, 1);
}));

test('an unknown method gets a Trailers-Only UNIMPLEMENTED answer', () => withServer({}, async (server) => {
  const result = await rawCall(server.origin, { path: '/acme.ticker.v1.Ticker/Nope', body: [frame(Buffer.alloc(0))] });
  assert.equal(result.headers[':status'], 200);
  assert.equal(result.headers['grpc-status'], '12');
  assert.ok(result.headers['grpc-message'].length > 0);
  assert.equal(result.data.length, 0, 'no DATA frame');
  assert.equal(result.trailersEvents, 0, 'one HEADERS frame only');
}));

test('a non-gRPC content type over HTTP/2 is refused with 415 and never answered as gRPC', () => withServer({}, async (server) => {
  const result = await rawCall(server.origin, { headers: { 'content-type': 'application/json' }, body: [Buffer.from('{"topic":"alpha"}')] });
  assert.equal(result.headers[':status'], 415);
  assert.equal(result.headers['grpc-status'], undefined);
  assert.equal(result.trailers?.['grpc-status'], undefined);
}));

test('a GET over HTTP/2 is refused with 405', () => withServer({}, async (server) => {
  const result = await rawCall(server.origin, { method: 'GET' });
  assert.equal(result.headers[':status'], 405);
  assert.equal(result.headers['grpc-status'], undefined);
}));

test('a plain HTTP/1.1 request to the gRPC port gets an HTTP/1.1 error and no gRPC answer', () => withServer({}, async (server) => {
  const answer = await new Promise((resolve) => {
    const socket = net.connect(server.port, '127.0.0.1', () => socket.write('GET / HTTP/1.1\r\nHost: x\r\nConnection: close\r\n\r\n'));
    const chunks = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', () => undefined);
    socket.on('close', () => resolve(Buffer.concat(chunks).toString('latin1')));
  });
  const line = /^HTTP\/1\.1 (\d{3}) /.exec(answer);
  assert.ok(line, 'an HTTP/1.1 status line, not HTTP/2 frames');
  assert.ok(Number(line[1]) >= 400);
  assert.doesNotMatch(answer, /grpc-status/i);
}));

test('malformed protobuf, a bad flag and a truncated message are INVALID_ARGUMENT in Trailers-Only form', () => withServer({}, async (server) => {
  const cases = [
    ['malformed protobuf', [frame(Buffer.from('0a05ff', 'hex'))]],
    ['bad prefix flag', [frame(watchRequest('alpha', 2), 9)]],
    ['truncated message', [Buffer.concat([Buffer.from('0000000010', 'hex'), Buffer.from('0a05', 'hex')])]]
  ];
  for (const [name, body] of cases) {
    const result = await rawCall(server.origin, { body });
    assert.equal(result.headers['grpc-status'], '3', name);
    assert.equal(result.data.length, 0, `${name}: no DATA`);
  }
}));

test('an oversized length prefix is RESOURCE_EXHAUSTED before any payload arrives', () => withServer({}, async (server) => {
  const result = await rawCall(server.origin, { body: [Buffer.from('00004c4b40', 'hex')] });
  assert.equal(result.headers['grpc-status'], '8');
  assert.equal(result.data.length, 0);
}));
