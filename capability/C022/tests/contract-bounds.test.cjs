'use strict';

// The bounds of every input field and of the list query at BOTH edges (found by the systematic mutants of contract.js: widening the bound of a
// session id or of a switch tenant by one survived). Every field is accepted AT its bound and refused one past it with the typed code and the
// field name; a body is a plain object with exactly the fields of its operation.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const contract = require('../contract.js');

const verdict = (op, body) => {
  const result = contract.validateInput(op, body);
  return result.ok ? 'ok' : `${result.code}:${result.field}`;
};
const query = (text) => contract.parseListQuery(new URLSearchParams(text));
const [ROLE] = contract.roles;

// [operation, the other fields it needs, the field, a value AT the bound, a value ONE PAST it]
const EDGES = [
  ['admin.revoke', {}, 'sid', 'x'.repeat(64), 'x'.repeat(65)],
  ['admin.revoke', {}, 'user', `a${'b'.repeat(31)}`, `a${'b'.repeat(32)}`],
  ['session.login', {}, 'ticket', 't'.repeat(256), 't'.repeat(257)],
  ['session.switch', {}, 'tenant', 'a'.repeat(64), 'a'.repeat(65)],
  ['project.create', { units: 5 }, 'name', 'a'.repeat(32), 'a'.repeat(33)],
  ['project.update', { units: 5 }, 'name', 'a'.repeat(32), 'a'.repeat(33)],
  ['admin.role', { role: ROLE }, 'user', `a${'b'.repeat(31)}`, `a${'b'.repeat(32)}`]
];
for (const [op, others, name, atBound, past] of EDGES) {
  test(`${op}.${name}: accepted at its bound, refused one past it`, () => {
    assert.equal(verdict(op, { ...others, [name]: atBound }), 'ok');
    assert.equal(verdict(op, { ...others, [name]: past }), `INPUT_INVALID:${name}`);
    assert.equal(verdict(op, { ...others, [name]: 5 }), `INPUT_INVALID:${name}`, 'a number is not a string');
    assert.equal(verdict(op, { ...others, [name]: null }), `INPUT_INVALID:${name}`);
  });
}

test('units are integers from 1 to 100 and nothing else', () => {
  for (const units of [1, 2, 99, 100]) assert.equal(verdict('project.create', { name: 'a', units }), 'ok', String(units));
  for (const units of [0, -1, 101, 1.5, '5', null, true, NaN, Infinity, [5], {}]) assert.equal(verdict('project.create', { name: 'a', units }), 'INPUT_INVALID:units', String(units));
  assert.equal(verdict('project.update', { name: 'a', units: 100 }), 'ok');
  assert.equal(verdict('project.update', { name: 'a', units: 101 }), 'INPUT_INVALID:units');
});

test('a project name starts with a letter or digit, then lower case letters, digits and hyphens; a user starts with a letter', () => {
  for (const name of ['a', '0', '0a', 'a-b', 'a-', 'abc-123']) assert.equal(verdict('project.create', { name, units: 1 }), 'ok', name);
  for (const name of ['', '-a', 'A', 'aB', 'a_b', 'a b', 'a.b', 'é', 5]) assert.equal(verdict('project.create', { name, units: 1 }), 'INPUT_INVALID:name', String(name));
  for (const user of ['a', 'a1', 'a-b']) assert.equal(verdict('admin.role', { user, role: ROLE }), 'ok', user);
  for (const user of ['', '1a', '-a', 'A', 'a_b', 5]) assert.equal(verdict('admin.role', { user, role: ROLE }), 'INPUT_INVALID:user', String(user));
});

test('a role is one of the closed list', () => {
  for (const role of contract.roles) assert.equal(verdict('admin.role', { user: 'ada', role }), 'ok', role);
  for (const role of ['root', '', 'ADMIN', 5, null, 'constructor']) assert.equal(verdict('admin.role', { user: 'ada', role }), 'INPUT_INVALID:role', String(role));
});

test('admin.revoke takes exactly one of sid and user', () => {
  assert.equal(verdict('admin.revoke', {}), 'INPUT_MISSING_FIELD:sid');
  assert.equal(verdict('admin.revoke', { sid: 'sid_a' }), 'ok');
  assert.equal(verdict('admin.revoke', { user: 'ada' }), 'ok');
  assert.equal(verdict('admin.revoke', { sid: 'sid_a', user: 'ada' }), 'INPUT_UNKNOWN_FIELD:user');
  assert.equal(verdict('admin.revoke', { user: 'ada', sid: 'sid_a' }), 'INPUT_UNKNOWN_FIELD:user');
});

