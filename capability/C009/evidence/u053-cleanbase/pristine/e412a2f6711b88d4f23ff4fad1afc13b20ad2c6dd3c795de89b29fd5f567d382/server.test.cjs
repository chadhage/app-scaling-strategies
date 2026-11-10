'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, fakeClock, withApp, request, rawRequest, VALID, send, preview } = require('./helpers.cjs');

const contract = load('contract.js');
const IDENTITIES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const COMMANDS = Object.keys(VALID);
const state = async (context) => (await request(context, { route: '/v1/state' })).json;
const unchanged = async (context, before, action) => {
  const result = await action();
  assert.deepEqual(context.app.snapshot(), before, 'state and revision are unchanged');
  return result;
};
const waitFor = async (predicate) => {
  for (let attempt = 0; attempt < 400; attempt += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  throw new Error('condition not reached');
};
// A promise a naive server never settles must fail fast as an assertion, not hang the file until the runner timeout.
const within = (promise, label, ms = 3000) => {
  let timer;
  const late = new Promise((resolve, reject) => { timer = setTimeout(() => reject(new assert.AssertionError({ message: `${label} was not reached` })), ms); });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
};

const MATRIX = [
  ['conductor-a', 'run.create', 200, 'ok'], ['conductor-b', 'scratch.create', 200, 'ok'],
  ['operator', 'pool.resize', 200, 'ok'], ['operator', 'experiment.approve', 200, 'ok'],
  ['visitor', 'run.create', 403, 'ROLE_FORBIDDEN'], ['visitor', 'scratch.create', 403, 'ROLE_FORBIDDEN'],
  ['visitor', 'pool.resize', 403, 'ROLE_FORBIDDEN'], ['visitor', 'experiment.approve', 403, 'ROLE_FORBIDDEN'],
  ['conductor-a', 'pool.resize', 403, 'ROLE_FORBIDDEN'], ['conductor-b', 'experiment.approve', 403, 'ROLE_FORBIDDEN'],
  ['operator', 'run.create', 403, 'ROLE_FORBIDDEN'], ['operator', 'scratch.create', 403, 'ROLE_FORBIDDEN']
];
for (const [identity, command, status, outcome] of MATRIX) {
  test(`${identity} sends ${command}: HTTP ${status} ${outcome}`, () => withApp({}, async (context) => {
    const token = context.app.issueToken(identity);
    const before = context.app.snapshot();
    const answer = await send(context, command, token);
    assert.equal(answer.status, status);
    assert.equal(answer.json.outcome, outcome);
    if (status === 200) {
      assert.equal(answer.json.actor.subject, identity);
      assert.equal(answer.json.actor.role, contract.identities[identity].role);
      assert.equal(answer.json.revision, before.revision + 1);
      assert.equal(context.app.snapshot().revision, before.revision + 1);
    } else {
      assert.equal(answer.json.error.code, 'ROLE_FORBIDDEN');
      assert.equal(answer.json.role, contract.identities[identity].role);
      assert.deepEqual(answer.json.requiredRoles, [...contract.commands[command].roles]);
      assert.deepEqual(context.app.snapshot(), before);
    }
  }));
}

test('every identity and command agrees with the permission table, and only the table', () => withApp({}, async (context) => {
  for (const identity of IDENTITIES) {
    for (const command of COMMANDS) {
      const token = context.app.issueToken(identity);
      const answer = await send(context, command, token, VALID[command]);
      const allowed = contract.commands[command].roles.includes(contract.identities[identity].role);
      assert.equal(answer.status, allowed ? 200 : 403, `${identity} ${command}`);
    }
  }
}));

test('forbidden commands have no effect, return typed errors and are audited with the server-derived identity', () => withApp({}, async (context) => {
  const cases = [['visitor', 'run.create'], ['conductor-a', 'pool.resize'], ['operator', 'scratch.create'], ['conductor-b', 'experiment.approve']];
  const before = context.app.snapshot();
  const publicBefore = await state(context);
  for (const [identity, command] of cases) {
    const answer = await unchanged(context, before, () => send(context, command, context.app.issueToken(identity)));
    assert.equal(answer.status, 403);
    assert.equal(answer.json.error.code, 'ROLE_FORBIDDEN');
    assert.equal(answer.json.command, command);
    assert.equal(Number.isInteger(answer.json.auditSeq), true);
    const entry = context.app.auditLog().at(-1);
    assert.equal(entry.seq, answer.json.auditSeq);
    assert.deepEqual({ outcome: entry.outcome, code: entry.code, command: entry.command, subject: entry.subject, role: entry.role },
      { outcome: 'denied', code: 'ROLE_FORBIDDEN', command, subject: identity, role: contract.identities[identity].role });
  }
  assert.deepEqual(await state(context), publicBefore);
}));

test('ownership is stamped from the verified token and never from the body', () => withApp({}, async (context) => {
  const a = context.app.issueToken('conductor-a');
  const b = context.app.issueToken('conductor-b');
  assert.equal((await send(context, 'run.create', a)).status, 200);
  assert.equal((await send(context, 'run.create', b, { name: 'beta', units: 7 })).status, 200);
  assert.equal((await send(context, 'scratch.create', b)).status, 200);
  const { state: now } = await state(context);
  assert.deepEqual(now.runs, [{ id: 'run-0001', name: 'alpha', units: 5, owner: 'conductor-a' }, { id: 'run-0002', name: 'beta', units: 7, owner: 'conductor-b' }]);
  assert.deepEqual(now.scratches, [{ id: 'scratch-0001', name: 'scratch-a', owner: 'conductor-b' }]);
  const before = context.app.snapshot();
  for (const claim of ['owner', 'role', 'subject', 'roles', 'identity', 'actingAs']) {
    const answer = await unchanged(context, before, () => send(context, 'run.create', a, { name: 'x', units: 1, [claim]: 'conductor-b' }));
    assert.equal(answer.status, 400, claim);
    assert.equal(answer.json.error.code, 'IDENTITY_CLAIM_REJECTED');
  }
}));

test('a duplicate approval is a typed conflict with no effect', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  assert.equal((await send(context, 'experiment.approve', operator)).status, 200);
  const before = context.app.snapshot();
  const again = await unchanged(context, before, () => send(context, 'experiment.approve', operator));
  assert.equal(again.status, 409);
  assert.equal(again.json.error.code, 'ALREADY_APPROVED');
  assert.deepEqual(before.state.approvals, [{ experimentId: 'exp-001', approvedBy: 'operator' }]);
}));

