'use strict';

// rev-C017 F12 addendum, part B: HTTP/1.0 framing. Node's maxRequestsPerSocket is not applied to HTTP/1.0 requests and is
// not advanced by Node's own no-Host 400, so the per-connection guard must not depend on the HTTP version. EVERY pair of
// the matrix is written in ONE TCP write to a server in a SEPARATE process, in both framings ([refused 1.1][mutation 1.0],
// [refused 1.0][mutation 1.1], [refused 1.0][mutation 1.0]) and with a leading read; the ledger and the revision of the
// child (read from the outside, polled to quiescence) must be exactly what they were, and the connection closed.
const { fork } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { assert, call, doc } = require('./support.cjs');
const {
  exchange, get, hostOf, mutation, send,
} = require('./pipe-support.cjs');

const HARD_MS = 900000;
const v10 = (bytes) => bytes.replace(' HTTP/1.1\r\n', ' HTTP/1.0\r\n');
const cleanEnvironment = () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return env;
};

async function startChild() {
  const child = fork(path.join(__dirname, 'child-server.cjs'), ['{}'], { execArgv: ['--max-old-space-size=48'], env: cleanEnvironment(), silent: true });
  const errors = [];
  child.stderr.on('data', (chunk) => errors.push(chunk));
  const watchdog = setTimeout(() => child.kill(), HARD_MS);
  const early = new Promise((resolve, reject) => child.once('exit', (code, signal) => reject(new Error(`the child exited early: ${code} ${signal} ${Buffer.concat(errors)}`))));
  early.catch(() => {});
  const listening = new Promise((resolve) => child.on('message', (message) => { if (message.type === 'listening') resolve(message.port); }));
  const stop = new Promise((resolve) => child.on('message', (message) => { if (message.type === 'closed') resolve(); }));
  const port = await Promise.race([listening, early]);
  return { port, dispose: async () => { child.send({ type: 'stop' }); await Promise.race([stop, new Promise((resolve) => setTimeout(resolve, 5000).unref())]); clearTimeout(watchdog); child.kill(); } };
}

async function observe(port) {
  const leases = (await call(port, 'GET', '/v1/leases')).json;
  const journal = (await call(port, 'GET', '/v1/journal')).json;
  return { committed: leases.leases['synthetic-lease-001'].committed, stepRecords: leases.journalRecords, runs: journal.runs, live: journal.live };
}

async function quiescent(port) {
  let previous = JSON.stringify(await observe(port));
  for (let stable = 0; stable < 3;) {
    await new Promise((resolve) => setImmediate(resolve));
    const now = JSON.stringify(await observe(port));
    stable = now === previous && JSON.parse(now).live === 0 ? stable + 1 : 0;
    previous = now;
  }
  return JSON.parse(previous);
}

