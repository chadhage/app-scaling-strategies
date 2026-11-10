'use strict';
const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const { endConnection } = require('../../C009/http-io.cjs');
const { bare, bearer, JSON_TYPE, withBody } = require('./raw-http.cjs');
const { planHooks, reserve, until, withApp } = require('./helpers.cjs');

for (const operation of ['reserve', 'release', 'batch']) {
  test(`cancelled ${operation} is dropped before token revalidation even when its token also expired`, { timeout: 30000 }, async () => {
    const plan = planHooks();
    await withApp({ app: { hooks: plan.hooks } }, async (ctx) => {
      const mine = (await reserve(ctx, 'conductor-a', 1)).json.reservation;
      const token = ctx.app.issueToken('conductor-a', { ttlMs: 5000 });
      const before = ctx.app.snapshot();
      const beforeAudit = ctx.app.auditLog().length;
      let requestSocket;
      let response;
      let entered = false;
      ctx.app.server.on('request', (request, answer) => { requestSocket = request.socket; response = answer; });
      const name = operation === 'reserve' ? 'reservation.create' : operation === 'release' ? 'reservation.release' : 'batch';
      plan.arm(name, () => {
        entered = true;
        endConnection(requestSocket);
        ctx.clock.advance(6000);
      });
      const client = net.connect({ host: '127.0.0.1', port: ctx.port });
      const received = [];
      client.on('data', (bytes) => received.push(bytes));
      client.on('error', () => {});
      try {
        const headers = [bearer(token)];
        const body = operation === 'batch'
          ? { ops: [{ op: 'reserve', key: 'cancel-order-key', tier: 'standard', units: 1 }] }
          : { key: 'cancel-order-key', tier: 'standard', units: 1 };
        client.write(operation === 'release'
          ? bare(ctx.port, 'POST', `/v1/reservations/${mine.id}/release`, headers)
          : withBody(ctx.port, 'POST', operation === 'batch' ? '/v1/batch' : '/v1/reservations', [...headers, JSON_TYPE], JSON.stringify(body)));
        await until(() => entered && ctx.app.queued() === 0, 'marked and expired request finished its commit lane');
        await new Promise((resolve) => setImmediate(resolve));
        assert.deepEqual(ctx.app.snapshot(), before);
        assert.equal(ctx.app.auditLog().length, beforeAudit, 'a dead connection does not acquire a TOKEN_EXPIRED audit decision');
        assert.equal(response.headersSent, false);
        assert.equal(Buffer.concat(received).length, 0);
      } finally { client.destroy(); }
    });
  });
}
