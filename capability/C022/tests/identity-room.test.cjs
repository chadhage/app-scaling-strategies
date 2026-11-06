'use strict';

// The record bound of a scope and the shapes of identity answers (found by the systematic mutants: dropping the session-id index entry of an
// evicted record, coercing a ticket, and the ok flag of a logout all survived the whole suite). When a scope is at its record bound the oldest
// ended record is dropped COMPLETELY: its token and its session id both read as unknown afterwards, exactly like a record that never
// existed, and no index keeps a reference to it.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const contract = require('../contract.js');
const { createIdentity } = require('../identity.cjs');
const { manualClock, seededBytes } = require('./helpers.cjs');

test('the oldest ended record is dropped completely: unknown by token AND by session id, the next one is still a known ended session', () => {
  const clock = manualClock();
  const identity = createIdentity({ now: clock.now, randomBytes: seededBytes('room'), limits: { ...contract.limits, sessionsPerTenant: 2, recordsPerTenant: 3 } });
  const login = (user) => identity.login(identity.issueTicket({ user, tenant: 'tenant-alder' }), null);
  const ended = [];
  for (const user of ['ada', 'alf', 'ana']) {
    const session = login(user);
    assert.equal(session.ok, true, user);
    identity.logout(session.token);
    ended.push(session);
  }
  assert.equal(identity.sessionsOf('tenant-alder').length, 3, 'the scope is at its record bound');
  assert.equal(login('ada').ok, true, 'a record is dropped to make room');
  assert.equal(identity.sessionsOf('tenant-alder').length, 3, 'the bound holds');
  const [oldest, second] = ended;
  assert.equal(identity.authenticate(oldest.token).code, 'TOKEN_UNKNOWN', 'the dropped record is unknown by token');
  assert.equal(identity.revokeSession('tenant-alder', oldest.session.sid).code, 'RESOURCE_NOT_FOUND', 'and unknown by session id');
  assert.equal(identity.revokeSession('tenant-alder', second.session.sid).code, 'SESSION_NOT_ACTIVE', 'the next one is still a known ended session');
});

test('a ticket that is not a string is refused TICKET_INVALID and never coerced: an array or an object that prints as a valid ticket is not one, and nothing is spent', () => {
  const identity = createIdentity({ now: manualClock().now, randomBytes: seededBytes('ticket') });
  const ticket = identity.issueTicket({ user: 'ada', tenant: 'tenant-alder' });
  const hostile = [[ticket], { toString: () => ticket }, 42, true, {}, [], null, undefined, Symbol('ticket'), () => ticket];
  for (const value of hostile) assert.equal(identity.login(value, null).code, 'TICKET_INVALID', typeof value);
  assert.equal(identity.login(ticket, null).ok, true, 'the real ticket was not spent by any of them');
});

test('logout answers ok with exactly the session id and the new state, and the same token then reads as logged out', () => {
  const identity = createIdentity({ now: manualClock().now, randomBytes: seededBytes('logout') });
  const session = identity.login(identity.issueTicket({ user: 'alf', tenant: 'tenant-alder' }), null);
  assert.deepEqual(identity.logout(session.token), { ok: true, session: { sid: session.session.sid, state: 'logged_out' } });
  assert.equal(identity.authenticate(session.token).code, 'SESSION_LOGGED_OUT');
  assert.equal(identity.logout(session.token).code, 'SESSION_LOGGED_OUT', 'a second logout is refused');
});
