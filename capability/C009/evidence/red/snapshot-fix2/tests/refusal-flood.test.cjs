'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const { startChild } = require('./resource-harness.cjs');

// Review findings L-0138, F1b and F9. The attacker runs in its OWN process, the server in a small-heap child process. One client
// streams an endless Transfer-Encoding: chunked body of 1-byte chunks (one parser callback each) at a REFUSED request, first on its
// connection or queued behind a GET. A refusal must end the connection and stop reading at once. NOTHING here is a wall-clock bound
// (a bare 400-and-close server shows seconds of event-loop lag when other processes use the CPU: L-0170): the facts asserted are
// structural, and a NAIVE control server (no close, no read stop) runs in the same test under the same load.
//   closed   the server ended every attacking connection (the test waits for the close EVENT, with a generous deadline);
//   bytes    the server READ at most READ_BOUND bytes from each of them, while the attacker offered OFFER_BYTES (the naive control
//            reads all of it: that proves the attack is delivered, and that the assertions fail on a naive server);
//   cpu      the server's own CPU time (process.cpuUsage) is a fraction of the naive control's;
//   alive    a normal client is still answered after the attack.
const ATTACKER = path.join(__dirname, 'flood-attacker.cjs');
const CHILD = path.join(__dirname, 'flood-child.cjs');
const SOCKETS = 2;
const OFFER_BYTES = 1024 * 1024;
const READ_BOUND = 256 * 1024;
const DEADLINE_MS = 150000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const JSON_TYPE = 'Content-Type: application/json';
const head = (method, target, host, lines) => [`${method} ${target} HTTP/1.1`, `Host: ${host}`, ...lines, 'Transfer-Encoding: chunked', '', ''].join('\r\n');
const getState = (host) => `GET /v1/state HTTP/1.1\r\nHost: ${host}\r\n\r\n`;

const KINDS = [
  { name: 'no credential (401)', status: 401, head: ({ host }) => head('POST', '/v1/commands/run.create', host, [JSON_TYPE]) },
  { name: 'visitor on run.create (403)', status: 403, head: ({ host, tokens }) => head('POST', '/v1/commands/run.create', host, [`Authorization: Bearer ${tokens.visitor}`, JSON_TYPE]) },
  { name: 'GET /v1/state with a body (400)', status: 400, head: ({ host }) => head('GET', '/v1/state', host, []) },
  { name: 'unknown Expect (417)', status: 417, head: ({ host }) => head('GET', '/v1/state', host, ['Expect: nonsense']) },
  { name: 'CONTROL: authorized command with an oversized body (413)', status: 413, control: true, head: ({ host, tokens }) => head('POST', '/v1/commands/pool.resize', host, [`Authorization: Bearer ${tokens.operator}`, JSON_TYPE]) }
];
const POSITIONS = [
  { name: 'first on its connection', prefix: () => '', before: [] },
  { name: 'queued behind a GET', prefix: getState, before: [200] }
];

// The attacker (flood-attacker.cjs) tells us when it has offered everything, stays connected, and reports what its sockets saw on request.
function runAttacker(port, spec) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = spawn(process.execPath, [ATTACKER, String(port), JSON.stringify(spec), String(SOCKETS), String(OFFER_BYTES)], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true });
  const hard = setTimeout(() => child.kill('SIGKILL'), DEADLINE_MS + 20000);
  const message = (type) => new Promise((resolve, reject) => {
    const listener = (received) => { if (received.type === type) { child.off('message', listener); resolve(received); } };
    child.on('message', listener);
    child.once('exit', () => reject(new Error(`the attacker ended before it sent ${type}`)));
  });
  const offered = message('offered');
  return {
    child, offered, hard,
    report() { const answer = message('report'); child.send('report'); return answer; }
  };
}

const getOnce = (port) => new Promise((resolve, reject) => {
  http.get({ host: '127.0.0.1', port, path: '/v1/state', agent: false, timeout: DEADLINE_MS }, (response) => {
    response.resume();
    response.once('end', () => resolve({ status: response.statusCode }));
  }).once('error', reject);
});

