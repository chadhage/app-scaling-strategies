'use strict';

// EVERY refusal the server can answer, from one table (rows.cjs): answered ONCE with a typed body, Connection: close, and the connection
// ended BY THE SERVER, whether the refusal is the first request of its connection, a later one on a kept-alive connection, or decided
// after an await (body read). Positive controls: a success keeps the connection open, and the harness can see an open one.
const assert = require('node:assert/strict');
const net = require('node:net');
const { after, before, test } = require('node:test');
const { raw, startApp } = require('./helpers.cjs');
const rows = require('./rows.cjs');

let ctx;
let table;
let tokens;
before(async () => {
  ctx = await startApp({ app: { hooks: rows.HOOKS } });
  tokens = await rows.prepare(ctx);
  table = rows.ROWS(tokens);
});
after(async () => { await ctx.close(); });

const label = (row) => row.name || row.code;

for (const row of rows.ROWS(new Proxy({}, { get: () => 'placeholder' }))) {
  test(`${label(row)} (${row.status}) as the FIRST request: one typed answer, Connection: close, ended by the server`, async () => {
    const result = await raw.exchange(ctx.port, rows.ROWS(tokens).find((entry) => label(entry) === label(row)).build(ctx.port), { waitMs: 8000, settleMs: 600 });
    assert.equal(result.closedByServer, true, 'the server ended the connection');
    if (row.lossy) {
      assert.ok(result.answers.length <= 1);
      if (result.answers.length === 1) assert.equal(result.answers[0].status, row.status);
      return;
    }
    assert.equal(result.answers.length, 1, 'exactly one answer');
    const [answer] = result.answers;
    assert.equal(answer.status, row.status);
    assert.equal(answer.json.outcome, row.code);
    assert.equal(answer.json.error.code, row.code);
    assert.equal(answer.headers.connection, 'close');
    assert.equal(answer.headers['cache-control'], 'no-store');
  });

  test(`${label(row)} (${row.status}) AFTER a kept-alive success: the success is answered, then the refusal, then the close`, async () => {
    const entry = rows.ROWS(tokens).find((candidate) => label(candidate) === label(row));
    const bytes = Buffer.concat([rows.LEGIT(tokens)(ctx.port), entry.build(ctx.port)]);
    const result = await raw.exchange(ctx.port, bytes, { waitMs: 8000, settleMs: 600 });
    assert.equal(result.closedByServer, true);
    const statuses = result.answers.map((answer) => answer.status);
    if (entry.lossy) assert.deepEqual(statuses, [200, entry.status].slice(0, statuses.length));
    else assert.deepEqual(statuses, [200, entry.status]);
    assert.equal(result.answers[0].headers.connection === 'close', false, 'the success before it did not close');
    if (!entry.lossy) {
      assert.equal(result.answers[1].headers.connection, 'close');
      assert.equal(result.answers[1].json.outcome, entry.code);
    }
  });
}

test('POSITIVE CONTROL: a success keeps its connection open, so the harness really can tell an open connection from a closed one', async () => {
  const result = await raw.exchange(ctx.port, rows.LEGIT(tokens)(ctx.port), { waitMs: 3000, settleMs: 400 });
  assert.equal(result.answers.length, 1);
  assert.equal(result.answers[0].status, 200);
  assert.equal(result.closedByServer, false);
});

test('REQUEST_TIMEOUT (408): a stalled request is answered and its connection ended by the server', async (t) => {
  const slow = await startApp({ app: { limits: { headerMs: 300, checkMs: 50 } } });
  t.after(() => slow.close());
  const result = await raw.exchange(slow.port, Buffer.from(`GET /v1/projects HTTP/1.1\r\nHost: 127.0.0.1:${slow.port}\r\n`), { waitMs: 10000, settleMs: 2000 });
  assert.equal(result.closedByServer, true);
  assert.equal(result.answers.length, 1, 'a silent cut is not an answered timeout');
  assert.equal(result.answers[0].status, 408);
  assert.equal(result.answers[0].json.outcome, 'REQUEST_TIMEOUT');
  assert.equal(result.answers[0].json.error.code, 'REQUEST_TIMEOUT');
  assert.equal(result.answers[0].headers.connection, 'close');
});

function connectAfter(count, split) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: ctx.port, allowHalfOpen: true });
    const chunks = [];
    let splitTimer;
    let finished = false;
    const finish = (closedByServer) => {
      if (finished) return;
      finished = true;
      clearTimeout(deadline);
      clearTimeout(splitTimer);
      socket.destroy();
      resolve({ answers: raw.parseAnswers(Buffer.concat(chunks)), closedByServer });
    };
    const deadline = setTimeout(() => finish(false), 10000);
    socket.on('data', (bytes) => chunks.push(bytes));
    socket.on('end', () => finish(true));
    socket.on('close', () => finish(true));
    socket.on('error', () => finish(true));
    socket.once('connect', () => {
      const get = rows.LEGIT(tokens)(ctx.port);
      const connect = Buffer.from(`CONNECT 127.0.0.1:${ctx.port} HTTP/1.1\r\nHost: 127.0.0.1:${ctx.port}\r\n\r\n`);
      const prefix = Buffer.concat(Array.from({ length: count }, () => get));
      if (split) {
        socket.write(prefix);
        splitTimer = setTimeout(() => socket.write(connect), 150);
      } else socket.write(Buffer.concat([prefix, connect]));
    });
  });
}

for (const shape of [
  { name: '[GET][CONNECT] in the same write', count: 1, split: false },
  { name: '[GET] then [CONNECT] in two writes 150 ms apart', count: 1, split: true },
  { name: '[GET][GET][CONNECT] in the same write', count: 2, split: false }
]) {
  test(`CONNECT refusal: ${shape.name} returns every 200, then typed 405 and server-side close`, async () => {
    const before = ctx.world();
    const result = await connectAfter(shape.count, shape.split);
    assert.deepEqual(result.answers.map((answer) => answer.status), [...Array(shape.count).fill(200), 405]);
    for (const answer of result.answers.slice(0, -1)) assert.notEqual(answer.headers.connection, 'close');
    const refused = result.answers.at(-1);
    assert.equal(refused.headers.connection, 'close');
    assert.equal(refused.json.outcome, 'METHOD_NOT_ALLOWED');
    assert.equal(refused.json.error.code, 'METHOD_NOT_ALLOWED');
    assert.equal(result.closedByServer, true);
    assert.equal(ctx.world(), before, 'GET and CONNECT do not mutate tenant state');
  });
}
