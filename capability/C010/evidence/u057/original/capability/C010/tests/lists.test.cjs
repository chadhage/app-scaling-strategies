'use strict';

// C010 scenario "Lists, counts, pagination, search, filters and sort show only the caller's resources": every list, count and page is computed
// over the caller's own items, whatever the other conductor holds, and a query that names an owner, a lease or a method is refused.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, same, seed, withApp } = require('./helpers.cjs');

async function crowd(context, tokens, ids) {
  // Both conductors also hold resources with the same names; conductor-b has five runs, conductor-a twelve.
  for (const [name, key, count] of [['conductor-a', 'a', 12], ['conductor-b', 'b', 5]]) {
    for (let index = 0; index < count; index += 1) {
      const answer = await call(context, tokens[name], 'POST', `/v1/leases/${ids[key].lease}/runs`, { name: index === 0 ? 'shared' : `crowd-${String(index).padStart(2, '0')}-${key}`, units: index + 1 });
      assert.equal(answer.status, 200, answer.text);
    }
    assert.equal((await call(context, tokens[name], 'POST', `/v1/leases/${ids[key].lease}/scratches`, { name: 'shared' })).status, 200);
  }
}
const list = (context, token, route) => call(context, token, 'GET', route);
const idsOf = (answer) => answer.json.items.map((item) => item.id);

test('a conductor lists only its own leases and the total counts only them', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const second = await call(context, tokens['conductor-a'], 'POST', '/v1/leases', { name: 'second', ttlMs: 60000 });
  assert.equal(second.status, 200);
  const mine = await list(context, tokens['conductor-b'], '/v1/leases');
  assert.equal(mine.status, 200);
  assert.deepEqual(idsOf(mine), [ids.b.lease]);
  assert.equal(mine.json.total, 1);
  const theirs = await list(context, tokens['conductor-a'], '/v1/leases');
  assert.equal(theirs.json.total, 2);
  assert.equal(theirs.text.includes(ids.b.lease), false);
}));

test('lists of every kind, pages, searches, filters and sorts contain only the caller\'s items and its own totals', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  await crowd(context, tokens, ids);
  const owned = (key) => new Set(context.app.snapshot().leases.find((lease) => lease.id === ids[key].lease).runs.map((run) => run.id));
  const bRuns = owned('b');
  const base = `/v1/leases/${ids.b.lease}/runs`;
  const everything = await list(context, tokens['conductor-b'], base);
  assert.equal(everything.json.total, 6);
  assert.deepEqual(new Set(idsOf(everything)), bRuns);
  const paged = [];
  for (const offset of [0, 2, 4, 6]) {
    const page = await list(context, tokens['conductor-b'], `${base}?limit=2&offset=${offset}`);
    assert.equal(page.json.total, 6, 'the total does not depend on the page');
    assert.equal(page.json.limit, 2);
    assert.equal(page.json.offset, offset);
    paged.push(...idsOf(page));
  }
  assert.deepEqual(paged, idsOf(everything), 'the pages tile the caller\'s own list in order');
  const found = await list(context, tokens['conductor-b'], `${base}?q=shared`);
  assert.equal(found.json.total, 1);
  assert.deepEqual(idsOf(found).filter((id) => !bRuns.has(id)), []);
  assert.equal((await list(context, tokens['conductor-b'], `${base}?q=crowd-11-a`)).json.total, 0, 'a name that only the other conductor holds is not found');
  assert.equal((await list(context, tokens['conductor-b'], `${base}?q=crowd`)).json.total, 4);
  const sorted = await list(context, tokens['conductor-b'], `${base}?sort=name`);
  assert.deepEqual(sorted.json.items.map((item) => item.name), ['crowd-01-b', 'crowd-02-b', 'crowd-03-b', 'crowd-04-b', 'run-b', 'shared'].sort());
  assert.deepEqual(new Set(idsOf(sorted)), bRuns);
  const lease = await call(context, tokens['conductor-b'], 'GET', `/v1/leases/${ids.b.lease}`);
  assert.deepEqual(lease.json.lease.counts, { runs: 6, scratches: 2, exports: 1 }, 'the counts of a lease are its own');
  for (const answer of [everything, found, sorted, lease]) assert.equal(answer.text.includes('-a"'), false, 'no name of the other conductor');
}));

