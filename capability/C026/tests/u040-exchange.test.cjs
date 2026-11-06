'use strict';

// U040 (found by the 64 x 8 loop): the raw-socket helper exchange() must not let its quiet window decide a verdict about the server. After an
// answer that says Connection: close the server has promised to end the connection, and a starved server may do so long after quietMs (run 36
// of the first loop failed there: closedByServer was false although the server closed shortly after). The fixtures are tiny TCP servers that
// answer and close on their own schedule; every assertion is about WHICH of the helper's three endings is reported (the server closed, the
// connection stayed open and quiet, the hang guard), never about how fast anything ran.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { exchange } = require('./u040-support.cjs');

const REFUSAL = 'HTTP/1.1 404 Not Found\r\nConnection: close\r\nContent-Length: 0\r\n\r\n';
const READ = 'HTTP/1.1 200 OK\r\nContent-Length: 0\r\n\r\n';
const UPGRADED = 'HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n\r\n';
const REQUEST = [{ data: Buffer.from('GET / HTTP/1.1\r\nHost: x\r\n\r\n') }];
const OPTIONS = Object.freeze({ quietMs: 100, boundMs: 20000 });
const LATE_CLOSE_MS = 600;

// script(socket) runs when the request arrives. Every socket is destroyed and the listener closed in finally.
async function withServer(script, body) {
  const sockets = new Set();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('error', () => {});
    socket.once('data', () => script(socket));
  });
  await new Promise((ready) => server.listen(0, '127.0.0.1', ready));
  try {
    return await body(server.address().port);
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise((done) => server.close(done));
  }
}

test('an answer that says Connection: close, followed by a close long after the quiet window, is a close by the server', { timeout: 30000 }, async () => {
  await withServer((socket) => { socket.write(REFUSAL); setTimeout(() => socket.end(), LATE_CLOSE_MS); }, async (port) => {
    const result = await exchange(port, REQUEST, OPTIONS);
    assert.deepEqual([result.statuses, result.closedByServer], [[404], true], `ended by ${result.reason}`);
  });
});

test('the last answer decides: a keep-alive answer followed by a refusal that says Connection: close waits for the close', { timeout: 30000 }, async () => {
  await withServer((socket) => { socket.write(READ + REFUSAL); setTimeout(() => socket.end(), LATE_CLOSE_MS); }, async (port) => {
    const result = await exchange(port, REQUEST, OPTIONS);
    assert.deepEqual([result.statuses, result.closedByServer], [[200, 404], true], `ended by ${result.reason}`);
  });
});

test('a server that promised Connection: close and never closes ends at the hang guard, and that is not a close', { timeout: 30000 }, async () => {
  await withServer((socket) => socket.write(REFUSAL), async (port) => {
    const result = await exchange(port, REQUEST, { quietMs: 100, boundMs: 800 });
    assert.deepEqual([result.statuses, result.closedByServer, result.reason], [[404], false, 'timeout']);
  });
});

test('a keep-alive answer that is never followed by a close ends by the quiet window: the connection stayed open', { timeout: 30000 }, async () => {
  await withServer((socket) => socket.write(READ), async (port) => {
    const result = await exchange(port, REQUEST, OPTIONS);
    assert.deepEqual([result.statuses, result.closedByServer, result.reason], [[200], false, 'quiet']);
  });
});

test('a 101 whose stream stays open keeps the quiet window, even behind an answer that said Connection: close', { timeout: 30000 }, async () => {
  await withServer((socket) => socket.write(REFUSAL + UPGRADED), async (port) => {
    const result = await exchange(port, REQUEST, OPTIONS);
    assert.deepEqual([result.statuses, result.saw101, result.closedByServer, result.reason], [[404, 101], true, false, 'quiet']);
  });
});
