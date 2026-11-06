'use strict';

// The gRPC server over real HTTP/2 sockets: what a client sees on the wire for refusals, immediate errors and metadata.
const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const { createService } = require('../service.cjs');
const { GrpcError } = require('../grpc.cjs');
const s = require('./support.cjs');

const call = (server, options) => s.rawCall(server.origin, options);
const plain = (fields) => Object.fromEntries(Object.entries(fields));

test('a watch carries the server-owned stamp, ordered messages and OK trailers without a grpc-message', () => s.withServer({}, async (server) => {
  for (const count of [1, 5, 50]) {
    const result = await call(server, { body: [s.frame(s.watchRequest('alpha', count))] });
    const messages = s.splitFrames(result.data).map((message) => s.fields(message.payload));
    assert.deepEqual(messages.map((message) => message[2]), Array.from({ length: count }, (_, index) => index + 1));
    assert.deepEqual(messages.map((message) => message[3]), Array.from({ length: count }, (_, index) => `tick-${index + 1}`));
    assert.equal(result.headers['x-fixture-scope'], 'synthetic-loopback-only');
    assert.equal(result.headers['grpc-status'], undefined);
    assert.deepEqual(plain(result.trailers), { 'grpc-status': '0' });
  }
  assert.deepEqual(server.calls.map((record) => [record.outcome, record.finishedBy]), Array(3).fill(['OK', 'handler']));
  assert.deepEqual(server.calls.map((record) => record.produced), [1, 5, 50]);
}));

test('request metadata is echoed only when valid and a caller can never forge the server stamp', () => s.withServer({}, async (server) => {
  const echoed = await call(server, { headers: { 'x-client-tag': 'demo tag', 'x-fixture-scope': 'forged' }, body: [s.frame(s.watchRequest('alpha', 1))] });
  assert.equal(echoed.headers['x-echo-client-tag'], 'demo tag');
  assert.equal(echoed.headers['x-fixture-scope'], 'synthetic-loopback-only');
  for (const bad of ['', 'x'.repeat(65), 'tab\there']) {
    const refused = await call(server, { headers: { 'x-client-tag': bad }, body: [s.frame(s.watchRequest('alpha', 1))] });
    assert.equal(refused.headers['grpc-status'], '3', JSON.stringify(bad));
    assert.equal(refused.headers['x-echo-client-tag'], undefined);
  }
  const joined = await call(server, { headers: { 'x-client-tag': ['a', 'b'] }, body: [s.frame(s.watchRequest('alpha', 1))] });
  assert.equal(joined.headers['x-echo-client-tag'], 'a, b', 'HTTP/2 joins repeated fields into one value');
}));

