'use strict';

// The SHIPPED limits, not tuned ones (review minor m1 of the first publication): with idleMs equal to headerMs the socket idle timeout destroyed a
// stalled request at about 5.1 s with ZERO bytes, before the request timeout could answer; the only 408 test tuned headerMs to 300. Under the
// shipped limits a request that stalls (a body cut short, a chunked body cut, half-sent headers), alone or behind one or two complete requests, is
// answered by the earlier answers and then the typed 408 REQUEST_TIMEOUT, and the server ends its connection. This costs one real request timeout
// (5 to 6 s): all the shapes run at the same time against one app. The 40 s deadline only ends a wait that cannot succeed.
const assert = require('node:assert/strict');
const net = require('node:net');
const { after, before, test } = require('node:test');
const contract = require('../contract.js');
const { parseAnswers, request } = require('./raw.cjs');
const { startApp } = require('./helpers.cjs');

const DEADLINE_MS = 40000;

// Sends the bytes and keeps the socket open until the SERVER ends it (no settle window: the 408 comes after the request timeout).
function stalled(port, bytes) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
    const chunks = [];
    let closedByServer = false;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      socket.destroy();
      resolve({ answers: parseAnswers(Buffer.concat(chunks)), closedByServer, bytes: Buffer.concat(chunks).length });
    };
    const timer = setTimeout(finish, DEADLINE_MS);
    const ended = () => { closedByServer = true; finish(); };
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', ended);
    socket.on('end', ended);
    socket.on('close', ended);
    socket.write(bytes);
  });
}

let ctx;
let results;
const SHAPES = ['a body cut short (Content-Length 100, 11 bytes sent)', 'a chunked body cut inside a chunk', 'half-sent headers'];

before(async () => {
  ctx = await startApp();
  const { token } = await ctx.session('alf');
  const auth = `Authorization: Bearer ${token}`;
  const lines = (extra) => Buffer.from(`${['POST /v1/projects HTTP/1.1', `Host: 127.0.0.1:${ctx.port}`, auth, 'Content-Type: application/json', ...extra].join('\r\n')}\r\n\r\n`);
  const shapes = [
    Buffer.concat([lines(['Content-Length: 100']), Buffer.from('{"name":"a"')]),
    Buffer.concat([lines(['Transfer-Encoding: chunked']), Buffer.from('b\r\n{"name":"a"')]),
    Buffer.from(`POST /v1/projects HTTP/1.1\r\nHost: 127.0.0.1:${ctx.port}\r\n${auth}\r\nContent-Type: application/json\r\n`)
  ];
  const complete = request(ctx.port, 'GET', '/v1/session', { headers: [auth] });
  results = await Promise.all(shapes.flatMap((shape) => [0, 1, 2].map(async (before) => ({ before, ...(await stalled(ctx.port, Buffer.concat([...Array(before).fill(complete), shape]))) }))));
});
after(async () => { await ctx.close(); });

test('the shipped limits keep the idle timeout above the request timeout plus its check interval', () => {
  const { idleMs, headerMs, checkMs } = contract.limits;
  assert.ok(idleMs > headerMs + checkMs);
});

for (const [index, name] of SHAPES.entries()) {
  for (const before of [0, 1, 2]) {
    // Half-sent headers behind a complete request are not a stalled REQUEST for Node: the connection is an idle keep-alive connection until the head
    // is complete, so Node's own keep-alive timeout ends it (plain node:http does the same). The earlier answers arrive, nothing applies, the server
    // ends the connection itself, and no typed answer follows: stated in the README limits.
    const silent = index === 2 && before > 0;
    test(`under the shipped limits ${name} behind ${before} complete request(s): ${silent ? 'the earlier answers, then the server ends the connection (a keep-alive cut, no typed answer)' : 'the earlier answers, then the typed 408, then the server ends the connection'}`, () => {
      const result = results[index * 3 + before];
      assert.equal(result.before, before);
      assert.equal(result.closedByServer, true);
      if (silent) {
        assert.deepEqual(result.answers.map((answer) => answer.status), Array(before).fill(200), 'only what was complete before the head arrived');
        return;
      }
      assert.deepEqual(result.answers.map((answer) => answer.status), [...Array(before).fill(200), 408], 'what arrived, in order');
      const last = result.answers.at(-1);
      assert.equal(last.json.outcome, 'REQUEST_TIMEOUT');
      assert.equal(last.json.error.code, 'REQUEST_TIMEOUT');
      assert.match(last.headers.connection ?? '', /close/i);
    });
  }
}
