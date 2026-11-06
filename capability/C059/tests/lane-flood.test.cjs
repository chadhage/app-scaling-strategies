'use strict';

// Second review, N1 (resource impact): 128 sockets that each send [G][G][X] (about 150 bytes) pinned the whole 128-connection cap while the 417 never
// came, and a legitimate GET got ECONNRESET. Structural, never timed: after the burst EVERY attacker socket is closed by the server (counted on the client
// side and on the server side), and a legitimate GET is answered. A control of 128 x [G][G][404] shows the same facts for a refusal the lane always handled.
// The only wait is a watchdog that turns a hang into a failure; no duration is asserted. The service runs in a SEPARATE process.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { call, startChild, until } = require('./net.cjs');
const { request } = require('./lane-support.cjs');

const SOCKETS = 128;
const OPTIONS = { timeout: 240000 };
const WATCHDOG_MS = 60000;

async function burst(port, tail, count) {
  const get = request(port, 'GET', '/scope.json', '1.1');
  const sockets = [];
  let closed = 0;
  const allClosed = new Promise((resolve) => {
    for (let index = 0; index < count; index += 1) {
      const socket = net.connect({ host: '127.0.0.1', port });
      socket.on('error', () => {});
      socket.on('data', () => {});
      socket.once('close', () => { closed += 1; if (closed === count) resolve(); });
      socket.write(get + get + tail);
      sockets.push(socket);
    }
  });
  const watchdog = new Promise((resolve) => { setTimeout(() => resolve(false), WATCHDOG_MS).unref(); });
  let everyClosed;
  let stillOpen;
  try {
    everyClosed = await Promise.race([allClosed.then(() => true), watchdog]);
    stillOpen = count - closed;
  } finally {
    for (const socket of sockets) socket.destroy();
  }
  assert.equal(everyClosed, true, `SOCKETS_NOT_CLOSED_BY_THE_SERVER: ${stillOpen} of ${count} sockets are still open after the watchdog`);
}

for (const [name, tail] of [
  ['[G][G][Expect: nonsense]', (port) => request(port, 'GET', '/scope.json', '1.1', ['Expect: nonsense'])],
  ['[G][G][404] (control: a refusal the lane always handled)', (port) => request(port, 'POST', '/admin', '1.1', [], '{}')],
]) {
  test(`${SOCKETS} sockets, each sending ${name}: every socket is closed by the server, the server holds no connection, a legitimate GET is answered`, OPTIONS, async () => {
    const child = await startChild({ watchdogMs: 300000 });
    try {
      await burst(child.port, tail(child.port), SOCKETS);
      await until(async () => (await child.stats()).connections === 0, 'the server holds no connection after the burst');
      assert.equal((await call(child.port, 'GET', '/scope.json')).status, 200, 'the connection cap is not pinned: a legitimate GET is answered');
    } finally {
      child.dispose();
    }
  });
}