test('every other operation needs every field of its schema, in the order of the schema', () => {
  assert.equal(verdict('project.create', {}), 'INPUT_MISSING_FIELD:name');
  assert.equal(verdict('project.create', { name: 'a' }), 'INPUT_MISSING_FIELD:units');
  assert.equal(verdict('project.create', { units: 1 }), 'INPUT_MISSING_FIELD:name');
  assert.equal(verdict('admin.role', { user: 'ada' }), 'INPUT_MISSING_FIELD:role');
  assert.equal(verdict('admin.role', { role: ROLE }), 'INPUT_MISSING_FIELD:user');
  assert.equal(verdict('session.login', {}), 'INPUT_MISSING_FIELD:ticket');
  assert.equal(verdict('session.switch', {}), 'INPUT_MISSING_FIELD:tenant');
});

test('a body is a plain object: anything else, an unknown field and a tenant claim are typed refusals', () => {
  for (const body of [null, [], 'x', 5, true, undefined]) assert.equal(verdict('project.create', body), 'BODY_NOT_OBJECT:undefined', String(body));
  assert.equal(verdict('project.create', { name: 'a', units: 1, extra: 1 }), 'INPUT_UNKNOWN_FIELD:extra');
  assert.equal(verdict('project.create', JSON.parse('{"__proto__": 1, "name": "a", "units": 1}')), 'INPUT_UNKNOWN_FIELD:__proto__');
  assert.equal(verdict('project.create', { name: 'a', units: 1, tenant: 'tenant-alder' }), 'TENANT_CLAIM_REJECTED:tenant');
  assert.equal(verdict('project.create', { name: 'a', units: 1, orgId: 'x' }), 'TENANT_CLAIM_REJECTED:orgId');
  assert.equal(verdict('session.switch', { tenant: 'tenant-alder' }), 'ok', 'the one operation whose own field is the tenant');
  assert.equal(verdict('session.switch', { tenant: 'tenant-alder', workspace: 'x' }), 'TENANT_CLAIM_REJECTED:workspace');
});

test('the list query: defaults, the limit from 1 to the maximum, a search of 1 to 32 characters, each key at most once', () => {
  assert.deepEqual(query(''), { ok: true, query: { limit: contract.limits.pageDefault, cursor: null, q: '' } });
  const max = contract.limits.pageMax;
  for (const [text, limit] of [['1', 1], ['2', 2], [String(max), max], ['010', 10]]) assert.deepEqual(query(`limit=${text}`), { ok: true, query: { limit, cursor: null, q: '' } }, text);
  for (const text of ['0', '00', String(max + 1), '1000', '-1', '1.5', ' 5', '5 ', 'abc', '']) assert.deepEqual(query(`limit=${encodeURIComponent(text)}`), { ok: false, code: 'QUERY_INVALID' }, text);
  assert.deepEqual(query(`q=${'a'.repeat(32)}`), { ok: true, query: { limit: contract.limits.pageDefault, cursor: null, q: 'a'.repeat(32) } });
  assert.deepEqual(query('q=Alder+Meadow_1-x'), { ok: true, query: { limit: contract.limits.pageDefault, cursor: null, q: 'alder meadow_1-x' } }, 'lower-cased');
  for (const text of ['', 'a'.repeat(33), 'a!', 'é', 'a%00']) assert.deepEqual(query(`q=${encodeURIComponent(text)}`), { ok: false, code: 'QUERY_INVALID' }, text);
  assert.deepEqual(query('cursor=abc'), { ok: true, query: { limit: contract.limits.pageDefault, cursor: 'abc', q: '' } });
  assert.deepEqual(query('limit=1&limit=2'), { ok: false, code: 'QUERY_INVALID' });
  assert.deepEqual(query('q=a&q=b'), { ok: false, code: 'QUERY_INVALID' });
  assert.deepEqual(query('cursor=a&cursor=b'), { ok: false, code: 'QUERY_INVALID' });
  for (const text of ['x=1', 'tenant=tenant-alder', 'Limit=1', 'limit=1&x=1']) assert.deepEqual(query(text), { ok: false, code: 'QUERY_INVALID' }, text);
});
