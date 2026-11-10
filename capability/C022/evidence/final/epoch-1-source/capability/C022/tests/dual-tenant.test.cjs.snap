'use strict';

// One user name, two tenants (found by the independent review of the first publication: `revokeUser` selected the sessions to end from EVERY
// tenant's sessions, an alder admin revoking "dana" ended dana's BIRCH session too, and no test had a user with active sessions in two tenants).
// dana is a member of tenant-alder (member) and of tenant-birch (viewer). Every operation that selects sessions, users, roles, records, counters
// or resources by a name that exists in two tenants runs here with dana (or the same project id) live in BOTH tenants, in BOTH directions, and
// asserts that the other tenant's state is byte-identical afterwards. The same facts are checked in process (identity, service) and over HTTP.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, manualClock, seededBytes, startApp } = require('./helpers.cjs');

const ALDER = 'tenant-alder';
const BIRCH = 'tenant-birch';
const { createCore } = load('server.cjs');

// ---- in process: identity and service ----------------------------------------------------------------------------------------------------

function core(limits = {}) {
  const clock = manualClock();
  const made = createCore({ now: clock.now, randomBytes: seededBytes('dual'), limits });
  const login = (user, tenant) => {
    const result = made.identity.login(made.identity.issueTicket({ user, tenant }), null);
    assert.equal(result.ok, true, `${user} in ${tenant}: ${result.code}`);
    return result;
  };
  const state = (token) => made.identity.authenticate(token);
  const sessions = (tenant) => made.identity.snapshot().sessions.filter((entry) => entry.tenant === tenant);
  return { ...made, clock, login, state, sessions };
}

test('identity: revoking dana in one tenant ends her sessions of that tenant only, in both directions, and an empty revoke ends nothing anywhere', () => {
  for (const [admin, other] of [[ALDER, BIRCH], [BIRCH, ALDER]]) {
    const world = core();
    const first = world.login('dana', ALDER);
    const second = world.login('dana', BIRCH);
    const third = world.login('dana', ALDER);
    const mine = admin === ALDER ? [first, third] : [second];
    const theirs = admin === ALDER ? [second] : [first, third];
    const before = JSON.stringify(world.sessions(other));
    assert.deepEqual(world.identity.revokeUser(admin, 'dana'), { ok: true, revoked: mine.length }, `${admin} ends ${mine.length} session(s)`);
    for (const record of mine) assert.equal(world.state(record.token).code, 'SESSION_REVOKED');
    for (const record of theirs) assert.equal(world.state(record.token).ok, true, `${other}: dana is still signed in`);
    assert.equal(JSON.stringify(world.sessions(other)), before, `${other}: every session record is byte-identical`);
    assert.deepEqual(world.identity.revokeUser(admin, 'dana'), { ok: true, revoked: 0 }, 'a second revoke has nothing left to end');
    for (const record of theirs) assert.equal(world.state(record.token).ok, true, `${other}: still signed in after the second revoke`);
  }
});

test('identity: a user of the other tenant, and a user of no tenant, is "not found" and ends nothing', () => {
  const world = core();
  const dana = world.login('dana', BIRCH);
  assert.deepEqual(world.identity.revokeUser(ALDER, 'bea'), { ok: false, code: 'RESOURCE_NOT_FOUND' });
  assert.deepEqual(world.identity.revokeUser('tenant-cedar', 'dana'), { ok: false, code: 'RESOURCE_NOT_FOUND' }, 'dana is no member of cedar');
  assert.deepEqual(world.identity.revokeUser(ALDER, 'nobody'), { ok: false, code: 'RESOURCE_NOT_FOUND' });
  assert.equal(world.state(dana.token).ok, true);
});

test('identity: a session id of the other tenant is "not found", identical to an id that never existed, in both directions', () => {
  const world = core();
  const inAlder = world.login('dana', ALDER);
  const inBirch = world.login('dana', BIRCH);
  assert.deepEqual(world.identity.revokeSession(ALDER, inBirch.session.sid), world.identity.revokeSession(ALDER, 'sid_never_existed'));
  assert.deepEqual(world.identity.revokeSession(BIRCH, inAlder.session.sid), { ok: false, code: 'RESOURCE_NOT_FOUND' });
  assert.equal(world.state(inBirch.token).ok && world.state(inAlder.token).ok, true);
  assert.deepEqual(world.identity.revokeSession(ALDER, inAlder.session.sid), { ok: true, revoked: 1 });
  assert.equal(world.state(inBirch.token).ok, true);
});

