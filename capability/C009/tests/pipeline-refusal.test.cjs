'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { send, withApp } = require('./helpers.cjs');
const { exchange, bare } = require('./raw-http.cjs');
const { ROWS, auth, post, JSON_HEADERS, CHUNKED } = require('./refusal-rows.cjs');
const { SHAPES, FRAMINGS, appFor, writesOf, exchangeWrites, mutations, appliedCount, wanted, resetMayDiscard, isSubsequence } = require('./pipeline-rows.cjs');

// Review finding F1b: a refusal that is not the first request of its connection, and a refusal decided after an await, must end the
// connection exactly like a first one: what stands behind it never runs (no state change, no revision, no audit record of an applied
// command), what stands before it is answered once. Every refusal of refusal-rows.cjs (the typed ones and the three that Node would
// answer by itself), in six shapes (position 0, 1 and 2, one TCP write or two) and three framings (HTTP/1.1, HTTP/1.0 keep-alive, and an
// HTTP/1.0 mutation behind an HTTP/1.1 refusal), with a permitted pool.resize pipelined behind the refusal.
const NAMES = ['visitor', 'conductor-a', 'conductor-b', 'operator'];
const tokensOf = (context) => Object.fromEntries(NAMES.map((name) => [name, context.app.issueToken(name)]));

// The cells are independent servers on their own ports, so they run eight at a time: the whole file stays far below the 60 s of the
// suite command even on a busy machine (700 cells one after the other did not).
const cells = ROWS.flatMap((row) => FRAMINGS.filter((entry) => !(entry.skips || []).includes(row.code)).flatMap((framing) => SHAPES.map((shape) => ({ row, framing, shape }))))
  .filter(({ row, framing, shape }) => wanted(`${row.code} [${shape.name}] ${framing.name}`));

async function checkCell({ row, framing, shape }) {
  await withApp({ app: appFor(row) }, async (context) => {
    const tokens = tokensOf(context);
    const extra = (await row.setup?.({ context, tokens, send })) || {};
    const before = context.app.snapshot();
    const applied = appliedCount(context);
    const refusal = row.request({ port: context.port, tokens, extra });
    const result = await exchangeWrites(context.port, writesOf(shape, { port: context.port, tokens, refusal }, framing));
    const expected = [...shape.earlier.map(() => 200), row.status];
    const statuses = result.answers.map((answer) => answer.status);
    // A reset can discard answers the client has not read yet (see resetMayDiscard in pipeline-rows.cjs): for those cells the answers are
    // what the client could still read, and the server-side facts below decide.
    const where = 'the answers of the earlier requests and the refusal, and no answer for what stands behind it';
    if (resetMayDiscard(row, shape)) assert.ok(isSubsequence(statuses, expected), `${where}: got ${statuses}, expected ${expected} or what a reset left of it`); else assert.deepEqual(statuses, expected, where);
    if (statuses.length === expected.length) {
      assert.equal(result.answers.at(-1).json?.error?.code, row.code);
      assert.equal(result.answers.at(-1).headers.connection, 'close', 'the refusal announces that the connection ends');
    }
    assert.equal(result.closedByServer, true, 'the server ends the connection after the refusal');
    const after = context.app.snapshot();
    const applyDone = after.revision - before.revision;
    if (row.code === 'REQUEST_TIMEOUT') {
      // A timer cuts a stalled request at once, so an earlier mutation a loaded server has not committed yet is cut with it: how many of the
      // earlier mutations ran is the machine's, that the audit log matches them and that nothing behind the refusal ran is not.
      assert.ok(applyDone >= 0 && applyDone <= mutations(shape), `only requests before the refusal were applied: ${applyDone} of at most ${mutations(shape)}`);
      assert.ok([before.state.pool.size, 6].includes(after.state.pool.size), 'the pool.resize 7 behind the refusal did not run');
      assert.equal(appliedCount(context) - applied, applyDone, 'the audit log records exactly the commands that were applied');
      return;
    }
    assert.equal(applyDone, mutations(shape), 'only the requests before the refusal were applied');
    assert.equal(after.state.pool.size, shape.earlier.includes('M6') ? 6 : before.state.pool.size, 'the pool.resize 7 behind the refusal did not run');
    assert.equal(appliedCount(context), applied + mutations(shape), 'the audit log records no applied command behind the refusal');
  });
}

test('every refusal row in every shape and framing: nothing behind the refusal runs, what stands before it is answered, the connection ends', { concurrency: 8, timeout: 280000 }, async (t) => {
  await Promise.all(cells.map((cell) => t.test(`${cell.row.code} [${cell.shape.name}] ${cell.framing.name}: nothing behind the refusal runs, what stands before it is answered, the connection ends`, { timeout: 90000 }, () => checkCell(cell))));
});

