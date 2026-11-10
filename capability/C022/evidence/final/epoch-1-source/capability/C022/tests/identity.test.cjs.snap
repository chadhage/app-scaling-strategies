'use strict';

// The identity and session state machine WITHOUT HTTP: every transition, every refusal with its typed code, no effect from a refusal,
// the derived expiry, the bounds, frozen answers, and two instances that share nothing.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createIdentity } = require('../identity.cjs');
const { manualClock, seededBytes } = require('./helpers.cjs');

const TTL = 600000;
function make(extra = {}) {
  const clock = manualClock();
  const identity = createIdentity({ now: clock.now, randomBytes: seededBytes(extra.seed || 'id'), ...extra.options });
  const login = (user, tenant, anon = null) => identity.login(identity.issueTicket({ user, tenant }), anon);
  return { clock, identity, login };
}
const world = (identity) => JSON.stringify(identity.snapshot());

test('issueTicket refuses an unknown user, an unknown tenant, a bad lifetime and a flood of tickets; used and expired tickets make room', () => {
  const { clock, identity } = make({ options: { limits: { ...require('../contract.js').limits, tickets: 3 } } });
  assert.throws(() => identity.issueTicket({ user: 'mallory', tenant: 'tenant-alder' }), { code: 'IDENTITY_UNKNOWN' });
  assert.throws(() => identity.issueTicket({ user: 'ada', tenant: 'tenant-nowhere' }), { code: 'TENANT_UNKNOWN' });
  assert.throws(() => identity.issueTicket(undefined), { code: 'IDENTITY_UNKNOWN' });
  for (const ttlMs of [-1, 1.5, 600001, '5', NaN]) assert.throws(() => identity.issueTicket({ user: 'ada', tenant: 'tenant-alder' }, { ttlMs }), { code: 'TTL_INVALID' });
  const first = identity.issueTicket({ user: 'ada', tenant: 'tenant-alder' });
  identity.issueTicket({ user: 'alf', tenant: 'tenant-alder' });
  identity.issueTicket({ user: 'ana', tenant: 'tenant-alder' });
  assert.throws(() => identity.issueTicket({ user: 'ada', tenant: 'tenant-alder' }), { code: 'TICKET_LIMIT' });
  assert.equal(identity.login(first, null).ok, true, 'a used ticket becomes room');
  assert.equal(typeof identity.issueTicket({ user: 'ada', tenant: 'tenant-alder' }), 'string');
  clock.advance(121000);
  assert.equal(typeof identity.issueTicket({ user: 'ada', tenant: 'tenant-alder' }), 'string', 'expired tickets make room too');
});

test('a ticket is bound to its user and tenant and spent only when a session is created', () => {
  const { identity } = make();
  const ticket = identity.issueTicket({ user: 'nomad', tenant: 'tenant-alder' });
  const before = world(identity);
  assert.deepEqual(identity.login(ticket, null), { ok: false, code: 'NOT_A_MEMBER' });
  assert.equal(world(identity), before, 'nothing spent');
  const wrongTenant = identity.issueTicket({ user: 'ana', tenant: 'tenant-birch' });
  assert.equal(identity.login(wrongTenant, null).code, 'NOT_A_MEMBER');
  const good = identity.issueTicket({ user: 'dana', tenant: 'tenant-birch' });
  const result = identity.login(good, null);
  assert.equal(result.session.tenant, 'tenant-birch');
  assert.equal(result.session.role, 'viewer', 'dana is a viewer in birch');
  assert.equal(identity.login(good, null).code, 'TICKET_INVALID', 'a spent ticket');
  for (const shape of [undefined, null, 5, '', 'garbage', `t022_${'!'.repeat(43)}`, {}, []]) assert.equal(identity.login(shape, null).code, 'TICKET_INVALID');
});

