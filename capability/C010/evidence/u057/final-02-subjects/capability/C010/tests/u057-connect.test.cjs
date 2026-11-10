'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { load, until } = require('./helpers.cjs');
const { parseAnswers } = require('./raw-http.cjs');

test('U057 the actual CONNECT event writes the typed 405 and its audit without an uncaught refusal-code fault', async () => {
  const app = load('server.cjs').createApp();
  const nativeClose = app.server.close;
  app.server.on('error', () => {});
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  let peer;
  app.server.on('connection', (socket) => { peer = socket; });
  const client = net.connect({ host: '127.0.0.1', port: app.server.address().port, allowHalfOpen: true });
  const received = [];
  let closed = false;
  client.on('data', (chunk) => received.push(chunk));
  client.on('end', () => client.end());
  client.on('close', () => { closed = true; });
  client.on('error', () => {});
  try {
    await until(() => peer !== undefined, 'the real owned HTTP connection exists before its CONNECT event');
    assert.doesNotThrow(() => app.server.emit('connect', {}, peer), 'the actual registered CONNECT handler must use a supported refusal code');
    await until(() => closed, 'the typed CONNECT refusal closes the real owned connection');
    const answers = parseAnswers(Buffer.concat(received));
    assert.equal(answers.length, 1);
    assert.equal(answers[0].status, 405);
    assert.equal(answers[0].json.error.code, 'METHOD_NOT_ALLOWED');
    assert.deepEqual(app.auditLog().map(({ method, outcome, code }) => ({ method, outcome, code })), [
      { method: 'OTHER', outcome: 'refused', code: 'METHOD_NOT_ALLOWED' }
    ]);
  } finally {
    client.destroy();
    await new Promise((resolve) => {
      nativeClose.call(app.server, () => resolve());
      app.server.closeAllConnections();
      if (peer) peer.destroy();
    });
  }
});