const CREDENTIALS = [
  ['no Authorization header', {}, 'AUTHENTICATION_REQUIRED'],
  ['a Basic scheme', { Authorization: 'Basic dXNlcjpwYXNz' }, 'TOKEN_MALFORMED'],
  ['an empty bearer token', { Authorization: 'Bearer ' }, 'TOKEN_MALFORMED'],
  ['a token of the wrong shape', { Authorization: 'Bearer abc' }, 'TOKEN_MALFORMED'],
  ['a well-formed token this server never made', { Authorization: `Bearer c009_${'Z'.repeat(43)}` }, 'TOKEN_UNKNOWN']
];
for (const [name, headers, code] of CREDENTIALS) {
  test(`${name} is 401 ${code} and never degrades to a visitor with write access`, () => withApp({}, async (context) => {
    const before = context.app.snapshot();
    for (const command of ['run.create', 'pool.resize']) {
      const answer = await unchanged(context, before, () => send(context, command, null, VALID[command], headers));
      assert.equal(answer.status, 401);
      assert.equal(answer.json.error.code, code);
      assert.match(answer.headers['www-authenticate'], /^Bearer realm="c009-local"/);
      assert.equal(Object.hasOwn(answer.json, 'role'), false);
    }
    const entry = context.app.auditLog().at(-1);
    assert.deepEqual({ outcome: entry.outcome, code: entry.code, subject: entry.subject, role: entry.role }, { outcome: 'unauthenticated', code, subject: null, role: null });
  }));
}