test('the lifecycle of a session: active, then logged out, revoked, superseded or expired, and never back', () => {
  const { clock, identity, login } = make();
  const a = login('ada', 'tenant-alder');
  const b = login('alf', 'tenant-alder');
  const c = login('ana', 'tenant-alder');
  const anon = identity.startAnonymous();
  const d = login('bea', 'tenant-birch', anon.token);
  assert.equal(anon.session.state, 'anonymous');
  assert.equal(identity.authenticate(anon.token).code, 'SESSION_SUPERSEDED');
  assert.notEqual(d.session.sid, anon.session.sid);
  assert.equal(identity.logout(b.token).session.state, 'logged_out');
  assert.equal(identity.authenticate(b.token).code, 'SESSION_LOGGED_OUT');
  assert.equal(identity.logout(b.token).code, 'SESSION_LOGGED_OUT');
  assert.deepEqual(identity.revokeSession('tenant-alder', c.session.sid), { ok: true, revoked: 1 });
  assert.equal(identity.authenticate(c.token).code, 'SESSION_REVOKED');
  assert.equal(identity.revokeSession('tenant-alder', c.session.sid).code, 'SESSION_NOT_ACTIVE');
  assert.equal(identity.authenticate(a.token).ok, true);
  clock.advance(TTL - 1);
  assert.equal(identity.authenticate(a.token).ok, true);
  clock.advance(1);
  assert.equal(identity.authenticate(a.token).code, 'SESSION_EXPIRED');
  assert.equal(identity.logout(a.token).code, 'SESSION_EXPIRED');
  assert.equal(identity.revokeSession('tenant-alder', a.session.sid).code, 'SESSION_NOT_ACTIVE', 'an expired session cannot be revoked either');
  clock.advance(-1);
  assert.equal(identity.authenticate(a.token).ok, true, 'expiry is derived from the clock: it is not written (and a clock that goes back is honoured)');
});

test('every refusal of a transition leaves the whole state exactly as it was', () => {
  const { clock, identity, login } = make();
  const ada = login('ada', 'tenant-alder');
  const alf = login('alf', 'tenant-alder');
  identity.logout(alf.token);
  const anon = identity.startAnonymous();
  const nomad = identity.issueTicket({ user: 'nomad', tenant: 'tenant-alder' });
  const fresh = identity.issueTicket({ user: 'ana', tenant: 'tenant-alder' });
  const attempts = [
    () => identity.authenticate('x'), () => identity.authenticate(`c022_${'A'.repeat(43)}`), () => identity.authenticate(alf.token), () => identity.authenticate(undefined),
    () => identity.login(nomad, null), () => identity.login('t022_x', null), () => identity.login(fresh, ada.token), () => identity.login(fresh, alf.token),
    () => identity.login(fresh, `c022_${'B'.repeat(43)}`), () => identity.logout(alf.token), () => identity.logout('x'),
    () => identity.revokeSession('tenant-alder', alf.session.sid), () => identity.revokeSession('tenant-birch', ada.session.sid), () => identity.revokeSession('tenant-alder', anon.session.sid),
    () => identity.revokeSession('tenant-alder', 'sid_none'), () => identity.revokeUser('tenant-alder', 'nobody'), () => identity.revokeUser('tenant-birch', 'ada'),
    () => identity.setRole('tenant-alder', 'nobody', 'admin'), () => identity.setRole('tenant-birch', 'ada', 'viewer'), () => identity.setRole('tenant-alder', 'ada', 'viewer'),
    () => identity.setRole('tenant-alder', 'alf', 'member'), () => identity.sessionsOf('tenant-cedar')
  ];
  const before = world(identity);
  for (const [index, attempt] of attempts.entries()) {
    const result = attempt();
    if (Array.isArray(result)) continue;
    assert.equal(result.ok === true && result.changed === false, result.ok, `attempt ${index}: ${JSON.stringify(result)}`);
    assert.equal(world(identity), before, `attempt ${index}: ${JSON.stringify(result)}`);
  }
  clock.advance(1);
  assert.equal(world(identity), before, 'time alone writes nothing');
});

test('roles: a session has no role of its own, a change applies at once in both directions, and the last admin stays', () => {
  const { identity, login } = make();
  const ada = login('ada', 'tenant-alder');
  const alf = login('alf', 'tenant-alder');
  assert.equal(identity.authenticate(alf.token).session.role, 'member');
  assert.deepEqual(identity.setRole('tenant-alder', 'alf', 'viewer'), { ok: true, changed: true });
  assert.equal(identity.authenticate(alf.token).session.role, 'viewer');
  assert.deepEqual(identity.setRole('tenant-alder', 'alf', 'viewer'), { ok: true, changed: false });
  identity.setRole('tenant-alder', 'alf', 'admin');
  assert.equal(identity.authenticate(alf.token).session.role, 'admin');
  assert.deepEqual(identity.setRole('tenant-alder', 'ada', 'member'), { ok: true, changed: true }, 'two admins: one may step down');
  assert.equal(identity.setRole('tenant-alder', 'alf', 'member').code, 'LAST_ADMIN');
  assert.equal(identity.authenticate(ada.token).session.role, 'member');
  const dana = login('dana', 'tenant-alder');
  identity.setRole('tenant-birch', 'dana', 'admin');
  assert.equal(identity.authenticate(dana.token).session.role, 'member', 'the birch membership never touches the alder session');
});

