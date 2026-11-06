'use strict';

// rev-C017 F11/F12 addendum, part A: Node answers some requests ITSELF and never calls the request handler (an unknown
// Expect header, a request without Host, every parse error and header overflow, a request timeout). Each of them must go
// through the ONE refusal path of the service: a typed answer, Connection: close, the socket marked and destroyed, nothing
// read afterwards, and nothing pipelined behind it may run (in both HTTP framings: Node's maxRequestsPerSocket is not
// applied to HTTP/1.0). Expect: 100-continue is honoured only for a request that was not refused.
const net = require('node:net');
const test = require('node:test');
const { validateResultEnvelope } = require('../envelope.js');
const {
  assert, committed, gate, startService,
} = require('./support.cjs');
const {
  exchange, get, hostOf, mutation, parseAnswers, quiet, sample,
} = require('./pipe-support.cjs');

const v10 = (bytes) => bytes.replace(' HTTP/1.1\r\n', ' HTTP/1.0\r\n');
const dump = `${(4096).toString(16)}\r\n${'x'.repeat(4096)}\r\n`.repeat(4);
const ROWS = [
  ['an unknown Expect header', 417, 'EXPECTATION_FAILED', (p) => get(p, '/v1/leases', 'Expect: foo\r\n')],
  ['an unknown Expect header with a chunked body that is dumped', 417, 'EXPECTATION_FAILED', (p) => `POST /v1/presets HTTP/1.1\r\nHost: ${hostOf(p)}\r\nExpect: foo\r\nTransfer-Encoding: chunked\r\n\r\n${dump}0\r\n\r\n`],
  ['an HTTP/1.1 request without a Host header', 421, 'LOCAL_HOST_REQUIRED', () => 'GET /v1/leases HTTP/1.1\r\n\r\n'],
  ['a malformed request line', 400, 'MALFORMED_REQUEST', () => 'GET\r\n\r\n'],
  ['an invalid method token', 400, 'MALFORMED_REQUEST', (p) => `G@T /v1/leases HTTP/1.1\r\nHost: ${hostOf(p)}\r\n\r\n`],
  ['an invalid header line', 400, 'MALFORMED_REQUEST', (p) => get(p, '/v1/leases', 'Bad Header: x\r\n')],
  ['Content-Length together with Transfer-Encoding', 400, 'MALFORMED_REQUEST', (p) => `POST /v1/presets HTTP/1.1\r\nHost: ${hostOf(p)}\r\nContent-Length: 5\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n`],
  ['a header block beyond the size bound', 431, 'HEADERS_TOO_LARGE', (p) => get(p, '/v1/leases', `X-Big: ${'a'.repeat(9000)}\r\n`)],
  ['more headers than the count bound', 431, 'HEADERS_TOO_LARGE', (p) => get(p, '/v1/leases', Array.from({ length: 70 }, (_, index) => `X-J-${index}: 1\r\n`).join(''))],
];

const typed = (answer) => { try { return JSON.parse(answer.body); } catch { return null; } };
function assertTyped(answer, status, code) {
  const envelope = typed(answer);
  assert.equal(envelope !== null && validateResultEnvelope(envelope).ok, true, `a typed envelope, not an answer of Node itself (status ${answer.status})`);
  assert.deepEqual([answer.status, envelope.error.code], [status, code]);
  assert.equal(answer.close, true, 'Connection: close');
}

for (const [name, status, code, request] of ROWS) {
  test(`NODE-OWN ${name}: a typed refusal that closes the connection, and nothing pipelined behind it runs in either framing`, { timeout: 60000 }, async (context) => {
    const layouts = [
      ['alone', (p) => [request(p)]],
      ['[refused HTTP/1.1][valid mutation HTTP/1.1] in one write', (p) => [request(p), mutation(p, 2)]],
      ['[refused HTTP/1.1][valid mutation HTTP/1.0] in one write', (p) => [request(p), v10(mutation(p, 2))]],
    ];
    for (const [label, parts] of layouts) {
      await context.test(label, async () => {
        const service = await startService();
        try {
          const before = sample(service);
          const seen = await exchange(service.port, parts(service.port));
          await quiet(service);
          assert.deepEqual(seen.statuses, [status], 'the client received only the refusal');
          assertTyped(seen.answers[0], status, code);
          assert.equal(seen.closed, true, 'the server closed the connection');
          assert.deepEqual(sample(service), before, 'the ledger and both journals are unchanged');
        } finally {
          await service.stop();
        }
      });
    }
  });
}

