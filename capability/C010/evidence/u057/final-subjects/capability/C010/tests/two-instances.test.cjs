'use strict';

// Self-review line 1: TWO live instances in one process. Each app owns its own listener, sockets, token registry, store and audit log. Closing one
// (the one opened first, or the one opened last; twice) ends only its own listener and connections: the neighbour keeps its held connection, its state,
// its audit log and its tokens, and nothing of one instance means anything to the other.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { call, seed, startApp } = require('./helpers.cjs');

const LONG = { app: { limits: { idleMs: 600000, headerMs: 600000 } } };
const open = (port) => new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.on('error', () => {});
  socket.once('connect', () => resolve(socket));
});
const closed = (socket) => new Promise((resolve) => (socket.destroyed ? resolve(true) : socket.once('close', () => resolve(true))));

for (const [label, order] of [['opened first, then opened last (FIFO)', (a, b) => [a, b]], ['opened last, then opened first (LIFO)', (a, b) => [b, a]]]) {
  test(`two live instances closed ${label}: each close ends only its own listener and connections, a repeated close is harmless, the neighbour is untouched`, async () => {
    const a = await startApp(LONG);
    const b = await startApp(LONG);
    const sockets = [];
    try {
      assert.notEqual(a.port, b.port);
      const worlds = new Map([[a, await seed(a)], [b, await seed(b)]]);
      const crossToken = await call(b, worlds.get(a).tokens['conductor-a'], 'GET', '/v1/me');
      assert.deepEqual([crossToken.status, crossToken.json.error.code], [401, 'TOKEN_UNKNOWN'], 'a token of one instance means nothing to the other');
      const crossLease = await call(b, worlds.get(b).tokens['conductor-a'], 'GET', `/v1/leases/${worlds.get(a).ids.a.lease}`);
      assert.deepEqual([crossLease.status, crossLease.json.error.code], [404, 'TARGET_NOT_FOUND'], 'a lease of one instance is absent in the other');
      const held = new Map([[a, await open(a.port)], [b, await open(b.port)]]);
      sockets.push(...held.values());

      const [first, second] = order(a, b);
      const secondState = JSON.stringify(second.app.snapshot());
      const secondAudit = second.app.auditLog().length;
      await first.close();
      await closed(held.get(first));
      await assert.rejects(call(first, worlds.get(first).tokens['conductor-a'], 'GET', '/v1/me'), 'the closed instance accepts nothing');
      await first.close();

      assert.equal(held.get(second).destroyed, false, 'the neighbour keeps its held connection');
      const alive = await call(second, worlds.get(second).tokens['conductor-a'], 'GET', '/v1/me');
      assert.equal(alive.status, 200, 'the neighbour keeps serving with its own tokens');
      assert.equal(JSON.stringify(second.app.snapshot()), secondState, 'the neighbour keeps its state');
      assert.equal(second.app.auditLog().length, secondAudit + 1, 'only its own request was audited');
      assert.equal(second.app.health().ok, true);

      await second.close();
      await closed(held.get(second));
      await second.close();
      assert.deepEqual([...held.values()].map((socket) => socket.destroyed), [true, true]);
    } finally {
      for (const socket of sockets) socket.destroy();
      await a.close();
      await b.close();
    }
  });
}
