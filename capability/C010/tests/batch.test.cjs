'use strict';

// C010 scenarios "A batch naming one own and one foreign target is refused as a whole" and "A resource may not reference a foreign resource":
// a batch is all or nothing, every target of every operation is decided against the caller's own live leases, and an own resource that names
// another resource (an export of a run) resolves that name inside the same lease only.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, same, seed, target, withApp } = require('./helpers.cjs');

const op = (verb, ids, kind, extra = {}) => ({ op: verb, lease: ids.lease, kind, id: ids[kind], ...extra });
const batch = (context, token, ops) => call(context, token, 'POST', '/v1/batch', { ops });
const lease = (context, id) => context.app.snapshot().leases.find((entry) => entry.id === id);

test('a batch of own targets is applied as a whole, in order', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const answer = await batch(context, tokens['conductor-b'], [op('update', ids.b, 'run', { patch: { units: 7 } }), op('delete', ids.b, 'scratch'), op('cancel', ids.b, 'run')]);
  assert.equal(answer.status, 200, answer.text);
  assert.equal(answer.json.applied, 3);
  const mine = lease(context, ids.b.lease);
  assert.deepEqual([mine.runs[0].units, mine.runs[0].state, mine.scratches.length], [7, 'cancelled', 0]);
}));

test('one foreign target anywhere in a batch refuses the whole batch with the uniform refusal and no effect, for every operation and every position', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  const own = [op('update', ids.b, 'run', { patch: { units: 9 } }), op('delete', ids.b, 'scratch'), op('cancel', ids.b, 'run')];
  const foreign = [op('delete', ids.a, 'run'), op('cancel', ids.a, 'run'), op('update', ids.a, 'run', { patch: { units: 1 } }), op('delete', ids.a, 'scratch'), op('delete', ids.a, 'export'), op('update', ids.a, 'scratch', { patch: { name: 'x' } })];
  let first = null;
  for (const bad of foreign) {
    for (const position of [0, 1, own.length]) {
      const ops = [...own.slice(0, position), bad, ...own.slice(position)];
      const answer = await batch(context, tokens['conductor-b'], ops);
      assert.equal(answer.status, 404, JSON.stringify(ops).slice(0, 120));
      assert.equal(answer.json.error.code, 'TARGET_NOT_FOUND');
      assert.equal(answer.headers.connection, 'close');
      first ??= answer.text;
      assert.equal(answer.text, first, 'the same bytes whatever the foreign target, operation and position');
      assert.deepEqual(context.app.snapshot(), before, 'not even the own operations were applied');
    }
  }
}));

test('a batch that fails on a conflict of its own targets is refused as a whole with 409 and no effect', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  const answer = await batch(context, tokens['conductor-b'], [op('update', ids.b, 'run', { patch: { units: 2 } }), op('cancel', ids.b, 'run'), op('cancel', ids.b, 'run')]);
  assert.equal(answer.status, 409);
  assert.equal(answer.json.error.code, 'STATE_CONFLICT');
  assert.deepEqual(context.app.snapshot(), before);
  const twice = await batch(context, tokens['conductor-b'], [op('delete', ids.b, 'scratch'), op('delete', ids.b, 'scratch')]);
  assert.equal(twice.status, 404, 'the second operation sees the draft: the scratch is already gone');
  assert.deepEqual(context.app.snapshot(), before);
}));

test('a batch may span several leases of the same conductor, and one foreign lease among them still refuses all', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const second = (await call(context, tokens['conductor-b'], 'POST', '/v1/leases', { name: 'second', ttlMs: 60000 })).json.lease;
  const scratch = (await call(context, tokens['conductor-b'], 'POST', `/v1/leases/${second.id}/scratches`, { name: 'other' })).json.resource;
  const own = [op('delete', ids.b, 'scratch'), { op: 'delete', lease: second.id, kind: 'scratch', id: scratch.id }];
  const before = same(context.app.snapshot());
  const refused = await batch(context, tokens['conductor-b'], [...own, op('delete', ids.a, 'scratch')]);
  assert.equal(refused.status, 404);
  assert.deepEqual(context.app.snapshot(), before);
  const done = await batch(context, tokens['conductor-b'], own);
  assert.equal(done.status, 200);
  assert.equal(done.json.applied, 2);
  assert.equal(lease(context, second.id).scratches.length, 0);
}));

