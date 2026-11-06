'use strict';

// The decision and the effect WITHOUT HTTP. The permission table is checked against an INDEPENDENT table written here (not read from
// the contract), a tripwire proves that no operation of any user of any tenant ever opens another tenant's scope (foreign ids, foreign
// users and foreign session ids included), the audit lands in the right ring, and the conditional-request forms are exact.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const contract = require('../contract.js');
const { createCore } = require('../server.cjs');
const { manualClock, seededBytes } = require('./helpers.cjs');

function make(extra = {}) {
  const clock = manualClock();
  const touched = [];
  const core = createCore({ now: clock.now, randomBytes: seededBytes('sv'), observe: (tenant) => touched.push(tenant), ...extra });
  const login = (user, tenant) => {
    const result = core.service.login(null, core.identity.issueTicket({ user, tenant }));
    assert.equal(result.ok, true, `${user} ${tenant}`);
    return { token: result.body.token, ...result.body.session };
  };
  return { clock, touched, core, login };
}

// op -> the roles (v viewer, m member, a admin) that may run it. null: any live session.
const ALLOW = {
  'session.whoami': null, 'session.logout': null, 'session.switch': 'vma', 'project.list': 'vma', 'project.read': 'vma', 'project.create': 'ma', 'project.update': 'ma',
  'project.delete': 'ma', 'profile.list': 'vma', 'profile.read': 'vma', 'admin.sessions': 'a', 'admin.audit': 'a', 'admin.revoke': 'a', 'admin.role': 'a'
};
const INPUT = {
  'session.whoami': {}, 'session.logout': {}, 'session.switch': { value: { tenant: 'tenant-birch' } }, 'project.list': { query: { limit: 5, cursor: null, q: '' } },
  'project.read': { id: 'proj-0001', ifNoneMatch: null }, 'project.create': { value: { name: 'n', units: 1 } }, 'project.update': { id: 'proj-0001', ifMatch: null, value: { name: 'n', units: 1 } },
  'project.delete': { id: 'proj-0001', ifMatch: null }, 'profile.list': {}, 'profile.read': { id: 'synthetic-001' }, 'admin.sessions': {}, 'admin.audit': {},
  'admin.revoke': { value: { user: 'ana' } }, 'admin.role': { value: { user: 'ana', role: 'member' } }
};
const LETTER = { viewer: 'v', member: 'm', admin: 'a' };

test('the permission table, against an independent table: every operation x every role, every dead or missing credential, an anonymous session', () => {
  assert.deepEqual(Object.keys(ALLOW).sort(), Object.keys(contract.ops).sort(), 'the independent table covers every operation');
  for (const op of Object.keys(ALLOW)) {
    for (const [user, role] of [['ada', 'admin'], ['alf', 'member'], ['ana', 'viewer']]) {
      const { core, login } = make();
      const session = login(user, 'tenant-alder');
      const result = core.service.execute(session.token, op, INPUT[op]);
      const allowed = ALLOW[op] === null || ALLOW[op].includes(LETTER[role]);
      if (op === 'session.switch') {
        assert.equal(result.code, 'TENANT_SWITCH_REQUIRES_LOGIN', 'authorized for every role, and refused for every role');
        continue;
      }
      assert.equal(result.ok, allowed, `${op} as ${role}: ${JSON.stringify(result.code)}`);
      if (!allowed) assert.equal(result.code, 'ROLE_FORBIDDEN');
    }
    const { core, clock, login } = make();
    const anonymous = core.service.start().body;
    const result = core.service.execute(anonymous.token, op, INPUT[op]);
    assert.equal(result.ok, ALLOW[op] === null, `${op} for an anonymous session`);
    if (ALLOW[op] !== null) assert.equal(result.code, 'LOGIN_REQUIRED');
    const dead = login('ada', 'tenant-alder');
    core.identity.logout(dead.token);
    assert.equal(core.service.execute(dead.token, op, INPUT[op]).code, 'SESSION_LOGGED_OUT');
    assert.equal(core.service.execute(null, op, INPUT[op]).code, 'AUTHENTICATION_REQUIRED');
    assert.equal(core.service.execute('nope', op, INPUT[op]).code, 'TOKEN_MALFORMED');
    assert.equal(core.service.execute(`c022_${'A'.repeat(43)}`, op, INPUT[op]).code, 'TOKEN_UNKNOWN');
    const live = login('ada', 'tenant-alder');
    clock.advance(contract.limits.ttlMs);
    assert.equal(core.service.execute(live.token, op, INPUT[op]).code, 'SESSION_EXPIRED');
  }
});

