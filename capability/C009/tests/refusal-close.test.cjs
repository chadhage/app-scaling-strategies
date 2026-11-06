'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { load, send, withApp } = require('./helpers.cjs');
const { exchange, bare } = require('./raw-http.cjs');
const { ROWS, auth, post, JSON_HEADERS, CHUNKED } = require('./refusal-rows.cjs');

const NAMES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const { CODES } = load('codes.cjs');
const tokensOf = (context) => Object.fromEntries(NAMES.map((name) => [name, context.app.issueToken(name)]));
const snapshot = (context) => JSON.stringify(context.app.snapshot());
const followUp = (port) => bare(port, 'GET', '/v1/state');

test('every typed refusal code has a row in the refusal table, and every row names a real code', () => {
  const rowCodes = ROWS.map((row) => row.code);
  assert.equal(new Set(rowCodes).size, rowCodes.length, 'one row per code');
  for (const code of Object.keys(CODES)) assert.ok(rowCodes.includes(code), `${code} has a refusal row`);
});

for (const row of ROWS) {
  test(`${row.code} (${row.status}) ends the connection: answered once with Connection: close, nothing pipelined behind it is served, no effect`, () => withApp({ app: row.app }, async (context) => {
    const tokens = tokensOf(context);
    const extra = (await row.setup?.({ context, tokens, send })) || {};
    const before = snapshot(context);
    const bytes = Buffer.concat([row.request({ port: context.port, tokens, extra }), followUp(context.port)]);
    const result = await exchange(context.port, bytes);
    assert.equal(result.answers.length, 1, 'only the refusal is answered; the request pipelined behind it is not served');
    const [answer] = result.answers;
    assert.deepEqual([answer.status, answer.json?.error?.code], [row.status, row.code]);
    assert.equal(answer.headers.connection, 'close', 'the answer announces that the connection ends');
    assert.equal(result.closedByServer, true, 'the server ends the connection after the answer');
    assert.equal(snapshot(context), before, 'a refusal changes nothing');
  }));
}

test('a refusal also cuts the request pipelined behind it when that one would be a permitted command', () => withApp({}, async (context) => {
  const tokens = tokensOf(context);
  const refused = post(context.port, 'run.create', [auth(tokens.visitor), ...JSON_HEADERS], '{"name":"a","units":1}');
  const permitted = post(context.port, 'pool.resize', [auth(tokens.operator), ...JSON_HEADERS], '{"size":9}');
  const result = await exchange(context.port, Buffer.concat([refused, permitted]));
  assert.deepEqual(result.answers.map((answer) => answer.status), [403]);
  assert.equal(context.app.snapshot().state.pool.size, 2, 'the command behind the refusal never ran');
  assert.equal(context.app.snapshot().revision, 0);
}));

test('a refused request whose body never ends is answered and the connection is closed at once', () => withApp({}, async (context) => {
  const tokens = tokensOf(context);
  const opening = `POST /v1/commands/run.create HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\nAuthorization: Bearer ${tokens.visitor}\r\nContent-Type: application/json\r\n${CHUNKED}\r\n\r\n3\r\nabc\r\n`;
  const result = await exchange(context.port, opening, { waitMs: 2500 });
  assert.equal(result.answers[0]?.status, 403);
  assert.equal(result.closedByServer, true, 'the unfinished body does not keep the connection open');
  assert.ok(result.ms < 2000, `closed after ${result.ms} ms`);
}));

test('a success keeps the connection: the next request on the same socket is answered, a refusal elsewhere changes nothing', () => withApp({}, async (context) => {
  const tokens = tokensOf(context);
  const run = post(context.port, 'run.create', [auth(tokens['conductor-a']), ...JSON_HEADERS], '{"name":"alpha","units":5}');
  const result = await exchange(context.port, Buffer.concat([followUp(context.port), run, followUp(context.port)]), { settleMs: 500 });
  assert.deepEqual(result.answers.map((answer) => answer.status), [200, 200, 200]);
  assert.ok(result.answers.every((answer) => answer.headers.connection === 'keep-alive'), 'successful answers keep the connection alive');
  assert.equal(result.closedByServer, false);
  assert.equal(context.app.snapshot().state.runs.length, 1);
}));
