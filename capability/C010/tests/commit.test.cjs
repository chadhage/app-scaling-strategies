'use strict';

// C010 scenarios "An ended or expired lease reaches nothing" and "The decision is repeated where the effect is committed". Mutations are
// linearized in one queue; a request that waits there was decided earlier, so the owner, the lease, its lifetime and the token are decided
// AGAIN right before the effect. hooks.beforeCommit runs inside the queue and lets a test change the world (or hold the head of the queue).
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { endConnection } = require('../../C009/http-io.cjs');
const { bare, bearer, JSON_TYPE, withBody } = require('./raw-http.cjs');
const { call, gate, planHooks, same, seed, target, until, withApp } = require('./helpers.cjs');

const SHORT = { name: 'short', ttlMs: 5000 };
const noEffect = (context, before) => assert.deepEqual(context.app.snapshot(), before, 'the request must have no effect');
const leaseOf = (context, id) => context.app.snapshot().leases.find((lease) => lease.id === id);

async function shortLease(context, token) {
  const lease = (await call(context, token, 'POST', '/v1/leases', SHORT)).json.lease;
  const run = (await call(context, token, 'POST', `/v1/leases/${lease.id}/runs`, { name: 'quick', units: 1 })).json.resource;
  return { lease: lease.id, run: run.id };
}

test('a lease whose lifetime is over reaches nothing, although the token of its owner is still valid, and it answers like an absent lease', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  const fresh = await shortLease(context, tokens['conductor-b']);
  const absent = await call(context, tokens['conductor-b'], 'GET', '/v1/leases/lease-ffffffffffffffff');
  context.clock.advance(5001);
  const before = same(context.app.snapshot());
  const run = `/v1/leases/${fresh.lease}/runs/${fresh.run}`;
  const routes = [['GET', `/v1/leases/${fresh.lease}`], ['GET', `/v1/leases/${fresh.lease}/runs`], ['GET', run], ['DELETE', run], ['PATCH', run, { units: 2 }], ['POST', `${run}/cancel`],
    ['POST', `/v1/leases/${fresh.lease}/scratches`, { name: 'late' }], ['DELETE', `/v1/leases/${fresh.lease}`]];
  for (const [method, route, body] of routes) {
    const answer = await call(context, tokens['conductor-b'], method, route, body);
    assert.equal(answer.status, 404, `${method} ${route}`);
    assert.equal(answer.text, absent.text, 'an expired lease answers exactly like an absent one');
  }
  assert.equal((await call(context, tokens['conductor-b'], 'GET', '/v1/leases')).json.items.some((item) => item.id === fresh.lease), false, 'it is not listed');
  noEffect(context, before);
}));

test('a token that expired is refused 401 with no effect, even for a lease that is still alive', () => withApp({}, async (context) => {
  const { ids } = await seed(context);
  const token = context.app.issueToken('conductor-a', { ttlMs: 1000 });
  context.clock.advance(1001);
  const before = same(context.app.snapshot());
  for (const [method, route, body] of [['GET', target(ids.a, 'lease')], ['POST', `/v1/leases/${ids.a.lease}/scratches`, { name: 'late' }], ['DELETE', target(ids.a, 'run')], ['POST', '/v1/batch', { ops: [] }]]) {
    const answer = await call(context, token, method, route, body);
    assert.equal(answer.status, 401, `${method} ${route}`);
    assert.equal(answer.json.error.code, 'TOKEN_EXPIRED');
  }
  noEffect(context, before);
}));

test('a lease that ends while requests wait in the queue gives them no effect: ended first, refused after', () => {
  const plan = planHooks();
  return withApp({ app: { hooks: plan.hooks } }, async (context) => {
    const { tokens, ids } = await seed(context);
    const held = gate();
    plan.arm('lease.end', () => held.closed);
    const ending = call(context, tokens['conductor-b'], 'DELETE', target(ids.b, 'lease'));
    await until(() => context.app.queued() === 1, 'the end of the lease is running in the queue');
    const creating = call(context, tokens['conductor-b'], 'POST', `/v1/leases/${ids.b.lease}/scratches`, { name: 'late' });
    const batching = call(context, tokens['conductor-b'], 'POST', '/v1/batch', { ops: [{ op: 'delete', lease: ids.b.lease, kind: 'scratch', id: ids.b.scratch }] });
    await until(() => context.app.queued() === 3, 'both requests wait behind it');
    held.open();
    const [ended, late, batch] = await Promise.all([ending, creating, batching]);
    assert.equal(ended.status, 200);
    for (const answer of [late, batch]) {
      assert.equal(answer.status, 404, answer.text);
      assert.equal(answer.json.error.code, 'TARGET_NOT_FOUND');
    }
    assert.equal(leaseOf(context, ids.b.lease), undefined);
  });
});

