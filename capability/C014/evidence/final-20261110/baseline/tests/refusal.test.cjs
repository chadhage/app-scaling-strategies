'use strict';

// The refusal path of THIS server, in the test process (coverage counts it): the table of every refusal row in the positions and framings of
// orders\_PIPELINING.md, the third-hole shapes ([G][G][X]) included. The same matrix runs against a separate server process in process.test.cjs.
const test = require('node:test');
const assert = require('node:assert/strict');
const { startLocal } = require('../server.cjs');
const { seedConfig } = require('./canaries.cjs');
const { call, exchange, build, parseAnswers } = require('./harness.cjs');
const { refusalRows, runMatrix, POSITIONS } = require('./matrix.cjs');

const config = seedConfig();
const runsOf = (port) => async () => (await call(port, 'GET', '/v1/evidence/runs')).json().total;

test('the matrix: every refusal row, every position, HTTP/1.1 and HTTP/1.0: the earlier answers in order, then the typed refusal, then the end; nothing runs behind it', { timeout: 120000 }, async () => {
  const local = await startLocal({ config });
  try {
    const problems = await runMatrix({ port: local.port, tokens: config.tokens, runs: runsOf(local.port), framings: [['1.1', '1.1'], ['1.0', '1.0']], concurrency: 24 });
    assert.deepEqual(problems, []);
    const rows = refusalRows(local.port, config.tokens);
    assert.deepEqual([...new Set(rows.map((row) => row.status))].sort(), [400, 401, 403, 404, 405, 413, 414, 415, 417, 421, 431]);
    assert.equal(POSITIONS.length, 8);
    assert.ok(rows.filter((row) => row.own).length >= 5, 'the answers Node gives itself are in the table');
  } finally { await local.close(); }
});

test('an asynchronous refusal (the owner quota is full after the body was read) ends the connection and nothing queued behind it runs', { timeout: 60000 }, async () => {
  const local = await startLocal({ config, limits: { ownerEntries: 2 } });
  try {
    const body = (name) => ({ name, units: 1 });
    const make = (name) => build('POST', '/v1/commands/run.create', { port: local.port, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.tokens['conductor-a']}` }, body: body(name) });
    const other = build('POST', '/v1/commands/run.create', { port: local.port, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.tokens['conductor-b']}` }, body: body('other-one') });
    const reply = await exchange(local.port, Buffer.concat([make('one'), make('two'), make('three'), other]), { settleMs: 10000 });
    assert.deepEqual(parseAnswers(reply.bytes).map((answer) => answer.status), [200, 200, 409]);
    assert.equal(parseAnswers(reply.bytes)[2].body.toString().includes('OWNER_QUOTA_FULL'), true);
    assert.equal(reply.closed, true);
    assert.equal((await runsOf(local.port)()), 2, 'the request behind the quota refusal did not run');
    const fresh = await call(local.port, 'POST', '/v1/commands/run.create', { token: config.tokens['conductor-b'], body: body('other-two') });
    assert.equal(fresh.status, 200, 'another identity still has room');
  } finally { await local.close(); }
});

test('a request with an Expect: 100-continue is invited to send its body only when it is about to be read; a refused one is not', { timeout: 30000 }, async () => {
  const local = await startLocal({ config });
  try {
    const head = (token) => `POST /v1/commands/run.create HTTP/1.1\r\nHost: 127.0.0.1:${local.port}\r\nContent-Type: application/json\r\nExpect: 100-continue\r\nContent-Length: 30\r\n${token ? `Authorization: Bearer ${token}\r\n` : ''}\r\n`;
    const accepted = await exchange(local.port, Buffer.from(head(config.tokens['conductor-a'])), { settleMs: 1500 });
    assert.match(accepted.bytes.toString('latin1'), /^HTTP\/1\.1 100 Continue/);
    const refused = await exchange(local.port, Buffer.from(head(null)), { settleMs: 10000 });
    assert.doesNotMatch(refused.bytes.toString('latin1'), /100 Continue/);
    assert.equal(parseAnswers(refused.bytes)[0].status, 401);
    assert.equal(refused.closed, true);
  } finally { await local.close(); }
});
