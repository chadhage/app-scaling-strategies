'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, startApp, withApp } = require('./helpers.cjs');
const { exchange, bare } = require('./raw-http.cjs');

// Review finding F10: the server stops reading a refused connection with socket._handle.readStop(), a Node INTERNAL. A Node that no
// longer has it must not degrade silently to "Connection: close only" (the stall of review F1 comes back): the server fails closed,
// on the first connection and, when its own listener lacks it, at startup.
const { createApp } = load('server.cjs');
const getState = (port) => bare(port, 'GET', '/v1/state');

test('a connection whose socket cannot stop reading is destroyed unserved, and the app reports why', async () => {
  const app = createApp();
  const stub = { destroyed: false, _handle: {}, destroy() { this.destroyed = true; }, once() {}, on() {} };
  app.server.emit('connection', stub);
  assert.equal(stub.destroyed, true, 'the socket without readStop is destroyed on the first connection');
  assert.deepEqual(app.health(), { ok: false, reason: 'READ_STOP_UNAVAILABLE' });
  const later = { destroyed: false, _handle: { readStop() {} }, destroy() { this.destroyed = true; }, once() {}, on() {} };
  app.server.emit('connection', later);
  assert.equal(later.destroyed, true, 'once the app failed closed it serves no later connection either');
  await app.close();
});

test('a healthy app reports ok, and its sockets are not touched by the self-check', () => withApp({}, async (context) => {
  assert.equal(typeof context.app.health, 'function', 'the app reports whether it can still stop reading');
  assert.deepEqual(context.app.health(), { ok: true, reason: null });
  const result = await exchange(context.port, getState(context.port), { settleMs: 2500 });
  assert.deepEqual(result.answers.map((answer) => answer.status), [200]);
  assert.deepEqual(context.app.health(), { ok: true, reason: null });
}));

test('a real connection whose handle has lost readStop is closed without an answer, not served with a silent no-op stop', async () => {
  const context = await startApp({});
  context.app.server.prependListener('connection', (socket) => { socket._handle.readStop = undefined; });
  try {
    const result = await exchange(context.port, getState(context.port), { settleMs: 2500, waitMs: 15000 });
    assert.deepEqual(result.answers, [], 'nothing is served over a connection that could not be stopped');
    assert.equal(result.closedByServer, true);
    assert.equal(context.app.health().ok, false);
  } finally {
    await context.close();
  }
});

test('a listener that cannot stop reading fails closed at startup with a typed error', async () => {
  const app = createApp();
  const errors = [];
  app.server.on('error', (error) => errors.push(error));
  app.server.emit('listening');
  assert.equal(errors.length, 1, 'startup reports the missing readStop');
  assert.match(errors[0].message, /READ_STOP_UNAVAILABLE/);
  assert.equal(app.health().ok, false);
  await app.close();
});

test('a real listener passes the startup self-check', () => withApp({}, async (context) => {
  assert.equal(typeof context.app.health, 'function', 'the app reports whether it can still stop reading');
  assert.equal(context.app.health().ok, true);
}));