const IMMEDIATE = [
  ['an unknown method', { path: '/acme.ticker.v1.Ticker/Nope', body: [s.frame(Buffer.alloc(0))] }, '12'],
  ['an unknown service', { path: '/other.Service/Watch', body: [s.frame(Buffer.alloc(0))] }, '12'],
  ['a prototype-named path', { path: '/__proto__', body: [s.frame(Buffer.alloc(0))] }, '12'],
  ['a constructor path', { path: '/constructor', body: [s.frame(Buffer.alloc(0))] }, '12'],
  ['a very long path', { path: `/${'a'.repeat(900)}`, body: [s.frame(Buffer.alloc(0))] }, '12'],
  ['an unsupported grpc-encoding', { headers: { 'grpc-encoding': 'gzip' }, body: [s.frame(s.watchRequest('alpha', 1))] }, '12'],
  ['a malformed protobuf message', { body: [s.frame(Buffer.from('0a05ff', 'hex'))] }, '3'],
  ['a bad prefix flag', { body: [s.frame(s.watchRequest('alpha', 2), 9)] }, '3'],
  ['a compressed message without negotiation', { body: [s.frame(s.watchRequest('alpha', 2), 1)] }, '3'],
  ['a truncated message', { body: [Buffer.concat([Buffer.from('0000000010', 'hex'), Buffer.from('0a05', 'hex')])] }, '3'],
  ['no request message at all', { body: [] }, '3'],
  ['an uppercase topic', { body: [s.frame(s.watchRequest('ALPHA', 1))] }, '3'],
  ['an empty topic', { body: [s.frame(s.watchRequest('', 1))] }, '3'],
  ['a 33 character topic', { body: [s.frame(s.watchRequest('a'.repeat(33), 1))] }, '3'],
  ['count zero', { body: [s.frame(s.watchRequest('alpha', 0))] }, '3'],
  ['count over the maximum', { body: [s.frame(s.watchRequest('alpha', 10001))] }, '3'],
  ['an interval over the maximum', { body: [s.frame(s.watchRequest('alpha', 1, 10001))] }, '3'],
  ['a payload over the maximum', { body: [s.frame(s.watchRequest('alpha', 1, 0, 131073))] }, '3'],
  ['a malformed grpc-timeout', { headers: { 'grpc-timeout': '5s' }, body: [s.frame(s.watchRequest('alpha', 1))] }, '3'],
  ['an oversized length prefix', { body: [Buffer.from('00004c4b40', 'hex')] }, '8'],
  ['an oversized prefix of the largest size', { body: [Buffer.from('00ffffffff', 'hex')] }, '8']
];
const DISPATCH_REFUSALS = new Set(['an unknown method', 'an unknown service', 'a prototype-named path', 'a constructor path', 'a very long path',
  'an unsupported grpc-encoding', 'a malformed grpc-timeout']);
for (const [name, options, code] of IMMEDIATE) {
  test(`Trailers-Only: ${name} is grpc-status ${code} in one HEADERS frame with no DATA`, () => s.withServer({}, async (server) => {
    const result = await call(server, options);
    assert.equal(result.headers[':status'], 200);
    assert.match(result.headers['content-type'], /^application\/grpc/);
    assert.equal(result.headers['grpc-status'], code);
    assert.ok(result.headers['grpc-message'].length > 0);
    assert.ok(decodeURIComponent(result.headers['grpc-message']).length < 200, 'the message never reflects an unbounded caller value');
    assert.equal(result.data.length, 0);
    assert.equal(result.trailersEvents, 0);
    assert.equal(server.calls.at(-1).finishedBy, DISPATCH_REFUSALS.has(name) ? 'refused' : 'bad-request');
  }));
}

test('an unsupported grpc-encoding names the supported one and identity is accepted', () => s.withServer({}, async (server) => {
  const refused = await call(server, { headers: { 'grpc-encoding': 'gzip' }, body: [s.frame(s.watchRequest('alpha', 1))] });
  assert.equal(refused.headers['grpc-accept-encoding'], 'identity');
  const accepted = await call(server, { headers: { 'grpc-encoding': 'identity' }, body: [s.frame(s.watchRequest('alpha', 1))] });
  assert.equal(accepted.trailers['grpc-status'], '0');
}));

test('two request messages for a server-streaming call fail after the headers with INVALID_ARGUMENT trailers', () => s.withServer({}, async (server) => {
  const result = await call(server, { body: [Buffer.concat([s.frame(s.watchRequest('alpha', 3, 25)), s.frame(s.watchRequest('alpha', 3, 25))])] });
  assert.equal(result.headers['grpc-status'], undefined);
  assert.equal(result.trailers['grpc-status'], '3');
  assert.equal(result.data.length, 0);
  assert.equal(server.calls[0].finishedBy, 'bad-request');
}));

