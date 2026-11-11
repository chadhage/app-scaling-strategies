'use strict';

// The decision is repeated where the effect is committed. Requests wait in ONE queue; the check of every bound and the commit are one synchronous step
// of the store inside it, so a request that waited sees the books as they are THEN, a request whose token expired or whose connection was refused,
// destroyed or cut while it waited has no effect, no audit record and no answer, and nothing is ever reserved partially. hooks.beforeCommit runs
// inside the queue and lets a test hold the head of the queue or change the world.
const assert = require('node:assert/strict');
const net = require('node:net');
const { test } = require('node:test');
const { endConnection } = require('../../C009/http-io.cjs');
const { bare, bearer, JSON_TYPE, withBody } = require('./raw-http.cjs');
const { bookProblems, call, gate, get, planHooks, reserve, same, until, withApp } = require('./helpers.cjs');

const noEffect = (ctx, before) => assert.deepEqual(ctx.app.snapshot(), before, 'the request must have no effect');
const BODY = JSON.stringify({ key: 'key-commit-001', tier: 'standard', units: 2 });

test('a request that waited is decided against the books as they are at the commit: the last unit goes to the one that is first in the queue', () => {
  const plan = planHooks();
  return withApp({ app: { hooks: plan.hooks } }, async (ctx) => {
    await reserve(ctx, 'conductor-a', 5);
    const held = gate();
    plan.arm('reservation.create', () => held.closed);
    const first = reserve(ctx, 'conductor-b', 5);
    await until(() => ctx.app.queued() === 1, 'the first reserve is running in the queue');
    const second = reserve(ctx, 'conductor-b', 1);
    const third = reserve(ctx, 'conductor-a', 1);
    await until(() => ctx.app.queued() === 3, 'two more wait behind it');
    held.open();
    const [one, two, three] = await Promise.all([first, second, third]);
    assert.equal(one.status, 200);
    for (const late of [two, three]) assert.deepEqual([late.status, late.json.error.code], [409, 'CAPACITY_EXCEEDED']);
    assert.deepEqual(await bookProblems(ctx), []);
  });
});

test('a release that waits sees an expiry that happened meanwhile: it replays and nothing returns twice', () => {
  const plan = planHooks();
  return withApp({ app: { hooks: plan.hooks } }, async (ctx) => {
    const held = (await reserve(ctx, 'conductor-a', 4)).json.reservation;
    plan.arm('reservation.release', () => ctx.clock.advance(held.deadlineMs - ctx.clock.now()));
    const answer = await call(ctx, ctx.tokens['conductor-a'], 'POST', `/v1/reservations/${held.id}/release`);
    assert.deepEqual([answer.status, answer.json.reservation.state, answer.json.replayed], [200, 'expired', true]);
    assert.equal((await get(ctx, 'operator', '/v1/operator/pool')).json.pool.reservedUnits, 0);
    assert.deepEqual(await bookProblems(ctx), []);
  });
});

test('a token that expires while a reservation waits gives a typed 401 and no effect', () => {
  const plan = planHooks();
  return withApp({ app: { hooks: plan.hooks } }, async (ctx) => {
    const token = ctx.app.issueToken('conductor-a', { ttlMs: 5000 });
    const before = same(ctx.app.snapshot());
    plan.arm('reservation.create', () => ctx.clock.advance(6000));
    const answer = await call(ctx, token, 'POST', '/v1/reservations', { key: 'key-commit-002', tier: 'standard', units: 1 });
    assert.deepEqual([answer.status, answer.json.error.code], [401, 'TOKEN_EXPIRED']);
    noEffect(ctx, before);
  });
});

test('a batch decides again at the commit: its release of a reservation that expired while it waited replays, and the batch is still whole', () => {
  const plan = planHooks();
  return withApp({ app: { hooks: plan.hooks } }, async (ctx) => {
    const held = (await reserve(ctx, 'conductor-a', 6)).json.reservation;
    plan.arm('batch', () => ctx.clock.advance(held.deadlineMs - ctx.clock.now()));
    const answer = await call(ctx, ctx.tokens['conductor-a'], 'POST', '/v1/batch', { ops: [{ op: 'release', id: held.id }, { op: 'reserve', key: 'key-commit-003', tier: 'standard', units: 6 }] });
    assert.equal(answer.status, 200, answer.text);
    assert.deepEqual(answer.json.results.map((result) => [result.op, result.replayed]), [['release', true], ['reserve', false]]);
    assert.deepEqual(await bookProblems(ctx), []);
  });
});