// One raw exchange that keeps the bytes (the interim 100 Continue is part of what is asserted). It ends when the server closes
// the connection, when `until` says the bytes asserted on have arrived, or at the 60 s hang detector, never after a fixed delay.
function rawText(port, bytes, until = () => false) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const chunks = [];
    const done = () => { clearTimeout(timer); socket.destroy(); resolve(Buffer.concat(chunks).toString('latin1')); };
    const timer = setTimeout(done, 60000);
    socket.on('error', () => {});
    socket.on('data', (chunk) => { chunks.push(chunk); if (until(Buffer.concat(chunks).toString('latin1'))) done(); });
    socket.on('close', done);
    socket.on('connect', () => socket.write(bytes));
  });
}
const expecting = (bytes) => bytes.replace('Content-Type:', 'Expect: 100-continue\r\nContent-Type:');

test('NODE-OWN Expect: 100-continue is honoured only for a request that was not refused', { timeout: 600000 }, async (context) => {
  await context.test('a valid POST gets 100 Continue and then its answer, and applies once', async () => {
    const service = await startService();
    try {
      const text = await rawText(service.port, expecting(mutation(service.port, 2)), (seen) => parseAnswers(seen).some((answer) => answer.status === 201));
      assert.match(text, /^HTTP\/1\.1 100 Continue\r\n\r\nHTTP\/1\.1 201 /);
      await quiet(service);
      assert.equal(committed(service.real), 15);
    } finally {
      await service.stop();
    }
  });
  await context.test('a refused request gets its typed refusal and no 100 Continue before it', async () => {
    const service = await startService();
    try {
      const refused = expecting(mutation(service.port, 2)).replace('application/json', 'text/plain');
      const text = await rawText(service.port, refused);
      assert.equal(text.includes('100 Continue'), false, 'the refusal came first');
      assert.match(text, /^HTTP\/1\.1 415 /);
      assert.equal(committed(service.real), 0);
    } finally {
      await service.stop();
    }
  });
});

test('NODE-OWN a parse error behind a request that is still being answered cuts nothing short: the mutation is answered, then the typed refusal', { timeout: 60000 }, async () => {
  const held = gate();
  const service = await startService({ executor: held.executor });
  try {
    const pending = exchange(service.port, [`${mutation(service.port, 2)}\u0000\u0001garbage\r\n\r\n`], { answers: 2 });
    await held.entered('pipe-s2-step-1');
    for (const index of [1, 2, 3]) held.release(`pipe-s2-step-${index}`);
    const seen = await pending;
    assert.deepEqual(seen.statuses, [201, 400], 'the first request came first and is answered before the refusal');
    assertTyped(seen.answers[1], 400, 'MALFORMED_REQUEST');
    assert.equal(committed(service.real), 15, 'the mutation applied exactly once');
  } finally {
    await service.stop();
  }
});

test('NODE-OWN a request timeout (clientError ERR_HTTP_REQUEST_TIMEOUT) is a typed 408 that closes the connection', { timeout: 60000 }, async () => {
  const service = await startService();
  try {
    const accepted = new Promise((resolve) => service.server.once('connection', resolve));
    const socket = net.connect({ host: '127.0.0.1', port: service.port });
    const chunks = [];
    socket.on('error', () => {});
    socket.on('data', (chunk) => chunks.push(chunk));
    const closed = new Promise((resolve) => socket.once('close', resolve));
    const serverSide = await accepted;
    service.server.emit('clientError', Object.assign(new Error('request timeout'), { code: 'ERR_HTTP_REQUEST_TIMEOUT' }), serverSide);
    await closed;
    socket.destroy();
    const text = Buffer.concat(chunks).toString('latin1');
    const [head, ...rest] = text.split('\r\n\r\n');
    assert.match(head, /^HTTP\/1\.1 408 /);
    assertTyped({ status: 408, close: /connection: close/i.test(head), body: rest.join('\r\n\r\n') }, 408, 'REQUEST_TIMEOUT');
  } finally {
    await service.stop();
  }
});
