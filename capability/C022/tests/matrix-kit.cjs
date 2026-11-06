'use strict';

// Test tooling, not production code: the shared set-up of the pipelining matrix files. The matrix used to be ONE file of 308 raw-socket tests
// that ran 77 s under CPU burners, over the runner's 60 s per-file cap, so it is split by the SHAPE of bytes sent behind each refusal and
// by the place of the server (this process, or a separate server process). Every file has its own app and its own prepared world (one
// refusal table, rows.cjs), each file stays cheap, and nothing in here is timed: the answers, the closed connection and the role of dana
// decide. A valid authorized mutation (the admin turns dana into a viewer) is what must never run behind a refusal.
const assert = require('node:assert/strict');
const net = require('node:net');
const { after, before } = require('node:test');
const { call, raw, startApp } = require('./helpers.cjs');
const rows = require('./rows.cjs');
const { startChild } = require('./proc.cjs');

const label = (row) => row.name || row.code;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Registers before/after hooks of the calling file: the app (or the separate server process) and the prepared world. Returns the handle m.
function useMatrix({ remote = false } = {}) {
  const m = { remote, port: 0, t: null, table: null };
  let stop = async () => {};
  before(async () => {
    if (remote) {
      const server = startChild({ mode: 'real' });
      stop = () => server.stop();
      m.server = server;
      ({ port: m.port, tokens: m.t } = await server.receive('ready'));
      m.digest0 = (await server.ask('report', 'report')).digest;
    } else {
      const ctx = await startApp({ app: { hooks: rows.HOOKS } });
      stop = () => ctx.close();
      m.t = await rows.prepare(ctx);
      m.port = ctx.port;
    }
    m.table = rows.ROWS(m.t);
  });
  after(async () => { await stop(); });
  m.call = (method, target, opts) => call(m.port, method, target, opts);
  m.danaRole = async () => (await m.call('GET', '/v1/session', { token: m.t.dana })).json.session.role;
  m.reset = async () => {
    if ((await m.danaRole()) !== 'member') await m.call('POST', '/v1/admin/role', { token: m.t.ada, body: { user: 'dana', role: 'member' } });
  };
  // Every cell starts from, and ends in, the same state, even when an assertion of the cell fails.
  m.cell = (body) => async () => {
    try { await body(); } finally { await m.reset(); }
  };
  // Remote only: the world digest of the server process equals the one taken before the first cell (no refusal and no pipelined request left a trace).
  m.worldUnchanged = async () => {
    await m.reset();
    assert.equal((await m.server.ask('report', 'report')).digest, m.digest0);
  };
  m.legit = (version = '1.1') => rows.LEGIT(m.t)(m.port, version);
  m.down = (version = '1.1') => rows.MUTATION(m.t).down(m.port, version);
  m.up = (version = '1.1') => rows.MUTATION(m.t).up(m.port, version);
  // Sends the parts as separate TCP writes (a pause between them only SHAPES the input, no assertion waits on a clock).
  m.exchangeParts = (parts) => new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port: m.port, allowHalfOpen: true });
    const chunks = [];
    let closed = false;
    let timer = null;
    const finish = () => { clearTimeout(timer); socket.destroy(); resolve({ answers: raw.parseAnswers(Buffer.concat(chunks)), closedByServer: closed }); };
    socket.on('data', (chunk) => { chunks.push(chunk); clearTimeout(timer); timer = setTimeout(finish, 300); });
    const ended = () => { closed = true; finish(); };
    socket.on('error', ended);
    socket.on('end', ended);
    socket.on('close', ended);
    timer = setTimeout(finish, 6000);
    (async () => {
      for (const part of parts) {
        if (!socket.destroyed) socket.write(part);
        await sleep(15);
      }
    })();
  });
  return m;
}

// The answers owed: those of the earlier requests, in order, then the refusal (a lossy row, a reset, may lose the tail).
function check(row, answers, expectedBefore) {
  const expected = [...expectedBefore, row.status];
  const statuses = answers.map((answer) => answer.status);
  if (row.lossy) assert.deepEqual(statuses, expected.slice(0, statuses.length), 'only the answers it was owed, in order');
  else assert.deepEqual(statuses, expected, `${label(row)}: answers`);
}

// One call per row of the refusal table; the row is looked up again on the prepared world when the test runs (the table of the placeholder
// world only names the rows at load time).
function eachRow(m, define) {
  for (const row of rows.ROWS(new Proxy({}, { get: () => 'placeholder' }))) {
    const entry = () => m.table.find((candidate) => label(candidate) === label(row));
    define(row, { entry, build: (...args) => entry().build(m.port, ...args) });
  }
}

// The answers Node gives itself at PARSE time, decided outside the lane of the requests (the third hole of orders\_PIPELINING.md).
const nodeOwn = (m) => [
  { name: 'unknown Expect', status: 417, only11: true, build: (v) => rows.get(m.port, '/v1/projects', m.t.alf, v, ['Expect: nonsense']) },
  { name: 'unknown Expect on a POST with a body', status: 417, only11: true, build: (v) => rows.post(m.port, '/v1/projects', m.t.alf, { name: 'x', units: 1 }, v, ['Expect: nonsense']) },
  { name: 'parse error', status: 400, build: () => Buffer.from(`GET /v1/projects HTTP/1.1\r\nHost: 127.0.0.1:${m.port}\r\nBad Header Line\r\n\r\n`) },
  { name: 'no Host', status: 421, build: (v) => raw.request(m.port, 'GET', '/v1/projects', { version: v, host: false, headers: [rows.bearer(m.t.alf)] }) },
  { name: 'CONNECT', status: 405, only11: true, build: () => Buffer.from(`CONNECT 127.0.0.1:1 HTTP/1.1\r\nHost: 127.0.0.1:${m.port}\r\n\r\n`) }
];

// Two or three legitimate requests, or a mutation, BEFORE the Node-own refusal: the earlier requests are answered in order, then the
// refusal, then the connection is closed.
async function thirdHole(m, x) {
  for (const v of x.only11 ? ['1.1'] : ['1.1', '1.0']) {
    const shapes = [
      ['[G][G][X]', [m.legit(v), m.legit(v), x.build(v)], [200, 200]],
      ['[G][G][G][X]', [m.legit(v), m.legit(v), m.legit(v), x.build(v)], [200, 200, 200]],
      ['[G][G][X][G]', [m.legit(v), m.legit(v), x.build(v), m.legit(v)], [200, 200]],
      ['[POST][G][X]', [m.down(v), m.legit(v), x.build(v)], [200, 200]]
    ];
    for (const [shape, parts, before] of shapes) {
      const result = await raw.exchange(m.port, Buffer.concat(parts), { waitMs: 6000, settleMs: 250 });
      assert.deepEqual(result.answers.map((answer) => answer.status), [...before, x.status], `${shape} HTTP/${v}`);
      assert.equal(result.closedByServer, true, `${shape} HTTP/${v}: the connection is closed`);
      await m.reset();
    }
  }
}

module.exports = Object.freeze({ check, eachRow, label, nodeOwn, sleep, thirdHole, useMatrix });