test('identity: a role change names a tenant\'s membership: dana is a member in alder and a viewer in birch, and each change leaves the other tenant\'s role alone', () => {
  const world = core();
  const inAlder = world.login('dana', ALDER);
  const inBirch = world.login('dana', BIRCH);
  assert.equal(world.state(inAlder.token).session.role, 'member');
  assert.equal(world.state(inBirch.token).session.role, 'viewer');
  assert.deepEqual(world.identity.setRole(ALDER, 'dana', 'admin'), { ok: true, changed: true });
  assert.equal(world.state(inAlder.token).session.role, 'admin', 'the change reaches her live alder session at once');
  assert.equal(world.state(inBirch.token).session.role, 'viewer', 'her birch role is untouched');
  assert.deepEqual(world.identity.setRole(BIRCH, 'dana', 'admin'), { ok: true, changed: true });
  assert.deepEqual(world.identity.setRole(ALDER, 'dana', 'viewer'), { ok: true, changed: true });
  assert.equal(world.state(inBirch.token).session.role, 'admin', 'her birch role is what birch set');
  assert.equal(world.state(inAlder.token).session.role, 'viewer', 'her alder role is what alder set');
  assert.deepEqual(world.identity.setRole(ALDER, 'dana', 'viewer'), { ok: true, changed: false });
});

test('identity: the last admin of a tenant stays, whatever admins the other tenants have (a second admin elsewhere is no second admin here)', () => {
  const world = core();
  assert.deepEqual(world.identity.setRole(BIRCH, 'bea', 'member'), { ok: false, code: 'LAST_ADMIN' });
  assert.deepEqual(world.identity.setRole(ALDER, 'dana', 'admin'), { ok: true, changed: true });
  assert.deepEqual(world.identity.setRole(ALDER, 'ada', 'member'), { ok: true, changed: true }, 'alder now has dana as its second admin');
  assert.deepEqual(world.identity.setRole(ALDER, 'dana', 'member'), { ok: false, code: 'LAST_ADMIN' }, 'and dana is its last one');
  assert.deepEqual(world.identity.setRole(BIRCH, 'bea', 'member'), { ok: false, code: 'LAST_ADMIN' }, 'birch is still on its own');
  assert.deepEqual(world.identity.setRole(BIRCH, 'ada', 'member'), { ok: false, code: 'RESOURCE_NOT_FOUND' }, 'ada is no member of birch');
});

test('identity: the session list of a tenant holds that tenant\'s sessions, in the order they were made, and the same user name appears in both lists with different ids', () => {
  const world = core();
  const sessions = [world.login('dana', ALDER), world.login('bea', BIRCH), world.login('ada', ALDER), world.login('dana', BIRCH), world.login('dana', ALDER)];
  const names = (tenant) => world.identity.sessionsOf(tenant).map((entry) => entry.user);
  assert.deepEqual(names(ALDER), ['dana', 'ada', 'dana']);
  assert.deepEqual(names(BIRCH), ['bea', 'dana']);
  assert.deepEqual(world.identity.sessionsOf(ALDER).map((entry) => entry.sid), [sessions[0], sessions[2], sessions[4]].map((entry) => entry.session.sid));
  assert.deepEqual(world.identity.sessionsOf(BIRCH).map((entry) => entry.sid), [sessions[1], sessions[3]].map((entry) => entry.session.sid));
  assert.deepEqual(world.identity.sessionsOf('tenant-cedar'), []);
});

test('identity: a tenant\'s session quota and record bound count that tenant\'s sessions only, in both directions', () => {
  for (const [full, free, users] of [[ALDER, BIRCH, ['ada', 'dana']], [BIRCH, ALDER, ['bea', 'dana']]]) {
    const world = core({ sessionsPerTenant: 2, recordsPerTenant: 4 });
    for (const user of users) world.login(user, full);
    const refused = world.identity.login(world.identity.issueTicket({ user: full === ALDER ? 'alf' : 'ben', tenant: full }), null);
    assert.deepEqual({ ok: refused.ok, code: refused.code }, { ok: false, code: 'SESSION_QUOTA_FULL' }, `${full} is full`);
    const open = world.identity.login(world.identity.issueTicket({ user: 'dana', tenant: free }), null);
    assert.equal(open.ok, true, `${free} still has its own room`);
  }
});

