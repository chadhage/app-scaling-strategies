'use strict';

// Smaller defects from the independent review: 426 answers, upgrade bodies and targets, control-frame lengths,
// the published limits and the page verifier's duplicate welcome.
const assert = require('node:assert/strict');
const test = require('node:test');
const framing = require('../framing.cjs');
const { createLocalServer, closeServer, produceLocalTranscript, limits } = require('../server.cjs');
const { runPage } = require('./dom-stub.cjs');
const { listen, request, upgradeRequest } = require('./support.cjs');
const { firstResponse } = require('./limits-support.cjs');

const plain = (value) => JSON.parse(JSON.stringify(value));

async function withServer(body) {
  const server = createLocalServer();
  const port = await listen(server);
  try {
    return await body(server, port);
  } finally {
    await closeServer(server);
  }
}

test('every 426 names the protocol it asks for (RFC 9110 15.5.22)', () => withServer(async (server, port) => {
  const plainGet = await firstResponse(port, request(port, { target: '/stream' }));
  assert.equal(plainGet.status, 426);
  assert.equal(plainGet.headers.upgrade, 'websocket');
  const wrongVersion = await firstResponse(port, upgradeRequest(port, { headers: { 'Sec-WebSocket-Version': '12' } }));
  assert.equal(wrongVersion.status, 426);
  assert.equal(wrongVersion.headers.upgrade, 'websocket');
  assert.equal(wrongVersion.headers['sec-websocket-version'], '13');
}));

test('an upgrade request that carries a body is refused with 400 UNEXPECTED_BODY, never answered with 101', () => withServer(async (server, port) => {
  const sized = await firstResponse(port, `${upgradeRequest(port, { headers: { 'Content-Length': '5' } })}hello`);
  const chunked = await firstResponse(port, `${upgradeRequest(port, { headers: { 'Transfer-Encoding': 'chunked' } })}0\r\n\r\n`);
  for (const response of [sized, chunked]) {
    assert.equal(response.status, 400, JSON.stringify(response));
    assert.equal(JSON.parse(response.body).error.code, 'UNEXPECTED_BODY');
  }
  assert.equal(server.hub.sessionCount(), 0);
}));

test('the upgrade path checks the whole request target like the plain routes: authority, empty query', () => withServer(async (server, port) => {
  const refusals = [
    ['an absolute-form target of another authority', 'http://evil.invalid/stream', 400, 'INVALID_URL'],
    ['a network-path target of another authority', '//evil.invalid/stream', 400, 'INVALID_URL'],
    ['an empty query', '/stream?', 400, 'INVALID_QUERY']
  ];
  for (const [name, target, status, code] of refusals) {
    const response = await firstResponse(port, upgradeRequest(port, { target }));
    assert.equal(response.status, status, name);
    assert.equal(JSON.parse(response.body).error.code, code, name);
  }
  const own = await firstResponse(port, upgradeRequest(port, { target: `http://127.0.0.1:${port}/stream` }));
  assert.equal(own.status, 101, 'the same authority in absolute form stays valid');
}));

test('a control frame that announces 70000 bytes in the 64-bit length form is a protocol error (1002), like the 16-bit form', () => {
  const key = [1, 2, 3, 4];
  for (const [name, header] of [['64-bit', [0x89, 0xff, 0, 0, 0, 0, 0, 1, 0x11, 0x70]], ['16-bit', [0x89, 0xfe, 0x11, 0x70]]]) {
    const parser = framing.createParser({ requireMask: true, maxMessageBytes: 4096 });
    assert.throws(() => parser.push(Buffer.from([...header, ...key])), (error) => error.code === 'INVALID_CONTROL_FRAME' && error.closeCode === 1002, name);
  }
});

test('the server states its limits in one frozen place', () => {
  assert.deepEqual(limits, { maxClientMessageBytes: 4096, maxFragmentsPerMessage: 64, maxOutboundBytes: 65536, maxConnections: 128 });
  assert.equal(Object.isFrozen(limits), true);
});

test('the page verifier rejects a second welcome for a known session: it would reset the counters and hide a replayed first delivery', async () => {
  const transcript = await produceLocalTranscript();
  const welcome = transcript.events.find((event) => event.dir === 'recv' && event.frame.type === 'welcome');
  const first = transcript.events.find((event) => event.dir === 'recv' && event.frame.type === 'message' && event.conn === welcome.conn);
  transcript.events.splice(transcript.events.indexOf(first) + 1, 0, structuredClone(welcome), structuredClone(first));
  transcript.events.forEach((event, index) => { event.n = index + 1; });
  const verdict = plain(runPage({ fetch: async () => { throw new Error('this test never fetches'); } }).context.C026Transcript.verify(transcript));
  assert.equal(verdict.verified, false, 'a replayed first delivery behind a second welcome was accepted');
  assert.equal(verdict.code, 'WELCOME_DUPLICATE');
});
