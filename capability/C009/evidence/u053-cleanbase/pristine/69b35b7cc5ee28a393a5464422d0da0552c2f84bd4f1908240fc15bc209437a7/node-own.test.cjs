'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { withApp } = require('./helpers.cjs');
const { exchange, bare } = require('./raw-http.cjs');
const { auth, post, JSON_HEADERS } = require('./refusal-rows.cjs');
const { exchangeWrites, isSubsequence } = require('./pipeline-rows.cjs');

// Review rev-C017 F11: Node answers some requests ITSELF and never calls the handler: a request without Host (a bare 400), an Expect
// header (a bare 417, and a 100 Continue for every request, refused or not), a parse error, CONNECT (a silent destroy). Each goes
// through the one refusal path: a typed answer, Connection: close, the socket marked and no longer read. The refusal table has the rows
// of the answers Node would write (refusal-rows.cjs: REQUEST_MALFORMED, HEADERS_TOO_LARGE, REQUEST_TIMEOUT, EXPECTATION_FAILED); here
// are the rest and the ordering of an answer that Node decided against the answers of the requests before it.
const NAMES = ['visitor', 'conductor-a', 'operator'];
const tokensOf = (context) => Object.fromEntries(NAMES.map((name) => [name, context.app.issueToken(name)]));
const resize = (context, tokens, extra = []) => post(context.port, 'pool.resize', [auth(tokens.operator), ...JSON_HEADERS, ...extra], '{"size":7}');
const state = (context) => [context.app.snapshot().revision, context.app.snapshot().state.pool.size];

test('a request without Host (HTTP/1.1 or HTTP/1.0) gets the typed 421 and the connection ends; nothing behind it runs', () => withApp({}, async (context) => {
  const tokens = tokensOf(context);
  for (const version of ['HTTP/1.1', 'HTTP/1.0']) {
    const missing = Buffer.from(`GET /v1/state ${version}\r\nConnection: keep-alive\r\n\r\n`);
    for (const parts of [[missing, resize(context, tokens)], [bare(context.port, 'GET', '/v1/state'), missing, resize(context, tokens)]]) {
      const result = await exchange(context.port, Buffer.concat(parts));
      const last = result.answers.at(-1);
      assert.equal(last.status, 421, version);
      assert.equal(last.json.error.code, 'LOCAL_HOST_REQUIRED', 'typed, not the bare 400 of Node');
      assert.equal(last.headers.connection, 'close');
      assert.equal(result.answers.length, parts.length - 1, `${version}: the answers before it and the refusal, none for the mutation behind it`);
      assert.equal(result.closedByServer, true);
      assert.deepEqual(state(context), [0, 2]);
    }
  }
}));

test('a refused request with Expect: 100-continue is never invited to send its body: no 100 Continue, only the typed refusal', () => withApp({}, async (context) => {
  const tokens = tokensOf(context);
  const body = '{"name":"a","units":1}';
  const refused = post(context.port, 'run.create', [auth(tokens.visitor), ...JSON_HEADERS, 'Expect: 100-continue'], body);
  const result = await exchange(context.port, refused);
  assert.deepEqual(result.answers.map((answer) => answer.status), [403]);
  assert.equal(result.closedByServer, true);
  const behind = await exchange(context.port, Buffer.concat([refused, resize(context, tokens, ['Expect: 100-continue'])]));
  assert.deepEqual(behind.answers.map((answer) => answer.status), [403], 'a 100-continue request behind a refusal is dropped without a 100');
  assert.deepEqual(state(context), [0, 2]);
}));

test('a permitted request with Expect: 100-continue gets the 100 first and its answer after, and HTTP/1.0 never gets a 100', () => withApp({}, async (context) => {
  const tokens = tokensOf(context);
  const result = await exchange(context.port, resize(context, tokens, ['Expect: 100-continue']), { settleMs: 2500 });
  assert.deepEqual(result.answers.map((answer) => answer.status), [100, 200]);
  assert.deepEqual(state(context), [1, 7]);
  const old = Buffer.from(resize(context, tokens, ['Expect: 100-continue']).toString('latin1').replace('HTTP/1.1', 'HTTP/1.0'), 'latin1');
  const plain = await exchange(context.port, old, { settleMs: 2500 });
  assert.deepEqual(plain.answers.map((answer) => answer.status), [200], 'Node ignores Expect in HTTP/1.0 and the server writes no 100');
}));

test('CONNECT gets the typed 405 instead of a silent destroy, behind the answers of the requests before it', () => withApp({}, async (context) => {
  const connect = Buffer.from(`CONNECT 127.0.0.1:1 HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\n\r\n`);
  const alone = await exchange(context.port, connect);
  assert.deepEqual([alone.answers[0]?.status, alone.answers[0]?.json?.error?.code, alone.closedByServer], [405, 'METHOD_NOT_ALLOWED', true]);
  const behind = await exchange(context.port, Buffer.concat([bare(context.port, 'GET', '/v1/state'), connect]));
  assert.deepEqual(behind.answers.map((answer) => answer.status), [200, 405]);
}));

test('a parse error is answered AFTER the slow request before it, in order, and only once however much garbage follows', () => withApp({
  app: { hooks: { beforeCommit: () => new Promise((resolve) => setTimeout(resolve, 200)) } }
}, async (context) => {
  const tokens = tokensOf(context);
  const result = await exchangeWrites(context.port, [Buffer.concat([resize(context, tokens), Buffer.from('GET\r\n\r\n')]), Buffer.from('more garbage\r\n\r\n')], { gapMs: 40 });
  // The second write lands in a connection the server may already have ended, and a reset can discard what the client has not read.
  assert.ok(isSubsequence(result.answers.map((answer) => answer.status), [200, 400]), 'the mutation is answered first, then the typed 400, then nothing');
  if (result.answers.length === 2) assert.equal(result.answers[1].json.error.code, 'REQUEST_MALFORMED');
  assert.equal(result.closedByServer, true);
  assert.deepEqual(state(context), [1, 7], 'the request before the parse error was applied');
}));

test('a malformed chunk in the body of a request that is running gets its typed 400 at once, not after the idle timeout, and the command never applies', () => withApp({}, async (context) => {
  const tokens = tokensOf(context);
  const head = `POST /v1/commands/pool.resize HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\n${auth(tokens.operator)}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`;
  const result = await exchange(context.port, Buffer.from(`${head}5\r\n{"siz\r\nZZ\r\n`), { waitMs: 15000, settleMs: 3000 });
  assert.deepEqual([result.answers[0]?.status, result.answers[0]?.json?.error?.code, result.closedByServer], [400, 'REQUEST_MALFORMED', true]);
  assert.deepEqual(state(context), [0, 2]);
}));

test('a header larger than the limit and a stalled request are answered with their typed codes', () => withApp({ app: { limits: { headerMs: 300, checkMs: 50 } } }, async (context) => {
  const flood = await exchange(context.port, bare(context.port, 'GET', '/v1/state', [`X-Pad: ${'a'.repeat(30000)}`]), { waitMs: 15000, settleMs: 3000 });
  assert.deepEqual([flood.answers[0]?.status, flood.answers[0]?.json?.error?.code], [431, 'HEADERS_TOO_LARGE']);
  const stalled = await exchange(context.port, Buffer.from(`GET /v1/state HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\nX-Slow: `), { waitMs: 15000, settleMs: 3000 });
  assert.deepEqual([stalled.answers[0]?.status, stalled.answers[0]?.json?.error?.code, stalled.closedByServer], [408, 'REQUEST_TIMEOUT', true]);
}));
