'use strict';

// The contract: the closed route table, the deny-by-default role table, the id shapes, the query vocabulary, the body schemas and the typed
// codes. Pure functions, so every row of every table is a case here (the same rules are proved over HTTP in the other suites).
const assert = require('node:assert/strict');
const test = require('node:test');
const { CODES } = require('../codes.cjs');
const contract = require('../contract.js');
const { CODES: shared } = require('../../C009/codes.cjs');

const HEX = '0123456789abcdef';
const ID = { lease: `lease-${HEX}`, run: `run-${HEX}`, scratch: `scratch-${HEX}`, export: `export-${HEX}` };

test('every route has a unique method and path, every API route has a role entry, and a role entry names a real route (deny by default)', () => {
  const names = new Set(contract.routes.map((route) => route.name));
  for (const route of contract.routes.filter((entry) => !entry.public)) assert.ok(Object.hasOwn(contract.roleTable, route.name), `${route.name} has no role entry`);
  for (const name of Object.keys(contract.roleTable)) assert.ok(names.has(name), `${name} is not a route`);
  assert.equal(new Set(contract.routes.map((route) => `${route.method} ${route.path.source}`)).size, contract.routes.length, 'no two routes share a method and a path');
  assert.deepEqual(Object.keys(contract.roleTable).filter((name) => contract.roleTable[name].roles.includes('visitor')), ['me'], 'a visitor holds one route only');
  assert.deepEqual(Object.keys(contract.roleTable).filter((name) => contract.roleTable[name].roles.includes('operator')).sort(), ['me', 'operator.audit', 'operator.leases']);
  for (const name of Object.keys(contract.roleTable).filter((entry) => entry !== 'me' && !entry.startsWith('operator.'))) assert.deepEqual(contract.roleTable[name].roles, ['conductor'], name);
  for (const route of contract.routes) assert.equal(route.mutating, ['POST', 'PATCH', 'DELETE'].includes(route.method), route.name);
  assert.ok(Object.isFrozen(contract) && Object.isFrozen(contract.routes) && Object.isFrozen(contract.roleTable) && Object.isFrozen(contract.roleTable.me.roles));
});

test('a path resolves to every route that serves it and to nothing else: id shapes, kinds and prefixes must match exactly', () => {
  const resolved = (path) => contract.resolve(path).routes.map((route) => `${route.method} ${route.name}`).sort();
  assert.deepEqual(resolved('/v1/leases'), ['GET lease.list', 'POST lease.create']);
  assert.deepEqual(resolved(`/v1/leases/${ID.lease}`), ['DELETE lease.end', 'GET lease.read']);
  assert.deepEqual(resolved(`/v1/leases/${ID.lease}/runs`), ['GET resource.list', 'POST resource.create']);
  assert.deepEqual(resolved(`/v1/leases/${ID.lease}/runs/${ID.run}`), ['DELETE resource.delete', 'GET resource.read', 'PATCH resource.update']);
  assert.deepEqual(resolved(`/v1/leases/${ID.lease}/scratches/${ID.scratch}`), ['DELETE resource.delete', 'GET resource.read', 'PATCH resource.update']);
  assert.deepEqual(resolved(`/v1/leases/${ID.lease}/exports/${ID.export}`), ['DELETE resource.delete', 'GET resource.read'], 'an export cannot be updated');
  assert.deepEqual(resolved(`/v1/leases/${ID.lease}/runs/${ID.run}/cancel`), ['POST run.cancel']);
  assert.deepEqual(resolved('/v1/batch'), ['POST batch']);
  assert.deepEqual(resolved('/v1/me'), ['GET me']);
  assert.deepEqual(resolved('/'), ['GET asset.index']);
  assert.deepEqual(resolved('/scope.json'), ['GET scope']);
  const found = contract.resolve(`/v1/leases/${ID.lease}/runs/${ID.run}`);
  assert.deepEqual(found.params, { lease: ID.lease, id: ID.run });
  for (const bad of [`/v1/leases/${ID.lease}/runs/${ID.scratch}`, `/v1/leases/${ID.lease}/scratches/${ID.run}`, `/v1/leases/${ID.run}`, '/v1/leases/lease-1234567', `/v1/leases/lease-${'a'.repeat(33)}`,
    `/v1/leases/${ID.lease.toUpperCase()}`, `/v1/leases/${ID.lease}/`, `/v1/leases/${ID.lease}/runs/${ID.run}/cancel/x`, `/v1/leases/${ID.lease}/scratches/${ID.scratch}/cancel`, '/v1/state', '/V1/me', '/v1/me/']) {
    assert.deepEqual(resolved(bad), [], bad);
  }
  assert.equal(contract.allowedMethods(contract.resolve(`/v1/leases/${ID.lease}/runs/${ID.run}`).routes), 'DELETE, GET, PATCH');
});

