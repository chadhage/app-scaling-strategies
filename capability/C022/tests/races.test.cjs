'use strict';

// Roles and races over REAL sockets. A role change applies at once to every existing token, in both directions. A race is built
// without a sleep: a request is held after its FIRST decision (the body is withheld by the raw client, a hook signals that the server
// is waiting), something else happens, and the body is released: the decision is repeated where the effect is committed.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { raw, startApp } = require('./helpers.cjs');

const TTL_MS = 10 * 60 * 1000;
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};
const within = (promise, ms = 15000) => Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new Error(`no event within ${ms} ms`)), ms).unref())]);

async function rig(t) {
  const hooks = { afterAuthorize: null, beforeCommit: null };
  const ctx = await startApp({ app: { hooks: { afterAuthorize: (info) => hooks.afterAuthorize?.(info), beforeCommit: (info) => hooks.beforeCommit?.(info) } } });
  t.after(() => ctx.close());
  // Holds one project.create after its first decision; returns the pending request and the moment it is held.
  const hold = async (who, name = 'late') => {
    const reached = deferred();
    hooks.afterAuthorize = (info) => { if (info.op === 'project.create') reached.resolve(info); };
    const pending = raw.inflight(ctx.port, 'POST', '/v1/projects', { headers: [`Authorization: Bearer ${who.token}`], body: { name, units: 1 } });
    await within(reached.promise);
    hooks.afterAuthorize = null;
    return pending;
  };
  const names = async (who) => (await ctx.call('GET', '/v1/projects?limit=10', { token: who.token })).json.items.map((item) => item.name);
  return { ctx, hooks, hold, names };
}

test('a role change takes effect at once on EXISTING tokens in both directions; downgrade then re-upgrade is decided by the current role only', async (t) => {
  const { ctx } = await rig(t);
  const ada = await ctx.session('ada');
  const alf = await ctx.session('alf');
  const ana = await ctx.session('ana');
  const create = (who, name) => ctx.call('POST', '/v1/projects', { token: who.token, body: { name, units: 1 } });
  const setRole = (user, role) => ctx.call('POST', '/v1/admin/role', { token: ada.token, body: { user, role } });
  assert.equal((await create(alf, 'before-downgrade')).status, 201);
  assert.deepEqual((await setRole('alf', 'viewer')).json, { outcome: 'ok', user: 'alf', role: 'viewer', changed: true });
  const after = await create(alf, 'after-downgrade');
  assert.equal(after.status, 403, 'the OLD token no longer holds the old privilege');
  assert.equal(after.json.outcome, 'ROLE_FORBIDDEN');
  assert.equal((await ctx.call('GET', '/v1/projects', { token: alf.token })).status, 200, 'it still reads');
  assert.equal((await ctx.call('GET', '/v1/session', { token: alf.token })).json.session.role, 'viewer');
  assert.deepEqual((await setRole('alf', 'viewer')).json.changed, false, 'the same role is a no-op');
  await setRole('alf', 'member');
  assert.equal((await create(alf, 'after-reupgrade')).status, 201, 'after the re-upgrade the same token acts by the CURRENT role');
  assert.equal((await create(ana, 'ana-before')).status, 403);
  await setRole('ana', 'member');
  assert.equal((await create(ana, 'ana-after')).status, 201, 'an upgrade applies at once to the existing token too');
  assert.equal((await ctx.call('GET', '/v1/admin/audit', { token: ana.token })).status, 403);
  await setRole('ana', 'admin');
  assert.equal((await ctx.call('GET', '/v1/admin/audit', { token: ana.token })).status, 200);
  await setRole('ana', 'viewer');
  assert.equal((await ctx.call('GET', '/v1/admin/audit', { token: ana.token })).status, 403);
});

test('the last admin of a tenant cannot be demoted; with a second admin the first may step down', async (t) => {
  const { ctx } = await rig(t);
  const ada = await ctx.session('ada');
  const world = ctx.world();
  const refused = await ctx.call('POST', '/v1/admin/role', { token: ada.token, body: { user: 'ada', role: 'member' } });
  assert.equal(refused.status, 409);
  assert.equal(refused.json.outcome, 'LAST_ADMIN');
  assert.equal(ctx.world(), world);
  await ctx.call('POST', '/v1/admin/role', { token: ada.token, body: { user: 'alf', role: 'admin' } });
  assert.equal((await ctx.call('POST', '/v1/admin/role', { token: ada.token, body: { user: 'ada', role: 'viewer' } })).status, 200);
  const alf = await ctx.session('alf');
  assert.equal((await ctx.call('POST', '/v1/admin/role', { token: alf.token, body: { user: 'alf', role: 'viewer' } })).json.outcome, 'LAST_ADMIN');
});

