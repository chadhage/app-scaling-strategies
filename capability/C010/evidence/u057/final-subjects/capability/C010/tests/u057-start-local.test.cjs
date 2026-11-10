'use strict';
const assert = require('node:assert/strict');
const http = require('node:http');
const test = require('node:test');
const { load } = require('./helpers.cjs');

test('U057 startLocal synchronously requests exactly one automatic loopback listener with its error handler installed', async (t) => {
  const nativeListen = http.Server.prototype.listen;
  const nativeClose = http.Server.prototype.close;
  const calls = [];
  let server;
  t.mock.method(http.Server.prototype, 'listen', function (...args) {
    server = this;
    calls.push(args.slice(0, 2));
    assert.equal(args[0], 0, 'the automatic port is actually zero');
    assert.equal(args[1], '127.0.0.1');
    assert.ok(this.listenerCount('error') >= 1, 'startup rejection is installed before listening');
    return nativeListen.apply(this, args);
  });
  try {
    const pending = load('server.cjs').startLocal();
    assert.deepEqual(calls, [[0, '127.0.0.1']], 'deleting listen is a synchronous assertion, not an unresolved promise timeout');
    const local = await pending;
    assert.equal(local.port, server.address().port);
    assert.equal(local.origin, `http://127.0.0.1:${local.port}`);
  } finally {
    if (server) await new Promise((resolve) => {
      nativeClose.call(server, () => resolve());
      server.closeAllConnections();
    });
  }
});
