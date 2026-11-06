'use strict';

// F11, F12 and F17 of the second independent review, deterministic and in-process (the cross-process structural test and the raw-socket matrix
// in a separate process live in flood-structural.test.cjs and pipelining.test.cjs): every row of BOTH refusal tables is answered by the ONE
// refusal path (typed, with its own closed-table code, Connection: close, the connection closed, one final answer), the shapes Node would answer
// itself included; and a request pipelined behind the first one never runs, in any HTTP version.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const h = require('./http.cjs');
const C = require('../contract.js');
const older = require('./refusals.cjs');
const own = require('./refusals-node.cjs');

const CODES = { 403: 'FORBIDDEN_ORIGIN', 404: 'NOT_FOUND', 405: 'METHOD_NOT_ALLOWED', 413: 'BODY_TOO_LARGE', 415: 'UNSUPPORTED_MEDIA_TYPE', 417: 'EXPECTATION_FAILED', 431: 'HEADERS_TOO_LARGE' };
const hostOf = (origin) => `Host: 127.0.0.1:${new URL(origin).port}\r\n`;

test('every row of both refusal tables is answered through the one refusal path: typed, closed, one final answer', async (t) => {
  const env = await h.serve(t);
  const host = hostOf(env.origin);
  let typedRows = 0;
  for (const row of [...older.rows, ...own.rows]) {
    const client = h.raw(env.origin, row.head(host) + row.small);
    await s.withTimeout(client.closed, `${row.name}: the connection was never closed`, 20000);
    const text = client.text();
    assert.equal(own.finalStatusOf(text), row.status, `${row.name}: status`);
    const answers = [...text.matchAll(/^HTTP\/1\.[01] (\d{3}) /gm)].map((m) => Number(m[1]));
    assert.deepEqual(answers.filter((status) => status !== 100), row.status ? [row.status] : [], `${row.name}: exactly one final answer`);
    if (/refused before any 100/.test(row.name)) assert.deepEqual(answers, [415], `${row.name}: a refusal never invites an upload`);
    if (/Expect: 100-continue with a body over the limit/.test(row.name)) assert.deepEqual(answers, [100, 413], `${row.name}: a request that is read gets its interim 100 Continue`);
    if (row.status !== 0) assert.match(text, /^Connection: close\r$/m, `${row.name}: Connection: close`);
    if (row.status >= 400) {
      const typed = JSON.parse(own.bodyOf(text));
      assert.deepEqual(C.failureCheck(typed).problems, [], `${row.name}: typed failure`);
      const expected = row.status === 400 ? 'MALFORMED_REQUEST' : CODES[row.status];
      assert.equal(typed.error.code, expected, `${row.name}: the code of the closed table`);
      typedRows += 1;
    }
  }
  assert.ok(typedRows >= 17, `${typedRows} typed refusals`);
  assert.equal(env.ctx.engine.view().journal.filter((entry) => entry.type !== 'boot').length, 0, 'no refusal changed the journal');
});

test('every answer is followed by the bounded drain: the wiring of the one send path (the drain is observable through its per-process counter)', async (t) => {
  const { drain } = require('../server.cjs');
  const env = await h.serve(t);
  const host = hostOf(env.origin);
  const settle = async (done) => { for (let turn = 0; turn < 200000 && !done(); turn += 1) await new Promise((resolve) => setImmediate(resolve)); return done(); };
  assert.equal(await settle(() => drain.active() === 0), true, 'no drain is running before the test');
  // A 415 is decided without reading the body; the client then stays silent, so the drain lasts until its own timer cuts it.
  const client = h.raw(env.origin, `POST /api/cancel HTTP/1.1\r\n${host}Content-Type: text/plain\r\nTransfer-Encoding: chunked\r\n\r\n1\r\na\r\n`);
  let closed = false;
  client.closed.then(() => { closed = true; });
  assert.equal(await settle(() => drain.active() >= 1 || closed), true);
  assert.ok(drain.active() >= 1, 'the answer was flushed but the connection was never handed to the bounded drain');
  await s.withTimeout(client.closed, 'the drain never cut the silent connection', 20000);
  assert.equal(await settle(() => drain.active() === 0), true, 'the budget is given back when the connection closes');
});

async function quiet(ctx) {
  let last = -1;
  let same = 0;
  while (same < 30) {
    await new Promise((resolve) => setImmediate(resolve));
    const now = ctx.engine.view().journal.length;
    if (now === last) same += 1; else { same = 0; last = now; }
  }
  return last;
}

test('a request pipelined behind the first request never runs, whatever the HTTP version and however the first was refused', async (t) => {
  const env = await h.serve(t);
  env.ctx.g.hold('before', 3);
  const started = await h.post(env.origin, '/api/start', s.startCmd('shape-start-001'));
  await env.ctx.g.reached('before', 3);
  const host = hostOf(env.origin);
  const cancel = JSON.stringify(s.cancelCmd('shape-cancel-01', started.json.action.actionId));
  const post = (version, head = host, extra = '', body = cancel) => `POST /api/cancel HTTP/${version}\r\n${head}Content-Type: application/json\r\n${extra}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  const cases = [
    ['a 404 then an HTTP/1.0 cancel', `GET /nowhere HTTP/1.1\r\n${host}\r\n${post('1.0')}`],
    ['a foreign Origin then an HTTP/1.0 cancel', `${post('1.1', host, 'Origin: http://evil.example\r\n')}${post('1.0')}`],
    ['a request without Host (Node would answer 400 itself) then an HTTP/1.1 cancel', `GET /api/state HTTP/1.1\r\n\r\n${post('1.1')}`],
    ['an unknown Expect header (Node would answer 417 itself) then an HTTP/1.0 cancel', `${post('1.1', host, 'Expect: foo\r\n')}${post('1.0')}`],
    ['an invalid JSON body (refused after an await) then an HTTP/1.0 cancel', `${post('1.1', host, '', '{"kind":')}${post('1.0')}`],
    ['an HTTP/1.0 refusal then an HTTP/1.1 cancel', `${post('1.0', host, '', 'not json')}${post('1.1')}`],
    ['a valid GET then a refusal then an HTTP/1.0 cancel', `GET /api/state HTTP/1.1\r\n${host}\r\n\r\nGET /nowhere HTTP/1.1\r\n${host}\r\n${post('1.0')}`],
  ];
  const before = await quiet(env.ctx);
  for (const [name, bytes] of cases) {
    const client = h.raw(env.origin, bytes);
    await s.withTimeout(client.closed, `${name}: never closed`, 20000);
    assert.equal(await quiet(env.ctx), before, `${name}: THE JOURNAL CHANGED behind a refusal`);
    assert.equal(env.ctx.engine.view().action.cancel, null, `${name}: the cancel was applied`);
  }
  const first = h.raw(env.origin, `${post('1.1')}GET /nowhere HTTP/1.1\r\n${host}\r\n`);
  await s.withTimeout(first.closed, 'the valid cancel was never answered', 20000);
  assert.deepEqual([...first.text().matchAll(/^HTTP\/1\.[01] (\d{3}) /gm)].map((m) => Number(m[1])), [200], 'the first request is answered, nothing behind it is');
  assert.equal(env.ctx.engine.view().journal.filter((entry) => entry.type === 'cancel-requested').length, 1, 'a valid first request applies exactly once');
});
