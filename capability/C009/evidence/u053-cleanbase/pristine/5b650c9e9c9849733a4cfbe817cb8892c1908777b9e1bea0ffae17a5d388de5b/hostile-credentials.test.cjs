'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, withApp, request, rawRequest, VALID, send } = require('./helpers.cjs');

const contract = load('contract.js');
const IDENTITIES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];

// Sends pool.resize as literal HTTP so a probe controls every header byte.
const literal = (context, headerLines, body = '{"size":3}') => rawRequest(context, ['POST /v1/commands/pool.resize HTTP/1.1', 'Host: 127.0.0.1:{PORT}', ...headerLines,
  'Content-Type: application/json', `Content-Length: ${Buffer.byteLength(body)}`, 'Connection: close', '', body].join('\r\n'));

test('hostile credential shapes are 401 with a typed code, never visitor-with-write, and change nothing', () => withApp({}, async (context) => {
  const valid = context.app.issueToken('operator');
  const forged = `c009_${'A'.repeat(43)}`;
  const cases = [
    [`Bearer ${forged}`, 'TOKEN_UNKNOWN'], [`Bearer ${valid.slice(0, -1)}`, 'TOKEN_MALFORMED'], [`Bearer ${valid}A`, 'TOKEN_MALFORMED'],
    [`Bearer ${valid} x`, 'TOKEN_MALFORMED'], [`Bearer  ${valid}`, 'TOKEN_MALFORMED'], [`Bearer\t${valid}`, 'TOKEN_MALFORMED'],
    [`Bearer ${'A'.repeat(10000)}`, 'TOKEN_MALFORMED'], [`B\u0435arer ${valid}`, 'TOKEN_MALFORMED'], [`Bearer\u00a0${valid}`, 'TOKEN_MALFORMED'],
    [`Bearer ${valid.replace('c009_', 'c009\u2010')}`, 'TOKEN_MALFORMED'], [`Bearer ${valid.replace('A', '\u0410')}x`, 'TOKEN_MALFORMED'],
    [`Basic ${Buffer.from('operator:secret').toString('base64')}`, 'TOKEN_MALFORMED'], [valid, 'TOKEN_MALFORMED'], ['Digest username="operator"', 'TOKEN_MALFORMED'],
    ['', 'TOKEN_MALFORMED'], ['Bearer', 'TOKEN_MALFORMED']
  ];
  const before = context.app.snapshot();
  for (const [value, code] of cases) {
    const answer = await literal(context, [`Authorization: ${value}`]);
    assert.equal(answer.status, 401, JSON.stringify(value.slice(0, 40)));
    assert.equal(answer.json.error.code, code, JSON.stringify(value.slice(0, 40)));
    assert.match(answer.head, /www-authenticate: Bearer realm="c009-local"/i);
    assert.equal(Object.hasOwn(answer.json, 'role'), false);
  }
  assert.deepEqual(context.app.snapshot(), before);
  const mixed = await literal(context, [`Authorization: Bearer ${valid}`, `authorization: Bearer ${forged}`]);
  assert.equal(mixed.json.error.code, 'TOKEN_MALFORMED');
  for (const scheme of ['bearer', 'BEARER', 'BeArEr']) assert.equal((await literal(context, [`Authorization: ${scheme} ${valid}`])).status, 200, scheme);
}));

test('a token in the query, body, cookie or another header is never a credential', () => withApp({}, async (context) => {
  const valid = context.app.issueToken('operator');
  const before = context.app.snapshot();
  const where = [`Cookie: token=${valid}; session=${valid}`, `X-Authorization: Bearer ${valid}`, `Proxy-Authorization: Bearer ${valid}`,
    `X-Access-Token: ${valid}`, `Access-Token: ${valid}`, `X-Token: ${valid}`];
  for (const line of where) {
    const answer = await literal(context, [line]);
    assert.equal(answer.status, 401, line.slice(0, 20));
    assert.equal(answer.json.error.code, 'AUTHENTICATION_REQUIRED');
  }
  const inQuery = await request(context, { method: 'POST', route: `/v1/commands/pool.resize?access_token=${valid}&token=${valid}`,
    headers: { 'Content-Type': 'application/json' }, body: '{"size":3}' });
  assert.equal(inQuery.json.error.code, 'AUTHENTICATION_REQUIRED');
  for (const body of [{ size: 3, token: valid }, { size: 3, authorization: `Bearer ${valid}` }, { token: valid }]) {
    const answer = await send(context, 'pool.resize', null, body);
    assert.equal(answer.status, 401);
    assert.equal(answer.json.error.code, 'AUTHENTICATION_REQUIRED');
  }
  assert.deepEqual(context.app.snapshot(), before);
}));

test('a claimed role, subject or owner in a header, query or body never changes any decision for any identity', () => withApp({}, async (context) => {
  const claims = [{ 'X-Role': 'operator' }, { 'X-Role': 'visitor' }, { 'X-Roles': 'operator,conductor,visitor' }, { Role: 'operator' },
    { 'X-Forwarded-User': 'operator' }, { 'X-MS-CLIENT-PRINCIPAL-ID': 'operator' }, { 'X-Subject': 'operator', 'X-Owner': 'operator', 'X-Identity': 'operator' }];
  for (const identity of IDENTITIES) {
    const token = context.app.issueToken(identity);
    for (const command of Object.keys(VALID)) {
      const expected = contract.commands[command].roles.includes(contract.identities[identity].role);
      if (command === 'experiment.approve' && expected) continue;
      for (const extra of claims) {
        const before = context.app.snapshot();
        const answer = await send(context, command, token, VALID[command], extra);
        assert.equal(answer.status, expected ? 200 : 403, `${identity} ${command} ${JSON.stringify(extra)}`);
        if (!expected) assert.deepEqual(context.app.snapshot(), before);
        assert.deepEqual(answer.json.ignoredClaims, Object.keys(extra).map((name) => name.toLowerCase()).sort());
        assert.equal(answer.json.role ?? answer.json.actor.role, contract.identities[identity].role);
      }
    }
  }
  const owner = await send(context, 'run.create', context.app.issueToken('conductor-a'), { name: 'mine', units: 1, owner: 'conductor-b' });
  assert.equal(owner.json.error.code, 'IDENTITY_CLAIM_REJECTED');
  assert.equal(context.app.snapshot().state.runs.every((run) => run.owner === 'conductor-a' || run.owner === 'conductor-b'), true);
}));