test('identity: an ended record is dropped from ITS OWN tenant when the record bound is met, never from another tenant', () => {
  for (const [crowded, quiet, crowd] of [[ALDER, BIRCH, ['ada', 'dana', 'alf', 'ana']], [BIRCH, ALDER, ['bea', 'dana', 'ben', 'bo']]]) {
    const world = core({ sessionsPerTenant: 3, recordsPerTenant: 3 });
    const quietEnded = world.login(quiet === BIRCH ? 'bea' : 'ada', quiet);
    world.identity.logout(quietEnded.token);
    const first = world.login(crowd[0], crowded);
    const second = world.login(crowd[1], crowded);
    world.login(crowd[2], crowded);
    world.identity.logout(second.token);
    const newest = world.login(crowd[3], crowded);
    assert.equal(newest.ok, true);
    assert.equal(world.state(second.token).code, 'TOKEN_UNKNOWN', `${crowded}: its own oldest ended record was dropped`);
    assert.equal(world.state(first.token).ok, true);
    assert.equal(world.state(quietEnded.token).code, 'SESSION_LOGGED_OUT', `${quiet}: its ended record is still there`);
  }
});

test('service: the audit of a tenant holds that tenant\'s own decisions about dana and nobody else\'s, in both directions', () => {
  const world = core();
  const enter = (tenant) => world.service.login(null, world.identity.issueTicket({ user: 'dana', tenant })).body;
  const inAlder = enter(ALDER);
  const inBirch = enter(BIRCH);
  assert.equal(world.service.execute(inBirch.token, 'project.create', { value: { name: 'birch-new', units: 1 } }).code, 'ROLE_FORBIDDEN');
  assert.equal(world.service.execute(inAlder.token, 'project.create', { value: { name: 'alder-new', units: 1 } }).ok, true);
  const log = (tenant) => world.store.scope(tenant).auditLog().map(({ user, op, outcome, code }) => `${user} ${op} ${outcome} ${code}`);
  assert.deepEqual(log(BIRCH), ['dana session.login applied ok', 'dana project.create denied ROLE_FORBIDDEN']);
  assert.deepEqual(log(ALDER), ['dana session.login applied ok', 'dana project.create applied ok']);
});

test('service: a revoke by user names the verified admin\'s own tenant, whatever user name the body carries (both directions, effect and answer)', () => {
  for (const [adminUser, adminTenant, otherTenant] of [['ada', ALDER, BIRCH], ['bea', BIRCH, ALDER]]) {
    const world = core();
    const admin = world.login(adminUser, adminTenant);
    const mine = world.login('dana', adminTenant);
    const theirs = world.login('dana', otherTenant);
    const answer = world.service.execute(admin.token, 'admin.revoke', { value: { user: 'dana' } });
    assert.equal(answer.ok, true);
    assert.equal(answer.body.revoked, 1);
    assert.equal(world.state(mine.token).code, 'SESSION_REVOKED');
    assert.equal(world.state(theirs.token).ok, true);
  }
});

// ---- over HTTP --------------------------------------------------------------------------------------------------------------------------

async function danaWorld(options) {
  const ctx = await startApp(options);
  return {
    ctx,
    ada: await ctx.session('ada'),
    bea: await ctx.session('bea'),
    danaAlder: await ctx.session('dana', ALDER),
    danaBirch: await ctx.session('dana', BIRCH)
  };
}
const get = (ctx, who, target) => ctx.call('GET', target, { token: who.token });
const post = (ctx, who, target, body) => ctx.call('POST', target, { token: who.token, body });
const identityOf = (ctx, tenant) => JSON.stringify(ctx.app.snapshot().world.identity.sessions.filter((entry) => entry.tenant === tenant));

