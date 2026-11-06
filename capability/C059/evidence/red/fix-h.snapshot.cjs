'use strict';

// RED snapshot of tests\lane-flood.test.cjs (second review, N1, resource impact): 128 sockets that each send [G][G][Expect: nonsense] pin the whole 128-connection cap on the
// service AS PUBLISHED in dfdace94 (evidence\red\stubs-5\server.cjs): no socket is ever closed by the server and a legitimate GET gets ECONNRESET; the control of 128 x
// [G][G][404] passes. Structural, never timed (the only wait is a watchdog). Replay: C059_RED_SUBJECT=capability\C059\evidence\red\stubs-5 (old), unset (the final code).
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { call, startChild, until } = require('./helpers-6/net.cjs');
const { request } = require('./helpers-7/lane-support.cjs');

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
  const watchdog = new Promise((resolve, reject) => {
    setTimeout(() => reject(new Error(`SOCKETS_NOT_CLOSED_BY_THE_SERVER: ${count - closed} of ${count} sockets are still open after the watchdog`)), WATCHDOG_MS).unref();
  });
  try {
    await Promise.race([allClosed, watchdog]);
  } finally {
    for (const socket of sockets) socket.destroy();
  }
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
