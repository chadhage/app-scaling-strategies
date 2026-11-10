'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { load, withApp } = require('./helpers.cjs');
const { parseAnswers } = require('./raw-http.cjs');

const readback = (server) => ({
  idleMs: server.timeout, headerMs: server.headersTimeout, requestMs: server.requestTimeout, checkMs: server.connectionsCheckingInterval
});

test('U057 actual default server readback: idleMs exceeds headerMs plus checkMs', async (t) => {
  const app = load('server.cjs').createApp();
  try {
    const limits = readback(app.server);
    t.diagnostic(JSON.stringify({ kind: 'default-readback', limits }));
    assert.ok(Number.isInteger(limits.checkMs) && limits.checkMs > 0, 'the actual server exposes its checking interval');
    assert.equal(limits.requestMs, limits.headerMs);
    assert.ok(limits.idleMs > limits.headerMs + limits.checkMs, 'the socket idle timeout must not preempt the typed request timeout');
  } finally {
    await app.close();
  }
});

async function stalled(context, shape) {
  const token = context.app.issueToken('conductor-a');
  const prefix = shape === 'header'
    ? `GET /v1/me HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\n`
    : `POST /v1/leases HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: 100\r\n\r\n{"name":"late`;
  if (shape === 'body') assert.equal(Buffer.byteLength(prefix.split('\r\n\r\n')[1]), 13, 'the stalled body contains exactly 13 bytes of the declared 100');
  const socket = net.connect({ host: '127.0.0.1', port: context.port, allowHalfOpen: true });
  const chunks = [];
  let ended = false;
  let closed = false;
  socket.on('data', (chunk) => chunks.push(chunk));
  socket.on('end', () => { ended = true; socket.end(); });
  socket.on('close', () => { closed = true; });
  socket.on('error', () => {});
  socket.write(prefix);
  try {
    for (let poll = 0; poll < 2500 && !closed; poll += 1) await new Promise((resolve) => setTimeout(resolve, 10));
    return { answers: parseAnswers(Buffer.concat(chunks)), ended, closed, bytes: Buffer.concat(chunks).length };
  } finally {
    socket.destroy();
  }
}

for (const shape of ['header', 'body']) {
  test(`U057 actual default stalled ${shape}: typed 408 REQUEST_TIMEOUT and its proper audit record`, (t) => withApp({}, async (context) => {
    const before = context.app.snapshot();
    const auditBefore = context.app.auditLog().length;
    const observed = await stalled(context, shape);
    const records = context.app.auditLog().slice(auditBefore);
    t.diagnostic(JSON.stringify({ kind: 'default-stall', shape, limits: readback(context.app.server), answers: observed.answers.map(({ status, json }) => ({ status, code: json?.error?.code })), ended: observed.ended, closed: observed.closed, bytes: observed.bytes, audit: records }));
    assert.equal(observed.answers.length, 1, 'a stalled request must receive one typed answer instead of silently closing');
    assert.equal(observed.answers[0].status, 408);
    assert.equal(observed.answers[0].json.error.code, 'REQUEST_TIMEOUT');
    assert.equal(observed.answers[0].headers.connection, 'close');
    assert.equal(observed.closed, true, 'the server ends the timed-out connection');
    assert.deepEqual(records.map(({ subject, role, route, method, outcome, code }) => ({ subject, role, route, method, outcome, code })), [
      { subject: null, role: null, route: null, method: 'OTHER', outcome: 'refused', code: 'REQUEST_TIMEOUT' }
    ]);
    assert.deepEqual(context.app.snapshot(), before, 'a stalled body has no state effect');
  }));
}

module.exports = { readback, stalled };
