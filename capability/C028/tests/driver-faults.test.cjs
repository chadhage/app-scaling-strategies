'use strict';

// The driver against hostile raw http2 servers: it must never report ok on a broken, forged, truncated or missing response.
const assert = require('node:assert/strict');
const http2 = require('node:http2');
const { test } = require('node:test');
const { connect } = require('../driver.cjs');
const s = require('./support.cjs');

const H2 = http2.constants;
const { frame, GRPC } = s;
const tick = (seq) => s.tickPayload(seq);
const trailing = (stream, trailers = { 'grpc-status': '0' }) => stream.on('wantTrailers', () => stream.sendTrailers(trailers));
const respondWithTrailers = (stream, trailers, data, head = GRPC) => {
  stream.respond(head, { waitForTrailers: true });
  trailing(stream, trailers);
  stream.end(data);
};

async function against(behavior, clientOptions = {}, request = { topic: 'alpha', count: 3 }) {
  const server = await s.evilServer(behavior);
  const client = await connect(server.origin, clientOptions);
  try {
    const timer = new Promise((resolve) => setTimeout(() => resolve('TIMED_OUT'), 6000).unref());
    const result = await Promise.race([client.call(s.WATCH, request, { timeoutMs: 5000 }).result, timer]);
    assert.notEqual(result, 'TIMED_OUT', 'the driver must always settle');
    return result;
  } finally {
    client.close();
    await server.close();
  }
}

