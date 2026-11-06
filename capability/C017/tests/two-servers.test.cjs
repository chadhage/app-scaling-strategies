'use strict';

// Checklist item 1 (two live instances) for server.cjs: everything the server owns per instance (its sockets, its one-request marks, its
// listener) is tested with TWO live servers in ONE process, closed in FIFO and in LIFO order, closed twice, and with an unrelated neighbour
// connection that must stay untouched. The drain budget is the one thing shared on purpose (per PROCESS; drain.test.cjs proves it with fake sockets).
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { createLocalServer, listen, closeOwned } = require('../server.cjs');

async function instance(t) {
  const ctx = s.boot();
  const server = await listen(createLocalServer({ engine: ctx.engine }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const close = async () => { await closeOwned(server); };
  t.after(async () => { await ctx.engine.close(); await closeOwned(server); await ctx.cleanup(); });
  return { ctx, server, origin, close, host: `Host: ${new URL(origin).host}\r\n` };
}

const turns = async (count) => { for (let i = 0; i < count; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

async function exercise(t, firstClosed, secondClosed) {
  const a = await instance(t);
  const b = await instance(t);
  assert.notEqual(a.origin, b.origin);
  for (const one of [a, b]) assert.equal((await h.get(one.origin, '/api/state')).status, 200);
  // The one-request mark belongs to its own server: a pipelined cancel behind a refusal on A never runs, and B is not affected by it.
  a.ctx.g.hold('before', 3);
  const started = await h.post(a.origin, '/api/start', s.startCmd('two-start-0001'));
  await a.ctx.g.reached('before', 3);
  const cancel = JSON.stringify(s.cancelCmd('two-cancel-001', started.json.action.actionId));
  const before = a.ctx.engine.view().journal.length;
  const pipelined = h.raw(a.origin, `GET /nowhere HTTP/1.1\r\n${a.host}\r\nPOST /api/cancel HTTP/1.0\r\n${a.host}Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(cancel)}\r\n\r\n${cancel}`);
  await s.withTimeout(pipelined.closed, 'the pipelined connection was never closed', 20000);
  await turns(30);
  assert.equal(a.ctx.engine.view().journal.length, before, 'A: nothing ran behind the refusal');
  assert.equal(b.ctx.engine.view().journal.filter((entry) => entry.type !== 'boot').length, 0, 'B: untouched');
  // An idle neighbour connection on each server.
  const idle = { a: h.raw(a.origin), b: h.raw(b.origin) };
  const closedNow = { a: false, b: false };
  idle.a.closed.then(() => { closedNow.a = true; });
  idle.b.closed.then(() => { closedNow.b = true; });
  await h.connections(a.server, 1);
  await h.connections(b.server, 1);
  const order = { a, b };
  const [first, second] = [order[firstClosed], order[secondClosed]];
  await first.close();
  await first.close();
  await s.withTimeout(idle[firstClosed].closed, 'the closed server left its own connection open', 20000);
  await turns(30);
  assert.equal(closedNow[secondClosed], false, 'closing one server touched the connection of its neighbour');
  assert.equal((await h.get(second.origin, '/api/state')).status, 200, 'the neighbour still serves');
  await second.close();
  await s.withTimeout(idle[secondClosed].closed, 'the second server left its connection open', 20000);
  await second.close();
  assert.equal(a.server.listening || b.server.listening, false);
}

test('two live servers in one process: independent marks, FIFO close, repeated close, an untouched neighbour', async (t) => {
  await exercise(t, 'a', 'b');
});

test('two live servers in one process: LIFO close, repeated close, an untouched neighbour', async (t) => {
  await exercise(t, 'b', 'a');
});