// A connection that ended or was refused while its reservation waited: no effect, no audit record, no answer. The test watches the server side of the
// connections and responses and, where a case needs it, marks the connection the way C009's refusal does (endConnection) or lets the lane cut it.
async function connectionEnded(how) {
  const arrivals = [];
  const hold = gate();
  let armed = false;
  const seen = { sockets: [], responses: [], onRequest: () => {} };
  const hooks = {
    beforeCommit: async (info) => {
      arrivals.push(info.route);
      if (!armed) return;
      if (how === 'held-then-client-gone') await hold.closed;
      if (how === 'marked-at-commit') endConnection(seen.sockets[0]);
    }
  };
  return withApp({ app: { hooks } }, async (ctx) => {
    arrivals.length = 0;
    armed = true;
    ctx.app.server.on('connection', (socket) => seen.sockets.push(socket));
    ctx.app.server.on('request', (request, response) => { seen.responses.push(response); seen.onRequest(request); });
    const before = same(ctx.app.snapshot());
    const auditBefore = ctx.app.auditLog().length;
    const post = withBody(ctx.port, 'POST', '/v1/reservations', [bearer(ctx.tokens['conductor-a']), JSON_TYPE], BODY);
    const me = bare(ctx.port, 'GET', '/v1/me', [bearer(ctx.tokens['conductor-a'])]);
    if (how === 'marked-while-body-arrives') seen.onRequest = (request) => endConnection(request.socket);
    const client = net.connect({ host: '127.0.0.1', port: ctx.port });
    const received = [];
    client.on('data', (chunk) => received.push(chunk));
    client.on('error', () => {});
    try {
      // The lane cuts a connection that has more than four requests in flight: one write of a complete mutation and four more requests.
      client.write(how === 'cut-by-the-lane' ? Buffer.concat([post, me, me, me, me]) : post);
      if (how === 'held-then-client-gone') {
        await until(() => arrivals.length === 1, 'the reservation waits at the commit gate');
        client.destroy();
        await until(() => seen.sockets[0].destroyed, 'the server saw the client leave');
        hold.open();
      }
      if (how === 'marked-at-commit') await until(() => arrivals.length === 1, 'the reservation reached the commit gate, where the hook marked its connection');
      if (how === 'cut-by-the-lane') await until(() => seen.sockets[0]?.destroyed === true, 'the lane cut the connection');
      if (how === 'marked-while-body-arrives') await until(() => seen.responses.length === 1, 'the request was dispatched and its connection marked');
      await until(() => ctx.app.queued() === 0, 'the queue is empty');
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(seen.responses[0].headersSent, false, 'no answer was written');
      assert.equal(Buffer.concat(received).length, 0, 'the client received nothing');
      assert.equal(ctx.app.auditLog().length, auditBefore, 'no audit record');
      noEffect(ctx, before);
      assert.deepEqual(await bookProblems(ctx), []);
      return arrivals.slice();
    } finally {
      client.destroy();
    }
  });
}

const ENDED = [
  ['marked-at-commit', ['reservation.create'], 'a hook marks the connection (as C009\'s refusal does) while the reservation sits at the commit gate: the second guard drops it'],
  ['held-then-client-gone', ['reservation.create'], 'the client leaves (its socket is destroyed) while the reservation is held at the commit gate: the second guard drops it'],
  ['cut-by-the-lane', [], 'the lane cuts the connection (a complete reservation followed by four more requests in one write): the first guard drops it before the queue'],
  ['marked-while-body-arrives', [], 'the connection is marked while the body of the reservation is still being read: the first guard drops it before the queue']
];

for (const [how, expected, label] of ENDED) {
  test(`a reservation whose connection ended or was refused while it waited has no effect, no audit record and no answer: ${label}`, async () => {
    assert.deepEqual(await connectionEnded(how), expected, `the commit gate was reached by: ${expected.length} request(s)`);
  });
}

test('control of the cases above: the same reservation on an untouched connection reaches the commit gate once, is applied and answered', () => {
  const arrivals = [];
  return withApp({ app: { hooks: { beforeCommit: (info) => { arrivals.push(info.route); } } } }, async (ctx) => {
    const answer = await call(ctx, ctx.tokens['conductor-a'], 'POST', '/v1/reservations', Buffer.from(BODY));
    assert.deepEqual([answer.status, answer.json.reservation.state], [200, 'reserved']);
    assert.deepEqual(arrivals, ['reservation.create']);
    assert.equal(ctx.app.auditLog().some((entry) => entry.outcome === 'admitted'), true);
  });
});

test('a release whose connection ended while it waited has no effect, so the retry still finds the reservation held', () => {
  const plan = planHooks();
  const held = gate();
  return withApp({ app: { hooks: plan.hooks } }, async (ctx) => {
    const mine = (await reserve(ctx, 'conductor-a', 3)).json.reservation;
    const sockets = [];
    ctx.app.server.on('connection', (socket) => sockets.push(socket));
    plan.arm('reservation.release', () => held.closed);
    const client = net.connect({ host: '127.0.0.1', port: ctx.port });
    client.on('error', () => {});
    try {
      client.write(bare(ctx.port, 'POST', `/v1/reservations/${mine.id}/release`, [bearer(ctx.tokens['conductor-a'])]));
      await until(() => ctx.app.queued() === 1, 'the release waits at the commit gate');
      client.destroy();
      await until(() => sockets[0].destroyed, 'the server saw the client leave');
      held.open();
      await until(() => ctx.app.queued() === 0, 'the queue is empty');
      assert.equal((await get(ctx, 'conductor-a', `/v1/reservations/${mine.id}`)).json.reservation.state, 'reserved');
      assert.equal((await call(ctx, ctx.tokens['conductor-a'], 'POST', `/v1/reservations/${mine.id}/release`)).json.replayed, false);
    } finally {
      client.destroy();
    }
  });
});
