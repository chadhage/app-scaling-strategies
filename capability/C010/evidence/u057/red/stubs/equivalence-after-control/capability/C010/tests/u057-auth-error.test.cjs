'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { endConnection } = require('../../C009/http-io.cjs');
const { bearer, JSON_TYPE, withBody } = require('./raw-http.cjs');
const { call, fakeClock, same, until, withApp } = require('./helpers.cjs');

test('U057 original AuthError equivalence: cancellation during the controlled token-clock read preserves the one original TOKEN_EXPIRED audit', async () => {
  const clock = fakeClock();
  let arm = false;
  let markOnRead = false;
  let markedReads = 0;
  let socket;
  const now = () => {
    if (markOnRead) {
      markOnRead = false;
      markedReads += 1;
      endConnection(socket);
    }
    return clock.now();
  };
  await withApp({ clock, app: { now, hooks: { beforeCommit: ({ route }) => {
    if (!arm || route !== 'resource.create') return;
    clock.advance(1001);
    markOnRead = true;
  } } } }, async (context) => {
    const owner = context.app.issueToken('conductor-a');
    const lease = (await call(context, owner, 'POST', '/v1/leases', { name: 'clock-boundary', ttlMs: 600000 })).json.lease.id;
    const token = context.app.issueToken('conductor-a', { ttlMs: 1000 });
    const before = same(context.app.snapshot());
    const auditBefore = context.app.auditLog().length;
    context.app.server.on('request', (request) => { socket = request.socket; });
    arm = true;
    const client = net.connect({ host: '127.0.0.1', port: context.port });
    client.on('error', () => {});
    client.on('data', () => {});
    try {
      client.write(withBody(context.port, 'POST', `/v1/leases/${lease}/scratches`, [bearer(token), JSON_TYPE], JSON.stringify({ name: 'never-created' })));
      await until(() => markedReads === 1 && context.app.queued() === 0, 'the controlled token verification marked the socket and the commit completed');
      assert.equal(markedReads, 1, 'cancellation happened during verification, not before the commit guard');
      assert.deepEqual(context.app.auditLog().slice(auditBefore).map(({ subject, role, route, method, outcome, code }) => ({ subject, role, route, method, outcome, code })), [
        { subject: 'conductor-a', role: 'conductor', route: 'resource.create', method: 'POST', outcome: 'refused', code: 'TOKEN_EXPIRED' }
      ], 'the original inner/outer AuthError handlers remain observably equivalent');
      assert.deepEqual(context.app.snapshot(), before);
    } finally {
      client.destroy();
    }
  });
});