test('non-POST methods and other content types are HTTP refusals, never gRPC answers', () => s.withServer({}, async (server) => {
  const refusals = [
    ['GET', { method: 'GET' }, 405], ['PUT', { method: 'PUT', body: [Buffer.from('x')] }, 405],
    ['json', { headers: { 'content-type': 'application/json' }, body: [Buffer.from('{}')] }, 415],
    ['grpc+json', { headers: { 'content-type': 'application/grpc+json' }, body: [Buffer.from('{}')] }, 415],
    ['grpc-web', { headers: { 'content-type': 'application/grpc-web' }, body: [Buffer.from('{}')] }, 415],
    ['text', { headers: { 'content-type': 'text/plain' }, body: [Buffer.from('x')] }, 415]
  ];
  for (const [name, options, status] of refusals) {
    const result = await call(server, options);
    assert.equal(result.headers[':status'], status, name);
    assert.equal(result.headers['grpc-status'], undefined, name);
    assert.equal(result.trailers?.['grpc-status'], undefined, name);
    assert.match(result.data.toString(), /gRPC only/, name);
  }
  assert.equal((await call(server, { method: 'GET' })).headers.allow, 'POST');
  assert.deepEqual(server.calls.slice(0, 3).map((record) => [record.outcome, record.finishedBy]), [['HTTP_405', 'refused'], ['HTTP_405', 'refused'], ['HTTP_415', 'refused']]);
}));

function rawSocket(server, bytes, { end = false } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect(server.port, '127.0.0.1', () => { socket.write(bytes); if (end) socket.end(); });
    const chunks = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', () => undefined);
    socket.on('close', () => resolve(Buffer.concat(chunks).toString('latin1')));
  });
}

test('anything that is not an HTTP/2 connection preface gets an HTTP/1.1 refusal and no gRPC bytes', () => s.withServer({}, async (server) => {
  for (const bytes of ['GET / HTTP/1.1\r\nHost: x\r\n\r\n', 'POST /acme.ticker.v1.Ticker/Watch HTTP/1.1\r\nContent-Type: application/grpc\r\n\r\n', 'PRI * HTTP/1.1\r\n\r\n', 'garbage\x00\x01\x02', 'GET / HTTP/1.0\r\n\r\n',
    'GET / HTTP/1.1\r\nHost: x\r\nConnection: Upgrade, HTTP2-Settings\r\nUpgrade: h2c\r\nHTTP2-Settings: AAMAAABkAAQAoAAAAAIAAAAA\r\n\r\n']) {
    const answer = await rawSocket(server, bytes);
    assert.match(answer, /^HTTP\/1\.1 505 HTTP Version Not Supported\r\n/, JSON.stringify(bytes.slice(0, 12)));
    assert.match(answer, /gRPC over HTTP\/2/);
    assert.doesNotMatch(answer, /grpc-status/i);
  }
}));

test('a connection that never speaks is cut after the first-byte timeout', () => s.withServer({ limits: { firstByteTimeoutMs: 40 } }, async (server) => {
  const answer = await rawSocket(server, '');
  assert.equal(answer, '');
}));

test('connections beyond maxConnections are dropped at once while the first keeps working', () => s.withServer({ limits: { maxConnections: 1 } }, async (server) => {
  const first = net.connect(server.port, '127.0.0.1');
  first.on('error', () => undefined);
  await new Promise((resolve) => first.once('connect', resolve));
  const second = net.connect(server.port, '127.0.0.1');
  second.on('error', () => undefined);
  await new Promise((resolve) => second.once('close', resolve));
  assert.equal(first.destroyed, false);
  first.destroy();
}));

test('a partial HTTP/2 preface is handed to http2 and the server still closes promptly', () => s.withServer({ limits: { firstByteTimeoutMs: 40 } }, async (server) => {
  const socket = net.connect(server.port, '127.0.0.1', () => socket.write('PRI * HTTP/2'));
  socket.on('error', () => undefined);
  await s.until(() => server.active === 0);
  socket.destroy();
}));

test('call records are bounded by maxCallRecords and carry increasing ids', () => s.withServer({ limits: { maxCallRecords: 2 } }, async (server) => {
  for (let index = 0; index < 3; index += 1) await call(server, { path: '/x.Y/Z', body: [s.frame(Buffer.alloc(0))] });
  assert.deepEqual(server.calls.map((record) => record.id), [2, 3]);
}));

