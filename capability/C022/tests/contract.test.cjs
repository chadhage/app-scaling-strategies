'use strict';

// The contract in isolation: the closed code table, the permission table, input validation, the list query, the tenant-claim names.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { test } = require('node:test');
const contract = require('../contract.js');

test('the contract is deeply frozen: a consumer can change none of it', () => {
  'use strict';
  for (const value of [contract, contract.members['tenant-alder'], contract.ops['project.create'].roles, contract.CODES.NOT_FOUND, contract.limits, contract.seedProjects['tenant-alder'][0]]) {
    assert.equal(Object.isFrozen(value), true);
  }
  assert.throws(() => { contract.members['tenant-alder'].mallory = 'admin'; }, TypeError);
  assert.throws(() => { contract.limits.projectsPerTenant = 1e9; }, TypeError);
});

test('every typed code has a status of 400 or more and a fixed message that carries no placeholder', () => {
  for (const [code, [status, message]] of Object.entries(contract.CODES)) {
    assert.ok(Number.isInteger(status) && status >= 400 && status < 600, code);
    assert.ok(message.length > 10 && !/[<>{}$%]/.test(message), code);
    assert.match(code, /^[A-Z][A-Z_]+$/);
  }
});

test('the permission table: an operation lists its roles explicitly (no inheritance) and unknown operations do not exist', () => {
  const expected = {
    'session.whoami': null, 'session.logout': null, 'session.switch': ['viewer', 'member', 'admin'],
    'project.list': ['viewer', 'member', 'admin'], 'project.read': ['viewer', 'member', 'admin'], 'project.create': ['member', 'admin'],
    'project.update': ['member', 'admin'], 'project.delete': ['member', 'admin'], 'profile.list': ['viewer', 'member', 'admin'],
    'profile.read': ['viewer', 'member', 'admin'], 'admin.sessions': ['admin'], 'admin.audit': ['admin'], 'admin.revoke': ['admin'], 'admin.role': ['admin']
  };
  assert.deepEqual(Object.fromEntries(Object.entries(contract.ops).map(([op, entry]) => [op, entry.roles])), expected);
  assert.equal(Object.hasOwn(contract.ops, 'project.purge'), false);
});

test('the world: three tenants, every user has the role the feature says, every tenant keeps an admin, nomad belongs nowhere', () => {
  assert.deepEqual(contract.tenants, ['tenant-alder', 'tenant-birch', 'tenant-cedar']);
  for (const [tenant, team] of Object.entries(contract.members)) {
    assert.ok(Object.values(team).includes('admin'), tenant);
    for (const [user, role] of Object.entries(team)) assert.ok(contract.users.includes(user) && contract.roles.includes(role), `${tenant} ${user}`);
  }
  assert.ok(contract.users.includes('nomad'));
  assert.ok(Object.values(contract.members).every((team) => !Object.hasOwn(team, 'nomad')));
  assert.deepEqual(contract.members['tenant-alder'].dana, 'member');
  assert.deepEqual(contract.members['tenant-birch'].dana, 'viewer');
  assert.deepEqual(contract.seedProjects['tenant-cedar'], []);
  assert.ok(contract.limits.sessionsPerTenant <= contract.limits.recordsPerTenant);
});

test('tenant claim names: headers, query and body fields that carry a tenant, an organisation, an account or a workspace', () => {
  for (const name of ['tenant', 'Tenant-Id', 'X-Tenant', 'x-forwarded-tenant', 'tenantId', 'X-MS-Tenant-Id', 'org', 'X-Org', 'orgId', 'org_id', 'organization', 'Organisation-Id', 'workspace', 'X-Workspace', 'account', 'X-Account-Id']) {
    assert.equal(contract.isTenantClaimName(name), true, name);
  }
  for (const name of ['name', 'units', 'role', 'owner', 'id', 'version', 'Origin', 'Host', 'Authorization', 'Cookie', 'X-Forwarded-For', 'If-None-Match', 'limit', 'cursor', 'q', 'sid', 'ticket', 'user', '', 'organ']) {
    assert.equal(contract.isTenantClaimName(name), false, name);
  }
  assert.equal(contract.isTenantClaimName(undefined), false);
  assert.equal(contract.isTenantClaimName(5), false);
});

const VALID = {
  'project.create': { name: 'alder-lake', units: 5 }, 'project.update': { name: 'x', units: 100 }, 'admin.role': { user: 'alf', role: 'viewer' },
  'admin.revoke': { sid: 'sid_abc' }, 'session.login': { ticket: 't022_x' }, 'session.switch': { tenant: 'tenant-birch' }
};

