'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const net = require('node:net');
const { test } = require('node:test');
const { send, startApp, request } = require('./helpers.cjs');
const { exchange, bare } = require('./raw-http.cjs');

// Pre-publication checklist item 1 (two instances). Everything an app owns per instance (the token registry, the ledger, the lanes, the
// fail-closed flag, the sockets close() ends) lives in the closure of createApp. Two live apps in one process must not see each other,
// in either closing order; closing twice is harmless; a neighbour the apps do not own (a plain HTTP server with a connected client)
// stays untouched. The marks of refused sockets are module level but keyed by socket, and a socket belongs to one server.
const LONG = { settleMs: 2500, waitMs: 15000 };
const unknownRoute = (port) => Buffer.from(`POST /nope HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Length: 2\r\n\r\n{}`);

async function neighbour() {
  const server = http.createServer((_request, response) => response.end('neighbour'));
  const sockets = new Set();
  server.on('connection', (socket) => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  const held = await new Promise((resolve) => { const socket = net.connect(port, '127.0.0.1', () => resolve(socket)); });
  return {
    port, held,
    async close() {
      held.destroy();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

for (const order of ['FIFO', 'LIFO']) {
  test(`two live apps in one process stay independent and a neighbour stays untouched (closed ${order}, each closed twice)`, async () => {
    const first = await startApp({});
    const second = await startApp({});
    const other = await neighbour();
    let heldClosed = false;
    other.held.once('close', () => { heldClosed = true; });
    const [early, late] = order === 'FIFO' ? [first, second] : [second, first];
    try {
      const tokenOfFirst = first.app.issueToken('operator');
      const tokenOfSecond = second.app.issueToken('operator');
      assert.equal((await send(first, 'pool.resize', tokenOfFirst)).status, 200, 'an app applies a command with its own token');
      assert.equal((await send(second, 'pool.resize', tokenOfFirst)).json.error.code, 'TOKEN_UNKNOWN', 'a token of one app is unknown to the other');
      assert.deepEqual([first.app.snapshot().revision, second.app.snapshot().revision], [1, 0], 'the commit of one app is not in the ledger of the other');
      const refused = await exchange(first.port, unknownRoute(first.port), LONG);
      assert.deepEqual([refused.answers.map((answer) => answer.status), refused.closedByServer], [[404], true], 'a refusal ends its own connection');
      assert.equal((await send(second, 'pool.resize', tokenOfSecond, { size: 4 })).status, 200, 'the other app is served as before');
      await early.app.close();
      await early.app.close();
      await assert.rejects(request(early, { route: '/v1/state' }), 'a closed app accepts no connection');
      const stillOpen = late === first ? tokenOfFirst : tokenOfSecond;
      assert.equal((await request(late, { route: '/v1/state' })).status, 200, 'the app that stays open still serves');
      assert.equal((await send(late, 'pool.resize', stillOpen, { size: 5 })).status, 200, 'and still applies commands');
      assert.deepEqual(late.app.health(), { ok: true, reason: null });
      await late.app.close();
      await late.app.close();
      assert.equal(heldClosed, false, 'the connection of an unrelated server was not touched');
      assert.equal((await request(other, { route: '/' })).text, 'neighbour', 'the unrelated server still serves');
    } finally {
      await Promise.all([first.close(), second.close(), other.close()]);
    }
  });
}

test('an app that failed closed does not fail its neighbour, and a refusal on one marks no socket of the other', async () => {
  const broken = await startApp({});
  const healthy = await startApp({});
  broken.app.server.prependListener('connection', (socket) => { socket._handle.readStop = undefined; });
  try {
    const result = await exchange(broken.port, bare(broken.port, 'GET', '/v1/state'), LONG);
    assert.deepEqual(result.answers, [], 'the broken app serves nothing');
    assert.equal(broken.app.health().ok, false);
    assert.equal((await request(healthy, { route: '/v1/state' })).status, 200, 'the healthy app is served');
    assert.deepEqual(healthy.app.health(), { ok: true, reason: null });
    const refused = await exchange(healthy.port, unknownRoute(healthy.port), LONG);
    assert.deepEqual(refused.answers.map((answer) => answer.status), [404]);
    assert.equal((await request(healthy, { route: '/v1/state' })).status, 200, 'a new connection of the healthy app is served after its refusal');
  } finally {
    await Promise.all([broken.close(), healthy.close()]);
  }
});