test('HTTP: the alder admin revokes "dana": her alder session ends, her birch session answers, and birch\'s own session list still says active', async (t) => {
  const world = await danaWorld();
  t.after(() => world.ctx.close());
  const { ctx, ada, bea, danaAlder, danaBirch } = world;
  const birchBefore = identityOf(ctx, BIRCH);
  const answer = await post(ctx, ada, '/v1/admin/revoke', { user: 'dana' });
  assert.equal(answer.status, 200);
  assert.deepEqual({ outcome: answer.json.outcome, revoked: answer.json.revoked }, { outcome: 'ok', revoked: 1 });
  const ended = await get(ctx, danaAlder, '/v1/session');
  assert.equal(ended.status, 401);
  assert.equal(ended.json.outcome, 'SESSION_REVOKED');
  const alive = await get(ctx, danaBirch, '/v1/session');
  assert.equal(alive.status, 200);
  assert.deepEqual({ tenant: alive.json.session.tenant, user: alive.json.session.user, role: alive.json.session.role, state: alive.json.session.state }, { tenant: BIRCH, user: 'dana', role: 'viewer', state: 'active' });
  const birchList = (await get(ctx, bea, '/v1/admin/sessions')).json;
  assert.equal(birchList.sessions.find((entry) => entry.sid === danaBirch.sid).state, 'active', 'the birch admin sees dana\'s session as active');
  assert.equal(identityOf(ctx, BIRCH), birchBefore, 'birch\'s session records are byte-identical');
  const alderList = (await get(ctx, ada, '/v1/admin/sessions')).json;
  assert.equal(alderList.sessions.find((entry) => entry.sid === danaAlder.sid).state, 'revoked');
});

test('HTTP (mirror): the birch admin revokes "dana": her birch session ends, her alder session answers and alder\'s own list still says active', async (t) => {
  const world = await danaWorld();
  t.after(() => world.ctx.close());
  const { ctx, ada, bea, danaAlder, danaBirch } = world;
  const alderBefore = identityOf(ctx, ALDER);
  const answer = await post(ctx, bea, '/v1/admin/revoke', { user: 'dana' });
  assert.deepEqual({ status: answer.status, revoked: answer.json.revoked }, { status: 200, revoked: 1 });
  assert.equal((await get(ctx, danaBirch, '/v1/session')).json.outcome, 'SESSION_REVOKED');
  const alive = await get(ctx, danaAlder, '/v1/session');
  assert.deepEqual({ status: alive.status, tenant: alive.json.session.tenant, role: alive.json.session.role }, { status: 200, tenant: ALDER, role: 'member' });
  const alderList = (await get(ctx, ada, '/v1/admin/sessions')).json;
  assert.equal(alderList.sessions.find((entry) => entry.sid === danaAlder.sid).state, 'active');
  assert.equal(identityOf(ctx, ALDER), alderBefore);
  assert.equal((await get(ctx, bea, '/v1/admin/sessions')).json.sessions.find((entry) => entry.sid === danaBirch.sid).state, 'revoked');
});

test('HTTP: dana with two sessions in alder and one in birch: the alder revoke ends exactly two, a repeated revoke ends none, the birch session never changes', async (t) => {
  const world = await danaWorld();
  t.after(() => world.ctx.close());
  const { ctx, ada, danaBirch } = world;
  const second = await ctx.session('dana', ALDER);
  assert.equal((await post(ctx, ada, '/v1/admin/revoke', { user: 'dana' })).json.revoked, 2);
  assert.equal((await get(ctx, second, '/v1/session')).json.outcome, 'SESSION_REVOKED');
  assert.equal((await post(ctx, ada, '/v1/admin/revoke', { user: 'dana' })).json.revoked, 0);
  assert.equal((await get(ctx, danaBirch, '/v1/session')).status, 200);
});

