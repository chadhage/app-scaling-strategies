'use strict';

// L-0120 for this fixture: a refused request that carries a body must not stall the process. Every refusal answers with
// Connection: close and the socket is gone once the response is flushed, even when the client keeps streaming an endless
// chunked body of 1-byte chunks. Five such streams run while a concurrent GET must still be served quickly.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const h = require('./http.cjs');

const refusals = [
  ['wrong media type', (host) => `POST /api/cancel HTTP/1.1\r\n${host}Content-Type: text/plain\r\nTransfer-Encoding: chunked\r\n\r\n`, 415],
  ['no content type', (host) => `POST /api/cancel HTTP/1.1\r\n${host}Transfer-Encoding: chunked\r\n\r\n`, 415],
  ['foreign origin', (host) => `POST /api/cancel HTTP/1.1\r\n${host}Origin: http://evil.example\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`, 403],
  ['wrong method', (host) => `PUT /api/cancel HTTP/1.1\r\n${host}Content-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`, 405],
  ['unknown route', (host) => `POST /nowhere HTTP/1.1\r\n${host}Content-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`, 405],
  ['endless valid-looking JSON body', (host) => `POST /api/cancel HTTP/1.1\r\n${host}Content-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`, 413],
];

for (const [name, head] of refusals) {
  test(`a refused request with an endless chunked body is closed and does not stall the event loop: ${name}`, async (t) => {
    const env = await h.serve(t);
    const host = `Host: ${new URL(env.origin).host}\r\n`;
    const streams = Array.from({ length: 5 }, () => {
      const client = h.raw(env.origin, head(host));
      let writing = true;
      client.closed.then(() => { writing = false; });
      (function pump() {
        if (!writing || client.socket.destroyed) return;
        client.socket.write('1\r\na\r\n'.repeat(500), () => setImmediate(pump));
      }());
      return client;
    });
    const started = Date.now();
    const served = await s.withTimeout(h.get(env.origin, '/api/state'), 'a concurrent GET stalled behind the refused streams', 3000);
    assert.equal(served.status, 200);
    assert.ok(Date.now() - started < 2000, `the GET took ${Date.now() - started} ms`);
    await s.withTimeout(Promise.all(streams.map((client) => client.closed)), 'a refused connection was left open', 5000);
    assert.equal(env.ctx.engine.view().journal.filter((e) => e.type !== 'boot').length, 0);
  });
}

test('a legitimate refused request with a small body still receives its typed answer with Connection: close', async (t) => {
  const env = await h.serve(t);
  for (const [headers, status] of [[{ 'Content-Type': 'text/plain' }, 415], [{ 'Content-Type': 'application/json', Origin: 'http://evil.example' }, 403]]) {
    const answer = await h.request(env.origin, { method: 'POST', path: '/api/cancel', headers, body: 'x'.repeat(200) });
    assert.equal(answer.status, status);
    assert.equal(answer.headers.connection, 'close');
    assert.equal(answer.json.effectClaimed, false);
  }
});
