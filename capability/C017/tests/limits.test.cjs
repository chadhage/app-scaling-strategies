'use strict';

// The two real gaps the mutation generator left open in the second fix (G102 server.maxHeadersCount and G103 server.maxConnections, F27 of the
// third independent review): a guard whose removal passes every test is unproven (L-0147), so each limit has a named test that fails when the line
// is removed. Every figure is a count or an event of the server itself; nothing is timed.
const test = require('node:test');
const assert = require('node:assert/strict');
const h = require('./http.cjs');

const statusOf = (text) => Number((/^HTTP\/1\.[01] (\d{3})/.exec(text) || [0, 0])[1]);

test('maxHeadersCount: a request with 32 header lines is served and one with 33 is refused with the typed 431 (Node itself refuses more than the cap)', async (t) => {
  const env = await h.serve(t);
  const port = new URL(env.origin).port;
  const head = (count) => [`Host: 127.0.0.1:${port}`, ...Array.from({ length: count - 1 }, (_, index) => `X-Fill-${index}: v`)].join('\r\n');
  const seen = [];
  env.server.on('request', (request) => seen.push(request.rawHeaders.length / 2));

  const atCap = h.raw(env.origin, `GET /api/state HTTP/1.1\r\n${head(32)}\r\n\r\n`);
  await atCap.closed;
  assert.equal(statusOf(atCap.text()), 200, 'exactly 32 header lines are within the cap');
  assert.deepEqual(seen, [32]);

  const over = h.raw(env.origin, `GET /api/state HTTP/1.1\r\n${head(33)}\r\n\r\n`);
  await over.closed;
  assert.equal(statusOf(over.text()), 431, '33 header lines are over the cap');
  assert.equal(JSON.parse(over.text().slice(over.text().indexOf('\r\n\r\n') + 4)).error.code, 'HEADERS_TOO_LARGE', 'the refusal is the typed one, not Node\'s prose');
  assert.deepEqual(seen, [32], 'the handler never saw the request with 33 lines');
});

test('maxHeadersCount is set on the server, not left at Node\'s default of 2000', async (t) => {
  const env = await h.serve(t);
  assert.equal(env.server.maxHeadersCount, 32);
});

test('maxConnections: a connection above the cap is dropped by the server itself (its own drop event), not accepted and left open', async (t) => {
  const env = await h.serve(t, { server: { maxConnections: 2 } });
  assert.equal(env.server.maxConnections, 2);
  let accepted = 0;
  const waiting = [];
  env.server.on('connection', () => {
    accepted += 1;
    for (const entry of waiting.filter((item) => item.count <= accepted)) entry.resolve();
  });
  const acceptedCount = (count) => (accepted >= count ? Promise.resolve() : new Promise((resolve) => waiting.push({ count, resolve })));
  const clients = [];
  try {
    const dropped = new Promise((resolve) => env.server.once('drop', resolve));
    clients.push(h.raw(env.origin), h.raw(env.origin));
    await acceptedCount(2);
    const third = h.raw(env.origin);
    clients.push(third);
    const which = await Promise.race([dropped.then(() => 'dropped'), acceptedCount(3).then(() => 'accepted')]);
    assert.equal(which, 'dropped', 'the third connection was accepted although the cap is 2');
    await third.closed;
    assert.equal(accepted, 2, 'only two connections were ever accepted');
  } finally {
    clients.forEach((client) => client.socket.destroy());
  }
});
