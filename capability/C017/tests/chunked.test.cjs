'use strict';

// Close-after-refusal (L-0120, L-0132) in the ONE central send path, measured in this process with STRUCTURAL facts only: no time bound decides
// pass or fail (F22 of the second independent review, L-0170; the first fix bounded the close at 1.5 s and a concurrent GET at 3 s, and that
// failed under load; its bytes are retained in evidence\red\prefix-legacy-8e7046e9). Every row of the shared refusal table (200, 403, 404, 405,
// 413 and 415 answers to a request whose body is never read) and an injected internal failure (500) is attacked by five clients that stream an
// endless chunked body. A client stops only when the server closed its connection or when it has pushed MAX_PUSHED bytes into it (a count,
// never a time), so the only clock left is the node:test timeout. The same attack runs in the same test against a NAIVE CONTROL (a plain
// keep-alive Node server in this process): it keeps every connection open until the clients give up, which proves that this test can tell a
// refusing server from a naive one. This test shares one event loop with its attackers, so it proves CLOSURE only; that a SEPARATE process is
// not starved is proven by counts in chunked-process.test.cjs (attacker in another process, server in a small-heap child) and by
// flood-structural.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { createLocalServer, listen, closeOwned } = require('../server.cjs');
const { rows } = require('./refusals.cjs');

const CHUNK = `3e8\r\n${'a'.repeat(1000)}\r\n`.repeat(32);
// Big chunks, not the 1-byte chunks of the cross-process attack (chunked-process.test.cjs): closure does not depend on the chunk size and the
// in-process naive control must not spend its time parsing 87,000 chunks per connection.
// The real server cuts a refused connection after reading about 32 KB more (a few KB of that is already in flight when it decides); a server
// that dumps an endless body absorbs this and more: the limit sits far above the first and far below what a naive server swallows in a second.
const MAX_PUSHED = 1024 * 1024;
const hostOf = (origin) => `Host: ${new URL(origin).host}\r\n`;

function flood(origin, head, count = 5) {
  return Array.from({ length: count }, () => {
    const client = h.raw(origin, head);
    const state = { pushed: 0, gaveUp: false };
    (function pump() {
      if (client.socket.destroyed) return;
      if (state.pushed >= MAX_PUSHED) {
        state.gaveUp = true;
        client.socket.destroy();
        return;
      }
      state.pushed += CHUNK.length;
      client.socket.write(CHUNK, () => setImmediate(pump));
    }());
    return { closed: client.closed, state };
  });
}

async function naiveControl(t) {
  const server = http.createServer((request, response) => {
    response.writeHead(404, { 'Content-Type': 'text/plain', 'Content-Length': 2 });
    response.end('no');
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => { server.closeAllConnections(); server.close(resolve); }));
  return `http://127.0.0.1:${server.address().port}`;
}

const pushed = (attackers) => attackers.map((attacker) => attacker.state.pushed);
const gaveUp = (attackers) => attackers.map((attacker) => attacker.state.gaveUp);

for (const row of rows) {
  test(`an abusive connection is closed by the server once the answer is flushed, although the endless chunked body keeps coming, and a naive control is not: ${row.name}`, { timeout: 120000 }, async (t) => {
    const env = await h.serve(t);
    const control = await naiveControl(t);
    const attackers = flood(env.origin, row.head(hostOf(env.origin)));
    const naive = flood(control, row.head(hostOf(control)));
    await Promise.all([...attackers, ...naive].map((attacker) => attacker.closed));
    assert.deepEqual(gaveUp(attackers), attackers.map(() => false), `the server kept reading an endless body: bytes pushed into its connections ${JSON.stringify(pushed(attackers))}`);
    assert.deepEqual(gaveUp(naive), naive.map(() => true), 'the naive control must keep every abusive connection open, or this test cannot tell a naive server from the real one');
    const served = await h.get(env.origin, '/api/state');
    assert.equal(served.status, 200, 'a legitimate request must still be served after the attack');
    assert.equal(env.ctx.engine.view().journal.filter((e) => e.type !== 'boot').length, 0);
  });
}

test('an internal failure (500) closes an abusive connection like every other answer', { timeout: 120000 }, async (t) => {
  const ctx = s.boot();
  const engine = { ...ctx.engine, view() { throw new Error('synthetic internal failure'); } };
  const server = await listen(createLocalServer({ engine }));
  t.after(async () => { await closeOwned(server); await ctx.cleanup(); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const failed = await h.get(origin, '/api/state');
  assert.equal(failed.status, 500);
  assert.equal(failed.json.effectClaimed, false);
  assert.equal(failed.json.error.code, 'INTERNAL', 'the internal failure is a typed failure of the closed table');
  assert.deepEqual(failed.json.allowedActions, ['reinspect']);
  assert.equal(failed.json.journalWritten, false);
  const control = await naiveControl(t);
  const head = (target) => `GET /api/state HTTP/1.1\r\n${hostOf(target)}Transfer-Encoding: chunked\r\n\r\n`;
  const attackers = flood(origin, head(origin));
  const naive = flood(control, head(control));
  await Promise.all([...attackers, ...naive].map((attacker) => attacker.closed));
  assert.deepEqual(gaveUp(attackers), attackers.map(() => false), `a connection with an endless body was left open after a 500: bytes pushed ${JSON.stringify(pushed(attackers))}`);
  assert.deepEqual(gaveUp(naive), naive.map(() => true), 'the naive control must keep every abusive connection open');
});

test('every answer of the shared refusal table announces Connection: close', { timeout: 120000 }, async (t) => {
  const env = await h.serve(t);
  const answers = await Promise.all(rows.map((row) => h.raw(env.origin, row.head(hostOf(env.origin)) + row.small)));
  await Promise.all(answers.map((client) => client.closed));
  answers.forEach((client, index) => assert.match(client.text(), /\r\nConnection: close\r\n/i, rows[index].name));
});

test('a legitimate refused request with a small body still receives its typed answer with Connection: close', { timeout: 120000 }, async (t) => {
  const env = await h.serve(t);
  for (const [headers, status] of [[{ 'Content-Type': 'text/plain' }, 415], [{ 'Content-Type': 'application/json', Origin: 'http://evil.example' }, 403]]) {
    const answer = await h.request(env.origin, { method: 'POST', path: '/api/cancel', headers, body: 'x'.repeat(200) });
    assert.equal(answer.status, status);
    assert.equal(answer.headers.connection, 'close');
    assert.equal(answer.json.effectClaimed, false);
  }
});