test('a lease that expires while a request waits gives that request no effect', () => {
  const plan = planHooks();
  return withApp({ app: { hooks: plan.hooks } }, async (context) => {
    const { tokens } = await seed(context);
    const fresh = await shortLease(context, tokens['conductor-b']);
    plan.arm('resource.create', () => context.clock.advance(6000));
    const late = await call(context, tokens['conductor-b'], 'POST', `/v1/leases/${fresh.lease}/runs`, { name: 'late', units: 1 });
    assert.equal(late.status, 404);
    assert.equal(late.json.error.code, 'TARGET_NOT_FOUND');
    assert.equal(leaseOf(context, fresh.lease).runs.length, 1, 'the run created in the queue never happened');
  });
});

test('a token that expires while a request waits gives a typed 401 and no effect', () => {
  const plan = planHooks();
  return withApp({ app: { hooks: plan.hooks } }, async (context) => {
    const { ids } = await seed(context);
    const token = context.app.issueToken('conductor-a', { ttlMs: 5000 });
    const before = same(context.app.snapshot());
    plan.arm('resource.create', () => context.clock.advance(6000));
    const answer = await call(context, token, 'POST', `/v1/leases/${ids.a.lease}/scratches`, { name: 'late' });
    assert.equal(answer.status, 401);
    assert.equal(answer.json.error.code, 'TOKEN_EXPIRED');
    noEffect(context, before);
  });
});

const MOVES = [
  ['resource.create', 'POST', (i) => `/v1/leases/${i.lease}/scratches`, { name: 'late' }], ['resource.delete', 'DELETE', (i) => target(i, 'scratch')],
  ['resource.update', 'PATCH', (i) => target(i, 'run'), { units: 9 }], ['run.cancel', 'POST', (i) => `${target(i, 'run')}/cancel`], ['lease.end', 'DELETE', (i) => target(i, 'lease')],
  ['batch', 'POST', () => '/v1/batch', (i) => ({ ops: [{ op: 'delete', lease: i.lease, kind: 'scratch', id: i.scratch }] })]
];

test('a lease that moves to another owner while a request waits gives that request no effect, and the new owner reaches it while the old owner does not', () => {
  const plan = planHooks();
  return withApp({ app: { hooks: plan.hooks } }, async (context) => {
    const { tokens, ids } = await seed(context);
    const before = same(context.app.snapshot());
    for (const [route, method, path, body] of MOVES) {
      plan.arm(route, () => context.app.transfer(ids.b.lease, 'conductor-a'));
      const answer = await call(context, tokens['conductor-b'], method, path(ids.b), typeof body === 'function' ? body(ids.b) : body);
      assert.equal(answer.status, 404, `${route}: ${answer.text}`);
      assert.equal(answer.json.error.code, 'TARGET_NOT_FOUND');
      assert.equal(leaseOf(context, ids.b.lease).owner, 'conductor-a', `${route}: the hook moved the lease`);
      context.app.transfer(ids.b.lease, 'conductor-b');
      noEffect(context, before);
    }
    context.app.transfer(ids.b.lease, 'conductor-a');
    assert.equal((await call(context, tokens['conductor-a'], 'GET', target(ids.b, 'lease'))).status, 200, 'the new owner reaches it');
    assert.equal((await call(context, tokens['conductor-b'], 'GET', target(ids.b, 'lease'))).status, 404, 'the old owner no longer does');
  });
});

