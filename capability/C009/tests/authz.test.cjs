'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, fakeClock } = require('./helpers.cjs');

const contract = load('contract.js');
const authz = load('authz.cjs');

const sequentialBytes = () => {
  let counter = 0;
  return (size) => Buffer.alloc(size, ++counter);
};
const bearer = (value) => ['Host', 'h', 'Authorization', value];

test('the contract is frozen, names four fake identities and opens no mutation to visitors', () => {
  assert.deepEqual([...contract.roles], ['visitor', 'conductor', 'operator']);
  assert.deepEqual(Object.keys(contract.identities).sort(), ['conductor-a', 'conductor-b', 'operator', 'visitor']);
  assert.equal(contract.identities['conductor-a'].role, 'conductor');
  assert.equal(contract.identities.visitor.role, 'visitor');
  assert.equal(Object.isFrozen(contract) && Object.isFrozen(contract.commands) && Object.isFrozen(contract.commands['run.create'].roles), true);
  assert.deepEqual(Object.keys(contract.commands).sort(), ['experiment.approve', 'pool.resize', 'run.create', 'scratch.create']);
  for (const [name, entry] of Object.entries(contract.commands)) {
    assert.ok(entry.roles.length >= 1, `${name} names at least one role`);
    assert.equal(entry.roles.includes('visitor'), false, `${name} is never open to visitors`);
    assert.equal(entry.roles.every((role) => contract.roles.includes(role)), true);
  }
  assert.deepEqual([...contract.commands['run.create'].roles], ['conductor']);
  assert.deepEqual([...contract.commands['pool.resize'].roles], ['operator']);
});

test('decide is table driven, exact and has no role inheritance', () => {
  for (const [command, entry] of Object.entries(contract.commands)) {
    for (const role of contract.roles) {
      const decision = authz.decide(contract.commands, command, role);
      const expected = entry.roles.includes(role);
      assert.equal(decision.allowed, expected, `${role} ${command}`);
      assert.equal(decision.code, expected ? 'ok' : 'ROLE_FORBIDDEN');
      assert.equal(decision.status, expected ? 200 : 403);
      assert.deepEqual([...decision.requiredRoles], [...entry.roles]);
    }
  }
  assert.equal(authz.decide(contract.commands, 'run.create', 'operator').allowed, false);
  assert.equal(authz.decide(contract.commands, 'pool.resize', 'conductor').allowed, false);
});

test('decide denies unknown, inherited and malformed command names and unknown roles', () => {
  for (const name of ['native.execute', 'constructor', 'toString', '__proto__', 'hasOwnProperty', '', undefined, null, 42, {}]) {
    const decision = authz.decide(contract.commands, name, 'operator');
    assert.equal(decision.allowed, false, String(name));
    assert.equal(decision.code, 'COMMAND_UNKNOWN');
    assert.equal(decision.status, 404);
  }
  for (const role of ['admin', 'OPERATOR', 'operator ', '', undefined, null, {}, ['operator']]) {
    const decision = authz.decide(contract.commands, 'pool.resize', role);
    assert.equal(decision.allowed, false);
    assert.equal(decision.code, 'ROLE_FORBIDDEN');
  }
});

test('a command without a permission entry or with no roles is denied for every role', () => {
  for (const table of [{ 'lab.new': {} }, { 'lab.new': { roles: [] } }, { 'lab.new': { roles: 'operator' } }]) {
    for (const role of [...contract.roles, 'root']) {
      const decision = authz.decide(table, 'lab.new', role);
      assert.equal(decision.allowed, false);
      assert.equal(decision.code, 'ROLE_FORBIDDEN');
      assert.deepEqual([...decision.requiredRoles], []);
    }
  }
});

test('parseBearer accepts exactly one Bearer credential and reports absence as null', () => {
  assert.equal(authz.parseBearer(['Host', 'h']), null);
  assert.equal(authz.parseBearer(bearer('Bearer abc.DEF-123_~+/=')), 'abc.DEF-123_~+/=');
  assert.equal(authz.parseBearer(['authorization', 'bearer lower']), 'lower');
});

