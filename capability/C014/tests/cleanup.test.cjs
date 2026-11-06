'use strict';

// Cleanup under an injected failure (self-review line 9): the flood, matrix and sweep tests own a child process, an in-process service and attacker sockets and release
// them in finally. A test injects a failing assertion into exactly that pattern and proves that the cleanup ran: the child exited and its port refuses connections, a
// neighbour service of the same file is untouched, a repeated close is harmless, and attacker sockets are destroyed and the server holds none of them. Every wait polls a
// fact (a refused connection, a connection count), never a fixed sleep. (The real Edge session has its own proof: tests\browser-cleanup.cjs.)
const test = require('node:test');
const assert = require('node:assert/strict');
const net = require('node:net');
const { startChild } = require('./child.cjs');
const { startLocal } = require('../server.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call } = require('./harness.cjs');

const OPTIONS = { timeout: 90000 };
const refused = (port) => new Promise((resolve) => {
  const socket = net.connect({ port, host: '127.0.0.1' });
  socket.once('connect', () => { socket.destroy(); resolve(false); });
  socket.once('error', (error) => resolve(error.code === 'ECONNREFUSED'));
});
const connections = (server) => new Promise((resolve) => server.getConnections((error, count) => resolve(count)));

// Polls a fact until it holds; the bound only keeps a broken cleanup from hanging the test.
async function until(fact, label, tries = 600) {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await fact()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  assert.fail(`never held: ${label}`);
}

test('an injected failure in a test that owns a child process still closes it: the child exits, its port refuses connections, a repeated close is harmless', OPTIONS, async () => {
  const child = await startChild({ mode: 'real' });
  assert.equal((await call(child.port, 'GET', '/scope.json')).status, 200, 'the child serves before the failure');
  await assert.rejects(async () => {
    try { assert.fail('injected failure'); } finally { await child.close(); }
  }, /injected failure/);
  await until(() => refused(child.port), 'the port of the closed child refuses connections');
  assert.throws(() => process.kill(child.pid, 0), 'the child process is gone');
  await child.close();
});

test('an injected failure in a test that owns an in-process service still closes it; a neighbour service of the same file is untouched and a repeated close is harmless', OPTIONS, async () => {
  const doomed = await startLocal({ config: seedConfig() });
  const neighbour = await startLocal({ config: seedConfig() });
  try {
    await assert.rejects(async () => {
      try { assert.fail('injected failure'); } finally { await doomed.close(); }
    }, /injected failure/);
    await until(() => refused(doomed.port), 'the port of the closed service refuses connections');
    await doomed.close();
    assert.equal((await call(neighbour.port, 'GET', '/scope.json')).status, 200, 'the neighbour still answers');
  } finally {
    await neighbour.close();
  }
  await until(() => refused(neighbour.port), 'the neighbour is closed by its own finally');
});

test('attacker sockets opened by a failing check are destroyed in finally: the server holds no connection afterwards', OPTIONS, async () => {
  const local = await startLocal({ config: seedConfig() });
  try {
    const sockets = [];
    await assert.rejects(async () => {
      try {
        for (let index = 0; index < 8; index += 1) {
          const socket = net.connect({ port: local.port, host: '127.0.0.1' });
          socket.on('error', () => {});
          sockets.push(socket);
        }
        await until(async () => (await connections(local.server)) === 8, 'the server holds the eight sockets');
        assert.fail('injected failure');
      } finally {
        for (const socket of sockets) socket.destroy();
      }
    }, /injected failure/);
    assert.ok(sockets.every((socket) => socket.destroyed), 'every attacker socket was destroyed by the finally');
    await until(async () => (await connections(local.server)) === 0, 'the server holds no connection after the cleanup');
  } finally {
    await local.close();
  }
});