test('two Authorization headers are TOKEN_MALFORMED even when both carry valid tokens', () => withApp({}, async (context) => {
  const a = context.app.issueToken('conductor-a');
  const b = context.app.issueToken('operator');
  const before = context.app.snapshot();
  const answer = await unchanged(context, before, () => rawRequest(context, [
    'POST /v1/commands/run.create HTTP/1.1', 'Host: 127.0.0.1:{PORT}', `Authorization: Bearer ${a}`, `Authorization: Bearer ${b}`,
    'Content-Type: application/json', 'Content-Length: 28', 'Connection: close', '', '{"name":"alpha","units":5}   '].join('\r\n')));
  assert.equal(answer.status, 401);
  assert.equal(answer.json.error.code, 'TOKEN_MALFORMED');
}));

test('a token issued here whose lifetime ended is 401 TOKEN_EXPIRED with no effect', () => withApp({}, async (context) => {
  const token = context.app.issueToken('conductor-a', { ttlMs: 1000 });
  context.clock.advance(999);
  assert.equal((await send(context, 'run.create', token)).status, 200);
  context.clock.advance(1);
  const before = context.app.snapshot();
  const answer = await unchanged(context, before, () => send(context, 'run.create', token));
  assert.equal(answer.status, 401);
  assert.equal(answer.json.error.code, 'TOKEN_EXPIRED');
  assert.match(answer.headers['www-authenticate'], /invalid_token/);
}));

const CLAIMS = [['X-Role', 'operator'], ['X-User-Role', 'operator'], ['X-Roles', 'operator,conductor'], ['Role', 'operator'],
  ['X-Forwarded-Role', 'operator'], ['X-MS-CLIENT-PRINCIPAL-NAME', 'operator']];
for (const [header, value] of CLAIMS) {
  test(`a visitor claiming "${header}: ${value}" is still a visitor and the claim is ignored, not reflected`, () => withApp({}, async (context) => {
    const visitor = context.app.issueToken('visitor');
    const before = context.app.snapshot();
    const answer = await unchanged(context, before, () => send(context, 'pool.resize', visitor, VALID['pool.resize'], { [header]: value }));
    assert.equal(answer.status, 403);
    assert.equal(answer.json.role, 'visitor');
    assert.deepEqual(answer.json.ignoredClaims, [header.toLowerCase()]);
    assert.equal(context.app.auditLog().at(-1).role, 'visitor');
    const unique = await send(context, 'pool.resize', visitor, VALID['pool.resize'], { [header]: 'forged-value-7' });
    assert.equal(unique.text.includes('forged-value-7'), false, 'claim values are never reflected');
    const seen = await preview(context, 'pool.resize', visitor, { [header]: value });
    assert.equal(seen.json.preview.allowed, false);
    assert.equal(seen.json.preview.role, 'visitor');
  }));
}

test('a claim in the query string is ignored for a visitor and rejected after authorization for others', () => withApp({}, async (context) => {
  const visitor = context.app.issueToken('visitor');
  const operator = context.app.issueToken('operator');
  const before = context.app.snapshot();
  const denied = await unchanged(context, before, () => request(context, { method: 'POST', route: '/v1/commands/pool.resize?role=operator',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${visitor}` }, body: '{"size":3}' }));
  assert.equal(denied.status, 403);
  assert.equal(denied.json.role, 'visitor');
  const rejected = await unchanged(context, before, () => request(context, { method: 'POST', route: '/v1/commands/pool.resize?subject=visitor',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${operator}` }, body: '{"size":3}' }));
  assert.equal(rejected.status, 400);
  assert.equal(rejected.json.error.code, 'QUERY_NOT_ALLOWED');
}));