// [name, behavior, violation code, status code, status origin, outcome]
const FAULTS = [
  ['ends the stream without trailers', (stream) => { stream.respond(GRPC); stream.end(frame(tick(1))); }, 'TRAILERS_MISSING', 13, 'protocol-violation', 'protocol-violation'],
  ['ends a headers-only response without any grpc-status', (stream) => { stream.respond(GRPC, { endStream: true }); }, 'TRAILERS_MISSING', 13, 'protocol-violation', 'protocol-violation'],
  ['truncates a message', (stream) => respondWithTrailers(stream, undefined, Buffer.concat([frame(tick(1)), Buffer.from('0000000020', 'hex'), Buffer.from('0a05', 'hex')])), 'TRUNCATED_MESSAGE', 13, 'protocol-violation', 'protocol-violation'],
  ['promises more than arrives', (stream) => respondWithTrailers(stream, undefined, Buffer.concat([Buffer.from('000000003c', 'hex'), tick(1)])), 'TRUNCATED_MESSAGE', 13, 'protocol-violation', 'protocol-violation'],
  ['promises less than it sends', (stream) => respondWithTrailers(stream, undefined, Buffer.concat([Buffer.from('0000000002', 'hex'), tick(1)])), 'MESSAGE_MALFORMED', 13, 'protocol-violation', 'protocol-violation'],
  ['leaves a partial prefix at the end', (stream) => respondWithTrailers(stream, undefined, Buffer.concat([frame(tick(1)), Buffer.from('0000', 'hex')])), 'TRUNCATED_MESSAGE', 13, 'protocol-violation', 'protocol-violation'],
  ['sends a bad prefix flag', (stream) => respondWithTrailers(stream, undefined, frame(tick(1), 7)), 'BAD_PREFIX', 13, 'protocol-violation', 'protocol-violation'],
  ['sends a compressed message', (stream) => respondWithTrailers(stream, undefined, frame(tick(1), 1)), 'COMPRESSED_MESSAGE', 13, 'protocol-violation', 'protocol-violation'],
  ['sends malformed protobuf', (stream) => respondWithTrailers(stream, undefined, frame(Buffer.from('0a05ff', 'hex'))), 'MESSAGE_MALFORMED', 13, 'protocol-violation', 'protocol-violation'],
  ['sends invalid UTF-8 in a field', (stream) => respondWithTrailers(stream, undefined, frame(Buffer.from('0a01ff', 'hex'))), 'MESSAGE_MALFORMED', 13, 'protocol-violation', 'protocol-violation'],
  ['sends a message over the limit', (stream) => respondWithTrailers(stream, undefined, frame(Buffer.concat([tick(1), Buffer.from(`1a40${'61'.repeat(64)}`, 'hex')]))), 'MESSAGE_TOO_LARGE', 8, 'protocol-violation', 'protocol-violation'],
  ['answers HTTP 500 with JSON', (stream) => { stream.respond({ ':status': 500, 'content-type': 'application/json' }); stream.end('{"e":1}'); }, 'HTTP_STATUS', 2, 'http-status', 'protocol-violation'],
  ['answers HTTP 503', (stream) => { stream.respond({ ':status': 503 }); stream.end(); }, 'HTTP_STATUS', 14, 'http-status', 'protocol-violation'],
  ['answers HTTP 404', (stream) => { stream.respond({ ':status': 404 }); stream.end(); }, 'HTTP_STATUS', 12, 'http-status', 'protocol-violation'],
  ['answers HTTP 401', (stream) => { stream.respond({ ':status': 401 }); stream.end(); }, 'HTTP_STATUS', 16, 'http-status', 'protocol-violation'],
  ['answers HTTP 403', (stream) => { stream.respond({ ':status': 403 }); stream.end(); }, 'HTTP_STATUS', 7, 'http-status', 'protocol-violation'],
  ['answers HTTP 400', (stream) => { stream.respond({ ':status': 400 }); stream.end(); }, 'HTTP_STATUS', 13, 'http-status', 'protocol-violation'],
  ['answers HTTP 429', (stream) => { stream.respond({ ':status': 429 }); stream.end(); }, 'HTTP_STATUS', 14, 'http-status', 'protocol-violation'],
  ['answers 200 with another content type', (stream) => respondWithTrailers(stream, undefined, frame(tick(1)), { ':status': 200, 'content-type': 'text/plain' }), 'CONTENT_TYPE', 13, 'protocol-violation', 'protocol-violation'],
  ['answers 200 with no content type', (stream) => respondWithTrailers(stream, undefined, frame(tick(1)), { ':status': 200 }), 'CONTENT_TYPE', 13, 'protocol-violation', 'protocol-violation'],
  ['puts grpc-status in the headers and then sends data', (stream) => respondWithTrailers(stream, undefined, frame(tick(1)), { ...GRPC, 'grpc-status': '0' }), 'STATUS_IN_HEADERS_WITH_BODY', 13, 'protocol-violation', 'protocol-violation'],
  ['resets the stream with INTERNAL_ERROR', (stream) => { stream.respond(GRPC); stream.write(frame(tick(1))); stream.close(H2.NGHTTP2_INTERNAL_ERROR); }, 'STREAM_RESET', 13, 'server-reset', 'protocol-violation'],
  ['refuses the stream', (stream) => stream.close(H2.NGHTTP2_REFUSED_STREAM), 'STREAM_RESET', 14, 'server-reset', 'protocol-violation'],
  ['cancels the stream', (stream) => stream.close(H2.NGHTTP2_CANCEL), 'STREAM_RESET', 1, 'server-reset', 'protocol-violation'],
  ['asks the client to calm down', (stream) => stream.close(H2.NGHTTP2_ENHANCE_YOUR_CALM), 'STREAM_RESET', 8, 'server-reset', 'protocol-violation'],
  ['demands more security', (stream) => stream.close(H2.NGHTTP2_INADEQUATE_SECURITY), 'STREAM_RESET', 7, 'server-reset', 'protocol-violation'],
  ['destroys the socket', (stream, sockets) => { stream.respond(GRPC); stream.write(frame(tick(1))); setImmediate(() => { for (const socket of sockets) socket.destroy(); }); }, 'TRANSPORT_CLOSED', 14, 'transport', 'transport-failure'],
  ['sends trailers without grpc-status', (stream) => respondWithTrailers(stream, { 'x-other': '1' }, frame(tick(1))), 'STATUS_MISSING', 13, 'protocol-violation', 'protocol-violation'],
  ['sends a non-numeric grpc-status', (stream) => respondWithTrailers(stream, { 'grpc-status': 'abc' }, frame(tick(1))), 'STATUS_INVALID', 13, 'protocol-violation', 'protocol-violation'],
  ['sends a grpc-status above 16', (stream) => respondWithTrailers(stream, { 'grpc-status': '17' }, frame(tick(1))), 'STATUS_INVALID', 13, 'protocol-violation', 'protocol-violation'],
  ['sends an empty grpc-status', (stream) => respondWithTrailers(stream, { 'grpc-status': '' }, frame(tick(1))), 'STATUS_INVALID', 13, 'protocol-violation', 'protocol-violation'],
  ['sends a negative grpc-status', (stream) => respondWithTrailers(stream, { 'grpc-status': '-1' }, frame(tick(1))), 'STATUS_INVALID', 13, 'protocol-violation', 'protocol-violation'],
  ['sends a padded grpc-status', (stream) => respondWithTrailers(stream, { 'grpc-status': '00' }, frame(tick(1))), 'STATUS_INVALID', 13, 'protocol-violation', 'protocol-violation']
];
for (const [name, behavior, violation, code, origin, outcome] of FAULTS) {
  test(`the driver never reports success when the server ${name}`, async () => {
    const report = await against(behavior, { maxMessageBytes: 64 });
    assert.equal(report.ok, false);
    assert.ok(report.violations.some((item) => item.code === violation), `${violation} in ${JSON.stringify(report.violations)}`);
    assert.deepEqual([report.status.code, report.status.origin, report.outcome], [code, origin, outcome]);
    assert.notEqual(report.status.code, 0);
    assert.equal(report.events.at(-1).ev, 'end');
  });
}