test('a revoked user\'s in-flight request has no effect: revoke, logout and a role downgrade between the decision and the commit', async (t) => {
  const { ctx, hold, names } = await rig(t);
  const ada = await ctx.session('ada');
  const reader = await ctx.session('ana');
  const cases = [
    ['revoked by an admin', 'SESSION_REVOKED', 401, (who) => ctx.call('POST', '/v1/admin/revoke', { token: ada.token, body: { sid: who.sid } })],
    ['logged out by its owner', 'SESSION_LOGGED_OUT', 401, (who) => ctx.call('POST', '/v1/session/logout', { token: who.token })],
    ['downgraded by an admin', 'ROLE_FORBIDDEN', 403, () => ctx.call('POST', '/v1/admin/role', { token: ada.token, body: { user: 'alf', role: 'viewer' } })],
    ['expired by the clock', 'SESSION_EXPIRED', 401, async () => ctx.clock.advance(TTL_MS)]
  ];
  for (const [index, [name, code, status, event]] of cases.entries()) {
    const alf = await ctx.session('alf');
    const world = ctx.world();
    const pending = await hold(alf, `late-${index}`);
    const happened = await event(alf);
    if (happened && happened.status) assert.equal(happened.status, 200, name);
    pending.release();
    const answer = await within(pending.result);
    assert.equal(answer.status, status, name);
    assert.equal(answer.json.outcome, code, name);
    if (name !== 'expired by the clock') {
      assert.ok(!(await names(reader)).some((item) => item.startsWith('late-')), `${name}: nothing was created`);
      assert.notEqual(ctx.world(), world, `${name}: the competing event itself changed the world`);
    }
    await ctx.call('POST', '/v1/admin/role', { token: (await ctx.session('ada')).token, body: { user: 'alf', role: 'member' } });
  }
});

test('the decision is repeated at the commit: a hook between the first decision and the effect that expires the session leaves no effect', async (t) => {
  const { ctx, hooks } = await rig(t);
  const alf = await ctx.session('alf');
  const world = ctx.world();
  hooks.beforeCommit = (info) => {
    assert.equal(info.op, 'project.create');
    assert.equal(info.user, 'alf');
    ctx.clock.advance(TTL_MS);
  };
  const res = await ctx.call('POST', '/v1/projects', { token: alf.token, body: { name: 'queued', units: 1 } });
  assert.equal(res.status, 401);
  assert.equal(res.json.outcome, 'SESSION_EXPIRED');
  assert.equal(ctx.world(), world);
  hooks.beforeCommit = null;
  const alf2 = await ctx.session('alf');
  hooks.beforeCommit = () => { throw new Error('boom'); };
  const world2 = ctx.world();
  const failed = await ctx.call('POST', '/v1/projects', { token: alf2.token, body: { name: 'queued', units: 1 } });
  assert.equal(failed.status, 500);
  assert.equal(failed.json.outcome, 'INTERNAL_ERROR');
  assert.equal(ctx.world(), world2, 'a failing step fails closed with no effect');
});

test('concurrent logins with ONE ticket: exactly one wins, and exactly one session exists', async (t) => {
  const { ctx } = await rig(t);
  const ada = await ctx.session('ada');
  const ticket = ctx.app.issueTicket({ user: 'alf', tenant: 'tenant-alder' });
  const results = await Promise.all(Array.from({ length: 8 }, () => ctx.call('POST', '/v1/session/login', { body: { ticket } })));
  assert.equal(results.filter((res) => res.status === 201).length, 1);
  assert.equal(results.filter((res) => res.status === 401 && res.json.outcome === 'TICKET_INVALID').length, 7);
  const sessions = (await ctx.call('GET', '/v1/admin/sessions', { token: ada.token })).json.sessions;
  assert.equal(sessions.filter((entry) => entry.user === 'alf').length, 1);
});

test('a login racing a logout and a revoke of the same user leaves every token in exactly one legal state, whatever the arrival order', async (t) => {
  const { ctx } = await rig(t);
  const ada = await ctx.session('ada');
  const alf = await ctx.session('alf');
  const ticket = ctx.app.issueTicket({ user: 'alf', tenant: 'tenant-alder' });
  const [login, logout, revoke] = await Promise.all([
    ctx.call('POST', '/v1/session/login', { body: { ticket } }),
    ctx.call('POST', '/v1/session/logout', { token: alf.token }),
    ctx.call('POST', '/v1/admin/revoke', { token: ada.token, body: { user: 'alf' } })
  ]);
  assert.equal(login.status, 201);
  assert.equal(revoke.status, 200);
  assert.ok(logout.status === 200 || (logout.status === 401 && logout.json.outcome === 'SESSION_REVOKED'), 'logout won, or the revoke had already ended the session');
  const old = (await ctx.call('GET', '/v1/session', { token: alf.token })).json.outcome;
  assert.ok(['SESSION_LOGGED_OUT', 'SESSION_REVOKED'].includes(old), 'the old session is dead in one way or the other, never active again');
  const states = (await ctx.call('GET', '/v1/admin/sessions', { token: ada.token })).json.sessions.filter((entry) => entry.user === 'alf');
  assert.equal(states.length, 2);
  assert.ok(states.every((entry) => ['active', 'logged_out', 'revoked'].includes(entry.state)));
  const fresh = (await ctx.call('GET', '/v1/session', { token: login.json.token })).status;
  assert.equal(fresh, states.find((entry) => entry.sid === login.json.session.sid).state === 'active' ? 200 : 401, 'the answer of the new token agrees with its listed state');
});