test('claims cannot lower an operator or raise a conductor', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const conductor = context.app.issueToken('conductor-a');
  const lowered = await send(context, 'pool.resize', operator, VALID['pool.resize'], { 'X-Role': 'visitor', 'X-Roles': 'visitor' });
  assert.equal(lowered.status, 200);
  assert.deepEqual(lowered.json.ignoredClaims, ['x-role', 'x-roles']);
  const before = context.app.snapshot();
  const raised = await unchanged(context, before, () => send(context, 'pool.resize', conductor, VALID['pool.resize'], { 'X-Roles': 'operator' }));
  assert.equal(raised.status, 403);
  assert.equal(raised.json.role, 'conductor');
}));

const ROUTES = [
  ['an unknown command', 'native.execute', 404, 'COMMAND_UNKNOWN'], ['an inherited name', 'constructor', 404, 'COMMAND_UNKNOWN'],
  ['a prototype name', '__proto__', 400, 'COMMAND_NAME_INVALID'], ['a traversal name', '..%2Fadmin', 400, 'COMMAND_NAME_INVALID'],
  ['a broken percent escape', '%E0%A4%A', 400, 'COMMAND_NAME_INVALID'], ['upper case', 'Pool.Resize', 400, 'COMMAND_NAME_INVALID'],
  ['an overlong name', 'a'.repeat(100), 400, 'COMMAND_NAME_INVALID'], ['a literal traversal path', '../admin', 404, 'NOT_FOUND']
];
for (const [name, route, status, code] of ROUTES) {
  test(`the operator sending ${name} gets ${status} ${code} and nothing changes`, () => withApp({}, async (context) => {
    const before = context.app.snapshot();
    const answer = await unchanged(context, before, () => send(context, route, context.app.issueToken('operator'), {}));
    assert.equal(answer.status, status);
    assert.equal(answer.json.error.code, code);
  }));
}

const BODIES = [
  ['an unknown field', '{"size":3,"extra":1}', 400, 'INPUT_UNKNOWN_FIELD'], ['a wrong type', '{"size":"3"}', 400, 'INPUT_INVALID'],
  ['out of bounds', '{"size":21}', 400, 'INPUT_INVALID'], ['a missing field', '{}', 400, 'INPUT_MISSING_FIELD'],
  ['invalid JSON', '{', 400, 'BODY_INVALID_JSON'], ['an array', '[]', 400, 'BODY_NOT_OBJECT'], ['null', 'null', 400, 'BODY_NOT_OBJECT'],
  ['an empty body', '', 400, 'BODY_INVALID_JSON'], ['an identity claim', '{"size":3,"role":"operator"}', 400, 'IDENTITY_CLAIM_REJECTED']
];
for (const [name, body, status, code] of BODIES) {
  test(`the operator sending ${name} gets ${status} ${code} and nothing changes`, () => withApp({}, async (context) => {
    const before = context.app.snapshot();
    const answer = await unchanged(context, before, () => send(context, 'pool.resize', context.app.issueToken('operator'), body));
    assert.equal(answer.status, status);
    assert.equal(answer.json.error.code, code);
    const entry = context.app.auditLog().at(-1);
    assert.deepEqual({ outcome: entry.outcome, code: entry.code, subject: entry.subject }, { outcome: 'rejected', code, subject: 'operator' });
  }));
}

