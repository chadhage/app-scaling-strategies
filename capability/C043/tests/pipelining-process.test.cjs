'use strict';

// rev-C043 F1 against a SEPARATE server process (the real service in a child with a small heap and a hard external
// timeout): one TCP write carrying a refused request and a valid mutation must leave the ledger and the revision of the
// child unchanged, and every refused connection must be closed by the server. The state is read from the outside, over
// fresh connections, and polled to quiescence, never a fixed sleep.
const { fork } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { assert, call } = require('./support.cjs');
const {
  exchange, get, hostOf, mutation, send,
} = require('./pipe-support.cjs');

const HARD_MS = 900000;
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
  const port = await Promise.race([listening, early]);
  const stop = new Promise((resolve) => child.on('message', (message) => { if (message.type === 'closed') resolve(); }));
  return { port, dispose: async () => { child.send({ type: 'stop' }); await Promise.race([stop, new Promise((resolve) => setTimeout(resolve, 5000).unref())]); clearTimeout(watchdog); child.kill(); } };
}

// The ledger and the revision of the child as seen from the outside.
async function observe(port) {
  const leases = (await call(port, 'GET', '/v1/leases')).json;
  const journal = (await call(port, 'GET', '/v1/journal')).json;
  return { committed: leases.leases['synthetic-lease-001'].committed, stepRecords: leases.journalRecords, runs: journal.runs, live: journal.live };
}

async function quiescent(port) {
  let previous = JSON.stringify(await observe(port));
  for (let stable = 0; stable < 4;) {
    await new Promise((resolve) => setImmediate(resolve));
    const now = JSON.stringify(await observe(port));
    stable = now === previous && JSON.parse(now).live === 0 ? stable + 1 : 0;
    previous = now;
  }
  return JSON.parse(previous);
}

const REFUSED = [
  ['an unknown route', 404, (p) => get(p, '/nope')],
  ['a wrong method', 405, (p) => `PUT /v1/presets HTTP/1.1\r\nHost: ${hostOf(p)}\r\n\r\n`],
  ['a query', 400, (p) => get(p, '/v1/leases?x=1')],
  ['a foreign host', 421, () => 'GET /v1/leases HTTP/1.1\r\nHost: evil.example\r\n\r\n'],
  ['a foreign origin', 403, (p) => get(p, '/v1/leases', 'Origin: http://evil.example\r\n')],
  ['invalid JSON (decided after an await)', 400, (p) => send(p, 'POST', '/v1/presets', '{nope')],
];

test('SEPARATE PROCESS: a mutation pipelined behind a refusal never runs, the ledger and the revision stay', { timeout: 1800000 }, async (context) => {
  const child = await startChild();
  try {
    const before = await quiescent(child.port);
    assert.equal(before.committed, 0);
    for (const [name, status, request] of REFUSED) {
      await context.test(name, async () => {
        const seen = await exchange(child.port, [request(child.port), mutation(child.port, 2)]);
        assert.deepEqual(seen.statuses, [status]);
        assert.equal(seen.closed, true);
        assert.deepEqual(await quiescent(child.port), before, 'the child process was not changed by the pipelined mutation');
      });
    }
    await context.test('control: the same mutation alone applies once, and a legitimate pipeline answers in order', async () => {
      const seen = await exchange(child.port, [get(child.port, '/v1/leases'), mutation(child.port, 3), get(child.port, '/v1/leases')], { answers: 3 });
      assert.deepEqual(seen.statuses, [200, 201, 200]);
      assert.equal((await quiescent(child.port)).committed, before.committed + 15);
    });
  } finally {
    await child.dispose();
  }
});