test('parseBearer rejects every other shape as TOKEN_MALFORMED', () => {
  const malformed = ['Basic dXNlcjpwYXNz', 'Bearer', 'Bearer ', 'Bearer   spaced', 'Bearer a b', 'Token abc', '', 'Bearer ' + 'x'.repeat(300), 'Bearer a\u0001b', 'Bearer ünï'];
  for (const value of malformed) {
    assert.throws(() => authz.parseBearer(bearer(value)), { code: 'TOKEN_MALFORMED', status: 401 }, JSON.stringify(value));
  }
  assert.throws(() => authz.parseBearer(['Authorization', 'Bearer a', 'authorization', 'Bearer b']), { code: 'TOKEN_MALFORMED' });
  assert.throws(() => authz.parseBearer(['Authorization', 'Bearer a', 'Authorization', 'Bearer a']), { code: 'TOKEN_MALFORMED' });
});

test('the registry issues opaque tokens that verify to a server-owned identity only', () => {
  const clock = fakeClock();
  const registry = authz.createTokenRegistry({ now: clock.now, randomBytes: sequentialBytes() });
  const tokens = Object.fromEntries(Object.keys(contract.identities).map((name) => [name, registry.issue(name, { ttlMs: 1000 })]));
  assert.equal(new Set(Object.values(tokens)).size, 4);
  for (const [name, token] of Object.entries(tokens)) {
    assert.match(token, /^c009_[A-Za-z0-9_-]{43}$/);
    const identity = registry.verify(token);
    assert.equal(identity.subject, name);
    assert.equal(identity.role, contract.identities[name].role);
    assert.equal(identity.expiresAtMs, clock.now() + 1000);
    assert.equal(token.includes(name), false, 'tokens are opaque and never embed the identity');
  }
});

test('verify separates malformed, unknown and expired tokens and expires at the exact lifetime', () => {
  const clock = fakeClock();
  const registry = authz.createTokenRegistry({ now: clock.now, randomBytes: sequentialBytes() });
  const token = registry.issue('conductor-a', { ttlMs: 1000 });
  clock.advance(999);
  assert.equal(registry.verify(token).subject, 'conductor-a');
  clock.advance(1);
  assert.throws(() => registry.verify(token), { code: 'TOKEN_EXPIRED', status: 401 });
  for (const wrong of ['', 'abc', `c009_${'A'.repeat(42)}`, `c009_${'A'.repeat(44)}`, `c008_${'A'.repeat(43)}`, `c009_${'A'.repeat(42)}!`, 7, null, undefined]) {
    assert.throws(() => registry.verify(wrong), { code: 'TOKEN_MALFORMED' }, String(wrong));
  }
  assert.throws(() => registry.verify(`c009_${'B'.repeat(43)}`), { code: 'TOKEN_UNKNOWN', status: 401 });
  assert.throws(() => registry.verify(token.slice(0, -1) + (token.endsWith('A') ? 'B' : 'A')), { code: 'TOKEN_UNKNOWN' });
});

test('a zero lifetime token is already expired, and bad issue requests are refused', () => {
  const clock = fakeClock();
  const registry = authz.createTokenRegistry({ now: clock.now });
  assert.throws(() => registry.verify(registry.issue('operator', { ttlMs: 0 })), { code: 'TOKEN_EXPIRED' });
  assert.equal(registry.verify(registry.issue('operator')).role, 'operator');
  assert.throws(() => registry.issue('root'), { code: 'IDENTITY_UNKNOWN' });
  assert.throws(() => registry.issue('constructor'), { code: 'IDENTITY_UNKNOWN' });
  for (const ttlMs of [-1, 1.5, '5', 900001, NaN]) {
    assert.throws(() => registry.issue('operator', { ttlMs }), { code: 'TTL_INVALID' }, String(ttlMs));
  }
});

test('authenticate returns null for no credential, an identity for a good one and throws for every bad one', () => {
  const clock = fakeClock();
  const registry = authz.createTokenRegistry({ now: clock.now });
  assert.equal(authz.authenticate(registry, ['Host', 'h']), null);
  const token = registry.issue('visitor');
  const identity = authz.authenticate(registry, bearer(`Bearer ${token}`));
  assert.equal(identity.subject, 'visitor');
  assert.equal(identity.role, 'visitor');
  assert.throws(() => authz.authenticate(registry, bearer('Bearer nope')), { code: 'TOKEN_MALFORMED' });
  assert.throws(() => authz.authenticate(registry, bearer(`Bearer c009_${'C'.repeat(43)}`)), { code: 'TOKEN_UNKNOWN' });
});