test('the body limit is exact, enforced for chunked uploads too, and the media type must be JSON', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const limit = contract.limits.bodyBytes;
  const pad = (length) => `{"size":3}${' '.repeat(length - '{"size":3}'.length)}`;
  assert.equal((await send(context, 'pool.resize', operator, pad(limit))).status, 200);
  const before = context.app.snapshot();
  const over = await unchanged(context, before, () => send(context, 'pool.resize', operator, pad(limit + 1)));
  assert.equal(over.status, 413);
  assert.equal(over.json.error.code, 'BODY_TOO_LARGE');
  const chunk = 'a'.repeat(1024);
  const chunked = await unchanged(context, before, () => rawRequest(context, [
    'POST /v1/commands/pool.resize HTTP/1.1', 'Host: 127.0.0.1:{PORT}', `Authorization: Bearer ${operator}`, 'Content-Type: application/json',
    'Transfer-Encoding: chunked', 'Connection: close', '', ...Array.from({ length: 6 }, () => `400\r\n${chunk}`), '0', '', ''].join('\r\n')));
  assert.equal(chunked.status, 413);
  assert.equal(chunked.json.error.code, 'BODY_TOO_LARGE');
  for (const type of ['text/plain', 'application/jsonx', 'application/x-www-form-urlencoded', '']) {
    const answer = await unchanged(context, before, () => send(context, 'pool.resize', operator, '{"size":3}', { 'Content-Type': type }));
    assert.equal(answer.status, 415, JSON.stringify(type));
    assert.equal(answer.json.error.code, 'MEDIA_TYPE_UNSUPPORTED');
  }
  for (const type of ['application/json; charset=utf-8', 'APPLICATION/JSON']) {
    assert.equal((await send(context, 'pool.resize', operator, '{"size":4}', { 'Content-Type': type })).status, 200, type);
  }
}));

test('forbidden is decided before any input is read: no validation detail reaches a forbidden identity', () => withApp({}, async (context) => {
  const visitor = context.app.issueToken('visitor');
  const before = context.app.snapshot();
  const attempts = [['invalid JSON', '{', {}], ['an oversized body', 'x'.repeat(5000), {}], ['the wrong media type', '{"size":3}', { 'Content-Type': 'text/plain' }],
    ['an unknown field', '{"size":3,"extra":1}', {}]];
  for (const [name, body, headers] of attempts) {
    const answer = await unchanged(context, before, () => send(context, 'pool.resize', visitor, body, headers));
    assert.equal(answer.status, 403, name);
    assert.equal(answer.json.error.code, 'ROLE_FORBIDDEN');
  }
}));

test('mutation commands are POST only and reads never mutate', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const before = context.app.snapshot();
  for (const method of ['GET', 'PUT', 'PATCH', 'DELETE', 'OPTIONS', 'HEAD']) {
    const answer = await unchanged(context, before, () => request(context, { method, route: '/v1/commands/pool.resize?size=9', headers: { Authorization: `Bearer ${operator}` } }));
    assert.equal(answer.status, 405, method);
    assert.equal(answer.headers.allow, 'POST');
    if (method !== 'HEAD') assert.equal(answer.json.error.code, 'METHOD_NOT_ALLOWED');
  }
  for (const route of ['/v1/state', '/v1/authorization/preview?command=pool.resize', '/scope.json', '/']) {
    const answer = await unchanged(context, before, () => request(context, { method: 'POST', route, headers: { Authorization: `Bearer ${operator}`, 'Content-Type': 'application/json' }, body: '{"size":9}' }));
    assert.equal(answer.status, 405, route);
    assert.equal(answer.headers.allow, 'GET');
  }
}));

test('a command without a table entry is unknown, one with no roles is denied for every identity, and neither handler runs', () => {
  let ran = 0;
  const handler = () => { ran += 1; return { state: undefined, result: {} }; };
  const options = { app: { commands: { 'lab.new': {}, 'lab.empty': { roles: [] } }, handlers: { 'lab.new': handler, 'lab.empty': handler, 'lab.orphan': handler } } };
  return withApp(options, async (context) => {
    const before = context.app.snapshot();
    for (const identity of IDENTITIES) {
      const token = context.app.issueToken(identity);
      for (const command of ['lab.new', 'lab.empty']) {
        const answer = await unchanged(context, before, () => send(context, command, token, {}));
        assert.equal(answer.status, 403);
        assert.equal(answer.json.error.code, 'ROLE_FORBIDDEN');
        assert.deepEqual(answer.json.requiredRoles, []);
      }
      const orphan = await unchanged(context, before, () => send(context, 'lab.orphan', token, {}));
      assert.equal(orphan.status, 404);
      assert.equal(orphan.json.error.code, 'COMMAND_UNKNOWN');
    }
    assert.equal(ran, 0);
  });
});

