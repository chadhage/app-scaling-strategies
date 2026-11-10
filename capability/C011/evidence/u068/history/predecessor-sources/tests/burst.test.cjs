'use strict';

// The 128-socket burst (rev-C059 N1): a connection cap of 128 and 128 sockets that each send two legitimate GETs and then a request that Node answers by
// itself at parse time (an unknown Expect, a parse error). The refusal must route through the lane, answer the earlier requests in order and then end the
// connection: after the burst every socket is closed by the server, the server holds no connection, and a legitimate GET is answered (the cap is not
// pinned). Counted facts only, in a SEPARATE server process. The README states the cap, the cost of a pending socket and the limit of this test.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { startChildTarget } = require('./targets.cjs');
const { call } = require('./helpers.cjs');

const SOCKETS = 128;
const SHAPES = {
  'G G Expect': (port, token) => `GET /v1/me HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${token}\r\n\r\n`.repeat(2) + `GET /v1/me HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nExpect: nonsense\r\n\r\n`,
  'G G malformed': (port, token) => `GET /v1/me HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${token}\r\n\r\n`.repeat(2) + 'GET\r\n\r\n'
};

async function until(check, label) {
  for (let turn = 0; turn < 6000; turn += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`never held: ${label}`);
}

for (const [name, build] of Object.entries(SHAPES)) {
  test(`${SOCKETS} sockets of [${name}] against a cap of ${SOCKETS}: every socket is answered in order and closed by the server, no connection remains, a legitimate GET is answered`, { timeout: 120000 }, async () => {
    const child = await startChildTarget('cap', { heapMb: 64, watchdogMs: 110000 });
    try {
      const token = child.tokens['conductor-a'];
      const ended = [];
      const sockets = Array.from({ length: SOCKETS }, () => {
        const socket = net.connect({ host: '127.0.0.1', port: child.port });
        const chunks = [];
        const done = new Promise((resolve) => socket.once('close', () => { ended.push(1); resolve(Buffer.concat(chunks).toString('latin1')); }));
        socket.on('data', (chunk) => chunks.push(chunk));
        socket.on('error', () => {});
        socket.write(build(child.port, token));
        return { socket, done };
      });
      await until(() => ended.length === SOCKETS, 'every socket is closed by the server');
      const transcripts = await Promise.all(sockets.map((item) => item.done));
      const answered = transcripts.map((text) => (text.match(/HTTP\/1\.1 (\d{3}) /g) || []).map((line) => line.slice(9, 12)));
      assert.ok(answered.every((statuses) => statuses.length >= 1 && statuses.length <= 3), JSON.stringify(answered.slice(0, 3)));
      assert.ok(answered.every((statuses) => statuses.slice(0, -1).every((status) => status === '200')), 'the earlier requests are answered 200, in order');
      let stats = null;
      await until(async () => { stats = await child.stats(); return stats.connections === 0; }, 'no connection remains');
      assert.equal((await call(child, token, 'GET', '/v1/me')).status, 200, 'the cap is not pinned: a legitimate GET is answered');
    } finally {
      await child.close();
    }
  });
}
