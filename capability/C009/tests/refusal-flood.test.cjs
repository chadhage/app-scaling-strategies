'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const { startChild } = require('./resource-harness.cjs');

// L-0138: the attacker runs in its OWN process, the server in a small-heap child that measures its own event-loop delay. One client
// streaming an endless Transfer-Encoding: chunked body of 1-byte chunks (one parser callback each) at a REFUSED request used to
// block the server for 8 to 10 s because the refusal kept the connection open and the body unread (the stall lasts about as long as the
// flood: 2 s here). The CONTROL is the same flood at an authorized command. Bounds are loose on purpose (a healthy server stays near 0.1 s).
// The in-process table (refusal-close.test.cjs) covers every typed code; these probe one representative per code path.
const ATTACKER = path.join(__dirname, 'flood-attacker.cjs');
const CHILD = path.join(__dirname, 'flood-child.cjs');
const ATTACK_MS = 2200;
const SOCKETS = 2;
const LOOP_LIMIT_MS = 1200;
const CONTROL_LOOP_LIMIT_MS = 5000;
const PROBE_TIMEOUT_MS = 2500;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const JSON_TYPE = 'Content-Type: application/json';
const request = (method, target, host, lines) => [`${method} ${target} HTTP/1.1`, `Host: ${host}`, ...lines, 'Transfer-Encoding: chunked', '', ''].join('\r\n');

const CLASSES = [
  { name: 'no credential (401)', status: 401, head: ({ local }) => request('POST', '/v1/commands/run.create', local, [JSON_TYPE]) },
  { name: 'visitor on run.create (403)', status: 403, head: ({ local, tokens }) => request('POST', '/v1/commands/run.create', local, [`Authorization: Bearer ${tokens.visitor}`, JSON_TYPE]) },
  { name: 'GET /v1/state with a body (400)', status: 400, head: ({ local }) => request('GET', '/v1/state', local, []) },
  { name: 'unknown Expect (417)', status: 417, head: ({ local }) => request('GET', '/v1/state', local, ['Expect: nonsense']) },
  { name: 'CONTROL: authorized command with an oversized body (413)', status: 413, control: true, head: ({ local, tokens }) => request('POST', '/v1/commands/pool.resize', local, [`Authorization: Bearer ${tokens.operator}`, JSON_TYPE]) }
];

function runAttacker(port, head) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = spawn(process.execPath, [ATTACKER, String(port), JSON.stringify(head), String(SOCKETS), String(ATTACK_MS)], { env, stdio: ['ignore', 'pipe', 'inherit'], windowsHide: true });
  const hard = setTimeout(() => child.kill('SIGKILL'), ATTACK_MS + 15000);
  let output = '';
  child.stdout.on('data', (chunk) => { output += chunk; });
  const done = new Promise((resolve) => child.once('exit', () => { clearTimeout(hard); resolve(output); }));
  return { child, done };
}

// A normal client asks for the state while the attack runs; a stalled server answers late or not at all.
async function probe(origin, untilMs) {
  const results = [];
  while (Date.now() < untilMs) {
    const started = Date.now();
    let ok = false;
    try {
      const response = await fetch(`${origin}/v1/state`, { signal: AbortSignal.timeout(PROBE_TIMEOUT_MS), headers: { Connection: 'close' } });
      ok = response.status === 200;
      await response.arrayBuffer();
    } catch { /* timed out or reset */ }
    results.push({ ok, ms: Date.now() - started });
    await sleep(100);
  }
  return results;
}

async function floodAt(kind) {
  const server = startChild({ heapMb: 64, hardMs: 70000, script: CHILD, args: [] });
  let attack = null;
  try {
    const { port, tokens } = await server.receive('listening', 15000);
    await server.ask('reset', 'reset', 15000);
    attack = runAttacker(port, kind.head({ local: `127.0.0.1:${port}`, tokens }));
    const probes = await probe(`http://127.0.0.1:${port}`, Date.now() + ATTACK_MS + 300);
    const flood = JSON.parse(await attack.done);
    const report = await server.ask('report', 'report', 25000);
    // The control (an authorized body is read until its limit, so up to one 64 KB read is parsed chunk by chunk, 0.5 to 2 s on a
    // loaded machine) only has to stay bounded and cut off; a REFUSED request must cost the server almost nothing.
    const limit = kind.control ? CONTROL_LOOP_LIMIT_MS : LOOP_LIMIT_MS;
    assert.ok(report.maxDelayMs < limit, `the server event loop was blocked for ${report.maxDelayMs} ms (limit ${limit})`);
    if (!kind.control) assert.deepEqual(probes.filter((entry) => !entry.ok), [], 'a normal client is served throughout the attack');
    assert.equal(flood.length, SOCKETS);
    for (const socket of flood) {
      assert.notEqual(socket.closedAfterMs, null, 'the server closed the attacking connection');
      assert.ok(socket.status === null || socket.status === kind.status, `the attacker saw ${socket.status}, expected ${kind.status} or a reset`);
    }
    assert.equal(report.revision, 0, 'the attack changed nothing');
  } finally {
    if (attack && attack.child.exitCode === null) attack.child.kill('SIGKILL');
    server.stop();
  }
}

// Three classes at a time: a healthy server is idle once it has cut the attacker, so the probes stay meaningful and the file stays short.
test('one client flooding endless 1-byte chunks cannot stall the server or stay connected, at a refusal of any kind and at the authorized control', { concurrency: 3, timeout: 55000 }, async (t) => {
  await Promise.all(CLASSES.map((kind) => t.test(`flood at: ${kind.name}`, () => floodAt(kind))));
});
