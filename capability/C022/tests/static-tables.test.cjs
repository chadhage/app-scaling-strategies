'use strict';

// The static tables of server.cjs that no behavior test observed (found by the systematic mutants: a flipped flag survived the whole suite):
// the declared scope (every field, not a sample) and the route table's "takes no body" flag (every route that takes no body refuses one).
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { startApp } = require('./helpers.cjs');

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });

test('scope.json is exactly the declared scope, every field, and the scope is frozen', async () => {
  const expected = {
    cardId: 'C022', businessData: 'synthetic', transport: '127.0.0.1 HTTP only', testRuntime: process.version,
    approvedProductionTarget: 'Node.js 24 LTS / Express / Microsoft Entra ID', tenantIsolationEnforcedServerSide: true,
    authorizationEnforcedServerSide: true, entraIntegrated: false, identityRegistered: false, productionRuntimeValidated: false,
    nativeTargetQualified: false, liveAzureRuns: 0, authorizedCloudSpend: 0
  };
  const res = await ctx.call('GET', '/scope.json');
  assert.equal(res.status, 200);
  assert.deepEqual(res.json, expected);
  assert.deepEqual(require('../server.cjs').scope, expected);
  assert.equal(Object.isFrozen(require('../server.cjs').scope), true);
});

// Every route of the table whose operation takes no body. Each is sent WITH a JSON body and a valid credential of an admin (so that the
// role never answers first): the answer is the typed refusal, the connection is closed and nothing changed (a logout, a delete or a new
// anonymous session that ran behind a flipped flag would change the world).
const NO_BODY = [
  ['POST', '/v1/session/anonymous', null], ['GET', '/v1/session', 'ada'], ['POST', '/v1/session/logout', 'ada'], ['GET', '/v1/projects', 'ada'],
  ['GET', '/v1/projects/proj-0001', 'ada'], ['DELETE', '/v1/projects/proj-0001', 'ada'], ['GET', '/v1/profiles', 'ada'], ['GET', '/v1/profiles/synthetic-001', 'ada'],
  ['GET', '/v1/admin/sessions', 'ada'], ['GET', '/v1/admin/audit', 'ada']
];

for (const [method, target, user] of NO_BODY) {
  test(`${method} ${target} takes no body: a JSON body is refused UNEXPECTED_BODY with the connection closed and no effect`, async () => {
    const { token } = user ? await ctx.session(user) : { token: undefined };
    const before = ctx.world();
    const answer = await ctx.bytes(method, target, { token, body: {} });
    assert.equal(answer.status, 400);
    assert.equal(answer.json.outcome, 'UNEXPECTED_BODY');
    assert.equal(answer.json.error.code, 'UNEXPECTED_BODY');
    assert.equal(answer.closedByServer, true);
    assert.equal(ctx.world(), before, 'a refused request changed nothing');
    if (token) assert.equal((await ctx.call('GET', '/v1/session', { token })).status, 200, 'the credential still works: the refusal did not end the session');
  });
}