const dump = (context, tokens, body = '{"size":7}') => post(context.port, 'pool.resize', [auth(tokens.operator), ...JSON_HEADERS], body);

test('a request with a body at an unknown route, a chunked refusal and an Expect: 100-continue refusal each cut off the mutation pipelined behind them', () => withApp({}, async (context) => {
  const tokens = tokensOf(context);
  const unknown = Buffer.from(`POST /nope HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\nContent-Length: 2\r\n\r\n{}`);
  const chunked = Buffer.from(`GET /v1/state HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\n${CHUNKED}\r\n\r\n3\r\nabc\r\n0\r\n\r\n`);
  const expecting = Buffer.from(`POST /v1/commands/run.create HTTP/1.1\r\nHost: 127.0.0.1:${context.port}\r\n${auth(tokens.visitor)}\r\nContent-Type: application/json\r\nExpect: 100-continue\r\nContent-Length: 2\r\n\r\n{}`);
  for (const [name, refusal, status] of [['unknown route', unknown, 404], ['chunked body on a GET', chunked, 400], ['Expect: 100-continue', expecting, 403]]) {
    const result = await exchange(context.port, Buffer.concat([bare(context.port, 'GET', '/v1/state'), refusal, dump(context, tokens)]), { waitMs: 15000, settleMs: 3000 });
    assert.equal(result.answers.at(-1).status, status, `${name}: the last answer is the refusal`);
    assert.equal(result.answers.filter((answer) => answer.status === 200).length, 1, `${name}: only the GET before the refusal was answered`);
    assert.equal(result.closedByServer, true, name);
    assert.deepEqual([context.app.snapshot().revision, context.app.snapshot().state.pool.size], [0, 2], `${name}: the pool.resize behind it did not run`);
  }
}));

test('a mutation that is still running when a LATER request is refused is applied and answered, and the refusal is answered after it', () => withApp({
  app: { hooks: { beforeCommit: () => new Promise((resolve) => setTimeout(resolve, 150)) } }
}, async (context) => {
  const tokens = tokensOf(context);
  const refusal = post(context.port, 'run.create', [auth(tokens.visitor), ...JSON_HEADERS], '{"name":"a","units":1}');
  const first = dump(context, tokens, '{"size":6}');
  const result = await exchange(context.port, Buffer.concat([first, refusal, dump(context, tokens)]), { waitMs: 15000, settleMs: 3000 });
  assert.deepEqual(result.answers.map((answer) => answer.status), [200, 403], 'the earlier mutation is answered first, then the refusal');
  assert.equal(result.closedByServer, true);
  assert.deepEqual([context.app.snapshot().revision, context.app.snapshot().state.pool.size], [1, 6], 'the first mutation applied, the third never ran');
}));

test('the second TCP write of a connection that was refused is never read, however long after the refusal it arrives', () => withApp({}, async (context) => {
  const tokens = tokensOf(context);
  const refusal = post(context.port, 'run.create', [auth(tokens.visitor), ...JSON_HEADERS], '{"name":"a","units":1}');
  const result = await exchangeWrites(context.port, [refusal, dump(context, tokens)], { gapMs: 120 });
  // The second write lands in a connection the server has already ended: Windows may reset it and discard the 403 the client has not read.
  assert.ok(isSubsequence(result.answers.map((answer) => answer.status), [403]), 'nothing but the refusal is ever answered');
  assert.equal(result.closedByServer, true);
  assert.deepEqual([context.app.snapshot().revision, context.app.snapshot().state.pool.size], [0, 2]);
}));

test('a refusal is answered and ends the connection, and the next connection is served normally (the close is per connection, not per client)', () => withApp({}, async (context) => {
  const tokens = tokensOf(context);
  const refusal = post(context.port, 'run.create', [auth(tokens.visitor), ...JSON_HEADERS], '{"name":"a","units":1}');
  const refused = await exchange(context.port, Buffer.concat([bare(context.port, 'GET', '/v1/state'), refusal]));
  assert.deepEqual(refused.answers.map((answer) => answer.status), [200, 403]);
  const served = await exchange(context.port, Buffer.concat([dump(context, tokens), bare(context.port, 'GET', '/v1/state')]), { settleMs: 2500 });
  assert.deepEqual(served.answers.map((answer) => answer.status), [200, 200], 'a pipeline without a refusal is served completely, in order');
  assert.equal(served.answers[0].json.result.size, 7);
  assert.equal(served.answers[1].json.revision, 1);
}));
