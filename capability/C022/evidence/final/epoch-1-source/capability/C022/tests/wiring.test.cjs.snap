'use strict';

// How server.cjs wires the Node server (found by the systematic mutants: each of these statements could be removed and the whole suite stayed
// green): the timeouts, the keep-alive and the connection cap come from the limits, the read-stop failure warns once however it is found, and
// close() destroys exactly the connections that only the app still tracks.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const contract = require('../contract.js');
const { load, startApp } = require('./helpers.cjs');

const turn = () => new Promise((resolve) => setImmediate(resolve));

test('the Node server is configured from the limits: the defaults, and every override reaches it', async (t) => {
  const defaults = await startApp();
  t.after(() => defaults.close());
  const server = defaults.app.server;
  assert.equal(server.requestTimeout, contract.limits.headerMs);
  assert.equal(server.headersTimeout, contract.limits.headerMs);
  assert.equal(server.keepAliveTimeout, 1000);
  assert.equal(server.timeout, contract.limits.idleMs);
  assert.equal(server.maxConnections, contract.limits.connections);
  assert.equal(server.connectionsCheckingInterval, contract.limits.checkMs);
  const tuned = await startApp({ app: { limits: { headerMs: 1234, idleMs: 777, connections: 9, checkMs: 55 } } });
  t.after(() => tuned.close());
  assert.equal(tuned.app.server.requestTimeout, 1234);
  assert.equal(tuned.app.server.headersTimeout, 1234);
  assert.equal(tuned.app.server.timeout, 777);
  assert.equal(tuned.app.server.maxConnections, 9);
  assert.equal(tuned.app.server.connectionsCheckingInterval, 55);
});

test('a read stop that is missing is warned about once, however many checks find it', async (t) => {
  const { createApp } = load('server.cjs');
  const app = createApp();
  const warnings = [];
  const onWarning = (warning) => { if (warning.code === 'C022_READ_STOP_UNAVAILABLE') warnings.push(warning); };
  process.on('warning', onWarning);
  t.after(() => process.off('warning', onWarning));
  app.server.on('error', () => {});
  const onConnection = app.server.listeners('connection').at(-1);
  onConnection({ _handle: {}, destroy() {}, once() {} });
  assert.equal(app.health().ok, false);
  app.server.emit('listening');
  await turn();
  await turn();
  assert.equal(warnings.length, 1, 'the startup check found it again and did not warn again');
  await app.close();
});

test('close() destroys a connection that only the app tracks and leaves alone one that has already closed', async () => {
  const { createApp } = load('server.cjs');
  const app = createApp();
  const onConnection = app.server.listeners('connection').at(-1);
  const destroyed = { tracked: 0, closed: 0 };
  let closeListener = null;
  onConnection({ _handle: { readStop() {} }, destroy() { destroyed.tracked += 1; }, once() {} });
  onConnection({ _handle: { readStop() {} }, destroy() { destroyed.closed += 1; }, once(event, listener) { if (event === 'close') closeListener = listener; } });
  assert.equal(typeof closeListener, 'function', 'the app listens for the close of every connection it tracks');
  closeListener();
  await app.close();
  assert.equal(destroyed.tracked, 1, 'a tracked connection is destroyed by close()');
  assert.equal(destroyed.closed, 0, 'a connection that closed on its own is no longer tracked');
});