// Waits for the server's own account, never for a clock: every attacking socket closed (safe server), or most of what was offered read
// (naive control: it never closes). The deadline only ends a wait that cannot succeed, and the assertions then fail.
async function settle(server, offered, naive) {
  const deadline = Date.now() + DEADLINE_MS;
  for (;;) {
    const report = await server.ask('report', 'report', 30000);
    const attackers = [...report.sockets].sort((left, right) => right.bytesRead - left.bytesRead).slice(0, SOCKETS);
    const done = naive ? attackers.reduce((sum, socket) => sum + socket.bytesRead, 0) >= 0.8 * offered : attackers.every((socket) => socket.closed);
    if (done || Date.now() > deadline) return { ...report, attackers };
    await sleep(100);
  }
}

async function flood({ kind, position, naive = false }) {
  process.env.C009_NAIVE = naive ? '1' : '0';
  const server = startChild({ heapMb: 64, hardMs: DEADLINE_MS + 30000, script: CHILD, args: [] });
  delete process.env.C009_NAIVE;
  let attack = null;
  try {
    const { port, tokens } = await server.receive('listening', 30000);
    const host = `127.0.0.1:${port}`;
    attack = runAttacker(port, { prefix: position.prefix(host), head: kind.head({ host, tokens }) });
    const { offered } = await attack.offered;
    const report = await settle(server, offered, naive);
    const { sockets } = await attack.report();
    return { sockets, report, offered, kind, position, served: await getOnce(port) };
  } finally {
    if (attack) clearTimeout(attack.hard);
    if (attack && attack.child.exitCode === null) attack.child.kill('SIGKILL');
    server.stop();
  }
}

function assertRefused({ sockets, report, offered, kind, position, served }, naiveCpuMs) {
  assert.equal(sockets.length, SOCKETS);
  const expected = [...position.before, kind.status];
  for (const socket of sockets) assert.deepEqual(socket.statuses, expected.slice(0, socket.statuses.length), `the attacker read only the answers it was owed (${expected}) or a reset`);
  for (const socket of report.attackers) {
    assert.equal(socket.closed, true, 'the server closed the attacking connection');
    assert.ok(socket.bytesRead <= READ_BOUND, `the server read ${socket.bytesRead} bytes of a refused connection (bound ${READ_BOUND}, offered ${offered} in all)`);
  }
  assert.equal(report.revision, 0, 'the attack changed nothing');
  assert.equal(served.status, 200, 'a normal client is still served after the attack');
  // The authorized control reads its body up to the limit (every 1-byte chunk of that first read reaches the body reader, about 4 times the
  // CPU of a refused one): it only has to cost less than the naive server, a refused request a third of it.
  if (naiveCpuMs !== undefined) assert.ok(report.cpuMs * (kind.control ? 1 : 3) <= naiveCpuMs, `server CPU ${report.cpuMs} ms against the naive control ${naiveCpuMs} ms`);
}

const naiveControl = flood({ kind: KINDS[1], position: POSITIONS[0], naive: true });
naiveControl.catch(() => {});

test('the naive control reads the whole flood and never closes: the assertions fail on it, so the attack is delivered', { timeout: DEADLINE_MS + 30000 }, async () => {
  const control = await naiveControl;
  const read = control.report.attackers.reduce((sum, socket) => sum + socket.bytesRead, 0);
  assert.ok(read >= 4 * READ_BOUND, `the naive server read ${read} bytes`);
  assert.ok(control.report.cpuMs > 0);
  assert.throws(() => assertRefused(control), /closed|read \d+ bytes/, 'the structural assertions reject the naive server');
});

test('one client flooding endless 1-byte chunks at a refusal of any kind, first or queued behind a GET, is cut off at once', { concurrency: 3, timeout: DEADLINE_MS + 60000 }, async (t) => {
  const naiveCpuMs = (await naiveControl).report.cpuMs;
  await Promise.all(KINDS.flatMap((kind) => POSITIONS.map((position) => t.test(`flood at: ${kind.name}, ${position.name}`, async () => {
    assertRefused(await flood({ kind, position }), naiveCpuMs);
  }))));
});
