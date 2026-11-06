'use strict';

// C010 scenario "One conductor filling its quota cannot starve another lease or the operator": every identity has its own share of the state
// (leases plus resources), the shares of all conductors always fit, so no conductor can fill what another one needs, and a refused creation
// has no effect. Expired and ended leases give their share back.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, same, seed, startApp, target, withApp } = require('./helpers.cjs');

const SMALL = { app: { limits: { ownerEntries: 6 } } };
const entriesOf = (context, owner) => context.app.snapshot().leases.filter((lease) => lease.owner === owner)
  .reduce((sum, lease) => sum + 1 + lease.runs.length + lease.scratches.length + lease.exports.length, 0);

test('a conductor that fills its share gets 409 OWNER_QUOTA_FULL with no effect, and the other conductor and the operator are not affected', () => withApp(SMALL, async (context) => {
  const { tokens, ids } = await seed(context);
  assert.equal(entriesOf(context, 'conductor-a'), 4);
  for (const index of [1, 2]) assert.equal((await call(context, tokens['conductor-a'], 'POST', `/v1/leases/${ids.a.lease}/scratches`, { name: `fill-${index}` })).status, 200);
  assert.equal(entriesOf(context, 'conductor-a'), 6);
  const before = same(context.app.snapshot());
  for (const [method, route, body] of [['POST', `/v1/leases/${ids.a.lease}/runs`, { name: 'over', units: 1 }], ['POST', `/v1/leases/${ids.a.lease}/exports`, { name: 'over', runId: ids.a.run }], ['POST', '/v1/leases', { name: 'over', ttlMs: 1000 }]]) {
    const answer = await call(context, tokens['conductor-a'], method, route, body);
    assert.equal(answer.status, 409, `${method} ${route}`);
    assert.equal(answer.json.error.code, 'OWNER_QUOTA_FULL');
    assert.equal(answer.headers.connection, 'close');
  }
  assert.deepEqual(context.app.snapshot(), before, 'a refused creation changes nothing');
  assert.equal((await call(context, tokens['conductor-b'], 'POST', `/v1/leases/${ids.b.lease}/scratches`, { name: 'still-fine' })).status, 200, 'the other conductor can still create');
  assert.equal((await call(context, tokens['conductor-b'], 'POST', '/v1/leases', { name: 'second', ttlMs: 1000 })).status, 200);
  assert.equal((await call(context, tokens.operator, 'GET', '/v1/operator/leases')).status, 200, 'the operator can still read');
  assert.equal((await call(context, tokens['conductor-a'], 'GET', target(ids.a, 'lease'))).status, 200, 'the conductor at its limit can still read and delete');
  assert.equal((await call(context, tokens['conductor-a'], 'DELETE', target(ids.a, 'scratch'))).status, 200);
  assert.equal((await call(context, tokens['conductor-a'], 'POST', `/v1/leases/${ids.a.lease}/scratches`, { name: 'room-again' })).status, 200, 'deleting gives the share back');
}));

test('the shares of all conductors always fit: whatever one holds, the state never exceeds the sum of the shares and the others keep theirs', () => withApp(SMALL, async (context) => {
  const { tokens, ids } = await seed(context);
  for (const [name, key] of [['conductor-a', 'a'], ['conductor-b', 'b']]) {
    for (let index = 0; index < 5; index += 1) await call(context, tokens[name], 'POST', `/v1/leases/${ids[key].lease}/scratches`, { name: `x-${index}` });
  }
  assert.equal(entriesOf(context, 'conductor-a'), 6);
  assert.equal(entriesOf(context, 'conductor-b'), 6);
  const total = context.app.snapshot().leases.reduce((sum, lease) => sum + 1 + lease.runs.length + lease.scratches.length + lease.exports.length, 0);
  assert.equal(total, 12, 'two conductors times their share of six');
}));

test('an expired lease and an ended lease give their share back', () => withApp(SMALL, async (context) => {
  const { tokens } = await seed(context);
  const short = (await call(context, tokens['conductor-a'], 'POST', '/v1/leases', { name: 'short', ttlMs: 1000 })).json.lease;
  assert.equal((await call(context, tokens['conductor-a'], 'POST', `/v1/leases/${short.id}/scratches`, { name: 'one' })).status, 200, 'six entries');
  const over = await call(context, tokens['conductor-a'], 'POST', '/v1/leases', { name: 'over', ttlMs: 1000 });
  assert.equal(over.status, 409);
  assert.equal(over.json.error.code, 'OWNER_QUOTA_FULL');
  context.clock.advance(1001);
  const again = await call(context, tokens['conductor-a'], 'POST', '/v1/leases', { name: 'again', ttlMs: 1000 });
  assert.equal(again.status, 200, 'the expired lease and its resource are reaped: the share is free again');
  assert.equal(entriesOf(context, 'conductor-a'), 5, 'the old lease with its run, scratch and export plus the new lease');
  assert.equal((await call(context, tokens['conductor-a'], 'DELETE', `/v1/leases/${again.json.lease.id}`)).status, 200);
  assert.equal(entriesOf(context, 'conductor-a'), 4);
}));

test('the limits are checked when the server is built: a share that is not a positive integer or an unknown limit is refused', async () => {
  for (const limits of [{ ownerEntries: 0 }, { ownerEntries: -1 }, { ownerEntries: 1.5 }, { ownerEntries: '5' }, { ownerEntries: Number.NaN }, { bodyBytes: 0 }, { unknownLimit: 1 }]) {
    let started = null;
    try { started = await startApp({ app: { limits } }); } catch (error) { assert.equal(error.code, 'LIMITS_INVALID', JSON.stringify(limits)); continue; }
    await started.close();
    assert.fail(`${JSON.stringify(limits)} must be refused when the server is built`);
  }
});
