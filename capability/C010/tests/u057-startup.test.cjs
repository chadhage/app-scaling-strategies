'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { load } = require('./helpers.cjs');

test('U057 actual default startup reaches a healthy owned loopback listener without a read-stop error', async () => {
  const app = load('server.cjs').createApp();
  const errors = [];
  app.server.on('error', (error) => errors.push(error.message));
  try {
    const outcome = await new Promise((resolve) => {
      app.server.once('listening', () => resolve('listening'));
      app.server.once('error', () => resolve('error'));
      app.server.listen(0, '127.0.0.1');
    });
    assert.equal(outcome, 'listening', 'a healthy runtime must reach listening, not the injected READ_STOP_UNAVAILABLE startup');
    assert.deepEqual(errors, [], 'startup is decided by the actual listening/error events, never an elapsed-time guess');
    assert.deepEqual(app.health(), { ok: true, reason: null });
    assert.equal(app.server.address().address, '127.0.0.1');
    assert.ok(app.server.address().port > 0);
  } finally {
    await new Promise((resolve) => {
      app.server.close(() => resolve());
      app.server.closeAllConnections();
    });
  }
});
