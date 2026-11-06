'use strict';

// Close-after-refusal (L-0120, L-0132) in the ONE central send path, measured in this process: every row of the shared refusal table
// (200, 403, 404, 405, 413 and 415 answers to a request whose body is never read), an injected internal failure (500) and a normal
// answer must close an abusive connection within 1.5 s although the client keeps streaming an endless chunked body. This test shares one
// event loop with its attackers, so it proves CLOSURE only: that the event loop of a SEPARATE process is not starved by such a client is
// proven by chunked-process.test.cjs (attacker in another process, server in a small-heap child).
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { createLocalServer, listen, closeOwned } = require('../server.cjs');
const { rows } = require('./refusals.cjs');

const CLOSE_BOUND_MS = 1500;

function streamEndlessBody(origin, head, count = 5) {
  return Array.from({ length: count }, () => {
    const client = h.raw(origin, head);
    let writing = true;
    client.closed.then(() => { writing = false; });
    (function pump() {
      if (!writing || client.socket.destroyed) return;
      client.socket.write('1\r\na\r\n'.repeat(500), () => setImmediate(pump));
    }());
    return client;
  });
}

for (const row of rows) {
  test(`an abusive connection is closed once the answer is flushed, although the endless chunked body keeps coming: ${row.name}`, { timeout: 30000 }, async (t) => {
    const env = await h.serve(t);
    const streams = streamEndlessBody(env.origin, row.head(`Host: ${new URL(env.origin).host}\r\n`));
    const served = await s.withTimeout(h.get(env.origin, '/api/state'), 'a concurrent GET stalled behind the endless streams', 3000);
    assert.equal(served.status, 200);
    await s.withTimeout(Promise.all(streams.map((client) => client.closed)), 'a connection with an endless body was left open', CLOSE_BOUND_MS);
    assert.equal(env.ctx.engine.view().journal.filter((e) => e.type !== 'boot').length, 0);
  });
}

test('an internal failure (500) closes an abusive connection like every other answer', { timeout: 30000 }, async (t) => {
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
  const streams = streamEndlessBody(origin, `GET /api/state HTTP/1.1\r\nHost: ${new URL(origin).host}\r\nTransfer-Encoding: chunked\r\n\r\n`);
  await s.withTimeout(Promise.all(streams.map((client) => client.closed)), 'a connection with an endless body was left open after a 500', CLOSE_BOUND_MS);
});

test('every answer of the shared refusal table announces Connection: close', async (t) => {
  const env = await h.serve(t);
  const answers = await Promise.all(rows.map((row) => h.raw(env.origin, row.head(`Host: ${new URL(env.origin).host}\r\n`) + row.small)));
  await Promise.all(answers.map((client) => client.closed));
  answers.forEach((client, index) => assert.match(client.text(), /\r\nConnection: close\r\n/i, rows[index].name));
});

test('a legitimate refused request with a small body still receives its typed answer with Connection: close', async (t) => {
  const env = await h.serve(t);
  for (const [headers, status] of [[{ 'Content-Type': 'text/plain' }, 415], [{ 'Content-Type': 'application/json', Origin: 'http://evil.example' }, 403]]) {
    const answer = await h.request(env.origin, { method: 'POST', path: '/api/cancel', headers, body: 'x'.repeat(200) });
    assert.equal(answer.status, status);
    assert.equal(answer.headers.connection, 'close');
    assert.equal(answer.json.effectClaimed, false);
  }
});
