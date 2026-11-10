'use strict';

// C010 scenario "A foreign resource and an absent resource are indistinguishable": for every route and verb the answer to a target of another
// lease and the answers to targets that exist nowhere (absent lease, absent resource, own lease with an absent or foreign resource) carry
// the same status, the same headers (the date apart) and byte-identical bodies, and echo nothing of the target.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, seed, withApp } = require('./helpers.cjs');

const ABSENT = Object.freeze({ lease: 'lease-ffffffffffffffff', run: 'run-ffffffffffffffff', scratch: 'scratch-ffffffffffffffff', export: 'export-ffffffffffffffff' });
const LEASE_ROUTES = [
  ['GET', (l) => `/v1/leases/${l}`], ['DELETE', (l) => `/v1/leases/${l}`],
  ['GET', (l) => `/v1/leases/${l}/runs`], ['GET', (l) => `/v1/leases/${l}/scratches`], ['GET', (l) => `/v1/leases/${l}/exports`],
  ['POST', (l) => `/v1/leases/${l}/runs`, { name: 'probe', units: 1 }], ['POST', (l) => `/v1/leases/${l}/scratches`, { name: 'probe' }],
  ['POST', (l) => `/v1/leases/${l}/exports`, { name: 'probe', runId: ABSENT.run }]
];
const ITEM_ROUTES = [
  ['runs', 'GET'], ['runs', 'PATCH', { units: 2 }], ['runs', 'DELETE'], ['runs', 'POST', undefined, '/cancel'],
  ['scratches', 'GET'], ['scratches', 'PATCH', { name: 'probe' }], ['scratches', 'DELETE'],
  ['exports', 'GET'], ['exports', 'DELETE']
].map(([kind, method, body, tail = '']) => [method, (l, i) => `/v1/leases/${l}/${kind}/${i}${tail}`, body, kind]);

const withoutDate = (answer) => answer.rawHeaders.reduce((lines, value, index, all) => (index % 2 === 0 && value.toLowerCase() !== 'date' ? [...lines, `${value}: ${all[index + 1]}`] : lines), []);
const fingerprint = (answer) => JSON.stringify({ status: answer.status, headers: withoutDate(answer), body: answer.text });

function assertUniform(answers, label, secrets) {
  const [first, ...rest] = answers;
  assert.equal(first.status, 404, `${label}: ${first.text}`);
  assert.equal(first.json.error.code, 'TARGET_NOT_FOUND', label);
  assert.equal(first.headers.connection, 'close');
  for (const other of rest) assert.equal(fingerprint(other), fingerprint(first), `${label}: the answers differ`);
  for (const secret of secrets) assert.equal(first.text.includes(secret), false, `${label}: the refusal echoes ${secret}`);
  assert.equal(first.headers.etag, undefined, 'no ETag');
  assert.equal(first.headers['last-modified'], undefined, 'no Last-Modified');
}

test('lease routes: a foreign lease, an absent lease and a lease that never existed get byte-identical refusals on every verb', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  for (const [method, route, body] of LEASE_ROUTES) {
    const variants = [ids.a.lease, ABSENT.lease, 'lease-0123456789abcdef'];
    const answers = [];
    for (const lease of variants) answers.push(await call(context, tokens['conductor-b'], method, route(lease), body));
    assertUniform(answers, `${method} ${route('LEASE')}`, [ids.a.lease, ids.a.run, 'conductor-a', 'lease-a']);
  }
}));

test('item routes: foreign, absent and mismatched targets (lease and resource each foreign or absent, own lease with a foreign or absent resource) are indistinguishable', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const idOf = { runs: 'run', scratches: 'scratch', exports: 'export' };
  for (const [method, route, body, kind] of ITEM_ROUTES) {
    const own = idOf[kind];
    const variants = [[ids.a.lease, ids.a[own]], [ABSENT.lease, ids.a[own]], [ABSENT.lease, ABSENT[own]], [ids.a.lease, ABSENT[own]], [ids.b.lease, ABSENT[own]], [ids.b.lease, ids.a[own]]];
    const answers = [];
    for (const [lease, item] of variants) answers.push(await call(context, tokens['conductor-b'], method, route(lease, item), body));
    assertUniform(answers, `${method} ${route('LEASE', 'ITEM')}`, [ids.a.lease, ids.a[own], 'conductor-a']);
  }
}));