test('ids: a shape is a kind, a dash and 8 to 32 lowercase hex digits, nothing else', () => {
  for (const [kind, id] of Object.entries(ID)) assert.equal(contract.isId(kind, id), true, kind);
  assert.equal(contract.isId('run', `run-${'f'.repeat(8)}`), true);
  assert.equal(contract.isId('run', `run-${'f'.repeat(32)}`), true);
  for (const bad of [`run-${'f'.repeat(7)}`, `run-${'f'.repeat(33)}`, `run-${'F'.repeat(8)}`, 'run-', 'run-ggggggggg', ` run-${HEX}`, `run-${HEX}\n`, ID.scratch, 7, null, undefined, {}, [ID.run]]) assert.equal(contract.isId('run', bad), false, String(bad));
  assert.equal(contract.isId('nothing', ID.run), false);
  assert.equal(contract.isId('__proto__', ID.run), false);
  assert.equal(contract.isName('a'), true);
  assert.equal(contract.isName('a'.repeat(32)), true);
  for (const bad of ['', 'a'.repeat(33), '-a', 'A', 'a b', 'a_b', 'é', 5, null]) assert.equal(contract.isName(bad), false, String(bad));
});

const LIST = contract.routes.find((route) => route.name === 'lease.list');
const PAGE_ONLY = contract.routes.find((route) => route.name === 'operator.leases');
const NONE = contract.routes.find((route) => route.name === 'lease.read');

test('the query is a closed vocabulary per route: defaults, bounds, repeats and every name outside it', () => {
  assert.deepEqual(contract.parseQuery(LIST, ''), { ok: true, value: { limit: 20, offset: 0, sort: 'created', q: null } });
  assert.deepEqual(contract.parseQuery(LIST, 'limit=50&offset=10000&sort=name&q=a-1').value, { limit: 50, offset: 10000, sort: 'name', q: 'a-1' });
  assert.deepEqual(contract.parseQuery(LIST, 'limit=1&sort=created').value, { limit: 1, offset: 0, sort: 'created', q: null });
  assert.deepEqual(contract.parseQuery(LIST, 'limit=05').value.limit, 5);
  for (const bad of ['limit=0', 'limit=51', 'limit=100', 'limit=-1', 'limit=1.5', 'limit=', 'limit=a', 'offset=10001', 'offset=100000', 'offset=-1', 'offset=', 'sort=id', 'sort=', 'q=', 'q=A', `q=${'a'.repeat(33)}`, 'q=a b',
    'owner=x', 'lease=x', '_method=DELETE', '__proto__=1', 'constructor=1', 'limit=1&limit=1', 'q=a&q=b', 'sort=name&sort=name', 'limit=1&x=1']) {
    assert.deepEqual(contract.parseQuery(LIST, bad), { ok: false, code: 'QUERY_REJECTED' }, bad);
  }
  assert.deepEqual(contract.parseQuery(PAGE_ONLY, 'limit=2&offset=1').value.limit, 2);
  for (const bad of ['sort=name', 'q=a']) assert.deepEqual(contract.parseQuery(PAGE_ONLY, bad), { ok: false, code: 'QUERY_REJECTED' }, bad);
  assert.deepEqual(contract.parseQuery(NONE, ''), { ok: true, value: {} });
  assert.deepEqual(contract.parseQuery(NONE, 'x=1'), { ok: false, code: 'QUERY_NOT_ALLOWED' });
  assert.deepEqual(contract.parseQuery(NONE, 'limit=1'), { ok: false, code: 'QUERY_NOT_ALLOWED' });
});

