'use strict';

const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const { AuthError } = require('../../C009/authz.cjs');
const { bare, bearer, JSON_TYPE, withBody } = require('./raw-http.cjs');
const { call, gate, planHooks, reserve, same, until, withApp } = require('./helpers.cjs');

for (const operation of ['reserve', 'release']) {
  for (const authentication of [false, true]) {
    test(`cancelled ${operation}: ${authentication ? 'authentication precedence survives' : 'non-auth failure has no audit or answer'}`, { timeout: 30000 }, async () => {
      const plan = planHooks();
      const held = gate();
      let entered = false;
      await withApp({ app: { hooks: plan.hooks } }, async (ctx) => {
        const existing = (await reserve(ctx, 'conductor-a', 2)).json.reservation;
        const route = operation === 'reserve' ? '/v1/reservations' : `/v1/reservations/${existing.id}/release`;
        const before = same(ctx.app.snapshot());
        const auditBefore = ctx.app.auditLog().length;
        const sockets = [];
        const responses = [];
        ctx.app.server.on('connection', (socket) => sockets.push(socket));
        ctx.app.server.on('request', (_request, response) => responses.push(response));
        plan.arm(operation === 'reserve' ? 'reservation.create' : 'reservation.release', async () => {
          entered = true;
          await held.closed;
          throw authentication ? new AuthError('TOKEN_EXPIRED') : new Error('synthetic commit failure');
        });
        const client = net.connect({ host: '127.0.0.1', port: ctx.port });
        const chunks = [];
        client.on('data', (chunk) => chunks.push(chunk));
        client.on('error', () => {});
        try {
          const headers = [bearer(ctx.tokens['conductor-a'])];
          client.write(operation === 'reserve'
            ? withBody(ctx.port, 'POST', route, [...headers, JSON_TYPE], JSON.stringify({ key: 'cancel-final-key', tier: 'standard', units: 1 }))
            : bare(ctx.port, 'POST', route, headers));
          await until(() => entered, 'request entered its owned commit gate');
          client.destroy();
          await until(() => sockets[0]?.destroyed === true, 'server observed the disconnected client');
          held.open();
          await until(() => ctx.app.queued() === 0, 'commit failure settled');
          await new Promise((resolve) => setImmediate(resolve));
          assert.deepEqual(ctx.app.snapshot(), before, 'cancelled operation preserves both lease books');
          const appended = ctx.app.auditLog().slice(auditBefore);
          assert.equal(appended.length, authentication ? 1 : 0, 'cancelled non-auth failure must not append a refusal');
          if (authentication) assert.equal(appended[0].code, 'TOKEN_EXPIRED');
          assert.equal(responses[0].headersSent, authentication, 'only the established authentication refusal retains its response attempt');
          assert.equal(Buffer.concat(chunks).length, 0, 'no response reached the departed client');
        } finally {
          held.open();
          client.destroy();
        }
      });
    });
  }

  test(`live ${operation}: non-auth failure remains a typed, audited, closing refusal`, { timeout: 30000 }, async () => {
    const plan = planHooks();
    await withApp({ app: { hooks: plan.hooks } }, async (ctx) => {
      const existing = (await reserve(ctx, 'conductor-a', 2)).json.reservation;
      const before = same(ctx.app.snapshot());
      const auditBefore = ctx.app.auditLog().length;
      plan.arm(operation === 'reserve' ? 'reservation.create' : 'reservation.release', () => {
        throw new Error('synthetic commit failure');
      });
      const answer = operation === 'reserve'
        ? await reserve(ctx, 'conductor-a', 1)
        : await call(ctx, ctx.tokens['conductor-a'], 'POST', `/v1/reservations/${existing.id}/release`);
      assert.equal(answer.status, 500);
      assert.equal(answer.json.error.code, 'INTERNAL_ERROR');
      assert.equal(answer.headers.connection, 'close');
      assert.deepEqual(ctx.app.snapshot(), before);
      const appended = ctx.app.auditLog().slice(auditBefore);
      assert.equal(appended.length, 1);
      assert.equal(appended[0].code, 'INTERNAL_ERROR');
    });
  });
}
