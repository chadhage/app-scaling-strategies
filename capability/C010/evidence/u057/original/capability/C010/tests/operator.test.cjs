'use strict';

// C010 scenario "A visitor reaches no lease and the operator reaches only audited metadata" (the operator part). What the operator may do is
// stated here and in the README: read the lease metadata (id, owner, expiry, counts) and the audit view, nothing else; each read is audited;
// no resource id, name or content is ever shown; the audit keeps a ring per subject so that one identity cannot evict another's records.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, seed, withApp } = require('./helpers.cjs');

const LEASE_KEYS = ['counts', 'expiresAtMs', 'id', 'owner'];
const AUDIT_KEYS = ['code', 'method', 'outcome', 'role', 'route', 'seq', 'subject'];
const lines = (answer) => answer.json.items;
const strings = (value) => (typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : []);

test('the operator reads the metadata of every live lease and nothing else: owner, expiry and counts, never an id, a name or a content of a resource', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  assert.equal((await call(context, tokens['conductor-b'], 'POST', `/v1/leases/${ids.b.lease}/runs`, { name: 'secret-name', units: 3 })).status, 200);
  const answer = await call(context, tokens.operator, 'GET', '/v1/operator/leases');
  assert.equal(answer.status, 200);
  assert.equal(answer.json.total, 2);
  for (const item of lines(answer)) assert.deepEqual(Object.keys(item).sort(), LEASE_KEYS);
  const byId = Object.fromEntries(lines(answer).map((item) => [item.id, item]));
  assert.equal(byId[ids.a.lease].owner, 'conductor-a');
  assert.equal(byId[ids.b.lease].owner, 'conductor-b');
  assert.deepEqual(byId[ids.b.lease].counts, { runs: 2, scratches: 1, exports: 1 });
  const shown = strings(answer.json);
  for (const secret of [ids.a.run, ids.a.scratch, ids.a.export, ids.b.run, ids.b.scratch, ids.b.export, 'secret-name', 'run-a', 'scratch-b', 'export-b', 'lease-a', 'lease-b']) {
    assert.equal(shown.includes(secret), false, `the operator view must not show ${secret}`);
  }
}));

test('the operator view lists only live leases, pages them and refuses every other query', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const short = await call(context, tokens['conductor-a'], 'POST', '/v1/leases', { name: 'short', ttlMs: 1000 });
  assert.equal((await call(context, tokens.operator, 'GET', '/v1/operator/leases')).json.total, 3);
  context.clock.advance(1001);
  const live = await call(context, tokens.operator, 'GET', '/v1/operator/leases');
  assert.deepEqual(lines(live).map((item) => item.id).sort(), [ids.a.lease, ids.b.lease].sort());
  assert.equal(live.text.includes(short.json.lease.id), false, 'an expired lease is not listed');
  const paged = await call(context, tokens.operator, 'GET', '/v1/operator/leases?limit=1&offset=1');
  assert.equal(paged.json.total, 2);
  assert.equal(lines(paged).length, 1);
  for (const query of ['owner=conductor-a', 'sort=owner', 'q=a', 'limit=0', 'limit=1&limit=2', 'x=1']) {
    const answer = await call(context, tokens.operator, 'GET', `/v1/operator/leases?${query}`);
    assert.equal(answer.status, 400, query);
    assert.equal(answer.json.error.code, 'QUERY_REJECTED');
  }
}));

test('every operator read is itself audited, and a refused attempt by the operator is audited with the server-derived subject', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  await call(context, tokens.operator, 'GET', '/v1/operator/leases');
  await call(context, tokens.operator, 'GET', `/v1/leases/${ids.a.lease}`);
  await call(context, tokens['conductor-b'], 'GET', `/v1/leases/${ids.a.lease}`);
  const audit = await call(context, tokens.operator, 'GET', '/v1/operator/audit');
  assert.equal(audit.status, 200);
  for (const item of lines(audit)) assert.deepEqual(Object.keys(item).sort(), AUDIT_KEYS);
  const mine = lines(audit).filter((item) => item.subject === 'operator').map(({ route, method, outcome, code, role }) => ({ route, method, outcome, code, role }));
  assert.deepEqual(mine, [
    { route: 'operator.leases', method: 'GET', outcome: 'read', code: 'ok', role: 'operator' },
    { route: 'lease.read', method: 'GET', outcome: 'refused', code: 'ROLE_FORBIDDEN', role: 'operator' },
    { route: 'operator.audit', method: 'GET', outcome: 'read', code: 'ok', role: 'operator' }
  ]);
  const refused = lines(audit).filter((item) => item.subject === 'conductor-b' && item.outcome === 'refused');
  assert.deepEqual(refused.map((item) => [item.route, item.code]), [['lease.read', 'TARGET_NOT_FOUND']]);
  const applied = lines(audit).filter((item) => item.outcome === 'applied');
  assert.equal(applied.length, 8, 'the eight creations of the seed');
  assert.equal(audit.text.includes(ids.a.lease), false, 'no id of a target is ever recorded');
}));

test('the audit view is for the operator only and never shows client-supplied text', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  await call(context, tokens['conductor-a'], 'POST', `/v1/leases/${ids.a.lease}/runs`, { name: 'hostile-name-1', units: 2 });
  await call(context, tokens['conductor-a'], 'GET', `/v1/leases/${ids.a.lease}/runs?q=hostile`, undefined, { 'X-Owner': '<script>', 'User-Agent': 'evil-agent' });
  await call(context, null, 'GET', '/v1/operator/audit', undefined, { 'X-Forwarded-For': 'evil-forward' });
  const audit = await call(context, tokens.operator, 'GET', '/v1/operator/audit');
  for (const secret of ['hostile-name-1', '<script>', 'evil-agent', 'evil-forward', ids.a.run, ids.b.lease]) assert.equal(audit.text.includes(secret), false, secret);
  for (const identity of ['conductor-a', 'conductor-b', 'visitor']) assert.equal((await call(context, tokens[identity], 'GET', '/v1/operator/audit')).status, 403);
  assert.equal((await call(context, null, 'GET', '/v1/operator/audit')).status, 401);
}));

test('one identity cannot evict another identity\'s audit records: every subject has its own ring and anonymous refusals have a separate one', () => withApp({ app: { limits: { auditEntries: 5, anonymousEntries: 3 } } }, async (context) => {
  const { tokens, ids } = await seed(context);
  await call(context, tokens['conductor-b'], 'GET', `/v1/leases/${ids.a.lease}`);
  const noise = [];
  for (let index = 0; index < 20; index += 1) noise.push(call(context, tokens.visitor, 'GET', '/v1/leases'));
  for (let index = 0; index < 20; index += 1) noise.push(call(context, null, 'GET', '/v1/leases'));
  await Promise.all(noise);
  const log = context.app.auditLog();
  assert.equal(log.filter((entry) => entry.subject === 'visitor').length, 5, 'the visitor ring is capped');
  assert.equal(log.filter((entry) => entry.subject === null).length, 3, 'the anonymous ring is capped');
  assert.deepEqual(log.filter((entry) => entry.subject === 'conductor-b' && entry.code === 'TARGET_NOT_FOUND').length, 1, 'the denial of conductor-b survived the noise');
  assert.equal(log.filter((entry) => entry.subject === 'conductor-a').length, 4, 'conductor-a keeps its four records (below its ring)');
  assert.equal(new Set(log.map((entry) => entry.seq)).size, log.length, 'sequence numbers are unique');
}));