const INVALID = [
  [[], 'INPUT_INVALID'], [Array.from({ length: 11 }, () => ({ op: 'delete', lease: 'lease-00000000', kind: 'scratch', id: 'scratch-00000000' })), 'INPUT_INVALID'],
  ['x', 'INPUT_INVALID'], [[null], 'INPUT_INVALID'], [[[]], 'INPUT_INVALID'], [[{ op: 'create', lease: 'lease-00000000', kind: 'scratch', id: 'scratch-00000000' }], 'INPUT_INVALID'],
  [[{ op: 'delete', lease: 'lease-0000000', kind: 'scratch', id: 'scratch-00000000' }], 'INPUT_INVALID'], [[{ op: 'delete', lease: 'lease-00000000', kind: 'lease', id: 'scratch-00000000' }], 'INPUT_INVALID'],
  [[{ op: 'delete', lease: 'lease-00000000', kind: 'run', id: 'scratch-00000000' }], 'INPUT_INVALID'], [[{ op: 'delete', lease: 'lease-00000000', kind: 'scratch' }], 'INPUT_MISSING_FIELD'],
  [[{ op: 'delete', lease: 'lease-00000000', kind: 'scratch', id: 'scratch-00000000', extra: 1 }], 'INPUT_UNKNOWN_FIELD'], [[{ op: 'delete', lease: 'lease-00000000', kind: 'scratch', id: 'scratch-00000000', owner: 'x' }], 'IDENTITY_CLAIM_REJECTED'],
  [[{ op: 'delete', lease: 'lease-00000000', kind: 'scratch', id: 'scratch-00000000', patch: {} }], 'INPUT_UNKNOWN_FIELD'], [[{ op: 'update', lease: 'lease-00000000', kind: 'scratch', id: 'scratch-00000000' }], 'INPUT_MISSING_FIELD'],
  [[{ op: 'update', lease: 'lease-00000000', kind: 'scratch', id: 'scratch-00000000', patch: { units: 1 } }], 'INPUT_UNKNOWN_FIELD'], [[{ op: 'update', lease: 'lease-00000000', kind: 'scratch', id: 'scratch-00000000', patch: { owner: 'x' } }], 'IDENTITY_CLAIM_REJECTED'],
  [[{ op: 'update', lease: 'lease-00000000', kind: 'export', id: 'export-00000000', patch: { name: 'x' } }], 'INPUT_INVALID'], [[{ op: 'cancel', lease: 'lease-00000000', kind: 'scratch', id: 'scratch-00000000' }], 'INPUT_INVALID'],
  [[{ op: 'update', lease: 'lease-00000000', kind: 'run', id: 'run-00000000', patch: { units: 0 } }], 'INPUT_INVALID'], [[{ op: 'update', lease: 'lease-00000000', kind: 'run', id: 'run-00000000', patch: {} }], 'INPUT_INVALID']
];

test('a malformed batch is refused by its shape before any target is looked at', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  const before = same(context.app.snapshot());
  for (const [ops, code] of INVALID) {
    const answer = await call(context, tokens['conductor-b'], 'POST', '/v1/batch', { ops });
    assert.equal(answer.status, 400, JSON.stringify(ops).slice(0, 100));
    assert.equal(answer.json.error.code, code, JSON.stringify(ops).slice(0, 100));
  }
  for (const body of ['{}', '[]', '{"ops":[]', 'null', '"x"']) assert.equal((await call(context, tokens['conductor-b'], 'POST', '/v1/batch', body)).status, 400, body);
  assert.deepEqual(context.app.snapshot(), before);
}));

test('an export names a run of its own lease; a foreign run and a run of another own lease are refused, and deleting the run removes its exports', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const base = `/v1/leases/${ids.b.lease}/exports`;
  const ok = await call(context, tokens['conductor-b'], 'POST', base, { name: 'again', runId: ids.b.run });
  assert.equal(ok.status, 200);
  assert.equal(ok.json.resource.runId, ids.b.run);
  const before = same(context.app.snapshot());
  for (const runId of [ids.a.run, 'run-ffffffffffffffff']) {
    const refused = await call(context, tokens['conductor-b'], 'POST', base, { name: 'evil', runId });
    assert.equal(refused.status, 404);
    assert.equal(refused.json.error.code, 'TARGET_NOT_FOUND');
  }
  assert.deepEqual(context.app.snapshot(), before);
  const gone = await call(context, tokens['conductor-b'], 'DELETE', target(ids.b, 'run'));
  assert.equal(gone.status, 200);
  assert.equal(lease(context, ids.b.lease).exports.length, 0, 'the exports of a deleted run are removed with it');
  assert.equal((await call(context, tokens['conductor-b'], 'GET', target(ids.b, 'export'))).status, 404);
  assert.equal(lease(context, ids.a.lease).exports.length, 1, 'the other conductor is untouched');
}));

test('cancel and update follow the state of the run: a second cancel and an update of a cancelled run are conflicts with no effect', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const run = target(ids.b, 'run');
  assert.equal((await call(context, tokens['conductor-b'], 'POST', `${run}/cancel`)).json.resource.state, 'cancelled');
  const before = same(context.app.snapshot());
  for (const [method, route, body] of [['POST', `${run}/cancel`], ['PATCH', run, { units: 3 }], ['PATCH', run, { name: 'renamed' }]]) {
    const answer = await call(context, tokens['conductor-b'], method, route, body);
    assert.equal(answer.status, 409, `${method} ${route}`);
    assert.equal(answer.json.error.code, 'STATE_CONFLICT');
  }
  assert.deepEqual(context.app.snapshot(), before);
}));

test('ending a lease removes it with every resource, answers like an absent lease afterwards and leaves the other conductor untouched', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const answer = await call(context, tokens['conductor-b'], 'DELETE', target(ids.b, 'lease'));
  assert.equal(answer.status, 200);
  assert.equal(answer.json.ended, true);
  assert.equal(lease(context, ids.b.lease), undefined);
  for (const route of [target(ids.b, 'lease'), target(ids.b, 'run'), `/v1/leases/${ids.b.lease}/runs`]) assert.equal((await call(context, tokens['conductor-b'], 'GET', route)).json.error.code, 'TARGET_NOT_FOUND');
  assert.equal(lease(context, ids.a.lease).runs.length, 1);
  assert.equal((await call(context, tokens['conductor-a'], 'GET', target(ids.a, 'lease'))).status, 200);
}));