test('every shipped handler has a permission entry and every permission entry has a handler', () => {
  const { defaultHandlers } = load('server.cjs');
  assert.deepEqual(Object.keys(defaultHandlers).sort(), Object.keys(contract.commands).sort());
});

test('the preview is the decision the server enforces: same flag, code and status for every identity and command', () => {
  return Promise.all(IDENTITIES.map((identity) => withApp({}, async (context) => {
    const token = context.app.issueToken(identity);
    for (const command of [...COMMANDS, 'native.execute']) {
      const snapshot = context.app.snapshot();
      const auditLength = context.app.auditLog().length;
      const seen = await preview(context, command, token);
      assert.equal(seen.status, 200);
      assert.deepEqual(context.app.snapshot(), snapshot, 'a preview never changes state or the revision');
      assert.equal(context.app.auditLog().length, auditLength, 'a preview is not a command');
      const actual = await send(context, command, token, VALID[command] || {});
      const { preview: decision } = seen.json;
      assert.equal(decision.command, command);
      assert.equal(decision.allowed, actual.status === 200, `${identity} ${command}`);
      assert.equal(decision.status, actual.status);
      assert.equal(decision.code, actual.json.outcome);
      assert.equal(decision.role, contract.identities[identity].role);
      assert.equal(decision.subject, identity);
    }
  })));
});

test('preview needs a valid credential, exactly one well-formed command parameter, and reports ignored claim names', () => withApp({}, async (context) => {
  const token = context.app.issueToken('conductor-a', { ttlMs: 1000 });
  assert.equal((await preview(context, 'run.create', null)).json.error.code, 'AUTHENTICATION_REQUIRED');
  assert.equal((await preview(context, 'run.create', 'bad')).json.error.code, 'TOKEN_MALFORMED');
  for (const route of ['/v1/authorization/preview', '/v1/authorization/preview?command=run.create&command=pool.resize',
    '/v1/authorization/preview?command=run.create&role=operator', '/v1/authorization/preview?cmd=run.create']) {
    const answer = await request(context, { route, headers: { Authorization: `Bearer ${token}` } });
    assert.equal(answer.status, 400, route);
    assert.equal(answer.json.error.code, 'QUERY_INVALID');
  }
  const invalid = await preview(context, 'Run Create', token);
  assert.equal(invalid.status, 400);
  assert.equal(invalid.json.error.code, 'COMMAND_NAME_INVALID');
  const claimed = await preview(context, 'run.create', token, { 'X-Role': 'operator', 'X-Roles': 'operator' });
  assert.deepEqual(claimed.json.ignoredClaims, ['x-role', 'x-roles']);
  assert.equal(claimed.json.preview.role, 'conductor');
  context.clock.advance(1000);
  assert.equal((await preview(context, 'run.create', token)).json.error.code, 'TOKEN_EXPIRED');
}));

test('public reads need no token, but a presented forged or expired token is never silently ignored', () => withApp({}, async (context) => {
  const initial = await request(context, { route: '/v1/state' });
  assert.equal(initial.status, 200);
  assert.deepEqual(initial.json, { outcome: 'ok', revision: 0, state: { pool: { size: 2 }, runs: [], scratches: [], approvals: [] } });
  const scope = (await request(context, { route: '/scope.json' })).json;
  assert.deepEqual({ cardId: scope.cardId, businessData: scope.businessData, transport: scope.transport, liveAzureRuns: scope.liveAzureRuns, authorizedCloudSpend: scope.authorizedCloudSpend },
    { cardId: 'C009', businessData: 'synthetic', transport: '127.0.0.1 HTTP only', liveAzureRuns: 0, authorizedCloudSpend: 0 });
  assert.deepEqual({ entra: scope.entraIntegrated, registered: scope.identityRegistered, productionRuntime: scope.productionRuntimeValidated,
    native: scope.nativeTargetQualified, enforced: scope.authorizationEnforcedServerSide }, { entra: false, registered: false, productionRuntime: false, native: false, enforced: true });
  assert.deepEqual(scope.roles, ['visitor', 'conductor', 'operator']);
  const expired = context.app.issueToken('visitor', { ttlMs: 0 });
  for (const route of ['/v1/state', '/scope.json']) {
    assert.equal((await request(context, { route, headers: { Authorization: `Bearer ${expired}` } })).json.error.code, 'TOKEN_EXPIRED');
    assert.equal((await request(context, { route, headers: { Authorization: `Bearer c009_${'Q'.repeat(43)}` } })).json.error.code, 'TOKEN_UNKNOWN');
    assert.equal((await request(context, { route, headers: { Authorization: 'Basic x' } })).status, 401);
  }
}));

