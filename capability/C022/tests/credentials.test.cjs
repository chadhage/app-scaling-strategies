'use strict';

// The credential of a request is read the same strict way on EVERY route that reads one (found by the systematic mutants: ignoring the parse
// error of the Authorization header survived the whole suite for the login route). A header that is not exactly ONE well-formed bearer
// credential is 401 TOKEN_MALFORMED and never read as "no credential": on a route that requires one, and on the login route that accepts an
// anonymous one (the ticket is NOT spent). The route that creates an anonymous session reads no credential at all.
const assert = require('node:assert/strict');
const { after, before, test } = require('node:test');
const { raw, startApp } = require('./helpers.cjs');

let ctx;
before(async () => { ctx = await startApp(); });
after(async () => { await ctx.close(); });

const VARIANTS = [
  ['a scheme that is not Bearer', ['Authorization: Basic YWxmOnB3']],
  ['Bearer without a token', ['Authorization: Bearer']],
  ['Bearer with two tokens', ['Authorization: Bearer one two']],
  ['a token over 256 characters', [`Authorization: Bearer ${'x'.repeat(257)}`]],
  ['two Authorization headers', ['Authorization: Bearer a', 'Authorization: Bearer b']],
  ['a token with a character outside the alphabet', ['Authorization: Bearer ab$cd']]
];
const JSON_TYPE = 'Content-Type: application/json';

test('login with a malformed credential is refused TOKEN_MALFORMED, spends nothing, and the same ticket then logs in', async () => {
  const ticket = ctx.app.issueTicket({ user: 'alf', tenant: 'tenant-alder' });
  const before = ctx.world();
  for (const [name, headers] of VARIANTS) {
    const result = await raw.exchange(ctx.port, raw.request(ctx.port, 'POST', '/v1/session/login', { headers: [...headers, JSON_TYPE], body: JSON.stringify({ ticket }) }), { waitMs: 6000, settleMs: 250 });
    const [answer] = result.answers;
    assert.equal(answer.status, 401, name);
    assert.equal(answer.json.outcome, 'TOKEN_MALFORMED', name);
    assert.equal(result.closedByServer, true, name);
    assert.equal(ctx.world(), before, `${name}: the world is unchanged`);
  }
  const good = await ctx.call('POST', '/v1/session/login', { body: { ticket } });
  assert.equal(good.status, 201, 'the ticket was not spent by the refusals');
});

test('every route that requires a credential refuses a malformed one TOKEN_MALFORMED', async () => {
  for (const [method, target] of [['GET', '/v1/session'], ['POST', '/v1/session/logout'], ['GET', '/v1/projects'], ['GET', '/v1/admin/sessions']]) {
    for (const [name, headers] of VARIANTS) {
      const result = await raw.exchange(ctx.port, raw.request(ctx.port, method, target, { headers }), { waitMs: 6000, settleMs: 250 });
      const [answer] = result.answers;
      assert.equal(answer.status, 401, `${method} ${target}: ${name}`);
      assert.equal(answer.json.outcome, 'TOKEN_MALFORMED', `${method} ${target}: ${name}`);
      assert.equal(result.closedByServer, true);
    }
  }
});

test('the route that creates an anonymous session reads no credential: a malformed header is not an error there', async () => {
  for (const [name, headers] of VARIANTS) {
    const result = await raw.exchange(ctx.port, raw.request(ctx.port, 'POST', '/v1/session/anonymous', { headers }), { waitMs: 6000, settleMs: 250 });
    const [answer] = result.answers;
    assert.equal(answer.status, 201, name);
    assert.match(answer.json.token, /^c022_[A-Za-z0-9_-]{43}$/, name);
  }
});

test('a well-formed credential in any case of the scheme is read: bearer, BEARER and Bearer all authenticate', async () => {
  const { token } = await ctx.session('alf');
  for (const scheme of ['Bearer', 'bearer', 'BEARER']) {
    const result = await raw.exchange(ctx.port, raw.request(ctx.port, 'GET', '/v1/session', { headers: [`Authorization: ${scheme} ${token}`] }), { waitMs: 6000, settleMs: 250 });
    assert.equal(result.answers[0].status, 200, scheme);
  }
});
