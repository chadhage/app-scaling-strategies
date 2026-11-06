'use strict';

// close() is how a caller learns that the server is gone, and a close() that never resolves does not fail a named test, it hangs every hook that
// awaits it (found by the systematic mutants: removing `server.close(...)` left every test file hanging in its after hook, a result no test could
// name). So the promise is awaited for a bounded NUMBER OF EVENT-LOOP TURNS (no clock): it resolves, the listener is gone, an idle connection that
// was open is ended, and a second close() resolves too.
const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const { startApp } = require('./helpers.cjs');

const TURNS = 20000;
async function resolvedWithin(promise) {
  let done = false;
  promise.then(() => { done = true; }, () => { done = true; });
  for (let turn = 0; turn < TURNS && !done; turn += 1) await new Promise((resolve) => setImmediate(resolve));
  return done;
}
const connect = (port) => new Promise((resolve) => {
  const socket = net.connect(port, '127.0.0.1');
  socket.once('connect', () => resolve({ socket, error: null }));
  socket.once('error', (error) => resolve({ socket, error }));
});

test('close() resolves, ends an idle open connection, stops listening, and a second close() resolves too', async () => {
  const ctx = await startApp();
  const { port } = ctx;
  const { socket, error } = await connect(port);
  assert.equal(error, null, 'the idle connection was accepted');
  const ended = new Promise((resolve) => socket.once('close', resolve));
  assert.equal(await resolvedWithin(ctx.close()), true, 'close() resolved');
  assert.equal(await resolvedWithin(ended), true, 'the idle connection was ended');
  const after = await connect(port);
  assert.equal(after.error && after.error.code, 'ECONNREFUSED', 'nothing listens any more');
  after.socket.destroy();
  assert.equal(await resolvedWithin(ctx.close()), true, 'a second close() resolves');
});

test('close() resolves with no connection at all', async () => {
  const ctx = await startApp();
  assert.equal(await resolvedWithin(ctx.close()), true);
});
