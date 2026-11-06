'use strict';

// Produces the transcript the browser page displays. Browsers cannot speak native gRPC, so the server runs a REAL gRPC
// conversation against a private fixture instance over real loopback HTTP/2 sockets, with the real driver, and records
// what both sides observed. Streams are paced by manual time, so every transcript is reproducible byte for byte.
const http2 = require('node:http2');
const net = require('node:net');
const { connect } = require('./driver.cjs');
const { createGrpcServer } = require('./grpc-server.cjs');
const { METHODS, SERVICE_NAME } = require('./service.cjs');
const { ManualTimers } = require('./timers.cjs');

const SERVER_FIELDS = ['id', 'outcome', 'status', 'message', 'finishedBy', 'produced', 'received', 'backpressureWaits', 'writesAfterFinish'];
const ignore = () => undefined;

function callsFinished(server, count) {
  return new Promise((resolve) => {
    const check = () => {
      if (server.calls.length < count) return false;
      server.off('call-finished', check);
      resolve();
      return true;
    };
    if (!check()) server.on('call-finished', check);
  });
}

function probeHttp1(port) {
  return new Promise((resolve) => {
    const chunks = [];
    const socket = net.connect(port, '127.0.0.1', () => socket.write('GET / HTTP/1.1\r\nHost: probe\r\nConnection: close\r\n\r\n'));
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', ignore);
    socket.on('close', () => {
      const line = Buffer.concat(chunks).toString('latin1').split('\r\n')[0];
      resolve({ id: 'http1-request', title: 'A plain HTTP/1.1 request to the gRPC port', observed: line, refused: /^HTTP\/1\.1 [45]\d\d /.test(line) });
    });
  });
}

function probeHttp2(origin, id, title, { method, contentType }) {
  return new Promise((resolve) => {
    const session = http2.connect(origin);
    session.on('error', ignore);
    const request = session.request({ ':method': method, ':path': METHODS.Watch.path, 'content-type': contentType }, { endStream: method === 'GET' });
    let headers = {};
    request.on('response', (value) => { headers = value; });
    request.on('error', ignore);
    request.resume();
    request.on('close', () => {
      session.destroy();
      resolve({
        id, title, observed: `HTTP ${headers[':status']}`, httpStatus: headers[':status'], grpcStatusPresent: headers['grpc-status'] !== undefined,
        refused: headers[':status'] >= 400 && headers['grpc-status'] === undefined
      });
    });
    if (method !== 'GET') request.end(Buffer.from('{"not":"grpc"}'));
  });
}

async function produceTranscript() {
  const serverTimers = new ManualTimers();
  const clientTimers = new ManualTimers();
  const server = createGrpcServer({ timers: serverTimers });
  await server.start();
  const client = await connect(server.origin, { timers: clientTimers });
  const small = await connect(server.origin, { timers: clientTimers, maxMessageBytes: 1000 });
  const calls = [];
  const watch = METHODS.Watch.path;
  const record = async (id, title, request, report, extra = {}) => {
    await callsFinished(server, calls.length + 1);
    const { events, ...result } = report;
    // the HTTP/2 date header is the one wall-clock value on the wire; leaving it out keeps the transcript reproducible
    if (result.headers !== null) result.headers = Object.fromEntries(Object.entries(result.headers).filter(([name]) => name !== 'date'));
    calls.push({ id, title, path: report.path, request, ...extra, result, events, server: Object.fromEntries(SERVER_FIELDS.map((field) => [field, server.calls[calls.length][field]])) });
  };
  // one paced tick: wait until the server is sleeping, move manual time, then read the message it produced
  const paced = async (iterator, pending, count) => {
    for (let index = 0; index < count; index += 1) {
      await serverTimers.whenPending(pending);
      serverTimers.advance(25);
      await iterator.next();
    }
  };
  try {
    const ok = client.call(watch, { topic: 'alpha', count: 5 }, { metadata: { 'x-client-tag': 'demo' } });
    await record('watch-ok', 'Server streaming: five ordered ticks, then OK trailers', { topic: 'alpha', count: 5 }, await ok.result);

    const chat = client.call(METHODS.Chat.path, undefined, {});
    for (const text of ['hello', 'world', 'bye']) chat.write({ text });
    chat.end();
    await record('chat-ok', 'Bidirectional: three notes, three echoes numbered by the server', { notes: ['hello', 'world', 'bye'] }, await chat.result);

    const cancelled = client.call(watch, { topic: 'beta', count: 1000, interval_ms: 25 }, {});
    const cancelledIterator = cancelled.messages()[Symbol.asyncIterator]();
    await paced(cancelledIterator, 1, 3);
    cancelled.cancel();
    await record('watch-cancelled', 'The client cancels after three ticks; the server observes it and stops', { topic: 'beta', count: 1000, interval_ms: 25 }, await cancelled.result);

    const late = client.call(watch, { topic: 'gamma', count: 1000, interval_ms: 25 }, { timeoutMs: 100 });
    const lateIterator = late.messages()[Symbol.asyncIterator]();
    await paced(lateIterator, 2, 3);
    await serverTimers.whenPending(2);
    serverTimers.advance(25);
    await record('watch-deadline', 'grpc-timeout 100m expires after three ticks: the server sends DEADLINE_EXCEEDED trailers', { topic: 'gamma', count: 1000, interval_ms: 25, timeoutMs: 100 }, await late.result);

    const unknown = client.call(`/${SERVICE_NAME}/Nope`, { topic: 'alpha', count: 1 }, {});
    await record('unknown-method', 'An unknown method is answered in the Trailers-Only form', { path: `/${SERVICE_NAME}/Nope` }, await unknown.result);

    const invalid = client.call(watch, { topic: 'BAD!', count: 1 }, {});
    await record('invalid-argument', 'An invalid field value is INVALID_ARGUMENT', { topic: 'BAD!', count: 1 }, await invalid.result);

    const big = small.call(watch, { topic: 'delta', count: 5, interval_ms: 25, payload_bytes: 2000 }, {});
    const bigIterator = big.messages()[Symbol.asyncIterator]();
    await serverTimers.whenPending(1);
    serverTimers.advance(25);
    await bigIterator.next();
    await record('message-too-large', 'The driver refuses a 2000 byte message over its 1000 byte limit', { topic: 'delta', payload_bytes: 2000, driverMaxMessageBytes: 1000 }, await big.result);

    const probes = [
      await probeHttp1(server.port),
      await probeHttp2(server.origin, 'non-grpc-content-type', 'HTTP/2 POST with content-type application/json', { method: 'POST', contentType: 'application/json' }),
      await probeHttp2(server.origin, 'http2-get', 'HTTP/2 GET', { method: 'GET', contentType: 'application/grpc' })
    ];
    return {
      schemaVersion: 1, cardId: 'C028', kind: 'server-side-grpc-transcript', businessData: 'synthetic', service: SERVICE_NAME,
      transport: 'HTTP/2 cleartext (prior knowledge) on 127.0.0.1, content-type application/grpc, 5-byte message prefix',
      note: 'Produced by a real gRPC conversation between this fixture and its node:http2 driver; paced by manual time, so it is reproducible.',
      calls, probes
    };
  } finally {
    client.close();
    small.close();
    await server.close();
  }
}

module.exports = Object.freeze({ produceTranscript });