test('a handler failure is INTERNAL without leaking its message, a GrpcError keeps its status', () => {
  const methods = createService().methods;
  const watch = methods['/acme.ticker.v1.Ticker/Watch'];
  const wrap = (handler, validate) => ({ methods: { [watch.path]: { ...watch, validate, handler } } });
  const cases = [
    ['an exception', wrap(async function* () { throw new Error('secret detail'); }), '13', /the handler failed/],
    ['a GrpcError', wrap(async function* () { throw new GrpcError(5, 'no such topic'); }), '5', /no such topic/],
    ['a synchronous throw', wrap(() => { throw new Error('sync secret'); }), '13', /the handler failed/],
    ['an invalid response message', wrap(async function* () { yield { nope: 1 }; }), '13', /schema cannot carry/],
    ['a validator', wrap(async function* () { yield { topic: 'a', seq: 1, body: '' }; }, () => { throw new GrpcError(9, 'not now'); }), '9', /not now/]
  ];
  return Promise.all(cases.map(([name, service, code, pattern]) => s.withServer({ service }, async (server) => {
    const result = await call(server, { body: [s.frame(s.watchRequest('alpha', 1))] });
    const status = result.trailers?.['grpc-status'] ?? result.headers['grpc-status'];
    assert.equal(status, code, name);
    assert.match(decodeURIComponent(result.trailers?.['grpc-message'] ?? result.headers['grpc-message']), pattern, name);
    assert.doesNotMatch(String(result.trailers?.['grpc-message']), /secret/, name);
    assert.equal(server.active, 0, `${name}: the call is no longer active`);
  })));
});

test('a response over maxResponseBytes ends RESOURCE_EXHAUSTED after the headers, with no message sent', () => s.withServer({ limits: { maxResponseBytes: 100 } }, async (server) => {
  const result = await call(server, { body: [s.frame(s.watchRequest('alpha', 2, 0, 200))] });
  assert.equal(result.headers[':status'], 200);
  assert.equal(result.trailers['grpc-status'], '8');
  assert.equal(result.data.length, 0);
  assert.equal(server.calls[0].produced, 0);
}));

test('a stream that opens and never sends its request is ended with DEADLINE_EXCEEDED and frees its call slot', () => s.withServer({ limits: { requestTimeoutMs: 30, maxActiveCalls: 1 } }, async (server) => {
  const stalled = s.openStream(server.origin);
  await s.once(stalled.request, 'response');
  assert.equal(stalled.seen.headers['grpc-status'], '4');
  assert.deepEqual(['outcome', 'finishedBy', 'received'].map((key) => server.calls[0][key]), ['DEADLINE_EXCEEDED', 'request-timeout', 0]);
  assert.equal(server.active, 0);
  const next = await call(server, { body: [s.frame(s.watchRequest('alpha', 1))] });
  assert.equal(next.trailers['grpc-status'], '0');
  stalled.session.destroy();
}));

test('a request that arrives in time clears the request timer, so a slow call outlives it', async () => {
  const { ManualTimers } = require('../timers.cjs');
  const timers = new ManualTimers();
  await s.withServer({ timers, limits: { requestTimeoutMs: 250 } }, async (server) => {
    const stream = s.openStream(server.origin);
    stream.request.end(s.frame(s.watchRequest('alpha', 2, 25)));
    await timers.whenPending(1);
    // real time passes here on purpose: the call must still be running after the request timeout would have fired
    await new Promise((resolve) => setTimeout(resolve, 600));
    assert.equal(server.active, 1, 'the call is still running well past the request timeout');
    for (let step = 0; step < 2; step += 1) {
      await timers.whenPending(1);
      timers.advance(25);
    }
    await stream.closed;
    assert.equal(stream.seen.trailers['grpc-status'], '0');
    stream.session.destroy();
  });
});
