'use strict';

// The F24 probe (rev-C017): a request whose answer is still pending, with 64 KB blocks of `GET /x HTTP/1.1` pipelined behind it on 3 sockets up to 50,000 requests,
// against a server in a SEPARATE process with a 48 MB heap. The C009 lanes queue at most `pipelined` (4) requests per socket and then destroy the socket, so no
// request or response object is queued without bound. Counts only: the child is alive and answers, its heap is bounded, every attacker socket was ended by the
// server and is gone, and a legitimate GET is answered.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { startChild, launch } = require('./child.cjs');
const { call } = require('./harness.cjs');

test('F24: 50,000 requests pipelined behind a pending first request on 3 sockets: the 48 MB server stays alive, its heap bounded, every socket ended, a legitimate GET answered', { timeout: 150000 }, async () => {
  const child = await startChild({ mode: 'real', heapMb: 48 });
  const attacker = launch(path.join(__dirname, 'pending-attacker.cjs'), { env: { C014_PENDING: JSON.stringify({ port: child.port, sockets: 3, requests: 50000, waitMs: 30000, maxMs: 60000 }) }, heapMb: 128, startupMs: 120000 });
  try {
    const { sockets } = await attacker.first('report');
    assert.equal(sockets.filter((socket) => socket.serverEnded).length, 3, `the server ended every attacker socket: ${JSON.stringify(sockets)}`);
    let stats = await child.stats();
    for (let turn = 0; turn < 400 && stats.connections > 0; turn += 1) { await new Promise((resolve) => setTimeout(resolve, 50)); stats = await child.stats(); }
    assert.equal(stats.connections, 0, 'no attacker connection is left');
    assert.ok(stats.heapBytes < 40 * 1024 * 1024, `the heap stays bounded (${(stats.heapBytes / 1048576).toFixed(1)} MB of 48)`);
    assert.equal((await call(child.port, 'GET', '/scope.json')).status, 200, 'the server still answers a legitimate GET');
  } finally { await attacker.stop(); await child.close(); }
});