test('a Trailers-Only error and a non-OK trailer status are reported as the server said, with messages kept in order', async () => {
  const only = await against((stream) => stream.respond({ ...GRPC, 'grpc-status': '14', 'grpc-message': 'try%20later%C2%A0' }, { endStream: true }));
  assert.deepEqual([only.ok, only.trailersOnly, only.status.code, only.status.message, only.messageCount, only.outcome], [false, true, 14, 'try later\u00a0', 0, 'server-error']);
  const partial = await against((stream) => respondWithTrailers(stream, { 'grpc-status': '14', 'grpc-message': 'overloaded' }, Buffer.concat([frame(tick(1)), frame(tick(2))])));
  assert.deepEqual([partial.ok, partial.messages.map((message) => message.seq), partial.status, partial.violations], [false, [1, 2], { code: 14, name: 'UNAVAILABLE', message: 'overloaded', origin: 'server-trailers' }, []]);
});

test('an empty OK stream, a frame split byte by byte and a message exactly at the limit are all fine', async () => {
  const empty = await against((stream) => respondWithTrailers(stream, undefined, undefined));
  assert.deepEqual([empty.ok, empty.messageCount, empty.violations], [true, 0, []]);
  const split = await against((stream) => {
    stream.respond(GRPC, { waitForTrailers: true });
    trailing(stream);
    const wire = Buffer.concat([frame(tick(1)), frame(tick(2))]);
    for (const byte of wire) stream.write(Buffer.from([byte]));
    stream.end();
  });
  assert.deepEqual([split.ok, split.messages.map((message) => message.seq)], [true, [1, 2]]);
  const exact = await against((stream) => respondWithTrailers(stream, undefined, frame(tick(1))), { maxMessageBytes: tick(1).length });
  assert.deepEqual([exact.ok, exact.messageCount], [true, 1]);
});

test('a server that floods more messages than the driver allows is cut off with RESOURCE_EXHAUSTED, keeping the first ones in order', async () => {
  const report = await against((stream) => respondWithTrailers(stream, undefined, Buffer.concat([1, 2, 3, 4, 5].map((seq) => frame(tick(seq))))), { maxMessages: 3 });
  assert.equal(report.ok, false);
  assert.deepEqual(report.violations.map((item) => item.code), ['TOO_MANY_MESSAGES']);
  assert.deepEqual([report.status.code, report.status.origin, report.messages.map((message) => message.seq)], [8, 'protocol-violation', [1, 2, 3]]);
  const exact = await against((stream) => respondWithTrailers(stream, undefined, Buffer.concat([1, 2, 3].map((seq) => frame(tick(seq))))), { maxMessages: 3 });
  assert.deepEqual([exact.ok, exact.messageCount], [true, 3]);
});

test('a missing status message is an empty message and a late reader still gets one settled report', async () => {
  const report = await against((stream) => respondWithTrailers(stream, { 'grpc-status': '5' }, undefined));
  assert.deepEqual(report.status, { code: 5, name: 'NOT_FOUND', message: '', origin: 'server-trailers' });
  assert.equal(report.ok, false);
});