test('quotas: active sessions per tenant and per anonymous scope, and ended records are evicted when the records bound is met', () => {
  const limits = { ...require('../contract.js').limits, sessionsPerTenant: 2, recordsPerTenant: 3, anonymousSessions: 2, anonymousRecords: 3 };
  const { clock, identity, login } = make({ options: { limits } });
  const one = login('ada', 'tenant-alder');
  const two = login('alf', 'tenant-alder');
  const ticket = identity.issueTicket({ user: 'ana', tenant: 'tenant-alder' });
  assert.equal(identity.login(ticket, null).code, 'SESSION_QUOTA_FULL');
  assert.equal(login('bea', 'tenant-birch').ok, true, 'another tenant is not affected');
  identity.logout(one.token);
  const three = identity.login(ticket, null);
  assert.equal(three.ok, true, 'room again, and the same unspent ticket works');
  identity.logout(two.token);
  const four = login('alf', 'tenant-alder');
  assert.equal(four.ok, true);
  assert.equal(identity.authenticate(one.token).code, 'TOKEN_UNKNOWN', 'the oldest ended record was evicted at the records bound');
  assert.equal(identity.authenticate(three.token).ok, true);
  const first = identity.startAnonymous();
  identity.startAnonymous();
  assert.equal(identity.startAnonymous().code, 'ANONYMOUS_QUOTA_FULL');
  clock.advance(300000);
  const later = identity.startAnonymous();
  assert.equal(later.ok, true, 'expired anonymous sessions make room');
  assert.equal(identity.authenticate(first.token).ok === false, true);
  identity.startAnonymous();
  assert.equal(identity.startAnonymous().code, 'ANONYMOUS_QUOTA_FULL');
});

test('answers are frozen and the snapshot is a copy: nothing a consumer does reaches the state', () => {
  const { identity, login } = make();
  const ada = login('ada', 'tenant-alder');
  for (const value of [ada, ada.session, identity.authenticate(ada.token), identity.authenticate(ada.token).session, identity.setRole('tenant-alder', 'alf', 'viewer'), identity.revokeUser('tenant-alder', 'alf'), identity.sessionsOf('tenant-alder'), identity.sessionsOf('tenant-alder')[0], identity.logout(ada.token).session]) {
    assert.equal(Object.isFrozen(value), true);
  }
  const snapshot = identity.snapshot();
  snapshot.roles['tenant-alder'].ada = 'viewer';
  snapshot.sessions.length = 0;
  snapshot.tickets.push({});
  assert.equal(identity.snapshot().roles['tenant-alder'].ada, 'admin');
  assert.equal(identity.snapshot().sessions.length, 1);
});

test('two instances in one process share nothing: tokens, tickets, roles and sessions stay inside their own instance', () => {
  const first = make({ seed: 'same' });
  const second = make({ seed: 'same' });
  const a = first.login('ada', 'tenant-alder');
  assert.equal(second.identity.authenticate(a.token).code, 'TOKEN_UNKNOWN', 'the same seed gives the same token string, which the other instance has never issued');
  const b = second.login('ada', 'tenant-alder');
  assert.equal(b.token, a.token);
  first.identity.setRole('tenant-alder', 'alf', 'viewer');
  assert.equal(second.identity.snapshot().roles['tenant-alder'].alf, 'member');
  first.identity.logout(a.token);
  assert.equal(second.identity.authenticate(b.token).ok, true, 'the neighbour is untouched');
  assert.notEqual(world(first.identity), world(second.identity));
});

test('the defaults are the real ones: the system clock and crypto randomness (tokens differ between instances and runs)', () => {
  const one = createIdentity();
  const two = createIdentity();
  const a = one.login(one.issueTicket({ user: 'ada', tenant: 'tenant-alder' }), null);
  const b = two.login(two.issueTicket({ user: 'ada', tenant: 'tenant-alder' }), null);
  assert.notEqual(a.token, b.token);
  assert.notEqual(a.session.sid, b.session.sid);
  assert.match(a.token, /^c022_[A-Za-z0-9_-]{43}$/);
  // The default clock IS the system clock: with Date.now replaced for one synchronous step the default instance reads exactly that value (no window).
  const realNow = Date.now;
  Date.now = () => 1700000000000;
  try {
    const three = createIdentity();
    const c = three.login(three.issueTicket({ user: 'ada', tenant: 'tenant-alder' }), null);
    assert.equal(c.session.expiresAtMs, 1700000000000 + TTL);
  } finally {
    Date.now = realNow;
  }
});
