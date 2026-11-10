'use strict';

// Self-review line 1: TWO live instances in one process. Each app owns its own listener, sockets, token registry, books and audit log. Closing one
// (the one opened first, or the one opened last; twice) ends only its own listener and connections: the neighbour keeps its held connection, its books,
// its audit log and its tokens, and nothing of one instance means anything to the other (an id, a key, a token).
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { SMALL, call, reserve, sequentialIds, startApp } = require('./helpers.cjs');

const LONG = { app: { config: { ...SMALL, limits: { idleMs: 120000, headerMs: 60000 } }, newId: sequentialIds() } };
const open = (port) => new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.on('error', () => {});
  socket.once('connect', () => resolve(socket));
});
const closed = (socket) => new Promise((resolve) => (socket.destroyed ? resolve(true) : socket.once('close', () => resolve(true))));
const fresh = () => startApp({ app: { ...LONG.app, newId: sequentialIds() } });

for (const [label, order] of [['opened first, then opened last (FIFO)', (a, b) => [a, b]], ['opened last, then opened first (LIFO)', (a, b) => [b, a]]]) {
  test(`two live instances closed ${label}: each close ends only its own listener and connections, a repeated close is harmless, the neighbour is untouched`, async () => {
    const a = await fresh();
    const b = await fresh();
    const sockets = [];
    try {
      assert.notEqual(a.port, b.port);
      const held = { [a.port]: (await reserve(a, 'conductor-a', 3, { key: 'key-two-0001' })).json.reservation, [b.port]: (await reserve(b, 'conductor-a', 2, { key: 'key-two-0001' })).json.reservation };
      assert.equal(held[a.port].id, held[b.port].id, 'both instances mint the same guessable id: only the instance tells them apart');
      assert.notEqual(held[a.port].units, held[b.port].units);
      const crossToken = await call(b, a.tokens['conductor-a'], 'GET', '/v1/me');
      assert.deepEqual([crossToken.status, crossToken.json.error.code], [401, 'TOKEN_UNKNOWN'], 'a token of one instance means nothing to the other');
      const crossKey = await reserve(b, 'conductor-b', 5, { key: 'key-two-0001' });
      assert.equal(crossKey.json.replayed, false, 'a key used in one instance is unused in the other');
      const sockets2 = new Map([[a, await open(a.port)], [b, await open(b.port)]]);
      sockets.push(...sockets2.values());

      const [first, second] = order(a, b);
      const secondState = JSON.stringify(second.app.snapshot());
      const secondAudit = second.app.auditLog().length;
      await first.close();
      await closed(sockets2.get(first));
      await assert.rejects(call(first, first.tokens['conductor-a'], 'GET', '/v1/me'), 'the closed instance accepts nothing');
      await first.close();

      assert.equal(sockets2.get(second).destroyed, false, 'the neighbour keeps its held connection');
      const alive = await call(second, second.tokens['conductor-a'], 'GET', '/v1/allowance');
      assert.equal(alive.status, 200, 'the neighbour keeps serving with its own tokens');
      assert.equal(alive.json.allowance.lease.heldUnits, held[second.port].units, 'the neighbour keeps its books');
      assert.equal(JSON.stringify(second.app.snapshot()), secondState, 'the neighbour keeps its state');
      assert.equal(second.app.auditLog().length, secondAudit + 1, 'only its own request was audited');
      assert.equal(second.app.health().ok, true);

      await second.close();
      await closed(sockets2.get(second));
      await second.close();
      assert.deepEqual([...sockets2.values()].map((socket) => socket.destroyed), [true, true]);
    } finally {
      for (const socket of sockets) socket.destroy();
      await a.close();
      await b.close();
    }
  });
}
