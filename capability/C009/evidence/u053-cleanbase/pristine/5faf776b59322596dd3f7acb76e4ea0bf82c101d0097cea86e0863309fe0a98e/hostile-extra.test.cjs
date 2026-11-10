'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { startApp, withApp, rawRequest, VALID, send, preview } = require('./helpers.cjs');

const IDENTITIES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];

// Sends one literal request so a probe controls the method, the request target and every header byte.
const literal = (context, line, token, body = '{"size":3}') => rawRequest(context, [line, 'Host: 127.0.0.1:{PORT}', ...(token ? [`Authorization: Bearer ${token}`] : []),
  'Content-Type: application/json', `Content-Length: ${Buffer.byteLength(body)}`, 'Connection: close', '', body].join('\r\n'));

test('a hostile body key reaches no prototype, no role and no state, whoever sends it', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const visitor = context.app.issueToken('visitor');
  const before = context.app.snapshot();
  const bodies = ['{"__proto__":{"role":"operator"},"size":3}', '{"constructor":{"prototype":{"role":"operator"}},"size":3}', '{"size":3,"__proto__":null}',
    '{"size":3,"toString":1}', '{"role":"operator","size":3}', '[{"size":3}]', '"size"', 'null', '{"size":3}x'];
  for (const body of bodies) {
    const rejected = await send(context, 'pool.resize', operator, body);
    assert.equal(rejected.status, 400, body);
    assert.match(rejected.json.error.code, /^(INPUT_UNKNOWN_FIELD|IDENTITY_CLAIM_REJECTED|BODY_NOT_OBJECT|BODY_INVALID_JSON)$/, body);
    assert.equal((await send(context, 'pool.resize', visitor, body)).json.error.code, 'ROLE_FORBIDDEN', 'a visitor is refused before the body is read');
  }
  assert.deepEqual([({}).role, Object.prototype.role, Object.hasOwn(Object.prototype, 'size')], [undefined, undefined, false]);
  assert.deepEqual(context.app.snapshot(), before);
}));

test('twenty concurrent approvals of one experiment produce exactly one approval and nineteen typed conflicts', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const answers = await Promise.all(Array.from({ length: 20 }, () => send(context, 'experiment.approve', operator, { experimentId: 'exp-002' })));
  assert.deepEqual([answers.filter((answer) => answer.status === 200).length, answers.filter((answer) => answer.json.error?.code === 'ALREADY_APPROVED').length], [1, 19]);
  const { revision, state } = context.app.snapshot();
  assert.deepEqual([revision, state.approvals], [1, [{ experimentId: 'exp-002', approvedBy: 'operator' }]]);
}));

test('the preview never allows a name outside the permission table, for any identity', () => withApp({}, async (context) => {
  const names = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'native.execute', 'pool.resize.x', 'POOL.RESIZE', 'pool', 'run'];
  for (const identity of IDENTITIES) {
    const token = context.app.issueToken(identity);
    for (const name of names) {
      const answer = await preview(context, name, token);
      const allowed = answer.json.preview?.allowed;
      assert.notEqual(allowed, true, `${identity} ${name}`);
      assert.match(answer.json.preview?.code ?? answer.json.error.code, /^(COMMAND_UNKNOWN|COMMAND_NAME_INVALID)$/, `${identity} ${name}`);
    }
  }
}));

test('request-target and method variants never reach a command or skip a check', () => withApp({}, async (context) => {
  const operator = context.app.issueToken('operator');
  const visitor = context.app.issueToken('visitor');
  const before = context.app.snapshot();
  const origin = `http://127.0.0.1:${context.port}`;
  const forbidden = [`${origin}/v1/commands/pool.resize`, '/v1/commands/../commands/pool.resize', '/v1/commands/./pool.resize', '/v1/commands/pool.resize?x=1'];
  for (const target of forbidden) {
    const answer = await literal(context, `POST ${target} HTTP/1.1`, visitor);
    assert.equal(answer.status, 403, target);
    assert.equal(answer.json.error.code, 'ROLE_FORBIDDEN', target);
  }
  const refused = [['post /v1/commands/pool.resize HTTP/1.1', [400]], ['POST http://evil.test/v1/commands/pool.resize HTTP/1.1', [400]], ['POST //v1/commands/pool.resize HTTP/1.1', [400]],
    ['POST /v1/commands/pool.resize/ HTTP/1.1', [404]], ['POST /v1/commands/pool.resize;role=operator HTTP/1.1', [400]], ['POST /v1/commands/pool.resize#frag HTTP/1.1', [400]],
    ['POST /V1/commands/pool.resize HTTP/1.1', [404]], ['PURGE /v1/commands/pool.resize HTTP/1.1', [405, 400]], ['TRACE /v1/commands/pool.resize HTTP/1.1', [405, 400]]];
  for (const [line, statuses] of refused) {
    const answer = await literal(context, line, operator, '{"size":9}');
    assert.ok(statuses.includes(answer.status), `${line} gave ${answer.status}`);
  }
  assert.deepEqual(context.app.snapshot(), before);
}));

test('a token issued by one server is unknown to another and changes nothing there', async () => {
  const first = await startApp({});
  const second = await startApp({});
  try {
    const token = first.app.issueToken('operator');
    const before = second.app.snapshot();
    const answer = await send(second, 'pool.resize', token, VALID['pool.resize']);
    assert.deepEqual([answer.status, answer.json.error.code], [401, 'TOKEN_UNKNOWN']);
    assert.deepEqual(second.app.snapshot(), before);
    assert.equal((await send(first, 'pool.resize', token, VALID['pool.resize'])).status, 200);
  } finally {
    await first.close();
    await second.close();
  }
});
