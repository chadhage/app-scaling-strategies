'use strict';
const assert = require('node:assert/strict');
const test = require('node:test');
const { withApp } = require('./helpers.cjs');

test('U057 chosen actual default idle timeout is 10000 and exactly twice the actual 5000 header timeout', () => withApp({}, async (context) => {
  const server = context.app.server;
  assert.equal(server.headersTimeout, 5000);
  assert.equal(server.connectionsCheckingInterval, 1000);
  assert.equal(server.timeout, 10000, 'the measured and documented idle default is exactly 10000, not the 15000 numeric mutant');
  assert.equal(server.timeout, 2 * server.headersTimeout);
}));