test('concurrent creates, reads, ends and rival attempts on one lease settle consistently, and the other conductor never has an effect', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  let state = 20261106;
  const random = () => { state = (state * 1664525 + 1013904223) % 4294967296; return state / 4294967296; };
  for (let round = 0; round < 25; round += 1) {
    const lease = (await call(context, tokens['conductor-a'], 'POST', '/v1/leases', { name: `round-${round}`, ttlMs: 600000 })).json.lease.id;
    const as = (identity) => (method, route, body) => call(context, tokens[identity], method, route, body);
    const [owner, rival] = [as('conductor-a'), as('conductor-b')];
    const jobs = [
      { kind: 'create', run: () => owner('POST', `/v1/leases/${lease}/scratches`, { name: 'one' }) }, { kind: 'create', run: () => owner('POST', `/v1/leases/${lease}/scratches`, { name: 'two' }) },
      { kind: 'read', run: () => owner('GET', `/v1/leases/${lease}/scratches`) }, { kind: 'end', run: () => owner('DELETE', `/v1/leases/${lease}`) },
      { kind: 'rival', run: () => rival('POST', `/v1/leases/${lease}/scratches`, { name: 'evil' }) }, { kind: 'rival', run: () => rival('GET', `/v1/leases/${lease}`) },
      { kind: 'rival', run: () => rival('DELETE', `/v1/leases/${lease}`) }
    ].sort(() => random() - 0.5);
    const answers = await Promise.all(jobs.map((job) => job.run()));
    const results = jobs.map((job, index) => ({ kind: job.kind, answer: answers[index] }));
    for (const { answer } of results.filter((item) => item.kind === 'rival')) assert.equal(answer.status, 404, answer.text);
    const ended = results.filter((item) => item.kind === 'end' && item.answer.status === 200).length;
    const created = results.filter((item) => item.kind === 'create' && item.answer.status === 200).length;
    const remaining = leaseOf(context, lease);
    assert.equal(Boolean(remaining), ended === 0, 'the lease is gone exactly when its owner ended it');
    if (remaining) {
      assert.equal(remaining.scratches.length, created, 'every accepted create is there');
      assert.equal(remaining.scratches.some((scratch) => scratch.name === 'evil'), false);
    }
  }
}));

// The first decision of a BATCH is made before the queue: a batch that names a foreign target never reaches the commit gate (the counter below
// is the proof: the store would refuse it there too, with the same answer, which is why only the counter tells the two decisions apart).
const batchOps = (own, foreign) => ({
  own: { op: 'delete', lease: own.lease, kind: 'scratch', id: own.scratch }, foreignDelete: { op: 'delete', lease: foreign.lease, kind: 'run', id: foreign.run },
  foreignUpdate: { op: 'update', lease: foreign.lease, kind: 'run', id: foreign.run, patch: { units: 9 } }
});

test('a batch that names a foreign target, alone or after an own one, is refused 404 before the queue (the commit gate is never reached, nothing changes); an own batch reaches the gate once', () => {
  const arrivals = [];
  return withApp({ app: { hooks: { beforeCommit: (info) => { arrivals.push(info.route); } } } }, async (context) => {
    const { tokens, ids } = await seed(context);
    const ops = batchOps(ids.b, ids.a);
    arrivals.length = 0;
    const before = same(context.app.snapshot());
    for (const batch of [[ops.own, ops.foreignDelete], [ops.foreignUpdate], [ops.foreignDelete, ops.own]]) {
      const answer = await call(context, tokens['conductor-b'], 'POST', '/v1/batch', { ops: batch });
      assert.equal(answer.status, 404, answer.text);
      assert.equal(answer.json.error.code, 'TARGET_NOT_FOUND');
      assert.deepEqual(arrivals, [], 'a batch with a foreign target never reaches the commit gate');
      noEffect(context, before);
    }
    const mine = await call(context, tokens['conductor-b'], 'POST', '/v1/batch', { ops: [ops.own] });
    assert.equal(mine.status, 200, mine.text);
    assert.deepEqual(arrivals, ['batch'], 'an own batch reaches the commit gate exactly once');
    assert.equal(leaseOf(context, ids.b.lease).scratches.length, 0, 'and it was applied');
  });
});