test('HTTP: a revoke by session id of the other tenant is the answer for an id that never existed, in both directions, and ends nothing', async (t) => {
  const world = await danaWorld();
  t.after(() => world.ctx.close());
  const { ctx, ada, bea, danaAlder, danaBirch } = world;
  const never = await post(ctx, ada, '/v1/admin/revoke', { sid: 'sid_never_existed' });
  const foreign = await post(ctx, ada, '/v1/admin/revoke', { sid: danaBirch.sid });
  assert.deepEqual({ status: foreign.status, json: foreign.json }, { status: never.status, json: never.json });
  assert.equal(foreign.json.outcome, 'RESOURCE_NOT_FOUND');
  const mirror = await post(ctx, bea, '/v1/admin/revoke', { sid: danaAlder.sid });
  assert.equal(mirror.json.outcome, 'RESOURCE_NOT_FOUND');
  assert.equal((await get(ctx, danaAlder, '/v1/session')).status, 200);
  assert.equal((await get(ctx, danaBirch, '/v1/session')).status, 200);
});

test('HTTP: a revoke of "dana" by the admin of a tenant she is no member of is "not found" and ends nothing', async (t) => {
  const world = await danaWorld();
  t.after(() => world.ctx.close());
  const { ctx, danaAlder, danaBirch } = world;
  const cai = await ctx.session('cai');
  const refused = await post(ctx, cai, '/v1/admin/revoke', { user: 'dana' });
  assert.deepEqual({ status: refused.status, outcome: refused.json.outcome }, { status: 404, outcome: 'RESOURCE_NOT_FOUND' });
  assert.equal((await get(ctx, danaAlder, '/v1/session')).status, 200);
  assert.equal((await get(ctx, danaBirch, '/v1/session')).status, 200);
});

test('HTTP: logging dana out of one tenant leaves her session of the other tenant live, in both directions', async (t) => {
  for (const [out, kept] of [['danaAlder', 'danaBirch'], ['danaBirch', 'danaAlder']]) {
    const world = await danaWorld();
    t.after(() => world.ctx.close());
    const { ctx } = world;
    assert.equal((await post(ctx, world[out], '/v1/session/logout')).status, 200);
    assert.equal((await get(ctx, world[out], '/v1/session')).json.outcome, 'SESSION_LOGGED_OUT');
    assert.equal((await get(ctx, world[kept], '/v1/session')).status, 200);
  }
});

test('HTTP: a role change by one tenant\'s admin changes dana\'s role in that tenant only, in both directions (and what each role may do follows)', async (t) => {
  const world = await danaWorld();
  t.after(() => world.ctx.close());
  const { ctx, ada, bea, danaAlder, danaBirch } = world;
  assert.equal((await get(ctx, danaBirch, '/v1/admin/sessions')).json.outcome, 'ROLE_FORBIDDEN', 'a birch viewer reads no admin list');
  const promoted = await post(ctx, ada, '/v1/admin/role', { user: 'dana', role: 'admin' });
  assert.deepEqual({ status: promoted.status, role: promoted.json.role, changed: promoted.json.changed }, { status: 200, role: 'admin', changed: true });
  assert.equal((await get(ctx, danaAlder, '/v1/admin/sessions')).status, 200, 'dana administers alder now');
  assert.equal((await get(ctx, danaBirch, '/v1/admin/sessions')).json.outcome, 'ROLE_FORBIDDEN', 'and still reads nothing of birch\'s');
  assert.equal((await get(ctx, danaBirch, '/v1/session')).json.session.role, 'viewer');
  const demoted = await post(ctx, bea, '/v1/admin/role', { user: 'dana', role: 'member' });
  assert.deepEqual({ status: demoted.status, role: demoted.json.role }, { status: 200, role: 'member' });
  assert.equal((await get(ctx, danaBirch, '/v1/session')).json.session.role, 'member');
  assert.equal((await get(ctx, danaAlder, '/v1/session')).json.session.role, 'admin', 'her alder role is what alder set');
  const last = await post(ctx, bea, '/v1/admin/role', { user: 'bea', role: 'member' });
  assert.deepEqual({ status: last.status, outcome: last.json.outcome }, { status: 409, outcome: 'LAST_ADMIN' }, 'alder\'s second admin is no second admin of birch');
});