const RUN = `run-${HEX}`;
const bad = (code, field) => ({ ok: false, code, ...(field && { field }) });
const CASES = [
  ['lease', { name: 'a', ttlMs: 1 }, { name: 'a', ttlMs: 1 }], ['lease', { name: 'a', ttlMs: 900000 }, { name: 'a', ttlMs: 900000 }], ['lease', { name: 'a', ttlMs: 900001 }, bad('INPUT_INVALID', 'ttlMs')],
  ['lease', { name: 'a', ttlMs: 0 }, bad('INPUT_INVALID', 'ttlMs')], ['lease', { name: 'a', ttlMs: 1.5 }, bad('INPUT_INVALID', 'ttlMs')], ['lease', { name: 'A', ttlMs: 5 }, bad('INPUT_INVALID', 'name')],
  ['lease', { name: 'a' }, bad('INPUT_MISSING_FIELD', 'ttlMs')], ['lease', { ttlMs: 5 }, bad('INPUT_MISSING_FIELD', 'name')], ['lease', { name: 'a', ttlMs: 5, x: 1 }, bad('INPUT_UNKNOWN_FIELD')],
  ['lease', { name: 'a', ttlMs: 5, owner: 'x' }, bad('IDENTITY_CLAIM_REJECTED', 'owner')], ['lease', { name: 'a', ttlMs: 5, actingAs: 'x' }, bad('IDENTITY_CLAIM_REJECTED', 'actingAs')],
  ['lease', { name: 'a', ttlMs: 5, expiresAtMs: 1 }, bad('SERVER_FIELD_REJECTED', 'expiresAtMs')], ['lease', { name: 'a', ttlMs: 5, leaseId: 'x' }, bad('SERVER_FIELD_REJECTED', 'leaseId')],
  ['lease', null, bad('BODY_NOT_OBJECT')], ['lease', [], bad('BODY_NOT_OBJECT')], ['lease', 'x', bad('BODY_NOT_OBJECT')], ['lease', 7, bad('BODY_NOT_OBJECT')],
  ['run', { name: 'r', units: 100 }, { name: 'r', units: 100 }], ['run', { name: 'r', units: 101 }, bad('INPUT_INVALID', 'units')], ['run', { name: 'r', units: 0 }, bad('INPUT_INVALID', 'units')],
  ['scratch', { name: 's' }, { name: 's' }], ['scratch', { name: 's', units: 1 }, bad('INPUT_UNKNOWN_FIELD')],
  ['export', { name: 'e', runId: RUN }, { name: 'e', runId: RUN }], ['export', { name: 'e', runId: 'scratch-00000000' }, bad('INPUT_INVALID', 'runId')], ['export', { name: 'e' }, bad('INPUT_MISSING_FIELD', 'runId')],
  ['run.patch', { units: 4 }, { units: 4 }], ['run.patch', { name: 'n', units: 4 }, { name: 'n', units: 4 }], ['run.patch', {}, bad('INPUT_INVALID')], ['run.patch', { units: 0 }, bad('INPUT_INVALID', 'units')],
  ['run.patch', { id: RUN }, bad('SERVER_FIELD_REJECTED', 'id')], ['scratch.patch', { name: 'n' }, { name: 'n' }], ['scratch.patch', {}, bad('INPUT_INVALID')], ['scratch.patch', { units: 1 }, bad('INPUT_UNKNOWN_FIELD')]
];

test('body schemas: valid values pass as a copy of the schema fields only; claims, server fields, unknown, missing and invalid fields are refused by name', () => {
  for (const [schema, body, expected] of CASES) {
    const checked = contract.validateBody(schema, body);
    assert.deepEqual(checked.ok ? checked.value : checked, checked.ok ? expected : expected, `${schema} ${JSON.stringify(body)}`);
  }
  const prototype = JSON.parse('{"name":"a","ttlMs":5,"__proto__":{"owner":"x"}}');
  assert.deepEqual(contract.validateBody('lease', prototype), bad('INPUT_UNKNOWN_FIELD'));
  const checked = contract.validateBody('lease', { name: 'a', ttlMs: 5 });
  assert.notEqual(checked.value, undefined);
  assert.equal(Object.getPrototypeOf(checked.value), Object.prototype);
});

