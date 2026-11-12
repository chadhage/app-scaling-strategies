'use strict';
const fs = require('node:fs'), path = require('node:path');
const { assert, fixture, request, login, world, subject } = require('./kit.cjs');
const { sha } = require('./ast.cjs');
const output = process.env.C047_CAPTURE_DIR;
assert.equal(typeof output, 'string', 'EXPLICIT_OWN_RESOURCE_CAPTURE');
const source = fs.readFileSync(path.resolve(__dirname, '..', 'server.cjs'));
const birth = JSON.parse(fs.readFileSync(process.env.C047_ADMISSION)).birth;
assert.equal(birth.pid, process.pid, 'RESOURCE_PROCESS_POSITIVELY_ADMITTED_BEFORE_WORK');
assert.equal(typeof birth.birthFileTime, 'string', 'RESOURCE_BIRTH_NOT_ROUNDED_NUMERIC_TICKS');
const originalDeadline = Date.parse(process.env.C047_WORKER_DEADLINE);
const records = [], startedAtUtc = new Date().toISOString(), initialMemory = process.memoryUsage(), initialCpu = process.cpuUsage();
let active = 0, maximumActive = 0, next = 1, ready = 0, releaseFirst;
const firstEightReady = new Promise(resolve => { releaseFirst = resolve; });
function record(file, value) { fs.writeFileSync(path.join(output, file), JSON.stringify(value, null, 2) + '\n', { flag: 'wx' }); }
async function group(id) {
  const steps = [], result = { id, startedAtUtc: new Date().toISOString(), steps, complete: false, cleanup: null };
  let f;
  active++; maximumActive = Math.max(maximumActive, active);
  fs.appendFileSync(path.join(output, 'resource-chronology.raw.jsonl'), JSON.stringify({ event: 'start', id, active, atUtc: result.startedAtUtc }) + '\n');
  try {
    assert.equal(Date.now() < originalDeadline, true, 'FIXED_WORKER_DEADLINE_BEFORE_RESOURCE_GROUP');
    f = await fixture();
    result.ownedListener = { address: '127.0.0.1', port: f.app.server.address().port, pid: process.pid, birth };
    if (id <= 8) { ready++; if (ready === 8) releaseFirst(); await firstEightReady; }
    async function resourceLogin(user = 'alf', tenant = 'tenant-alder') {
      const before = world(f), signed = await login(f, user, tenant), after = world(f);
      assert.deepEqual(after.resources, before.resources, 'RESOURCE_LOGIN_NO_BUSINESS_EFFECT');
      assert.deepEqual(after.identity.roles, before.identity.roles, 'RESOURCE_LOGIN_CANNOT_CHANGE_MEMBERSHIP_AUTHORITY');
      assert.deepEqual(after.identity.sessions.slice(0, -1), before.identity.sessions, 'RESOURCE_LOGIN_PRESERVES_EVERY_EXISTING_SESSION');
      assert.equal(after.identity.sessions.length, before.identity.sessions.length + 1, 'RESOURCE_LOGIN_EXACTLY_ONE_SESSION');
      assert.equal(signed.session.tenant, tenant, 'RESOURCE_REAL_TICKET_ONE_TENANT_BINDING');
      assert.equal(signed.session.user, user, 'RESOURCE_REAL_TICKET_USER_BINDING');
      assert.equal(signed.session.role, after.identity.roles[tenant][user], 'RESOURCE_ROLE_IS_CURRENT_SERVER_MEMBERSHIP');
      assert.equal(after.identity.sessions.at(-1).sid, signed.session.sid, 'RESOURCE_RETURNED_SESSION_IS_ACTUALLY_STORED');
      assert.deepEqual(after.identity.tickets.slice(0, -1), before.identity.tickets, 'RESOURCE_EXISTING_TICKETS_UNCHANGED');
      assert.equal(after.identity.tickets.length, before.identity.tickets.length + 1, 'RESOURCE_ONLY_ISSUED_TICKET_ADDED');
      assert.equal(after.identity.tickets.at(-1).used, true, 'RESOURCE_REAL_TICKET_SPENT_ONLY_ON_SUCCESS');
      steps.push({ label: 'accepted-login:' + user + ':' + tenant, status: 201, exactlyOneOwnSessionAndTicketEffect: true,
        worldBeforeSha256: sha(JSON.stringify(before)), worldAfterSha256: sha(JSON.stringify(after)) });
      return signed;
    }
    const member = await resourceLogin(), viewer = await resourceLogin('ana'), admin = await resourceLogin('ada'), birch = await resourceLogin('ben', 'tenant-birch');
    result.realAcceptedSessionLogins = 4;
    async function readOrDeny(label, route, options, status, predicate) {
      assert.equal(Date.now() < originalDeadline, true, 'FIXED_WORKER_DEADLINE_DURING_RESOURCE_OPERATIONS');
      const before = world(f), response = await request(f, route, options), after = world(f);
      assert.equal(response.status, status, 'RESOURCE_SPECIFIED_STATUS:' + label);
      assert.deepEqual(after, before, 'RESOURCE_POST_OPERATION_NO_EFFECT:' + label);
      if (predicate) predicate(response);
      steps.push({ label, route, method: options?.method || 'GET', status, outcome: response.json?.outcome || null,
        responseSha256: sha(response.raw), worldBeforeSha256: sha(JSON.stringify(before)), worldAfterSha256: sha(JSON.stringify(after)), noEffect: true });
    }
    {
      const before = world(f), response = await request(f, '/v1/session/anonymous', { method: 'POST' }), after = world(f);
      assert.equal(response.status, 201, 'RESOURCE_INTENDED_ANONYMOUS_BOOTSTRAP_SUCCEEDS_WITHOUT_PREVIEW_PERMISSION');
      assert.equal(response.json.session.state, 'anonymous', 'RESOURCE_ACCEPTED_ANONYMOUS_VIEW');
      assert.deepEqual(after.resources, before.resources, 'RESOURCE_ANONYMOUS_BOOTSTRAP_NO_BUSINESS_EFFECT');
      assert.deepEqual(after.identity.roles, before.identity.roles, 'RESOURCE_ANONYMOUS_BOOTSTRAP_NO_AUTHORITY_EFFECT');
      assert.deepEqual(after.identity.tickets, before.identity.tickets, 'RESOURCE_ANONYMOUS_BOOTSTRAP_NO_TICKET_EFFECT');
      assert.deepEqual(after.identity.sessions.slice(0, -1), before.identity.sessions, 'RESOURCE_ANONYMOUS_BOOTSTRAP_NO_EXISTING_SESSION_EFFECT');
      assert.equal(after.identity.sessions.length, before.identity.sessions.length + 1, 'RESOURCE_ANONYMOUS_BOOTSTRAP_EXACTLY_ONE_OWN_SESSION');
      assert.equal(after.identity.sessions.at(-1).kind, 'anonymous', 'RESOURCE_ANONYMOUS_SESSION_NOT_A_TENANT_CLAIM');
      steps.push({ label: 'accepted-anonymous-bootstrap', status: 201, exactlyOneOwnAnonymousSessionEffect: true });
      await readOrDeny('anonymous-direct', '/candidate', { token: response.json.token }, 401, r => assert.equal(r.json.outcome, 'LOGIN_REQUIRED'));
    }
    for (const route of ['/', '/scope.json']) await readOrDeny('public-scope:' + route, route, {}, 200, r => assert.equal(r.json.cardId, 'C047'));
    await readOrDeny('accepted-session-whoami', '/v1/session', { token: member.token }, 200, r => {
      assert.equal(r.json.session.tenant, 'tenant-alder', 'RESOURCE_WHOAMI_VERIFIED_TENANT');
      assert.equal(r.json.session.user, 'alf', 'RESOURCE_WHOAMI_VERIFIED_USER');
    });
    await readOrDeny('accepted-tenant-switch-refusal', '/v1/session/switch', { method: 'POST', token: member.token, body: { tenant: 'tenant-birch' } }, 403,
      r => assert.equal(r.json.outcome, 'TENANT_SWITCH_REQUIRES_LOGIN', 'RESOURCE_TENANT_SWITCH_REFUSAL_IS_ACCEPTED_POLICY'));
    for (const row of subject.ROUTES.filter(row => row.candidate)) {
      const options = { method: row.method, ...(row.body ? { body: { name: 'refused', units: 1 } } : {}) };
      await readOrDeny('viewer-direct:' + row.path, row.path, { ...options, token: viewer.token }, 403, r => {
        assert.equal(r.json.outcome, 'ROLE_FORBIDDEN', 'RESOURCE_VIEWER_NATURAL_ACCEPTED_REFUSAL');
        assert.equal(/synthetic-00[12]|displayName/.test(r.raw), false, 'RESOURCE_REFUSAL_NO_CANDIDATE_DATA');
      });
      if (row.method === 'GET') await readOrDeny('member-positive:' + row.path, row.path, { token: member.token }, 200, r => {
        assert.equal(r.json.outcome, 'ok', 'RESOURCE_NON_VACUOUS_AUTHORIZED_MOUNT');
        if (row.op === 'profile.list') assert.equal(r.json.profiles[0].profile.id, 'synthetic-001', 'RESOURCE_REAL_C022_CANDIDATE_DATA');
        else assert.equal(r.json.tenant, 'tenant-alder', 'RESOURCE_MANIFEST_ACCEPTED_TENANT');
        assert.equal(/synthetic-002|birch-harbor/.test(r.raw), false, 'RESOURCE_NO_OTHER_TENANT_LEAK');
      });
    }
    for (const [token, tenant, owner] of [[member.token, 'tenant-alder', 'alf'], [birch.token, 'tenant-birch', 'ben']]) {
      const route = tenant === 'tenant-alder' ? '/candidate/projects' : '/v2/projects';
      const before = world(f), response = await request(f, route, { method: 'POST', token, body: { name: 'resource-' + id, units: 1 } }), after = world(f);
      assert.equal(response.status, 201, 'RESOURCE_REAL_ACCEPTED_CREATE_EFFECT');
      assert.equal(response.json.project.owner, owner, 'RESOURCE_SERVER_DERIVED_EFFECT_OWNER');
      assert.deepEqual(after.identity, before.identity, 'RESOURCE_CREATE_DOES_NOT_MUTATE_SESSIONS');
      for (const name of Object.keys(before.resources)) {
        if (name !== tenant) assert.deepEqual(after.resources[name], before.resources[name], 'RESOURCE_FOREIGN_TENANT_NO_EFFECT');
      }
      assert.equal(after.resources[tenant].counter, before.resources[tenant].counter + 1, 'RESOURCE_ONE_OWN_COUNTER_EFFECT');
      assert.equal(after.resources[tenant].projects.length, before.resources[tenant].projects.length + 1, 'RESOURCE_EXACTLY_ONE_OWN_PROJECT_EFFECT');
      assert.deepEqual(after.resources[tenant].projects.slice(0, -1), before.resources[tenant].projects, 'RESOURCE_EXISTING_OWN_PROJECTS_UNCHANGED');
      steps.push({ label: 'owned-create:' + tenant, status: response.status, owner: response.json.project.owner, tenant, exactlyOneOwnedEffect: true,
        worldBeforeSha256: sha(JSON.stringify(before)), worldAfterSha256: sha(JSON.stringify(after)) });
    }
    for (const role of ['viewer', 'member']) {
      const before = world(f), expected = structuredClone(before);
      const response = await request(f, '/v1/admin/role', { method: 'POST', token: admin.token, body: { user: 'alf', role } });
      expected.identity.roles['tenant-alder'].alf = role;
      assert.equal(response.status, 200, 'RESOURCE_REAL_ACCEPTED_ROLE_TRANSITION');
      assert.deepEqual(world(f), expected, 'RESOURCE_ONLY_INTENDED_ROLE_CHANGES');
      steps.push({ label: 'accepted-role:' + role, status: response.status, exactlyIntendedAuthorityEffect: true });
      await readOrDeny('same-token-current-role:' + role, '/candidate', { token: member.token }, role === 'viewer' ? 403 : 200);
    }
    {
      const before = world(f), expected = structuredClone(before);
      const response = await request(f, '/v1/admin/revoke', { method: 'POST', token: admin.token, body: { sid: member.session.sid } });
      expected.identity.sessions.find(row => row.sid === member.session.sid).state = 'revoked';
      assert.equal(response.status, 200, 'RESOURCE_REAL_ACCEPTED_REVOCATION');
      assert.deepEqual(world(f), expected, 'RESOURCE_ONLY_OWN_TARGET_SESSION_REVOKED');
      steps.push({ label: 'accepted-revoke', status: response.status, exactlyIntendedAuthorityEffect: true });
    }
    await readOrDeny('revoked-direct', '/v2/profile.json', { token: member.token }, 401, r => assert.equal(r.json.outcome, 'SESSION_REVOKED'));
    {
      const before = world(f), expected = structuredClone(before);
      const response = await request(f, '/v1/session/logout', { method: 'POST', token: birch.token });
      expected.identity.sessions.find(row => row.sid === birch.session.sid).state = 'logged_out';
      assert.equal(response.status, 200, 'RESOURCE_REAL_ACCEPTED_LOGOUT');
      assert.deepEqual(world(f), expected, 'RESOURCE_ONLY_CALLER_SESSION_LOGGED_OUT');
      steps.push({ label: 'accepted-logout', status: response.status, exactlyIntendedAuthorityEffect: true });
    }
    await readOrDeny('logged-out-direct', '/v2/manifest.json', { token: birch.token }, 401, r => assert.equal(r.json.outcome, 'SESSION_LOGGED_OUT'));
    await readOrDeny('missing-direct', '/assets/candidate.json', {}, 401);
    assert.equal(f.app.queued(), 0, 'RESOURCE_NO_EFFECTS_PENDING_AFTER_OPERATIONS');
    result.complete = true;
  } catch (error) {
    result.failure = { name: error.name, code: error.code, message: error.message, stack: error.stack };
  } finally {
    if (f) {
      try {
        const first = f.app.close(); assert.equal(f.app.close(), first, 'RESOURCE_REPEATED_CLOSE_SAME_OWN_OPERATION'); await first;
        const connections = await new Promise((resolve, reject) => f.app.server.getConnections((error, count) => error ? reject(error) : resolve(count)));
        assert.equal(f.app.server.listening, false, 'RESOURCE_OWN_LISTENER_CLOSED');
        assert.equal(connections, 0, 'RESOURCE_OWN_CONNECTIONS_CONFIRMED_ABSENT');
        assert.equal(f.app.queued(), 0, 'RESOURCE_OWN_EFFECT_QUEUE_EMPTY');
        result.cleanup = { confirmed: true, ownListenerClosed: true, ownConnections: 0, ownQueuedEffects: 0, globalCleanlinessClaimed: false };
      } catch (error) { result.complete = false; result.cleanup = { confirmed: false, error: error.message, stack: error.stack }; }
    } else result.cleanup = { confirmed: false, reason: 'fixture-not-created' };
    active--; result.finishedAtUtc = new Date().toISOString(); records.push(result);
    record('resource-group-' + String(id).padStart(2, '0') + '.json', result);
    fs.appendFileSync(path.join(output, 'resource-chronology.raw.jsonl'), JSON.stringify({ event: 'finish', id, active, complete: result.complete, cleanup: result.cleanup.confirmed, atUtc: result.finishedAtUtc }) + '\n');
  }
}
async function main() {
  await Promise.all(Array.from({ length: 8 }, async () => { while (next <= 64) { const id = next++; await group(id); } }));
  assert.equal(sha(fs.readFileSync(path.resolve(__dirname, '..', 'server.cjs'))), sha(source), 'FINAL_SOURCE_UNCHANGED_DURING_RESOURCE_CAPTURE');
  const report = { schema: 'C047-exactly64-total-complete-groups-at8/1', startedAtUtc, finishedAtUtc: new Date().toISOString(), sourceSha256: sha(source),
    resourceProcessIdentityBeforeWork: birth, totalGroupsAttempted: records.length, totalGroupsComplete: records.filter(row => row.complete).length,
    totalGroupsFailed: records.filter(row => !row.complete).length, totalGroupsCleanupConfirmed: records.filter(row => row.cleanup?.confirmed).length,
    configuredConcurrency: 8, observedMaximumActiveGroups: maximumActive, firstBatchActualListeningBarrier: ready,
    groupIds: records.map(row => row.id).sort((a, b) => a - b), totalActualOperationsWithPostOperationInvariants: records.reduce((sum, row) => sum + row.steps.length, 0),
    nativeBrowserOverlap: false, standaloneBurners: 0, ownAdditionalHeavyCaptures: 0, ownStateAfter: { activeGroups: active },
    cpuMicroseconds: process.cpuUsage(initialCpu), memoryBefore: initialMemory, memoryAfter: process.memoryUsage(), wholeMachineCleanlinessClaimed: false };
  record('resources.json', report); console.log(JSON.stringify(report));
  assert.equal(report.totalGroupsAttempted, 64, 'EXACTLY64_TOTAL_NOT64_TIMES8');
  assert.equal(new Set(report.groupIds).size, 64, 'NO_DUPLICATE_OR_REPLACED_GROUP');
  assert.equal(report.totalGroupsComplete, 64, 'ALL64_COMPLETE_FULL_METHOD_REQUIRED');
  assert.equal(report.totalGroupsCleanupConfirmed, 64, 'ALL64_OWN_CLEANUP_CONFIRMED');
  assert.equal(report.observedMaximumActiveGroups, 8, 'ACTUAL8_WAY_NOT_A_SINGLETON_CORRECTION');
  assert.equal(active, 0, 'ALL_OWN_GROUPS_FINISHED');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
