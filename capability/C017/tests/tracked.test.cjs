'use strict';

// F30 of the fourth review (G110, G109, G111, G114 of the systematic generator): the set of accepted sockets that closeOwned() destroys at shutdown, and
// closeAllConnections(), are two redundant layers, and the line that empties the set when a socket closes was observable by no test (a mutant without it
// leaked one socket object per connection: 2.1 KB each, linear in the number of connections). The read-only accessor openSockets(server) makes the set a
// COUNT, so every claim below is an exact number and no heap or time bound decides anything: events only (the sockets' own close events), no clock.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { createLocalServer, listen, closeOwned, openSockets } = require('../server.cjs');

// A live server whose accepted sockets are also recorded here: `accepted` resolves once `count` sockets arrived, `closedAll()` once every one closed.
// This listener is registered after the server's own, so when a socket's promise below settles the server's bookkeeping of that close has run.
async function observed(t) {
  const ctx = s.boot();
  const server = await listen(createLocalServer({ engine: ctx.engine }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const sockets = [];
  const closes = [];
  const waiting = [];
  server.on('connection', (socket) => {
    sockets.push(socket);
    closes.push(new Promise((resolve) => socket.once('close', resolve)));
    for (const waiter of waiting.splice(0)) if (sockets.length >= waiter.count) waiter.resolve(); else waiting.push(waiter);
  });
  t.after(async () => {
    delete server.closeAllConnections;
    await ctx.engine.close();
    await closeOwned(server);
    await ctx.cleanup();
  });
  return {
    ctx, server, origin, sockets,
    accepted: (count) => (sockets.length >= count ? Promise.resolve() : new Promise((resolve) => { waiting.push({ count, resolve }); })),
    closedAll: () => Promise.all(closes),
  };
}

test('the tracked set holds exactly the open connections: idle ones are counted while open and every one leaves it when it closes (G109, G110, G111)', async (t) => {
  const live = await observed(t);
  assert.equal(openSockets(live.server), 0, 'a server that accepted nothing tracks nothing');
  const idle = Array.from({ length: 5 }, () => h.raw(live.origin));
  await live.accepted(5);
  assert.equal(openSockets(live.server), 5, 'five open connections are tracked');
  for (const one of idle) one.socket.destroy();
  await live.closedAll();
  assert.equal(openSockets(live.server), 0, 'a closed connection leaves the set (a set that keeps it leaks one socket object per connection)');
});

test('short connections at concurrency 8 never accumulate in the tracked set: every one has left it once it closed (G110)', async (t) => {
  const live = await observed(t);
  const TOTAL = 160;
  let next = 0;
  const statuses = [];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < TOTAL) {
      next += 1;
      statuses.push((await h.get(live.origin, '/api/state')).status);
    }
  }));
  assert.equal(statuses.length, TOTAL);
  assert.ok(statuses.every((status) => status === 200));
  assert.equal(live.sockets.length, TOTAL, 'every request used its own connection (Connection: close)');
  await live.closedAll();
  assert.equal(openSockets(live.server), 0, `${TOTAL} closed connections left ${openSockets(live.server)} sockets in the tracked set`);
});

test('closeOwned calls closeAllConnections once, and the tracked set alone destroys every socket when closeAllConnections does nothing (G114 and the redundant layers)', async (t) => {
  const live = await observed(t);
  const idle = Array.from({ length: 3 }, () => h.raw(live.origin));
  await live.accepted(3);
  let calls = 0;
  live.server.closeAllConnections = () => { calls += 1; };
  const done = closeOwned(live.server);
  // Both layers run before the first await of closeOwned, so these are exact facts at this point and nothing waits for a clock.
  assert.equal(calls, 1, 'closeOwned calls closeAllConnections exactly once');
  assert.deepEqual(live.sockets.map((socket) => socket.destroyed), [true, true, true], 'the tracked set destroyed every socket although closeAllConnections did nothing');
  delete live.server.closeAllConnections;
  await done;
  await live.closedAll();
  await Promise.all(idle.map((one) => one.closed));
  assert.equal(live.server.listening, false);
  assert.equal(openSockets(live.server), 0);
});

test('openSockets of an object the server never tracked is 0 (it reads, it never creates)', () => {
  assert.equal(openSockets({}), 0);
  assert.equal(openSockets(Object.create(null)), 0);
});
