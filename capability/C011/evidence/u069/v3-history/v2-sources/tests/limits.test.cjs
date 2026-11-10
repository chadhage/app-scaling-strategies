'use strict';

// The SHIPPED limits, not tuned ones (lesson L-0227, found in the C010 review): the idle timeout default is above the header timeout plus the check
// interval, read back from the Node server itself, so that a stalled header or a stalled body is answered with the typed 408 and its audit record
// instead of being closed silently by the socket idle timeout. One real default-limits wait (5 to 6 s) serves every shape at once; the deadline only
// ends a wait that cannot succeed and never decides a pass.
const assert = require('node:assert/strict');
const net = require('node:net');
const { after, before, test } = require('node:test');
const contract = require('../contract.js');
const { createApp } = require('../server.cjs');
const { parseAnswers } = require('./raw-http.cjs');
const { call, startApp } = require('./helpers.cjs');

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
      resolve({ answers: parseAnswers(Buffer.concat(chunks)), closedByServer });
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

test('the shipped limits read back from the Node server: the idle timeout is above the header timeout plus the check interval', () => {
  const { server, config } = createApp({});
  assert.deepEqual(
    { headers: server.headersTimeout, request: server.requestTimeout, idle: server.timeout, check: server.connectionsCheckingInterval, keepAlive: server.keepAliveTimeout, cap: server.maxConnections },
    { headers: 5000, request: 5000, idle: 8000, check: 1000, keepAlive: 1000, cap: 256 }
  );
  assert.ok(server.timeout > server.headersTimeout + server.connectionsCheckingInterval);
  assert.ok(server.timeout > server.requestTimeout + server.connectionsCheckingInterval);
  assert.deepEqual([config.limits.idleMs, config.limits.headerMs, config.limits.checkMs], [8000, 5000, 1000]);
  assert.equal(contract.resolveConfig().limits.idleMs, 8000);
});

let ctx;
let results;
const SHAPES = ['a body cut short (Content-Length 100, 11 bytes sent)', 'a chunked body cut inside a chunk', 'half-sent headers'];

before(async () => {
  ctx = await startApp({ app: { config: undefined } });
  const auth = `Authorization: Bearer ${ctx.tokens['conductor-a']}`;
  const head = (extra) => Buffer.from(`${['POST /v1/reservations HTTP/1.1', `Host: 127.0.0.1:${ctx.port}`, auth, 'Content-Type: application/json', ...extra].join('\r\n')}\r\n\r\n`);
  const shapes = [
    Buffer.concat([head(['Content-Length: 100']), Buffer.from('{"key":"k"')]),
    Buffer.concat([head(['Transfer-Encoding: chunked']), Buffer.from('b\r\n{"key":"k"')]),
    Buffer.from(`POST /v1/reservations HTTP/1.1\r\nHost: 127.0.0.1:${ctx.port}\r\n${auth}\r\nContent-Type: application/json\r\n`)
  ];
  results = await Promise.all(shapes.map((shape) => stalled(ctx.port, shape)));
});
after(async () => { await ctx.close(); });

for (const [index, name] of SHAPES.entries()) {
  test(`under the shipped limits ${name}: the typed 408 REQUEST_TIMEOUT, Connection: close, and the server ends the connection`, () => {
    const result = results[index];
    assert.equal(result.closedByServer, true);
    assert.deepEqual(result.answers.map((answer) => answer.status), [408]);
    assert.equal(result.answers[0].json.error.code, 'REQUEST_TIMEOUT');
    assert.match(result.answers[0].headers.connection ?? '', /close/i);
  });
}

test('every stalled request left its audit record, and nothing was reserved by the cut requests', async () => {
  const timeouts = ctx.app.auditLog().filter((entry) => entry.outcome === 'refused' && entry.code === 'REQUEST_TIMEOUT');
  assert.equal(timeouts.length, SHAPES.length);
  assert.ok(timeouts.every((entry) => entry.subject === null && entry.route === null));
  const view = await call(ctx, ctx.tokens.operator, 'GET', '/v1/operator/audit');
  assert.equal(view.json.items.filter((item) => item.code === 'REQUEST_TIMEOUT').length, SHAPES.length);
  assert.equal((await call(ctx, ctx.tokens.operator, 'GET', '/v1/operator/pool')).json.pool.reservedUnits, 0);
});
