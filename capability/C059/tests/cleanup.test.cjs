'use strict';

// Cleanup under an injected failure (review N5, self-review line 9): the lane and flood tests own a child process, an in-process service and attacker sockets and release
// them in finally. A test injects a failing assertion into exactly that pattern and proves that the cleanup ran: the child exited, the ports refuse connections, a
// neighbour service of the same file is untouched, and a repeated stop is harmless. (The real Edge session has its own proof: tests\browser-cleanup.cjs.)
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { call, startChild, startService, until } = require('./net.cjs');

const OPTIONS = { timeout: 60000 };
const refused = (port) => new Promise((resolve) => {
  const socket = net.connect({ host: '127.0.0.1', port });
  socket.once('connect', () => { socket.destroy(); resolve(false); });
  socket.once('error', (error) => resolve(error.code === 'ECONNREFUSED'));
});

test('an injected failure in a test that owns a child process still disposes it: the child exits and its port refuses connections', OPTIONS, async () => {
  const child = await startChild({ watchdogMs: 120000 });
  assert.equal((await call(child.port, 'GET', '/scope.json')).status, 200, 'the child serves before the failure');
  await assert.rejects(async () => {
    try { assert.fail('injected failure'); } finally { child.dispose(); }
  }, /injected failure/);
  const exit = await Promise.race([child.exited, new Promise((resolve) => { setTimeout(() => resolve(null), 30000).unref(); })]);
  assert.notEqual(exit, null, 'the child exited after the cleanup');
  await until(() => refused(child.port), 'the port of the disposed child refuses connections');
  child.dispose();
});

test('an injected failure in a test that owns an in-process service still stops it; a neighbour service of the same file is untouched and a repeated stop is harmless', OPTIONS, async () => {
  const doomed = await startService();
  const neighbour = await startService();
  try {
    await assert.rejects(async () => {
      try { assert.fail('injected failure'); } finally { await doomed.stop(); }
    }, /injected failure/);
    await until(() => refused(doomed.port), 'the port of the stopped service refuses connections');
    await doomed.stop();
    assert.equal((await call(neighbour.port, 'GET', '/scope.json')).status, 200, 'the neighbour still answers');
  } finally {
    await neighbour.stop();
  }
  await until(() => refused(neighbour.port), 'the neighbour is stopped by its own finally');
});

test('attacker sockets opened by a failing check are destroyed in finally: the server sees no connection afterwards', OPTIONS, async () => {
  const child = await startChild({ watchdogMs: 120000 });
  try {
    const sockets = [];
    await assert.rejects(async () => {
      try {
        for (let index = 0; index < 8; index += 1) {
          const socket = net.connect({ host: '127.0.0.1', port: child.port });
          socket.on('error', () => {});
          sockets.push(socket);
        }
        await until(async () => (await child.stats()).connections === 8, 'the child holds the eight sockets');
        assert.fail('injected failure');
      } finally {
        for (const socket of sockets) socket.destroy();
      }
    }, /injected failure/);
    assert.ok(sockets.every((socket) => socket.destroyed), 'every attacker socket was destroyed by the finally');
    await until(async () => (await child.stats()).connections === 0, 'the server holds no connection after the cleanup');
  } finally {
    child.dispose();
  }
});