const payload = (value) => JSON.stringify(value);
const dump = `${(4096).toString(16)}\r\n${'x'.repeat(4096)}\r\n`.repeat(2);
// [name, status, request(port), version-neutral]: a version-neutral request keeps its meaning when its request line is HTTP/1.0.
const KINDS = [
  ['an unknown route', 404, (p) => get(p, '/nope'), true],
  ['a wrong method', 405, (p) => `DELETE /v1/presets HTTP/1.1\r\nHost: ${hostOf(p)}\r\n\r\n`, true],
  ['a query', 400, (p) => get(p, '/v1/leases?x=1'), true],
  ['an invalid key', 400, (p) => get(p, '/v1/presets/short'), true],
  ['a foreign host', 421, () => 'GET /v1/leases HTTP/1.1\r\nHost: evil.example\r\n\r\n', true],
  ['a foreign origin', 403, (p) => get(p, '/v1/leases', 'Origin: http://evil.example\r\n'), true],
  ['a wrong media type', 415, (p) => send(p, 'POST', '/v1/presets', '{}').replace('application/json', 'text/plain'), true],
  ['a URL that is too long', 414, (p) => get(p, `/${'a'.repeat(2100)}`), true],
  ['a GET with a body', 400, (p) => send(p, 'GET', '/v1/leases', '{}'), true],
  ['an unsupported action', 422, (p) => `POST /v1/presets/abcdefgh/undo HTTP/1.1\r\nHost: ${hostOf(p)}\r\nContent-Length: 0\r\n\r\n`, true],
  ['a missing preset', 404, (p) => get(p, '/v1/presets/abcdefgh'), true],
  ['a declared body that is too large', 413, (p) => send(p, 'POST', '/v1/presets', 'x'.repeat(2049)), true],
  ['invalid JSON', 400, (p) => send(p, 'POST', '/v1/presets', '{nope'), true],
  ['an unknown field', 400, (p) => send(p, 'POST', '/v1/presets', payload({ ...doc({ idempotencyKey: 'frame-bad-0001' }), extra: 1 })), true],
  ['a static bound', 409, (p) => send(p, 'POST', '/v1/presets', payload(doc({ idempotencyKey: 'frame-bad-0002', bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 14 } }))), true],
  ['an unknown Expect header (Node answers it itself)', 417, (p) => get(p, '/v1/leases', 'Expect: foo\r\n'), false],
  ['an unknown Expect header with a dumped chunked body', 417, (p) => `POST /v1/presets HTTP/1.1\r\nHost: ${hostOf(p)}\r\nExpect: foo\r\nTransfer-Encoding: chunked\r\n\r\n${dump}0\r\n\r\n`, false],
  ['an HTTP/1.1 request without Host (Node answers it itself)', 421, () => 'GET /v1/leases HTTP/1.1\r\n\r\n', false],
  ['a malformed request line (clientError)', 400, () => 'GET\r\n\r\n', false],
  ['an invalid header line (clientError)', 400, (p) => get(p, '/v1/leases', 'Bad Header: x\r\n'), false],
  ['a header block beyond the size bound (clientError)', 431, (p) => get(p, '/v1/leases', `X-Big: ${'a'.repeat(9000)}\r\n`), false],
];

test('SEPARATE PROCESS, BOTH FRAMINGS: no pair of the matrix lets a mutation run behind a refusal, HTTP/1.1 or HTTP/1.0', { timeout: 1800000 }, async (context) => {
  const child = await startChild();
  let counter = 100;
  try {
    assert.equal((await quiescent(child.port)).committed, 0);
    for (const [name, status, request, neutral] of KINDS) {
      const pairs = [
        ['[refused 1.1][mutation 1.0]', (p, n) => [request(p), v10(mutation(p, n))]],
        ['[ok GET 1.1][refused 1.1][mutation 1.0]', (p, n) => [get(p, '/v1/leases'), request(p), v10(mutation(p, n))]],
        ['[refused 1.1][mutation 1.1]', (p, n) => [request(p), mutation(p, n)]],
        ...(neutral ? [
          ['[refused 1.0][mutation 1.1]', (p, n) => [v10(request(p)), mutation(p, n)]],
          ['[refused 1.0][mutation 1.0]', (p, n) => [v10(request(p)), v10(mutation(p, n))]],
        ] : []),
      ];
      for (const [label, parts] of pairs) {
        await context.test(`${name} ${label}`, async () => {
          // A fresh mutation key per case (a leaked mutation would otherwise be an idempotent replay in the next case) and a rolling baseline.
          counter += 1;
          const before = await quiescent(child.port);
          const seen = await exchange(child.port, parts(child.port, counter));
          const lead = label.startsWith('[ok GET') ? [200] : [];
          assert.deepEqual(seen.statuses, [...lead, status], `${name} ${label}`);
          assert.equal(seen.closed, true, 'the server closed the connection');
          assert.deepEqual(await quiescent(child.port), before, 'the child process was not changed by the pipelined mutation');
        });
      }
    }
    await context.test('control: the same mutation alone, in HTTP/1.0 framing, applies once', async () => {
      const before = await quiescent(child.port);
      const seen = await exchange(child.port, [v10(mutation(child.port, 3))]);
      assert.deepEqual(seen.statuses, [201]);
      assert.equal((await quiescent(child.port)).committed, before.committed + 15);
    });
  } finally {
    await child.dispose();
  }
});