const OP = (extra = {}) => ({ op: 'delete', lease: ID.lease, kind: 'scratch', id: ID.scratch, ...extra });
const BATCHES = [
  [{ ops: [OP()] }, null], [{ ops: [OP({ op: 'cancel', kind: 'run', id: ID.run })] }, null], [{ ops: [OP({ op: 'update', patch: { name: 'x' } })] }, null], [{ ops: Array.from({ length: 10 }, () => OP()) }, null],
  [{ ops: Array.from({ length: 11 }, () => OP()) }, bad('INPUT_INVALID', 'ops')], [{ ops: [] }, bad('INPUT_INVALID', 'ops')], [{ ops: 'x' }, bad('INPUT_INVALID', 'ops')], [{}, bad('INPUT_MISSING_FIELD', 'ops')],
  [{ ops: [OP()], extra: 1 }, bad('INPUT_UNKNOWN_FIELD')], [{ ops: [OP()], owner: 'x' }, bad('IDENTITY_CLAIM_REJECTED', 'owner')], [{ ops: [OP()], revision: 1 }, bad('SERVER_FIELD_REJECTED', 'revision')],
  [{ ops: [null] }, bad('INPUT_INVALID', 'ops')], [{ ops: [[]] }, bad('INPUT_INVALID', 'ops')], [{ ops: [OP({ op: 'create' })] }, bad('INPUT_INVALID', 'op')], [{ ops: [{ lease: ID.lease }] }, bad('INPUT_INVALID', 'op')],
  [{ ops: [OP({ extra: 1 })] }, bad('INPUT_UNKNOWN_FIELD')], [{ ops: [OP({ owner: 'x' })] }, bad('IDENTITY_CLAIM_REJECTED', 'owner')], [{ ops: [OP({ state: 'x' })] }, bad('SERVER_FIELD_REJECTED', 'state')],
  [{ ops: [OP({ patch: {} })] }, bad('INPUT_UNKNOWN_FIELD')], [{ ops: [{ op: 'delete', lease: ID.lease, kind: 'scratch' }] }, bad('INPUT_MISSING_FIELD', 'id')], [{ ops: [{ op: 'update', lease: ID.lease, kind: 'run', id: ID.run }] }, bad('INPUT_MISSING_FIELD', 'patch')],
  [{ ops: [OP({ lease: 'lease-1' })] }, bad('INPUT_INVALID', 'lease')], [{ ops: [OP({ kind: 'lease' })] }, bad('INPUT_INVALID', 'kind')], [{ ops: [OP({ id: ID.run })] }, bad('INPUT_INVALID', 'id')],
  [{ ops: [OP({ op: 'cancel' })] }, bad('INPUT_INVALID', 'kind')], [{ ops: [OP({ op: 'update', kind: 'export', id: ID.export, patch: { name: 'x' } })] }, bad('INPUT_INVALID', 'kind')],
  [{ ops: [OP({ op: 'update', patch: { units: 1 } })] }, bad('INPUT_UNKNOWN_FIELD')], [{ ops: [OP({ op: 'update', patch: { owner: 'x' } })] }, bad('IDENTITY_CLAIM_REJECTED', 'owner')],
  [{ ops: [OP({ op: 'update', patch: {} })] }, bad('INPUT_INVALID')], [{ ops: [OP({ op: 'update', patch: 'x' })] }, bad('BODY_NOT_OBJECT')], [null, bad('BODY_NOT_OBJECT')], [[], bad('BODY_NOT_OBJECT')]
];

test('a batch body is validated operation by operation before any target is looked at, and the validated copy holds the schema fields only', () => {
  for (const [body, expected] of BATCHES) {
    const checked = contract.validateBody('batch', body);
    if (expected === null) assert.equal(checked.ok, true, JSON.stringify(body).slice(0, 100));
    else assert.deepEqual(checked, expected, JSON.stringify(body).slice(0, 100));
  }
  const checked = contract.validateBody('batch', { ops: [OP({ op: 'update', kind: 'run', id: ID.run, patch: { units: 3 } })] });
  assert.deepEqual(checked.value, { ops: [{ op: 'update', lease: ID.lease, kind: 'run', id: ID.run, patch: { units: 3 } }] });
});

test('the typed codes: every code has a status and a fixed message, C009\'s wording is reused as is, the statuses are a closed set, and nothing is mutable', () => {
  assert.ok(Object.isFrozen(CODES));
  const statuses = new Set();
  for (const [code, entry] of Object.entries(CODES)) {
    assert.equal(Array.isArray(entry) && entry.length === 2 && Number.isInteger(entry[0]) && typeof entry[1] === 'string' && entry[1].length > 5, true, code);
    assert.equal(entry[1].includes('${'), false, 'a message never carries a placeholder for client input');
    statuses.add(entry[0]);
    if (Object.hasOwn(shared, code)) assert.deepEqual(entry, shared[code], `${code} keeps C009's wording`);
  }
  assert.deepEqual([...statuses].sort(), [400, 401, 403, 404, 405, 408, 409, 413, 414, 415, 417, 421, 431, 500]);
  assert.deepEqual(CODES.TARGET_NOT_FOUND, [404, 'No such target is available to this identity.']);
  assert.equal(Object.keys(CODES).length, 32);
  for (const field of ['limits', 'tunable', 'claimFields', 'serverFields', 'folders', 'idShapes']) assert.ok(Object.isFrozen(contract[field]), field);
  for (const name of contract.tunable) assert.ok(Object.hasOwn(contract.limits, name), name);
  assert.ok(contract.limits.ownerEntries * 2 <= 1000, 'two conductors times a share stays a small state');
});
