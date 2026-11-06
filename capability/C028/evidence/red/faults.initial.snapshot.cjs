'use strict';

// Initial behavioral tests: the driver must never report success on a broken response (written before any
// implementation). Retained as a snapshot; run against the RED stubs with C028_RED_SUBJECT. The hostile servers are raw
// node:http2 servers built here, so the fixture itself never needs a misbehaving switch.
const assert = require('node:assert/strict');
const http2 = require('node:http2');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const subjectRoot = process.env.C028_RED_SUBJECT ? path.resolve(process.env.C028_RED_SUBJECT) : root;
const { connect } = require(path.join(subjectRoot, 'driver.cjs'));
const WATCH = '/acme.ticker.v1.Ticker/Watch';
const GRPC = { ':status': 200, 'content-type': 'application/grpc' };

const frame = (payload, flag = 0) => {
  const prefix = Buffer.alloc(5);
  prefix[0] = flag;
  prefix.writeUInt32BE(payload.length, 1);
  return Buffer.concat([prefix, payload]);
};
// Tick { topic: "alpha", seq: n, body: "tick" }
const tick = (seq) => Buffer.concat([Buffer.from('0a05616c706861', 'hex'), Buffer.from([0x10, seq]), Buffer.from('1a047469636b', 'hex')]);
const okTrailers = (stream, trailers = { 'grpc-status': '0' }) => {
  stream.on('wantTrailers', () => stream.sendTrailers(trailers));
};

const faults = {
  'ends the stream without trailers': (stream) => { stream.respond(GRPC); stream.end(frame(tick(1))); },
  'sends a truncated message': (stream) => {
    stream.respond(GRPC, { waitForTrailers: true }); okTrailers(stream);
    stream.end(Buffer.concat([frame(tick(1)), Buffer.from('0000000020', 'hex'), Buffer.from('0a05', 'hex')]));
  },
  'sends a prefix that promises too much': (stream) => {
    stream.respond(GRPC, { waitForTrailers: true }); okTrailers(stream);
    stream.end(Buffer.concat([Buffer.from('0000000064', 'hex'), tick(1)]));
  },
  'sends a prefix that promises too little': (stream) => {
    stream.respond(GRPC, { waitForTrailers: true }); okTrailers(stream);
    stream.end(Buffer.concat([Buffer.from('0000000002', 'hex'), tick(1)]));
  },
  'sends a bad prefix flag': (stream) => {
    stream.respond(GRPC, { waitForTrailers: true }); okTrailers(stream);
    stream.end(frame(tick(1), 7));
  },
  'sends malformed protobuf': (stream) => {
    stream.respond(GRPC, { waitForTrailers: true }); okTrailers(stream);
    stream.end(frame(Buffer.from('0a05ff', 'hex')));
  },
  'answers HTTP 500 with JSON': (stream) => { stream.respond({ ':status': 500, 'content-type': 'application/json' }); stream.end('{"error":"x"}'); },
  'answers with another content type': (stream) => {
    stream.respond({ ':status': 200, 'content-type': 'text/plain' }, { waitForTrailers: true }); okTrailers(stream);
    stream.end(frame(tick(1)));
  },
  'puts grpc-status in headers then data': (stream) => {
    stream.respond({ ...GRPC, 'grpc-status': '0' }, { waitForTrailers: true }); okTrailers(stream);
    stream.end(frame(tick(1)));
  },
  'resets the stream': (stream) => {
    stream.respond(GRPC); stream.write(frame(tick(1)));
    setImmediate(() => stream.close(http2.constants.NGHTTP2_INTERNAL_ERROR));
  },
  'destroys the socket': (stream, sockets) => {
    stream.respond(GRPC); stream.write(frame(tick(1)));
    setImmediate(() => { for (const socket of sockets) socket.destroy(); });
  },
  'sends a message over the size limit': (stream) => {
    stream.respond(GRPC, { waitForTrailers: true }); okTrailers(stream);
    stream.end(frame(Buffer.concat([tick(1), Buffer.from('1a40' + '61'.repeat(64), 'hex')])));
  }
};
const violations = {
  'ends the stream without trailers': 'TRAILERS_MISSING',
  'sends a truncated message': 'TRUNCATED_MESSAGE',
  'sends a prefix that promises too much': 'TRUNCATED_MESSAGE',
  'sends a prefix that promises too little': 'MESSAGE_MALFORMED',
  'sends a bad prefix flag': 'BAD_PREFIX',
  'sends malformed protobuf': 'MESSAGE_MALFORMED',
  'answers HTTP 500 with JSON': 'HTTP_STATUS',
  'answers with another content type': 'CONTENT_TYPE',
  'puts grpc-status in headers then data': 'STATUS_IN_HEADERS_WITH_BODY',
  'resets the stream': 'STREAM_RESET',
  'destroys the socket': 'TRANSPORT_CLOSED',
  'sends a message over the size limit': 'MESSAGE_TOO_LARGE'
};

async function against(behavior, clientOptions = {}) {
  const server = http2.createServer();
  const sessions = new Set();
  const sockets = new Set();
  server.on('connection', (socket) => { sockets.add(socket); socket.on('error', () => undefined); });
  server.on('session', (session) => { sessions.add(session); session.on('error', () => undefined); });
  server.on('sessionError', () => undefined);
  server.on('stream', (stream) => { stream.on('error', () => undefined); stream.resume(); behavior(stream, sockets); });
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

for (const [name, behavior] of Object.entries(faults)) {
  test(`the driver never reports success when the server ${name}`, async () => {
    const result = await against(behavior, { maxMessageBytes: 64 });
    assert.equal(result.ok, false, 'ok must be false');
    assert.ok(result.violations?.some((violation) => violation.code === violations[name]), `violation ${violations[name]}`);
    assert.notEqual(result.status?.code, 0, 'a broken response is never status OK');
  });
}

test('a non-OK trailer status keeps the messages in order but is reported as the server said', async () => {
  const result = await against((stream) => {
    stream.respond(GRPC, { waitForTrailers: true });
    okTrailers(stream, { 'grpc-status': '14', 'grpc-message': 'overloaded%20now' });
    stream.end(Buffer.concat([frame(tick(1)), frame(tick(2))]));
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.messages.map((message) => message.seq), [1, 2]);
  assert.deepEqual(result.status, { code: 14, name: 'UNAVAILABLE', message: 'overloaded now', origin: 'server-trailers' });
  assert.deepEqual(result.violations, []);
});