test('the tripwire: no operation of any user of any tenant opens another tenant scope, whatever ids, users and session ids it names', () => {
  const { core, touched, login } = make();
  const sessions = [['ada', 'tenant-alder'], ['alf', 'tenant-alder'], ['ana', 'tenant-alder'], ['bea', 'tenant-birch'], ['ben', 'tenant-birch'], ['bo', 'tenant-birch'], ['cai', 'tenant-cedar'], ['cy', 'tenant-cedar'], ['dana', 'tenant-alder'], ['dana', 'tenant-birch']].map(([user, tenant]) => login(user, tenant));
  const foreignIds = ['proj-0001', 'proj-0002', 'proj-0003', 'proj-0099', '__proto__', 'synthetic-001', 'synthetic-002', 'synthetic-999'];
  const sids = sessions.map((session) => session.sid);
  const inputs = [];
  for (const id of foreignIds) {
    inputs.push(['project.read', { id, ifNoneMatch: '*' }], ['project.update', { id, ifMatch: null, value: { name: 'x', units: 1 } }], ['project.delete', { id, ifMatch: '*' }], ['profile.read', { id }]);
  }
  for (const sid of [...sids, 'sid_none']) inputs.push(['admin.revoke', { value: { sid } }]);
  for (const user of ['ada', 'bea', 'cai', 'dana', 'nomad', 'nobody']) inputs.push(['admin.revoke', { value: { user } }], ['admin.role', { value: { user, role: 'member' } }]);
  inputs.push(['project.list', { query: { limit: 5, cursor: 'garbage.xxxx', q: 'birch' } }], ['profile.list', {}], ['admin.sessions', {}], ['admin.audit', {}], ['session.whoami', {}], ['session.switch', { value: { tenant: 'tenant-birch' } }]);
  let requests = 0;
  for (const session of sessions) {
    for (const [op, input] of inputs) {
      touched.length = 0;
      core.service.execute(session.token, op, input);
      requests += 1;
      assert.ok(touched.every((tenant) => tenant === session.tenant), `${session.user}@${session.tenant} ${op} touched ${[...new Set(touched)]}`);
    }
  }
  assert.equal(requests, sessions.length * inputs.length);
  assert.ok(requests > 500);
  touched.length = 0;
  core.service.execute(null, 'project.read', INPUT['project.read']);
  core.service.execute('x', 'project.read', INPUT['project.read']);
  core.service.start();
  assert.deepEqual(touched, [], 'no credential, a bad credential and an anonymous session open no tenant at all');
});

