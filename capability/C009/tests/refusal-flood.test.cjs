'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { test } = require('node:test');
const { startChild } = require('./resource-harness.cjs');

// Review findings L-0138, F1b, F9 and F9c. The attacker runs in its OWN process, the server in a small-heap child process. One client
// streams an endless Transfer-Encoding: chunked body of 1-byte chunks (one parser callback each) at a REFUSED request, first on its
// connection or queued behind a GET. A refusal must end the connection and stop reading at once. NOTHING here is a wall-clock bound
// (a bare 400-and-close server shows seconds of event-loop lag when other processes use the CPU: L-0170): the facts asserted are
// structural, and a NAIVE control server (no close, no read stop) runs in the same file under the same load.
//   closed   the server ended every attacking connection (the test waits for the close EVENT, with a generous deadline);
//   bytes    the server READ at most READ_BOUND bytes from each of them, while the attacker offered OFFER_BYTES (the naive control
//            reads all of it: that proves the attack is delivered, and that the assertions fail on a naive server);
//   cpu      the server's own CPU time (process.cpuUsage) for the attack is a fraction of the naive control's;
//   alive    a normal client is still answered after the attack.
// COST (review F9c, L-0204): the file must fit the 60 s of the runner at several times the quiet cost, and on a loaded machine a process
// start alone costs seconds. ONE server child hosts the safe server AND the naive control (flood-servers.cjs), ONE persistent attacker
// process attacks both (flood-attacks.cjs), and every attack of the file runs one after the other (the server child's own account of an
// attack is the slice of that server's connections after the ones it had before, and the CPU time of the attack is a difference),
// instead of a server and an attacker per attack; the attacks are one per refusal code path (see ATTACKS), no wait is longer than the 30 s
// that only end a wait that cannot succeed.
const ATTACKER = path.join(__dirname, 'flood-attacks.cjs');
const CHILD = path.join(__dirname, 'flood-servers.cjs');
const SOCKETS = 2;
const OFFER_BYTES = 1024 * 1024;
const READ_BOUND = 256 * 1024;
const DEADLINE_MS = 30000;
const HARD_MS = 65000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const JSON_TYPE = 'Content-Type: application/json';
const head = (method, target, host, lines) => [`${method} ${target} HTTP/1.1`, `Host: ${host}`, ...lines, 'Transfer-Encoding: chunked', '', ''].join('\r\n');
const getState = (host) => `GET /v1/state HTTP/1.1\r\nHost: ${host}\r\n\r\n`;

const KINDS = [
  { name: 'no credential (401)', status: 401, queued: true, head: ({ host }) => head('POST', '/v1/commands/run.create', host, [JSON_TYPE]) },
  { name: 'visitor on run.create (403)', status: 403, head: ({ host, tokens }) => head('POST', '/v1/commands/run.create', host, [`Authorization: Bearer ${tokens.visitor}`, JSON_TYPE]) },
  { name: 'GET /v1/state with a body (400)', status: 400, head: ({ host }) => head('GET', '/v1/state', host, []) },
  { name: 'unknown Expect (417)', status: 417, queued: true, head: ({ host }) => head('GET', '/v1/state', host, ['Expect: nonsense']) },
  { name: 'CONTROL: authorized command with an oversized body (413)', status: 413, control: true, head: ({ host, tokens }) => head('POST', '/v1/commands/pool.resize', host, [`Authorization: Bearer ${tokens.operator}`, JSON_TYPE]) }
];
const POSITIONS = [
  { name: 'first on its connection', prefix: () => '', before: [] },
  { name: 'queued behind a GET', prefix: getState, before: [200] }
];

// ONE persistent attacker process for the whole file (flood-attacks.cjs, over IPC): it attacks the port each attack names.
function startAttacker() {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = spawn(process.execPath, [ATTACKER, String(SOCKETS), String(OFFER_BYTES)], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true });
  const hard = setTimeout(() => child.kill('SIGKILL'), HARD_MS);
  let attacks = 0;
  const message = (type) => new Promise((resolve, reject) => {
    const onExit = () => reject(new Error(`the attacker ended before it sent ${type}`));
    const listener = (received) => {
      if (received.type !== type) return;
      child.off('message', listener);
      child.off('exit', onExit);
      resolve(received);
    };
    child.on('message', listener);
    child.once('exit', onExit);
  });
  return {
    async attack(spec) {
      const offered = message('offered');
      child.send({ type: 'attack', spec });
      return { index: attacks++, offered: (await offered).offered };
    },
    report(index) { const answer = message('report'); child.send({ type: 'report', index }); return answer; },
    stop() { clearTimeout(hard); if (child.exitCode === null) child.kill('SIGKILL'); }
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
async function settle(env, which, { start, offered }) {
  const deadline = Date.now() + DEADLINE_MS;
  for (;;) {
    const report = await env.server.ask({ type: 'report', which }, `report:${which}`, DEADLINE_MS);
    const attackers = report.sockets.slice(start, start + SOCKETS);
    const done = attackers.length === SOCKETS && (which === 'naive' ? attackers.reduce((sum, socket) => sum + socket.bytesRead, 0) >= 0.8 * offered : attackers.every((socket) => socket.closed));
    if (done || Date.now() > deadline) return { ...report, attackers };
    await sleep(100);
  }
}

async function startEnvironment() {
  const server = startChild({ heapMb: 64, hardMs: HARD_MS, script: CHILD, args: [] });
  const attacker = startAttacker();
  const { ports, tokens } = await server.receive('listening', DEADLINE_MS);
  return { server, attacker, ports, tokens };
}

async function flood(env, which, { kind, position }) {
  const port = env.ports[which];
  const host = `127.0.0.1:${port}`;
  const before = await env.server.ask({ type: 'report', which }, `report:${which}`, DEADLINE_MS);
  const { index, offered } = await env.attacker.attack({ port, prefix: position.prefix(host), head: kind.head({ host, tokens: env.tokens }) });
  const report = await settle(env, which, { start: before.sockets.length, offered });
  const { sockets } = await env.attacker.report(index);
  return { sockets, report: { ...report, cpuMs: report.cpuMs - before.cpuMs }, offered, kind, position, served: await getOnce(port) };
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

// One attack per refusal code path: every kind first on its connection, and the two that are decided in different places (a refusal of the
// route, the answer Node gives itself through checkExpectation) also queued behind a GET.
const ATTACKS = KINDS.flatMap((kind) => POSITIONS.filter((position, index) => index === 0 || kind.queued).map((position) => ({ kind, position })));

test('the flood of a client at a refusal of every kind, first or queued behind a GET, is cut off at once; a naive control is not', { timeout: 55000 }, async (t) => {
  const env = await startEnvironment();
  try {
    const control = flood(env, 'naive', { kind: KINDS[1], position: POSITIONS[0] });
    control.catch(() => {});
    await t.test('the naive control reads the whole flood and never closes: the assertions fail on it, so the attack is delivered', async () => {
      const result = await control;
      const read = result.report.attackers.reduce((sum, socket) => sum + socket.bytesRead, 0);
      assert.ok(read >= 4 * READ_BOUND, `the naive server read ${read} bytes`);
      assert.ok(result.report.cpuMs > 0);
      assert.throws(() => assertRefused(result), /closed|read \d+ bytes/, 'the structural assertions reject the naive server');
    });
    for (const attack of ATTACKS) {
      await t.test(`flood at: ${attack.kind.name}, ${attack.position.name}`, async () => {
        assertRefused(await flood(env, 'safe', attack), (await control).report.cpuMs);
      });
    }
  } finally {
    env.attacker.stop();
    env.server.stop();
  }
});
