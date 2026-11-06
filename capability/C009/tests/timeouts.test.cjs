'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const { withApp } = require('./helpers.cjs');

// Node enforces headersTimeout and requestTimeout only every connectionsCheckingInterval (30 s unless set, L-0145): a client that
// trickles one byte every 150 ms was cut after about 30 s although 5 s were configured. These probes shrink the limits and demand
// that the cut follows the configured value and the checking interval.
const SLOW_MS = 150;

// Writes `start` and then one byte every SLOW_MS until the server ends the connection or waitMs pass. (The 408 the server writes is not
// asserted: the client keeps sending, so the reset that follows may discard the answer before it is read.)
function trickle(port, start, { waitMs = 3000 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
    const startedAt = Date.now();
    let closedByServer = false;
    const finish = () => { clearInterval(feeder); clearTimeout(timer); socket.destroy(); resolve({ closedByServer, ms: Date.now() - startedAt }); };
    const feeder = setInterval(() => { if (!socket.destroyed) socket.write('a'); }, SLOW_MS);
    const timer = setTimeout(finish, waitMs);
    const ended = () => { closedByServer = true; finish(); };
    socket.on('data', () => {});
    socket.on('error', ended);
    socket.on('end', ended);
    socket.on('close', ended);
    socket.write(start);
  });
}

test('the shipped timeouts are 5 s and Node checks them every second, not every 30 seconds', () => withApp({}, ({ app }) => {
  assert.equal(app.server.headersTimeout, 5000);
  assert.equal(app.server.requestTimeout, 5000);
  assert.ok(app.server.connectionsCheckingInterval <= 1000, `Node checks the header and request timeouts every ${app.server.connectionsCheckingInterval} ms`);
}));

test('a header trickled one byte at a time is cut about when the configured header timeout runs out', () => withApp({ app: { limits: { headerMs: 400, checkMs: 100 } } }, async (context) => {
  const result = await trickle(context.port, `GET /v1/state HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\nX-Slow: `);
  assert.equal(result.closedByServer, true, 'the server cut the trickling client');
  assert.ok(result.ms < 2500, `cut after ${result.ms} ms`);
}));

test('a body trickled one byte at a time is cut about when the configured request timeout runs out', () => withApp({ app: { limits: { headerMs: 400, checkMs: 100 } } }, async (context) => {
  const token = context.app.issueToken('conductor-a');
  const start = `POST /v1/commands/run.create HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\nContent-Length: 400\r\n\r\n{"name":"`;
  const result = await trickle(context.port, start);
  assert.equal(result.closedByServer, true, 'the server cut the trickling client');
  assert.ok(result.ms < 2500, `cut after ${result.ms} ms`);
  assert.equal(context.app.snapshot().revision, 0, 'the unfinished command had no effect');
}));
