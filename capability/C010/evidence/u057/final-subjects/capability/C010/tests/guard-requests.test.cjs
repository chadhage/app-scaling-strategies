'use strict';

// C010 scenario "Hostile ids, paths, methods and fields are refused uniformly", the REQUEST ITSELF (rev-C010 m7: generated mutants that no cell of the
// quick mutation stage reaches). (1) A request target that is not an origin-form path (absolute-form, asterisk, a double slash, a fragment) is
// 400 INVALID_URL, never a route lookup that answers another code. (2) A public route takes no query and no body. (3) A batch operation names its
// verb as a JSON string: an array or an object that only COERCES to a verb is refused, because the store reads the verb as a key.
const assert = require('node:assert/strict');
const test = require('node:test');
const { CODES } = require('../codes.cjs');
const { bearer, exchange } = require('./raw-http.cjs');
const { call, same, seed, withApp } = require('./helpers.cjs');

const QUICK = { settleMs: 300 };
const raw = (lines, body = '') => Buffer.from(`${lines.join('\r\n')}\r\n\r\n${body}`);
const one = async (port, bytes) => { const { answers, closedByServer } = await exchange(port, bytes, QUICK); return { answer: answers[0], count: answers.length, closedByServer }; };

test('a request target that is not an origin-form path is 400 INVALID_URL, with no effect, one audit record and a closed connection', () => withApp({}, async (context) => {
  const { tokens } = await seed(context);
  const token = tokens['conductor-a'];
  const host = `Host: 127.0.0.1:${context.port}`;
  const before = same(context.app.snapshot());
  const auditBefore = context.app.auditLog().length;
  const TARGETS = ['http://127.0.0.1:1/v1/me', '*', '//evil.example/v1/me', '//v1/me', '/v1/me#fragment'];
  let sent = 0;
  for (const target of TARGETS) {
    const { answer, count, closedByServer } = await one(context.port, raw([`GET ${target} HTTP/1.1`, host, bearer(token)]));
    if (answer === undefined) continue;
    sent += 1;
    assert.deepEqual([count, answer.status, answer.json.error.code], [1, CODES.INVALID_URL[0], 'INVALID_URL'], target);
    assert.equal(answer.headers.connection, 'close', `${target}: the connection is closed`);
    assert.equal(closedByServer, true, `${target}: the server ended the connection`);
  }
  assert.ok(sent >= 4, 'Node hands the server at least the absolute-form, the asterisk and the double-slash targets');
  assert.deepEqual(context.app.snapshot(), before);
  assert.equal(context.app.auditLog().length, auditBefore + sent, 'one audit record per refusal');
  assert.equal((await call(context, token, 'GET', '/v1/me')).status, 200, 'an origin-form path is served');
}));

test('a public route takes no query and no body: the page, its script, its style and the scope answer 400 for either, and 200 without', () => withApp({}, async (context) => {
  const host = `Host: 127.0.0.1:${context.port}`;
  for (const route of ['/', '/page.js', '/style.css', '/scope.json']) {
    const plain = await one(context.port, raw([`GET ${route} HTTP/1.1`, host]));
    assert.equal(plain.answer.status, 200, `${route} is served`);
    const query = await one(context.port, raw([`GET ${route}?x=1 HTTP/1.1`, host]));
    assert.deepEqual([query.answer.status, query.answer.json.error.code], [CODES.QUERY_NOT_ALLOWED[0], 'QUERY_NOT_ALLOWED'], `${route} with a query`);
    const emptyQuery = await one(context.port, raw([`GET ${route}? HTTP/1.1`, host]));
    assert.equal(emptyQuery.answer.status, 200, `${route} with an empty query string is the same route`);
    const body = await one(context.port, raw([`GET ${route} HTTP/1.1`, host, 'Content-Length: 2'], '{}'));
    assert.deepEqual([body.answer.status, body.answer.json.error.code], [CODES.UNEXPECTED_BODY[0], 'UNEXPECTED_BODY'], `${route} with a body`);
    const chunked = await one(context.port, raw([`GET ${route} HTTP/1.1`, host, 'Transfer-Encoding: chunked'], '0\r\n\r\n'));
    assert.deepEqual([chunked.answer.status, chunked.answer.json.error.code], [CODES.UNEXPECTED_BODY[0], 'UNEXPECTED_BODY'], `${route} with a chunked body`);
  }
}));

test('a batch operation that names its verb with an array, an object, a number or another non-string is refused INPUT_INVALID on the field op, and nothing is applied', () => withApp({}, async (context) => {
  const { tokens, ids } = await seed(context);
  const before = same(context.app.snapshot());
  const target = { lease: ids.b.lease, kind: 'scratch', id: ids.b.scratch };
  for (const verb of [['delete'], [['delete']], { toString: 'delete' }, 5, null, true, ['cancel']]) {
    const answer = await call(context, tokens['conductor-b'], 'POST', '/v1/batch', { ops: [{ op: verb, ...target }] });
    assert.deepEqual([answer.status, answer.json.error.code, answer.json.field], [CODES.INPUT_INVALID[0], 'INPUT_INVALID', 'op'], JSON.stringify(verb));
    assert.deepEqual(context.app.snapshot(), before, `${JSON.stringify(verb)}: nothing was applied`);
  }
  const done = await call(context, tokens['conductor-b'], 'POST', '/v1/batch', { ops: [{ op: 'delete', ...target }] });
  assert.equal(done.status, 200, 'the verb as a string is applied');
}));