test('a reference to a foreign run, to a run of another own lease and to a run that exists nowhere gets the same refusal', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const second = (await call(context, tokens['conductor-b'], 'POST', '/v1/leases', { name: 'second', ttlMs: 60000 })).json.lease;
  const secondRun = (await call(context, tokens['conductor-b'], 'POST', `/v1/leases/${second.id}/runs`, { name: 'second-run', units: 1 })).json.resource;
  const route = `/v1/leases/${ids.b.lease}/exports`;
  const answers = [];
  for (const runId of [ids.a.run, ABSENT.run, secondRun.id]) answers.push(await call(context, tokens['conductor-b'], 'POST', route, { name: 'probe', runId }));
  assertUniform(answers, 'POST exports with a foreign, absent or other-lease runId', [ids.a.run, secondRun.id, 'conductor-a']);
  assert.equal(context.app.snapshot().leases.find((lease) => lease.id === ids.b.lease).exports.length, 1, 'no export was created');
}));

test('a batch naming a foreign target is refused with the same bytes as a batch naming an absent target', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const own = { op: 'delete', lease: ids.b.lease, kind: 'scratch', id: ids.b.scratch };
  const answers = [];
  for (const operation of [{ op: 'delete', lease: ids.a.lease, kind: 'run', id: ids.a.run }, { op: 'delete', lease: ids.b.lease, kind: 'run', id: ABSENT.run }, { op: 'delete', lease: ABSENT.lease, kind: 'run', id: ABSENT.run }]) {
    answers.push(await call(context, tokens['conductor-b'], 'POST', '/v1/batch', { ops: [own, operation] }));
  }
  assertUniform(answers, 'POST /v1/batch', [ids.a.lease, ids.a.run, 'conductor-a']);
}));

test('conditional headers change nothing: a foreign target stays the same refusal, an own target is never answered 304, and no validator is ever sent', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const conditional = [{ 'If-None-Match': '*' }, { 'If-None-Match': '"1"' }, { 'If-Match': '*' }, { 'If-Modified-Since': 'Wed, 21 Oct 2037 07:28:00 GMT' }, { 'If-Unmodified-Since': 'Wed, 21 Oct 1999 07:28:00 GMT' }, { 'If-Range': '"1"' }];
  const route = (lease, run) => `/v1/leases/${lease}/runs/${run}`;
  const plainForeign = await call(context, tokens['conductor-b'], 'GET', route(ids.a.lease, ids.a.run));
  const plainOwn = await call(context, tokens['conductor-b'], 'GET', route(ids.b.lease, ids.b.run));
  assert.equal(plainOwn.status, 200);
  assert.equal(plainForeign.status, 404, 'the foreign target is refused before any conditional header is looked at');
  assert.equal(plainForeign.json.error.code, 'TARGET_NOT_FOUND');
  for (const headers of conditional) {
    const foreign = await call(context, tokens['conductor-b'], 'GET', route(ids.a.lease, ids.a.run), undefined, headers);
    assert.equal(fingerprint(foreign), fingerprint(plainForeign), JSON.stringify(headers));
    const own = await call(context, tokens['conductor-b'], 'GET', route(ids.b.lease, ids.b.run), undefined, headers);
    assert.equal(own.status, 200, `${JSON.stringify(headers)} must not turn the read into a conditional answer`);
    assert.equal(own.headers.etag, undefined);
    assert.equal(own.headers['last-modified'], undefined);
    assert.equal(own.text, plainOwn.text);
  }
}));