test('the audit: applied mutations and refusals of a tenant session land in ITS ring, everything unauthenticated in the anonymous ring, reads are not recorded', () => {
  const { core, login } = make();
  const alf = login('alf', 'tenant-alder');
  const ana = login('ana', 'tenant-alder');
  const bea = login('bea', 'tenant-birch');
  const trail = (tenant) => core.store.scope(tenant).auditLog().map((entry) => `${entry.user}:${entry.outcome}:${entry.code}:${entry.op}`);
  core.service.execute(alf.token, 'project.create', { value: { name: 'a', units: 1 } });
  core.service.execute(alf.token, 'project.list', INPUT['project.list']);
  core.service.execute(ana.token, 'project.create', { value: { name: 'a', units: 1 } });
  core.service.execute(alf.token, 'project.read', { id: 'proj-0099', ifNoneMatch: null });
  core.service.execute(bea.token, 'project.read', { id: 'proj-0003', ifNoneMatch: null });
  core.service.execute(null, 'project.list', INPUT['project.list']);
  core.service.execute(alf.token, 'session.switch', INPUT['session.switch']);
  assert.deepEqual(trail('tenant-alder'), [
    'alf:applied:ok:session.login', 'ana:applied:ok:session.login', 'alf:applied:ok:project.create', 'ana:denied:ROLE_FORBIDDEN:project.create',
    'alf:rejected:RESOURCE_NOT_FOUND:project.read', 'alf:rejected:TENANT_SWITCH_REQUIRES_LOGIN:session.switch'
  ]);
  assert.deepEqual(trail('tenant-birch'), ['bea:applied:ok:session.login', 'bea:rejected:RESOURCE_NOT_FOUND:project.read']);
  assert.deepEqual(core.store.anonymousLog().map((entry) => `${entry.code}:${entry.op}`), ['AUTHENTICATION_REQUIRED:project.list']);
  assert.equal(core.service.reject(null, 'project.list', 'QUERY_INVALID').ok, false);
  assert.equal(core.store.anonymousLog().length, 2);
  core.service.reject(alf, 'x', 'INPUT_INVALID');
  assert.equal(core.service.reject({ kind: 'tenant', session: { tenant: 'tenant-alder', user: 'alf' } }, 'x', 'INPUT_INVALID', { a: 1 }).extra.a, 1);
  assert.ok(trail('tenant-alder').includes('alf:rejected:INPUT_INVALID:x'));
});

const etagOf = (core, token) => core.service.execute(token, 'project.read', { id: 'proj-0001', ifNoneMatch: null }).headers.ETag;

test('conditional requests are exact: lists, *, weak forms, mismatches, in the tenant of the caller only', () => {
  const { core, login } = make();
  const ada = login('ada', 'tenant-alder');
  const bea = login('bea', 'tenant-birch');
  const etag = etagOf(core, ada.token);
  const read = (token, ifNoneMatch) => core.service.execute(token, 'project.read', { id: 'proj-0001', ifNoneMatch });
  for (const header of [etag, `"x", ${etag}`, `W/${etag}`, '*', ` ${etag} `, `"y",W/${etag},"z"`]) assert.equal(read(ada.token, header).status, 304, header);
  for (const header of ['"nope"', '', '"x", "y"', etag.slice(0, -1), 'W/"nope"']) assert.equal(read(ada.token, header).status, 200, header);
  assert.equal(read(bea.token, etag).status, 200, 'an ETag of alder validates nothing in birch');
  const update = (token, ifMatch) => core.service.execute(token, 'project.update', { id: 'proj-0001', ifMatch, value: { name: 'n', units: 2 } });
  assert.equal(update(ada.token, '"stale"').code, 'PRECONDITION_FAILED');
  assert.equal(update(bea.token, etag).code, 'PRECONDITION_FAILED', 'the alder ETag fails in birch');
  assert.equal(update(ada.token, etag).status, 200);
  assert.equal(update(ada.token, etag).code, 'PRECONDITION_FAILED', 'the old ETag is stale after the update');
  const fresh = etagOf(core, ada.token);
  assert.equal(core.service.execute(ada.token, 'project.delete', { id: 'proj-0001', ifMatch: '"stale"' }).code, 'PRECONDITION_FAILED');
  assert.equal(core.service.execute(ada.token, 'project.delete', { id: 'proj-0001', ifMatch: fresh }).status, 200);
  assert.equal(core.service.execute(ada.token, 'project.delete', { id: 'proj-0001', ifMatch: null }).code, 'RESOURCE_NOT_FOUND');
  assert.equal(core.service.execute(ada.token, 'project.update', { id: 'proj-0001', ifMatch: null, value: { name: 'n', units: 1 } }).code, 'RESOURCE_NOT_FOUND');
});