// A connection that ended or was refused while its mutation waited: no effect, no audit record, no answer. The test watches the server side of
// the connections and responses and, where a case needs it, marks the connection the way C009's refusal does (endConnection) or lets the lane cut it.
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
  return withApp({ app: { hooks } }, async (context) => {
    const { tokens, ids } = await seed(context);
    arrivals.length = 0;
    armed = true;
    context.app.server.on('connection', (socket) => seen.sockets.push(socket));
    context.app.server.on('request', (request, response) => { seen.responses.push(response); seen.onRequest(request); });
    const before = same(context.app.snapshot());
    const auditBefore = context.app.auditLog().length;
    const post = withBody(context.port, 'POST', `/v1/leases/${ids.a.lease}/scratches`, [bearer(tokens['conductor-a']), JSON_TYPE], JSON.stringify({ name: 'late' }));
    const get = bare(context.port, 'GET', '/v1/me', [bearer(tokens['conductor-a'])]);
    if (how === 'marked-while-body-arrives') seen.onRequest = (request) => endConnection(request.socket);
    const client = net.connect({ host: '127.0.0.1', port: context.port });
    const received = [];
    client.on('data', (chunk) => received.push(chunk));
    client.on('error', () => {});
    try {
      // The lane cuts a connection that has more than four requests in flight: one write of a complete mutation and four more requests.
      client.write(how === 'cut-by-the-lane' ? Buffer.concat([post, get, get, get, get]) : post);
      if (how === 'held-then-client-gone') {
        await until(() => arrivals.length === 1, 'the mutation waits at the commit gate');
        client.destroy();
        await until(() => seen.sockets[0].destroyed, 'the server saw the client leave');
        hold.open();
      }
      if (how === 'marked-at-commit') await until(() => arrivals.length === 1, 'the mutation reached the commit gate, where the hook marked its connection');
      if (how === 'cut-by-the-lane') await until(() => seen.sockets[0]?.destroyed === true, 'the lane cut the connection');
      if (how === 'marked-while-body-arrives') await until(() => seen.responses.length === 1, 'the request was dispatched and its connection marked');
      await until(() => context.app.queued() === 0, 'the queue is empty');
      await new Promise((resolve) => setImmediate(resolve));
      assert.equal(seen.responses[0].headersSent, false, 'no answer was written');
      assert.equal(Buffer.concat(received).length, 0, 'the client received nothing');
      assert.equal(context.app.auditLog().length, auditBefore, 'no audit record');
      noEffect(context, before);
      return arrivals.slice();
    } finally {
      client.destroy();
    }
  });
}

const ENDED = [
  ['marked-at-commit', ['resource.create'], 'a hook marks the connection (as C009\'s refusal does) while the mutation sits at the commit gate: the second guard drops it'],
  ['held-then-client-gone', ['resource.create'], 'the client leaves (its socket is destroyed) while the mutation is held at the commit gate: the second guard drops it'],
  ['cut-by-the-lane', [], 'the lane cuts the connection (a complete mutation followed by four more requests in one write): the first guard drops it before the queue'],
  ['marked-while-body-arrives', [], 'the connection is marked while the body of the mutation is still being read: the first guard drops it before the queue']
];

for (const [how, expected, label] of ENDED) {
  test(`a mutation whose connection ended or was refused while it waited has no effect, no audit record and no answer: ${label}`, async () => {
    assert.deepEqual(await connectionEnded(how), expected, `the commit gate was reached by: ${expected.length} request(s)`);
  });
}

test('control of the cases above: the same mutation on an untouched connection reaches the commit gate once, is applied and answered', () => {
  const arrivals = [];
  return withApp({ app: { hooks: { beforeCommit: (info) => { arrivals.push(info.route); } } } }, async (context) => {
    const { tokens, ids } = await seed(context);
    arrivals.length = 0;
    const answer = await call(context, tokens['conductor-a'], 'POST', `/v1/leases/${ids.a.lease}/scratches`, { name: 'late' });
    assert.equal(answer.status, 200, answer.text);
    assert.deepEqual(arrivals, ['resource.create']);
    assert.equal(leaseOf(context, ids.a.lease).scratches.length, 2, 'the scratch resource was added');
  });
});