test('the snapshot is a copy: mutating it cannot change the server state', () => withApp({}, async (context) => {
  const copy = context.app.snapshot();
  copy.state.runs.push({ id: 'forged' });
  copy.revision = 99;
  assert.deepEqual(context.app.snapshot().state.runs, []);
  assert.equal(context.app.snapshot().revision, 0);
  const entry = context.app.auditLog();
  assert.equal(Array.isArray(entry), true);
}));

test('requests are bound to the loopback origin and every answer is uncached with a strict content security policy', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const before = context.app.snapshot();
  const forged = await unchanged(context, before, () => send(context, 'pool.resize', operator, VALID['pool.resize'], { Host: 'evil.example' }));
  assert.equal(forged.status, 421);
  assert.equal(forged.json.error.code, 'LOCAL_HOST_REQUIRED');
  const foreign = await unchanged(context, before, () => send(context, 'pool.resize', operator, VALID['pool.resize'], { Origin: 'http://evil.example' }));
  assert.equal(foreign.status, 403);
  assert.equal(foreign.json.error.code, 'CROSS_ORIGIN_DENIED');
  const same = await send(context, 'pool.resize', operator, VALID['pool.resize'], { Origin: context.origin });
  assert.equal(same.status, 200);
  const body = await request(context, { route: '/v1/state', body: '{}', headers: { 'Content-Length': '2' } });
  assert.equal(body.status, 400);
  assert.equal(body.json.error.code, 'UNEXPECTED_BODY');
  const long = await request(context, { route: `/v1/state?${'a'.repeat(2100)}=1` });
  assert.equal(long.status, 414);
  assert.equal((await request(context, { route: '/nowhere' })).json.error.code, 'NOT_FOUND');
  assert.equal((await request(context, { route: '/v1/state?x=1' })).json.error.code, 'QUERY_NOT_ALLOWED');
  for (const answer of [forged, foreign, same, body, long, await request(context, { route: '/scope.json' })]) {
    assert.equal(answer.headers['cache-control'], 'no-store');
    assert.equal(answer.headers['x-content-type-options'], 'nosniff');
    assert.equal(answer.headers['access-control-allow-origin'], undefined);
    assert.match(answer.headers['content-security-policy'], /default-src 'none'/);
    assert.match(answer.headers['content-security-policy'], /script-src 'self'/);
    assert.match(answer.headers['content-security-policy'], /frame-ancestors 'none'/);
    assert.doesNotMatch(answer.headers['content-security-policy'], /unsafe-inline|unsafe-eval|\*/);
  }
}));

