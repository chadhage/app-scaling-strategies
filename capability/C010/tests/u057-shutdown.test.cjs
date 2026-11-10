'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers.cjs');

test('U057 close invokes the actual listener close once before returning its completion promise', async () => {
  const app = load('server.cjs').createApp();
  const nativeClose = app.server.close;
  const errors = [];
  let calls = 0;
  app.server.close = function (...args) {
    calls += 1;
    return nativeClose.apply(this, args);
  };
  app.server.on('error', (error) => errors.push(error.message));
  try {
    const outcome = await new Promise((resolve) => {
      app.server.once('listening', () => resolve('listening'));
      app.server.once('error', () => resolve('error'));
      app.server.listen(0, '127.0.0.1');
    });
    assert.equal(outcome, 'listening');
    assert.deepEqual(errors, []);
    const completion = app.close();
    assert.equal(calls, 1, 'deleting server.close is an immediate named assertion, never a waiting-test timeout');
    await completion;
    assert.equal(app.server.listening, false);
  } finally {
    await new Promise((resolve) => {
      nativeClose.call(app.server, () => resolve());
      app.server.closeAllConnections();
    });
  }
});
