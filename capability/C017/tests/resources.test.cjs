'use strict';

// Resource and shutdown attacks on the loopback server (sibling attacks of the C026 review findings F1 and F2):
// half-open and never-reading clients, slow headers and bodies, oversize headers, pipelining floods, the connection cap and
// shutdown with every kind of stuck socket. The same attacks run against a real child process with a small heap in child.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { closeOwned } = require('../server.cjs');

const hostLine = (origin) => `Host: ${new URL(origin).host}\r\n`;
const settle = (promises, message, ms = 4000) => s.withTimeout(Promise.all(promises), message, ms);

test('shutdown never hangs on half-open, partial, upgrade, connect or never-reading sockets', async (t) => {
  const env = await h.serve(t);
  env.ctx.g.hold('in', 2);
  const start = { schemaVersion: 1, kind: 'start', key: 'res-start-0001', ...s.attribution, expectedEpoch: 0 };
  const started = await h.post(env.origin, '/api/start', start);
  await env.ctx.g.reached('in', 2);
  const host = hostLine(env.origin);
  const cancel = JSON.stringify(s.cancelCmd('res-cancel-0001', started.json.action.actionId));
  const clients = [
    h.raw(env.origin),
    h.raw(env.origin, `GET /api/state HTTP/1.1\r\n${host}X-Partial: `),
    h.raw(env.origin, `POST /api/cancel HTTP/1.1\r\n${host}Content-Type: application/json\r\nContent-Length: 400\r\n\r\n{"a":1`),
    h.raw(env.origin, `GET /api/state HTTP/1.1\r\n${host}Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n`, { read: false }),
    h.raw(env.origin, `CONNECT 127.0.0.1:1 HTTP/1.1\r\n${host}\r\n`),
    h.raw(env.origin, `POST /api/cancel HTTP/1.1\r\n${host}Content-Type: application/json\r\nContent-Length: ${Buffer.byteLength(cancel)}\r\n\r\n${cancel}`, { read: false }),
  ];
  await s.wait(env.ctx, (state) => Boolean(state.action.cancel));
  await h.connections(env.server, 4);
  await s.withTimeout(closeOwned(env.server), 'closeOwned hung on a stuck socket', 4000);
  clients.forEach((client) => client.socket.resume());
  await settle(clients.map((client) => client.closed), 'a client socket was left open after shutdown');
  assert.equal(env.server.listening, false);
});

test('slow headers and slow bodies are cut off by the request timeout', async (t) => {
  const env = await h.serve(t, { server: { requestTimeoutMs: 300 } });
  const host = hostLine(env.origin);
  const slowHeaders = h.raw(env.origin, `GET /api/state HTTP/1.1\r\n${host}X-Slow: a`);
  const slowBody = h.raw(env.origin, `POST /api/cancel HTTP/1.1\r\n${host}Content-Type: application/json\r\nContent-Length: 300\r\n\r\n{"x":`);
  await settle([slowHeaders.closed, slowBody.closed], 'the request timeout did not close a slow client', 5000);
  assert.equal(env.ctx.engine.view().journal.filter((e) => e.type !== 'boot').length, 0);
});

test('oversize headers are refused with 431 and no effect', async (t) => {
  const env = await h.serve(t);
  const answer = await h.request(env.origin, { path: '/api/state', headers: { 'X-Big': 'z'.repeat(12000) } });
  assert.equal(answer.status, 431);
  const flood = h.raw(env.origin, `GET /api/state HTTP/1.1\r\n${hostLine(env.origin)}${Array.from({ length: 400 }, (_, i) => `X-H${i}: v\r\n`).join('')}\r\n`);
  await s.withTimeout(flood.closed, 'a header flood was not closed', 4000);
  assert.match(flood.text(), /^HTTP\/1\.1 (200|431)/);
});

test('one request per connection: pipelined requests beyond the first are never served', async (t) => {
  const env = await h.serve(t);
  const one = `GET /api/state HTTP/1.1\r\n${hostLine(env.origin)}\r\n`;
  const client = h.raw(env.origin, one.repeat(30));
  await s.withTimeout(client.closed, 'the pipelined connection stayed open', 4000);
  assert.equal((client.text().match(/^HTTP\/1\.1 200/gm) || []).length, 1);
});

test('the connection cap refuses the surplus and never-reading clients cannot stop normal service', async (t) => {
  const env = await h.serve(t, { server: { maxConnections: 8, socketTimeoutMs: 500 } });
  const idle = Array.from({ length: 24 }, () => h.raw(env.origin, '', { read: false }));
  await h.connections(env.server, 8);
  const dropped = await s.withTimeout(Promise.race(idle.map((c, i) => c.closed.then(() => i))), 'no surplus client was refused', 4000);
  assert.ok(dropped >= 0);
  await settle(idle.map((client) => client.closed), 'idle sockets were not cut off by the socket timeout', 6000);
  const served = await h.get(env.origin, '/api/state');
  assert.equal(served.status, 200);
});

test('memory per request is bounded: the state view caps the journal and a full journal refuses new actions', async (t) => {
  const env = await h.serve(t);
  for (let i = 0; i < 40; i += 1) {
    const started = await env.ctx.engine.execute({ schemaVersion: 1, kind: 'start', key: `fill-start-${String(i).padStart(4, '0')}`, ...s.attribution, expectedEpoch: i });
    if (started.status !== 202) {
      assert.equal(started.body.error.code, 'JOURNAL_FULL');
      break;
    }
    await s.wait(env.ctx, (state) => state.action.status === 'COMPLETED');
  }
  const state = (await h.get(env.origin, '/api/state')).json;
  assert.ok(state.journal.length <= 48);
  assert.equal(state.journalEntries, env.ctx.engine.view().journal.length);
  assert.equal(state.journalOmitted, Math.max(0, state.journalEntries - 48));
  assert.ok(state.journalEntries > 48);
  assert.ok(JSON.stringify(state).length < 60000);
});