test('commands are linearized in arrival order and a failing handler does not stall the queue', async () => {
  const events = [];
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let entered;
  const firstEntered = new Promise((resolve) => { entered = resolve; });
  const hooks = {
    async beforeCommit({ command, subject }) {
      events.push(`start ${subject}:${command}`);
      if (subject === 'conductor-a' && command === 'run.create') { entered(); await gate; }
      if (command === 'scratch.create') throw new Error('boom');
      await new Promise((resolve) => setImmediate(resolve));
      events.push(`end ${subject}:${command}`);
    }
  };
  await withApp({ app: { hooks } }, async (context) => {
    const a = context.app.issueToken('conductor-a');
    const b = context.app.issueToken('conductor-b');
    const operator = context.app.issueToken('operator');
    const answers = [send(context, 'run.create', a)];
    await within(firstEntered, 'the beforeCommit hook of the first command');
    answers.push(send(context, 'run.create', b, { name: 'beta', units: 2 }));
    await waitFor(() => context.app.queued() === 2);
    answers.push(send(context, 'scratch.create', b));
    await waitFor(() => context.app.queued() === 3);
    answers.push(send(context, 'pool.resize', operator, { size: 9 }));
    await waitFor(() => context.app.queued() === 4);
    assert.deepEqual(events, ['start conductor-a:run.create'], 'later commands wait behind the running one');
    release();
    const [first, second, failed, last] = await Promise.all(answers);
    assert.deepEqual([first.status, second.status, failed.status, last.status], [200, 200, 500, 200]);
    assert.deepEqual([first.json.revision, second.json.revision, last.json.revision], [1, 2, 3]);
    assert.equal(failed.json.error.code, 'COMMAND_FAILED');
    assert.equal(failed.text.includes('boom'), false, 'internal error text is never exposed');
    assert.deepEqual(events, ['start conductor-a:run.create', 'end conductor-a:run.create', 'start conductor-b:run.create', 'end conductor-b:run.create',
      'start conductor-b:scratch.create', 'start operator:pool.resize', 'end operator:pool.resize']);
    const now = context.app.snapshot().state;
    assert.deepEqual(now.runs.map((run) => run.owner), ['conductor-a', 'conductor-b']);
    assert.deepEqual([now.scratches.length, now.pool.size], [0, 9]);
    assert.deepEqual(context.app.auditLog().map((entry) => entry.outcome), ['applied', 'applied', 'failed', 'applied']);
    assert.equal(context.app.queued(), 0);
  });
});

test('authorization is enforced again where the effect is committed: a token that expired while queued has no effect', async () => {
  const clock = fakeClock();
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  let entered;
  const firstEntered = new Promise((resolve) => { entered = resolve; });
  const hooks = {
    async beforeCommit({ command }) {
      if (command === 'pool.resize') { entered(); await gate; clock.advance(5000); }
    }
  };
  await withApp({ clock, app: { hooks } }, async (context) => {
    const operator = context.app.issueToken('operator');
    const conductor = context.app.issueToken('conductor-a', { ttlMs: 2000 });
    const first = send(context, 'pool.resize', operator, { size: 4 });
    await within(firstEntered, 'the beforeCommit hook of the first command');
    const second = send(context, 'run.create', conductor);
    await waitFor(() => context.app.queued() === 2);
    release();
    const [resized, late] = await Promise.all([first, second]);
    assert.equal(resized.status, 200);
    assert.equal(late.status, 401);
    assert.equal(late.json.error.code, 'TOKEN_EXPIRED');
    assert.deepEqual(context.app.snapshot().state.runs, []);
    assert.equal(context.app.snapshot().revision, 1);
  });
});

test('an unexpected server fault fails closed with a generic 500 and no effect', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const before = context.app.snapshot();
  const original = context.clock.now;
  context.clock.now = () => { throw new Error('clock exploded'); };
  const answer = await send(context, 'pool.resize', operator);
  context.clock.now = original;
  assert.equal(answer.status, 500);
  assert.equal(answer.json.error.code, 'INTERNAL_ERROR');
  assert.equal(answer.text.includes('exploded'), false);
  assert.deepEqual(context.app.snapshot(), before);
}));

test('the audit log is bounded, ordered and never records token material', () => withApp({}, async (context) => {
  const visitor = context.app.issueToken('visitor');
  const limit = contract.limits.auditEntries;
  for (let index = 0; index < limit + 5; index += 1) await send(context, 'run.create', visitor);
  const log = context.app.auditLog();
  assert.equal(log.length, limit);
  assert.equal(log.at(-1).seq - log[0].seq, limit - 1);
  assert.equal(Object.isFrozen(log[0]), true);
  assert.equal(JSON.stringify(log).includes(visitor), false);
}));