test('HTTP: each tenant\'s admin session list holds its own sessions of dana and the other tenant\'s are not in it (and the counts agree)', async (t) => {
  const world = await danaWorld();
  t.after(() => world.ctx.close());
  const { ctx, ada, bea, danaAlder, danaBirch } = world;
  const alder = (await get(ctx, ada, '/v1/admin/sessions')).json;
  const birch = (await get(ctx, bea, '/v1/admin/sessions')).json;
  assert.deepEqual(alder.sessions.map((entry) => entry.sid).sort(), [ada.sid, danaAlder.sid].sort());
  assert.deepEqual(birch.sessions.map((entry) => entry.sid).sort(), [bea.sid, danaBirch.sid].sort());
  assert.deepEqual([alder.count, birch.count], [alder.sessions.length, birch.sessions.length]);
  assert.equal(alder.sessions.some((entry) => entry.sid === danaBirch.sid) || birch.sessions.some((entry) => entry.sid === danaAlder.sid), false);
  assert.deepEqual(alder.sessions.filter((entry) => entry.user === 'dana').length + birch.sessions.filter((entry) => entry.user === 'dana').length, 2, 'the same user name, two sessions, two lists');
});

test('HTTP: the audit trail of a tenant holds that tenant\'s decisions about dana and the other tenant\'s are not in it (both directions)', async (t) => {
  const world = await danaWorld();
  t.after(() => world.ctx.close());
  const { ctx, ada, bea, danaAlder, danaBirch } = world;
  assert.equal((await post(ctx, danaBirch, '/v1/projects', { name: 'birch-new', units: 1 })).json.outcome, 'ROLE_FORBIDDEN');
  assert.equal((await post(ctx, danaAlder, '/v1/projects', { name: 'alder-new', units: 1 })).status, 201);
  const trail = async (admin) => (await get(ctx, admin, '/v1/admin/audit')).json.entries.filter((entry) => entry.user === 'dana').map((entry) => `${entry.op} ${entry.outcome} ${entry.code}`);
  assert.deepEqual(await trail(bea), ['session.login applied ok', 'project.create denied ROLE_FORBIDDEN']);
  assert.deepEqual(await trail(ada), ['session.login applied ok', 'project.create applied ok']);
});

test('HTTP: session quotas and ended records are per tenant: a full tenant refuses, the other tenant still serves, and eviction never reaches across', async (t) => {
  for (const [full, free] of [[ALDER, BIRCH], [BIRCH, ALDER]]) {
    const ctx = await startApp({ app: { limits: { sessionsPerTenant: 2, recordsPerTenant: 3 } } });
    t.after(() => ctx.close());
    const [first, second] = full === ALDER ? ['ada', 'dana'] : ['bea', 'dana'];
    await ctx.session(first, full);
    await ctx.session(second, full);
    const refused = await ctx.login(full === ALDER ? 'alf' : 'ben', full);
    assert.deepEqual({ status: refused.status, outcome: refused.json.outcome }, { status: 409, outcome: 'SESSION_QUOTA_FULL' });
    const open = await ctx.login('dana', free);
    assert.equal(open.status, 201, `${free} has its own quota`);
  }
});

test('HTTP: the same project id in two tenants is two projects: updating or deleting it in one never touches the other (both directions)', async (t) => {
  const world = await danaWorld();
  t.after(() => world.ctx.close());
  const { ctx, ada, bea } = world;
  const read = async (admin) => (await get(ctx, admin, '/v1/projects/proj-0001')).json.project;
  const [alderFirst, birchFirst] = [await read(ada), await read(bea)];
  assert.notEqual(alderFirst.name, birchFirst.name);
  assert.equal((await ctx.call('PUT', '/v1/projects/proj-0001', { token: ada.token, body: { name: 'alder-renamed', units: 9 } })).status, 200);
  assert.deepEqual(await read(bea), birchFirst, 'birch\'s proj-0001 is untouched by alder\'s update');
  assert.equal((await ctx.call('DELETE', '/v1/projects/proj-0001', { token: bea.token })).status, 200);
  assert.equal((await read(ada)).name, 'alder-renamed', 'alder\'s proj-0001 survives birch\'s delete');
  assert.equal((await get(ctx, bea, '/v1/projects/proj-0001')).json.outcome, 'RESOURCE_NOT_FOUND');
  assert.equal((await ctx.call('PUT', '/v1/projects/proj-0001', { token: bea.token, body: { name: 'birch-renamed', units: 1 } })).json.outcome, 'RESOURCE_NOT_FOUND');
  assert.equal((await read(ada)).name, 'alder-renamed');
});