test('validateInput accepts exactly the closed shapes and answers a typed code for everything else', () => {
  for (const [op, body] of Object.entries(VALID)) assert.deepEqual(contract.validateInput(op, body), { ok: true, value: body }, op);
  assert.deepEqual(contract.validateInput('admin.revoke', { user: 'alf' }), { ok: true, value: { user: 'alf' } });
  const code = (op, body) => contract.validateInput(op, body).code;
  for (const body of [null, 5, 'x', true, [], [{ name: 'x' }]]) assert.equal(code('project.create', body), 'BODY_NOT_OBJECT');
  assert.equal(code('project.create', { name: 'x', units: 1, tenant: 'tenant-birch' }), 'TENANT_CLAIM_REJECTED');
  assert.equal(code('project.create', { name: 'x', units: 1, orgId: 'o' }), 'TENANT_CLAIM_REJECTED');
  assert.equal(code('session.switch', { tenant: 'tenant-birch', orgId: 'o' }), 'TENANT_CLAIM_REJECTED', 'only the switch field itself is exempt');
  for (const field of ['role', 'owner', 'id', 'version', 'sid', '__proto__', 'constructor', 'x.y', '']) assert.equal(code('project.create', { name: 'x', units: 1, [field]: 'v' }), 'INPUT_UNKNOWN_FIELD', field);
  assert.equal(code('project.create', { name: 'x' }), 'INPUT_MISSING_FIELD');
  assert.equal(code('project.create', {}), 'INPUT_MISSING_FIELD');
  for (const bad of [{ name: 'X', units: 1 }, { name: '', units: 1 }, { name: 'a'.repeat(33), units: 1 }, { name: 5, units: 1 }, { name: 'x', units: 0 }, { name: 'x', units: 101 }, { name: 'x', units: 1.5 }, { name: 'x', units: '1' }, { name: '-x', units: 1 }]) {
    assert.equal(code('project.create', bad), 'INPUT_INVALID', JSON.stringify(bad));
  }
  assert.equal(code('admin.role', { user: 'alf', role: 'superadmin' }), 'INPUT_INVALID');
  assert.equal(code('admin.role', { user: 'Alf', role: 'admin' }), 'INPUT_INVALID');
  assert.equal(code('admin.role', { user: 'alf' }), 'INPUT_MISSING_FIELD');
  assert.equal(code('admin.revoke', {}), 'INPUT_MISSING_FIELD');
  assert.equal(code('admin.revoke', { sid: 's', user: 'alf' }), 'INPUT_UNKNOWN_FIELD');
  assert.equal(code('admin.revoke', { sid: 5 }), 'INPUT_INVALID');
  assert.equal(code('session.login', { ticket: 5 }), 'INPUT_INVALID');
  assert.equal(code('session.login', { ticket: 'x'.repeat(257) }), 'INPUT_INVALID');
  assert.equal(code('session.switch', {}), 'INPUT_MISSING_FIELD');
});

test('validateInput copies only validated own fields: the result is a new plain object', () => {
  const body = JSON.parse('{"name":"x","units":2}');
  const result = contract.validateInput('project.create', body);
  assert.notEqual(result.value, body);
  assert.deepEqual(Object.keys(result.value), ['name', 'units']);
  assert.equal(Object.getPrototypeOf(result.value), Object.prototype);
});

test('the list query accepts limit, cursor and q once each and refuses everything else', () => {
  const parse = (text) => contract.parseListQuery(new URLSearchParams(text));
  assert.deepEqual(parse(''), { ok: true, query: { limit: contract.limits.pageDefault, cursor: null, q: '' } });
  assert.deepEqual(parse('limit=3&q=RiVer&cursor=abc.def'), { ok: true, query: { limit: 3, cursor: 'abc.def', q: 'river' } });
  for (const bad of ['limit=0', 'limit=11', 'limit=-1', 'limit=1.5', 'limit=abc', 'limit=1000', 'limit=', 'limit=1&limit=2', 'q=', 'q=a%00b', `q=${'a'.repeat(33)}`, 'q=a&q=b', 'cursor=a&cursor=b', 'sort=name', 'tenant=x', 'Limit=2']) {
    assert.deepEqual(parse(bad), { ok: false, code: 'QUERY_INVALID' }, bad);
  }
});

test('loaded without module (a browser), the contract publishes itself once as C022Contract', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'contract.js'), 'utf8');
  const root = {};
  vm.runInNewContext(source, root, { filename: 'contract.js' });
  assert.deepEqual(Object.keys(root), [], 'not enumerable');
  assert.equal(root.C022Contract.limits.projectsPerTenant, contract.limits.projectsPerTenant);
  assert.equal(Object.getOwnPropertyDescriptor(root, 'C022Contract').writable, false);
});