test('authentication errors carry a Bearer challenge and never a role', () => {
  const error = new authz.AuthError('TOKEN_EXPIRED');
  assert.equal(error.status, 401);
  assert.equal(error.code, 'TOKEN_EXPIRED');
  assert.match(error.challenge, /^Bearer realm="c009-local"/);
  assert.match(error.challenge, /error="invalid_token"/);
  assert.match(new authz.AuthError('TOKEN_MALFORMED').challenge, /error="invalid_request"/);
  assert.equal(new authz.AuthError('AUTHENTICATION_REQUIRED').challenge, 'Bearer realm="c009-local"');
  assert.equal(Object.hasOwn(error, 'role'), false);
});

test('claimedHeaders names only known claim headers, lowercase, unique and sorted', () => {
  const claimed = authz.claimedHeaders(['Host', 'h', 'X-Role', 'operator', 'x-role', 'conductor', 'X-Roles', 'a', 'Accept', '*/*',
    'X-MS-CLIENT-PRINCIPAL-NAME', 'operator', 'Role', 'operator', 'X-Forwarded-Role', 'operator', 'X-User-Role', 'operator']);
  assert.deepEqual(claimed, ['role', 'x-forwarded-role', 'x-ms-client-principal-name', 'x-role', 'x-roles', 'x-user-role']);
  assert.deepEqual(authz.claimedHeaders(['Host', 'h', 'Accept', '*/*']), []);
});

test('validateInput accepts exactly the specified fields for each command', () => {
  const { validateInput } = contract;
  assert.deepEqual(validateInput('run.create', { name: 'alpha-1', units: 5 }), { ok: true, value: { name: 'alpha-1', units: 5 } });
  assert.equal(validateInput('run.create', { name: 'a', units: 1 }).ok, true);
  assert.equal(validateInput('run.create', { name: 'a'.repeat(32), units: 100 }).ok, true);
  assert.deepEqual(validateInput('scratch.create', { name: 's1' }), { ok: true, value: { name: 's1' } });
  assert.equal(validateInput('pool.resize', { size: 0 }).ok, true);
  assert.equal(validateInput('pool.resize', { size: 20 }).ok, true);
  for (const id of ['exp-001', 'exp-002', 'exp-003']) assert.equal(validateInput('experiment.approve', { experimentId: id }).ok, true);
});

test('validateInput rejects claims, unknown fields, missing fields, wrong types and bounds with typed codes', () => {
  const { validateInput } = contract;
  for (const claim of ['role', 'roles', 'subject', 'owner', 'identity', 'actingAs']) {
    assert.deepEqual(validateInput('run.create', { name: 'a', units: 1, [claim]: 'operator' }), { ok: false, code: 'IDENTITY_CLAIM_REJECTED', field: claim });
  }
  assert.deepEqual(validateInput('run.create', { name: 'a', units: 1, extra: true }), { ok: false, code: 'INPUT_UNKNOWN_FIELD', field: 'extra' });
  assert.equal(validateInput('run.create', JSON.parse('{"__proto__":1,"name":"a","units":1}')).code, 'INPUT_UNKNOWN_FIELD');
  assert.deepEqual(validateInput('run.create', { name: 'a' }), { ok: false, code: 'INPUT_MISSING_FIELD', field: 'units' });
  const invalid = [
    ['run.create', { name: 'a', units: 0 }], ['run.create', { name: 'a', units: 101 }], ['run.create', { name: 'a', units: 1.5 }],
    ['run.create', { name: 'a', units: '5' }], ['run.create', { name: 'Bad Name', units: 1 }], ['run.create', { name: '', units: 1 }],
    ['run.create', { name: 'a'.repeat(33), units: 1 }], ['run.create', { name: 5, units: 1 }], ['pool.resize', { size: 21 }],
    ['pool.resize', { size: -1 }], ['experiment.approve', { experimentId: 'exp-004' }], ['scratch.create', { name: '-lead' }]
  ];
  for (const [command, body] of invalid) assert.deepEqual(validateInput(command, body).code, 'INPUT_INVALID', JSON.stringify([command, body]));
  for (const body of [[], null, 'text', 5, true]) assert.deepEqual(validateInput('run.create', body), { ok: false, code: 'BODY_NOT_OBJECT' });
  assert.equal(validateInput('native.execute', {}).code, 'COMMAND_UNKNOWN');
  assert.equal(validateInput('constructor', {}).code, 'COMMAND_UNKNOWN');
});
