'use strict';

// C010 closing (rev-C010 m7, a generated mutant that makes every closing test hang instead of fail): the promise that close() returns ends once the listener
// and every connection are gone, and ends again for a repeated call. The wait is a bounded poll (never a hang, never a clock that decides): a close that
// never ends is a failed test with its own name.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { startApp, until } = require('./helpers.cjs');

test('close ends its promise once the listener and the held connection are gone, and a repeated close ends too', async () => {
  const context = await startApp();
  const held = net.connect({ host: '127.0.0.1', port: context.port });
  try {
    held.on('error', () => {});
    await new Promise((resolve) => held.once('connect', resolve));
    let ended = 0;
    const first = context.app.close().then(() => { ended += 1; });
    await until(() => ended === 1, 'close ended its promise', 500);
    await first;
    await until(() => held.destroyed, 'the held connection was ended by close', 500);
    const second = context.app.close().then(() => { ended += 1; });
    await until(() => ended === 2, 'a repeated close ended its promise', 500);
    await second;
    assert.equal(context.app.server.listening, false, 'nothing listens any more');
  } finally {
    held.destroy();
    context.app.server.close();
    context.app.server.closeAllConnections();
  }
});