test('the answers to one conductor do not change when the other conductor changes its own resources', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const routes = ['/v1/leases', `/v1/leases/${ids.b.lease}`, `/v1/leases/${ids.b.lease}/runs`, `/v1/leases/${ids.b.lease}/runs?q=run&limit=1`, `/v1/leases/${ids.b.lease}/scratches?sort=name`, `/v1/leases/${ids.b.lease}/exports`];
  const before = [];
  for (const route of routes) before.push((await list(context, tokens['conductor-b'], route)).text);
  assert.equal((await call(context, tokens['conductor-a'], 'POST', '/v1/leases', { name: 'extra', ttlMs: 60000 })).status, 200);
  for (let index = 0; index < 12; index += 1) assert.equal((await call(context, tokens['conductor-a'], 'POST', `/v1/leases/${ids.a.lease}/runs`, { name: `crowd-${index}`, units: 1 })).status, 200);
  assert.equal((await call(context, tokens['conductor-a'], 'DELETE', `/v1/leases/${ids.a.lease}/scratches/${ids.a.scratch}`)).status, 200);
  for (const [index, route] of routes.entries()) {
    assert.equal((await list(context, tokens['conductor-b'], route)).text, before[index], `${route} is unaffected by the other conductor`);
  }
}));

const REFUSED_QUERIES = [
  'owner=conductor-a', `lease=LEASE`, 'subject=conductor-a', 'role=operator', '_method=DELETE', 'method=DELETE', 'limit=1&limit=2', 'limit=0', 'limit=-1', 'limit=51', 'limit=abc',
  'limit=', 'offset=-1', 'offset=1.5', 'offset=99999999999', 'sort=owner', 'sort=name&sort=created', 'q=', 'q=UPPER', `q=${'a'.repeat(33)}`, 'q=%00', 'x=1', '__proto__=x'
];

test('a list query that names an owner, a lease, a method or anything outside the closed vocabulary is refused with no effect', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  for (const route of ['/v1/leases', `/v1/leases/${ids.b.lease}/runs`, `/v1/leases/${ids.b.lease}/scratches`, `/v1/leases/${ids.b.lease}/exports`]) {
    for (const query of REFUSED_QUERIES) {
      const answer = await call(context, tokens['conductor-b'], 'GET', `${route}?${query.replace('LEASE', ids.a.lease)}`);
      assert.equal(answer.status, 400, `${route}?${query}: ${answer.text}`);
      assert.equal(answer.json.error.code, 'QUERY_REJECTED', `${route}?${query}`);
      assert.equal(answer.headers.connection, 'close');
      assert.equal(answer.text.includes(ids.a.lease), false);
    }
  }
  assert.deepEqual(context.app.snapshot(), before);
}));

test('a route that takes no query refuses one, whoever asks', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  for (const [method, route] of [['GET', `/v1/leases/${ids.b.lease}?owner=conductor-a`], ['DELETE', `/v1/leases/${ids.b.lease}?x=1`], ['GET', `/v1/leases/${ids.b.lease}/runs/${ids.b.run}?x=1`], ['POST', '/v1/leases?x=1'], ['GET', '/v1/me?x=1']]) {
    const answer = await call(context, tokens['conductor-b'], method, route, method === 'POST' ? { name: 'x', ttlMs: 1000 } : undefined);
    assert.equal(answer.status, 400, `${method} ${route}`);
    assert.equal(answer.json.error.code, 'QUERY_NOT_ALLOWED');
  }
  assert.deepEqual(context.app.snapshot(), before);
}));
