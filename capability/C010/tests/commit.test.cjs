'use strict';

// C010 scenarios "An ended or expired lease reaches nothing" and "The decision is repeated where the effect is committed". Mutations are
// linearized in one queue; a request that waits there was decided earlier, so the owner, the lease, its lifetime and the token are decided
// AGAIN right before the effect. hooks.beforeCommit runs inside the queue and lets a test change the world (or hold the head of the queue).
const assert = require('node:assert/strict');
const test = require('node:test');
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