test('lists, cursors, profiles and the admin operations: the effect and the answer shape', () => {
  const { core, login } = make();
  const ada = login('ada', 'tenant-alder');
  const page = core.service.execute(ada.token, 'project.list', { query: { limit: 2, cursor: null, q: '' } });
  assert.equal(page.body.items.length, 2);
  const next = core.service.execute(ada.token, 'project.list', { query: { limit: 2, cursor: page.body.nextCursor, q: '' } });
  assert.deepEqual(next.body.items.map((item) => item.id), ['proj-0003']);
  assert.equal(next.body.nextCursor, null);
  assert.equal(core.service.execute(ada.token, 'project.list', { query: { limit: 2, cursor: 'x.y', q: '' } }).code, 'CURSOR_INVALID');
  assert.equal(core.service.execute(ada.token, 'profile.list', {}).body.profiles[0].profile.displayName, 'Avery Example');
  assert.equal(core.service.execute(ada.token, 'profile.read', { id: 'synthetic-002' }).code, 'RESOURCE_NOT_FOUND');
  assert.equal(core.service.execute(ada.token, 'admin.role', { value: { user: 'alf', role: 'viewer' } }).body.changed, true);
  assert.equal(core.service.execute(ada.token, 'admin.revoke', { value: { sid: ada.sid } }).body.revoked, 1, 'an admin may revoke their own session');
  assert.equal(core.service.execute(ada.token, 'session.whoami', {}).code, 'SESSION_REVOKED');
  const bea = login('bea', 'tenant-birch');
  assert.equal(core.service.execute(bea.token, 'admin.sessions', {}).body.count, 1);
  assert.equal(core.service.execute(bea.token, 'admin.audit', {}).body.entries[0].op, 'session.login');
});

const walk = (value, seen = new Set()) => {
  if (value === null || typeof value !== 'object' || seen.has(value)) return;
  seen.add(value);
  for (const key of Reflect.ownKeys(value)) {
    walk(value[key], seen);
    for (const attempt of [() => { value[key] = 'MUTATED'; }, () => { delete value[key]; }, () => { Object.defineProperty(value, key, { value: 'MUTATED' }); }]) {
      try { attempt(); } catch (error) { assert.ok(error instanceof TypeError || error instanceof RangeError, 'strict mode refuses writes to frozen data with a TypeError (or an array length with a RangeError)'); }
    }
  }
  if (Array.isArray(value)) try { value.push('MUTATED'); } catch { /* frozen */ }
};

test('no shared mutable returns: a walker mutates every reachable object of every read answer in strict mode, and the next answer is unchanged', () => {
  const { core, login } = make();
  const ada = login('ada', 'tenant-alder');
  core.service.execute(ada.token, 'project.create', { value: { name: 'extra', units: 2 } });
  const reads = [['project.list', { query: { limit: 10, cursor: null, q: '' } }], ['project.read', { id: 'proj-0001', ifNoneMatch: null }], ['profile.list', {}], ['profile.read', { id: 'synthetic-001' }],
    ['admin.sessions', {}], ['admin.audit', {}], ['session.whoami', {}]];
  for (const [op, input] of reads) {
    const first = core.service.execute(ada.token, op, input);
    const expected = JSON.stringify(first);
    walk(first);
    assert.equal(JSON.stringify(core.service.execute(ada.token, op, input)), expected, op);
  }
  const snapshot = JSON.stringify(core.store.snapshot());
  walk(core.store.snapshot());
  walk(core.identity.snapshot());
  assert.equal(JSON.stringify(core.store.snapshot()), snapshot);
});

test('start and login: the typed refusals are recorded as unauthenticated, a success is recorded in the new tenant', () => {
  const { core } = make({ limits: { anonymousSessions: 1, anonymousRecords: 2 } });
  const first = core.service.start();
  assert.equal(first.status, 201);
  assert.equal(core.service.start().code, 'ANONYMOUS_QUOTA_FULL');
  assert.equal(core.service.login(null, 'garbage').code, 'TICKET_INVALID');
  const done = core.service.login(first.body.token, core.identity.issueTicket({ user: 'ada', tenant: 'tenant-alder' }));
  assert.equal(done.status, 201);
  assert.equal(core.service.login(done.body.token, core.identity.issueTicket({ user: 'ada', tenant: 'tenant-alder' })).code, 'ALREADY_AUTHENTICATED');
  assert.deepEqual(core.store.anonymousLog().map((entry) => entry.code), ['ok', 'ANONYMOUS_QUOTA_FULL', 'TICKET_INVALID', 'ALREADY_AUTHENTICATED']);
});
