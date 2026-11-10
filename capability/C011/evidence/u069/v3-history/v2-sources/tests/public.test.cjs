'use strict';

// The public routes (the page, its script and style, the scope) and what every answer carries: security headers, a credential that is always verified
// (also on a public route), no query and no body on a public route, GET only, and a typed refusal for everything else.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const { call, get, withApp } = require('./helpers.cjs');
const { scope, startLocal } = require('../server.cjs');

const file = (name) => fs.readFileSync(path.join(__dirname, '..', name));

test('the page, its script and its style are served as the files of the namespace, with their own content type and the strict headers', () => withApp({}, async (ctx) => {
  for (const [route, name, type] of [['/', 'index.html', 'text/html; charset=utf-8'], ['/page.js', 'page.js', 'text/javascript; charset=utf-8'], ['/style.css', 'style.css', 'text/css; charset=utf-8']]) {
    const answer = await call(ctx, null, 'GET', route);
    assert.equal(answer.status, 200, route);
    assert.equal(answer.headers['content-type'], type);
    assert.deepEqual(answer.bytes, file(name), route);
    assert.equal(answer.headers['cache-control'], 'no-store');
    assert.equal(answer.headers['x-content-type-options'], 'nosniff');
    assert.equal(answer.headers['referrer-policy'], 'no-referrer');
    assert.match(answer.headers['content-security-policy'], /^default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'/);
    assert.equal(/unsafe-inline|unsafe-eval/.test(answer.headers['content-security-policy']), false);
  }
}));

test('the scope states what this fixture is and is not', () => withApp({}, async (ctx) => {
  const answer = await call(ctx, null, 'GET', '/scope.json');
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.json, JSON.parse(JSON.stringify(scope)));
  assert.deepEqual(
    [answer.json.cardId, answer.json.businessData, answer.json.transport, answer.json.capacityUnits, answer.json.costUnits, answer.json.leaseIsSubjectOfVerifiedToken, answer.json.authorizedCloudSpend, answer.json.liveAzureRuns],
    ['C011', 'synthetic', '127.0.0.1 HTTP only', 'synthetic', 'synthetic', true, 0, 0]
  );
  assert.deepEqual([answer.json.entraIntegrated, answer.json.identityRegistered, answer.json.productionRuntimeValidated, answer.json.nativeTargetQualified, answer.json.publicState], [false, false, false, false, false]);
  assert.equal(Object.isFrozen(scope), true);
}));

test('a public route takes no query, no body and only GET, and a presented credential is verified even there', () => withApp({}, async (ctx) => {
  for (const route of ['/', '/page.js', '/style.css', '/scope.json']) {
    const query = await call(ctx, null, 'GET', `${route}?x=1`);
    assert.deepEqual([query.status, query.json.error.code, query.headers.connection], [400, 'QUERY_NOT_ALLOWED', 'close'], route);
    const body = await call(ctx, null, 'GET', route, '{}');
    assert.deepEqual([body.status, body.json.error.code], [400, 'UNEXPECTED_BODY'], route);
    const wrong = await call(ctx, null, 'POST', route, '{}');
    assert.deepEqual([wrong.status, wrong.json.error.code], [405, 'METHOD_NOT_ALLOWED'], route);
    const forged = await call(ctx, `c009_${'A'.repeat(43)}`, 'GET', route);
    assert.deepEqual([forged.status, forged.json.error.code], [401, 'TOKEN_UNKNOWN'], route);
    const malformed = await call(ctx, 'abc', 'GET', route);
    assert.deepEqual([malformed.status, malformed.json.error.code], [401, 'TOKEN_MALFORMED'], route);
    const valid = await get(ctx, 'visitor', route);
    assert.equal(valid.status, 200, route);
  }
}));

test('a refusal carries the same strict headers and the challenge of the credential that failed', () => withApp({}, async (ctx) => {
  const anonymous = await call(ctx, null, 'GET', '/v1/allowance');
  assert.equal(anonymous.status, 401);
  assert.match(anonymous.headers['www-authenticate'], /realm="c009-local"/);
  assert.equal(anonymous.headers['cache-control'], 'no-store');
  assert.match(anonymous.headers['content-security-policy'], /^default-src 'none'/);
  const forged = await call(ctx, `c009_${'A'.repeat(43)}`, 'GET', '/v1/allowance');
  assert.match(forged.headers['www-authenticate'], /invalid_token/);
  const refused = await call(ctx, ctx.tokens.visitor, 'GET', '/v1/allowance');
  assert.equal(refused.headers['www-authenticate'], undefined);
  assert.equal(refused.headers['x-c009-scope'], 'synthetic-loopback-only');
}));

test('startLocal listens on 127.0.0.1 only, on an automatic port, with one token per synthetic identity and the token lifetime asked for', async () => {
  const first = await startLocal({ tokenMs: 123456 });
  const second = await startLocal({});
  try {
    assert.deepEqual(Object.keys(first.tokens), ['visitor', 'conductor-a', 'conductor-b', 'operator']);
    assert.deepEqual(first.app.server.address().address, '127.0.0.1');
    assert.notEqual(first.port, second.port);
    assert.equal(first.origin, `http://127.0.0.1:${first.port}`);
    assert.equal(new Set(Object.values(first.tokens)).size, 4);
    assert.equal((await call(first, first.tokens.operator, 'GET', '/v1/me')).json.role, 'operator');
    assert.equal((await call(first, second.tokens.operator, 'GET', '/v1/me')).json.error.code, 'TOKEN_UNKNOWN');
    assert.deepEqual(first.app.health(), { ok: true, reason: null });
    assert.equal(first.app.config.pool.units, 100);
  } finally {
    await first.close();
    await second.close();
  }
});
