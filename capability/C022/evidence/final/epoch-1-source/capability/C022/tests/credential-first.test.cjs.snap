'use strict';

// Decision 1 comes before everything else of a request is read (found by the systematic mutants: dropping the early refusal of a malformed
// credential survived, because the later layers refuse a non-string token the same way, but only AFTER the query, the claims, the media type
// and the body had been judged). On the login route, which accepts an anonymous caller, a malformed credential is 401 TOKEN_MALFORMED
// whatever else is wrong with the request; the control request without the credential shows that each of these is refused for ANOTHER reason.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const contract = require('../contract.js');
const { raw, startApp } = require('./helpers.cjs');

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });

const JSON_TYPE = 'Content-Type: application/json';
const MALFORMED = 'Authorization: Basic YWxmOnB3';

const CASES = [
  ['a tenant claim in a header', '/v1/session/login', [JSON_TYPE, 'X-Tenant: tenant-alder'], '{}', 'TENANT_CLAIM_REJECTED'],
  ['a tenant claim in the query', '/v1/session/login?tenant=tenant-alder', [JSON_TYPE], '{}', 'TENANT_CLAIM_REJECTED'],
  ['a query the route does not take', '/v1/session/login?x=1', [JSON_TYPE], '{}', 'QUERY_INVALID'],
  ['a media type that is not JSON', '/v1/session/login', ['Content-Type: text/plain'], '{}', 'MEDIA_TYPE_UNSUPPORTED'],
  ['a body that is not JSON', '/v1/session/login', [JSON_TYPE], '{"ticket":', 'BODY_INVALID_JSON'],
  ['an empty body', '/v1/session/login', [JSON_TYPE], '', 'BODY_INVALID_JSON'],
  ['a body that fails the input rules', '/v1/session/login', [JSON_TYPE], '{}', contract.validateInput('session.login', {}).code]
];

const send = async (target, headers, body) => (await raw.exchange(ctx.port, raw.request(ctx.port, 'POST', target, { headers, body }), { waitMs: 6000, settleMs: 250 }));

for (const [name, target, headers, body, expected] of CASES) {
  test(`login: a malformed credential is judged before ${name}`, async () => {
    const control = (await send(target, headers, body)).answers[0];
    assert.equal(control.json.outcome, expected, 'without the credential the request is refused for its own reason');
    assert.notEqual(expected, 'TOKEN_MALFORMED');
    const before = ctx.world();
    const result = await send(target, [...headers, MALFORMED], body);
    assert.equal(result.answers.length, 1);
    assert.equal(result.answers[0].status, 401);
    assert.equal(result.answers[0].json.outcome, 'TOKEN_MALFORMED');
    assert.equal(result.closedByServer, true);
    assert.equal(ctx.world(), before, 'nothing changed');
  });
}
