'use strict';

// L-0120 and L-0138 for this fixture, measured the only way that can see a stall: the attacker is ANOTHER process and the server is the
// real CLI in a small-heap child. An in-process attacker shares the server's event loop and cannot starve it (the first publication's
// chunked.test.cjs passed while a separate process kept the loop busy for 2 to 5 s). Every row of the shared refusal table is attacked
// with three endless chunked streams while this process keeps issuing GETs; the event-loop delay is sampled inside the child.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { startChild } = require('./child.cjs');
const { rows, statusOf } = require('./refusals.cjs');

const attacker = path.join(__dirname, 'attacker.cjs');
// The defect keeps three attacker sockets open for 3.9 s to the 5 s request timeout (and starves the loop for 2 to 5 s); a loaded machine
// (three coverage suites at once plus other builds) was measured at up to 2.5 s without any flood, so the bounds sit between the two.
const LAG_BOUND_MS = 3200;
const CLOSE_BOUND_MS = 3200;
const ROUNDS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function lagSince(file, since) {
  const samples = fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.endsWith('}')).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  return samples.filter((sample) => sample.t >= since).reduce((max, sample) => Math.max(max, sample.maxMs), 0);
}

function attack(t, port, head) {
  const child = spawn(process.execPath, [attacker, JSON.stringify({ port, head, sockets: 3, capMs: 6000 })], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  let out = '';
  child.stdout.on('data', (part) => { out += part; });
  const state = { finished: false };
  const done = new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => { state.finished = true; if (code === 0) resolve(JSON.parse(out.trim())); else reject(new Error(`the attacker process exited with ${code}`)); });
  });
  return { state, done };
}

async function concurrentGets(origin, state) {
  const latencies = [];
  while (!state.finished) {
    const started = Date.now();
    await s.withTimeout(h.get(origin, '/api/state'), 'a concurrent GET never completed', 9000).catch(() => null);
    latencies.push(Date.now() - started);
    await sleep(40);
  }
  return latencies;
}

test('every refusal of the shared table closes an abusive connection at once and never starves the event loop of a small-heap child (attacker in another process)', { timeout: 240000 }, async (t) => {
  const made = s.scratch('cp');
  t.after(() => made.remove());
  const lagFile = path.join(made.dir, 'lag.jsonl');
  const kid = startChild(t, { nodeFlags: ['--max-old-space-size=48'], env: { C017_LAG_FILE: lagFile }, args: [`--dir=${made.dir}`, '--step-delay-ms=0'] });
  const origin = await kid.origin();
  const { port } = new URL(origin);
  const host = `Host: 127.0.0.1:${port}\r\n`;
  const idle = Date.now();
  await h.get(origin, '/api/state');
  assert.ok(Date.now() - idle < 8000, 'the idle child must answer a GET');

  for (const row of rows) {
    await t.test(row.name, { timeout: 120000 }, async (sub) => {
      const polite = h.raw(origin, row.head(host) + row.small);
      await s.withTimeout(polite.closed, 'the polite request was never closed', 8000);
      assert.equal(statusOf(polite.text()), row.status, 'the table row must elicit its status from a well-behaved client');

      // A machine under heavy load (other builds, browsers) can starve the child for seconds without any flood, so a row gets up to three
      // rounds and fails only when every round breaks a bound. The unfixed server breaks them in EVERY round on the 413 path (three attacker
      // sockets stay open to the 5 s request timeout) and in some rounds on the other paths (L-0132).
      let problems = [];
      for (let round = 1; round <= ROUNDS; round += 1) {
        const since = Date.now();
        const hostile = attack(sub, port, row.head(host));
        const latencies = await concurrentGets(origin, hostile.state);
        const report = await hostile.done;
        await sleep(400);
        const lag = lagSince(lagFile, since);
        const slowest = Math.max(...latencies);
        problems = [];
        if (!report.closedAfterMs.every((ms) => ms !== null && ms < CLOSE_BOUND_MS)) problems.push(`an abusive connection stayed open: closed after ${JSON.stringify(report.closedAfterMs)} ms (null = still open at the cap)`);
        if (slowest >= LAG_BOUND_MS) problems.push(`a concurrent GET took ${slowest} ms while the endless chunked bodies were streaming`);
        if (lag >= LAG_BOUND_MS) problems.push(`the server event loop was starved for ${lag} ms`);
        if (!problems.length) { sub.diagnostic(`bounds held in round ${round}`); break; }
      }
      assert.deepEqual(problems, [], `the bounds were broken in all ${ROUNDS} rounds`);
    });
  }
  const stopped = await kid.stop();
  assert.equal(stopped.code, 0, kid.errors());
});
