'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startApp, withApp, request } = require('./helpers.cjs');
const { clients, within } = require('./resource-harness.cjs');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const closing = (socket) => new Promise((resolve) => socket.once('close', resolve));
const getState = (port) => `GET /v1/state HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;

test('a connection that stays silent is dropped after the idle bound while normal requests are still served', () => withApp({ app: { limits: { idleMs: 300 } } }, async (context) => {
  const net = clients(context.port);
  try {
    const silent = net.open(undefined, { read: true });
    await within(closing(silent), 'the silent connection is dropped', 2500);
    assert.equal((await request(context, { route: '/v1/state' })).status, 200);
  } finally {
    net.destroyAll();
  }
}));

test('connections beyond the cap are dropped by the server and the first ones keep working', () => withApp({ app: { limits: { connections: 3 } } }, async (context) => {
  const net = clients(context.port);
  try {
    const kept = [net.open(undefined, { read: true }), net.open(undefined, { read: true }), net.open(undefined, { read: true })];
    await sleep(200);
    await within(closing(net.open(undefined, { read: true })), 'the connection over the cap is dropped', 2500);
    assert.equal(kept.some((socket) => socket.destroyed), false, 'the connections inside the cap stay open');
    kept[0].write(getState(context.port));
    const answer = await within(new Promise((resolve) => kept[0].once('data', resolve)), 'a kept connection is answered', 2500);
    assert.match(String(answer), /^HTTP\/1\.1 200 /);
  } finally {
    net.destroyAll();
  }
}));

test('a client that pipelines past the bound is cut off, other clients are served, and sequential keep-alive reuse is untouched', () => withApp({ app: { limits: { pipelined: 2 } } }, async (context) => {
  const net = clients(context.port);
  try {
    const flooder = net.open(undefined, { read: true });
    let text = '';
    flooder.on('data', (chunk) => { text += chunk; });
    const ended = closing(flooder);
    flooder.write(getState(context.port).repeat(50));
    await within(ended, 'the pipelining client is cut off', 3000);
    assert.ok((text.match(/HTTP\/1\.1 200 OK/g) || []).length <= 2, 'no more answers than the pipelining bound are ever queued');
    assert.equal((await request(context, { route: '/v1/state' })).status, 200);
    for (let index = 0; index < 20; index += 1) {
      assert.equal((await (await fetch(`${context.origin}/v1/state`)).json()).outcome, 'ok', `sequential request ${index}`);
    }
  } finally {
    net.destroyAll();
  }
}));

test('closing the app ends every accepted socket, even silent, partial, upgrade-asking, half-closed and never-read ones', async () => {
  const context = await startApp({});
  const net = clients(context.port);
  try {
    assert.equal(typeof context.app.close, 'function', 'the app offers one shutdown that owns every accepted socket');
    const host = `Host: 127.0.0.1:${context.port}`;
    const upgrade = `GET /v1/state HTTP/1.1\r\n${host}\r\nConnection: Upgrade\r\nUpgrade: websocket\r\nSec-WebSocket-Version: 13\r\nSec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n\r\n`;
    const sockets = [
      net.open(undefined, { read: true }), net.open('GET /v1/sta', { read: true }), net.open(`GET /v1/state HTTP/1.1\r\n${host}\r\nX-Partial: a`, { read: true }),
      net.open(upgrade, { read: true }), net.open(getState(context.port), { read: true }), net.open(getState(context.port).repeat(3)),
      net.open(`CONNECT 127.0.0.1:1 HTTP/1.1\r\n${host}\r\n\r\n`, { read: true })
    ];
    sockets[4].end();
    await sleep(300);
    await within(context.app.close(), 'close() resolves', 3000);
    for (const socket of sockets) {
      socket.once('end', () => socket.destroy());
      socket.resume();
    }
    await within(Promise.all(sockets.map((socket) => (socket.destroyed ? null : closing(socket)))), 'every client socket is closed by the server', 3000);
    await assert.rejects(request(context, { route: '/v1/state' }), 'nothing is listening any more');
  } finally {
    net.destroyAll();
    await context.close();
  }
});
