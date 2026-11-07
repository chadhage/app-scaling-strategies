'use strict';

// Review findings L-0138, L-0143, L-0170 and the C009 lesson F9c. The attacker runs in its OWN process, the server in a small-heap child
// process (ONE child and ONE naive control for the whole file, so the file stays cheap under load). One client streams an endless
// Transfer-Encoding: chunked body of 1-byte chunks at a REFUSED request, first on its connection or queued behind a GET. A refusal must end
// the connection and stop reading at once. NOTHING here is a wall-clock bound: the facts asserted are structural, and a NAIVE control server
// (no close, no read stop) runs under the same load. closed: the server ended every attacking connection (event, with a generous deadline
// that only ends a wait that cannot succeed); bytes: the server READ at most READ_BOUND bytes from each (the control reads what was offered,
// so the attack is delivered and the assertions fail on it); cpu: the server's CPU time is a fraction of the control's; alive: a normal
// client is still served; the world digest of the server is unchanged.
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { after, before, test } = require('node:test');
const { call } = require('./helpers.cjs');
const { startChild, childEnv } = require('./proc.cjs');

const ATTACKER = path.join(__dirname, 'flood-attacker.cjs');
const SOCKETS = 2;
const OFFER_BYTES = 512 * 1024;
const READ_BOUND = 256 * 1024;
const DEADLINE_MS = 90000;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const JSON_TYPE = 'Content-Type: application/json';
const head = (method, target, host, lines) => [`${method} ${target} HTTP/1.1`, `Host: ${host}`, ...lines, 'Transfer-Encoding: chunked', '', ''].join('\r\n');
const session = (host, token) => `GET /v1/session HTTP/1.1\r\nHost: ${host}\r\nAuthorization: Bearer ${token}\r\n\r\n`;

const KINDS = [
  { name: 'no credential (401) first on its connection', status: 401, before: [], prefix: () => '', head: ({ host }) => head('POST', '/v1/projects', host, [JSON_TYPE]) },
  { name: 'viewer token on a mutation (403) queued behind a GET', status: 403, before: [200], prefix: ({ host, t }) => session(host, t.alf), head: ({ host, t }) => head('POST', '/v1/projects', host, [`Authorization: Bearer ${t.ana}`, JSON_TYPE]) },
  { name: 'unknown Expect (417, answered by Node itself) first on its connection', status: 417, before: [], prefix: () => '', head: ({ host, t }) => head('GET', '/v1/projects', host, [`Authorization: Bearer ${t.alf}`, 'Expect: nonsense']) }
];

let real;
let naive;
let realReady;
let naiveReady;
before(async () => {
  real = startChild({ mode: 'real', heapMb: 64, hardMs: DEADLINE_MS + 60000 });
  naive = startChild({ mode: 'naive', heapMb: 64, hardMs: DEADLINE_MS + 60000 });
  [realReady, naiveReady] = await Promise.all([real.receive('ready'), naive.receive('ready')]);
});
after(async () => { await Promise.all([real.stop(), naive.stop()]); });

// The attacker tells us when it has offered everything, stays connected, and reports what its sockets saw on request.
function runAttacker(port, spec) {
  const env = childEnv();
  const child = spawn(process.execPath, [ATTACKER, String(port), JSON.stringify(spec), String(SOCKETS), String(OFFER_BYTES)], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true });
  const hard = setTimeout(() => child.kill('SIGKILL'), DEADLINE_MS + 20000);
  const message = (type) => new Promise((resolve, reject) => {
    const listener = (received) => { if (received.type === type) { child.off('message', listener); resolve(received); } };
    child.on('message', listener);
    child.once('exit', () => reject(new Error(`the attacker ended before it sent ${type}`)));
  });
  const offered = message('offered');
  return { child, offered, hard, report() { const answer = message('report'); child.send('report'); return answer; } };
}

// Waits for the server's own account, never for a clock: every new attacking socket closed (safe server), or most of what was offered read
// (naive control: it never closes). The deadline only ends a wait that cannot succeed, and the assertions then fail.
async function settle(server, since, offered, isNaive) {
  const deadline = Date.now() + DEADLINE_MS;
  for (;;) {
    const report = await server.ask('report', 'report', 30000);
    const mine = report.sockets.slice(since).sort((left, right) => right.bytesRead - left.bytesRead).slice(0, SOCKETS);
    const done = isNaive ? mine.reduce((sum, socket) => sum + socket.bytesRead, 0) >= 0.8 * offered : mine.length === SOCKETS && mine.every((socket) => socket.closed);
    if (done || Date.now() > deadline) return { ...report, mine };
    await sleep(100);
  }
}

async function flood(server, ready, kind, isNaive) {
  const host = `127.0.0.1:${ready.port}`;
  const start = await server.ask('report', 'report', 30000);
  const ctx = { host, t: ready.tokens };
  const attack = runAttacker(ready.port, { prefix: kind.prefix(ctx), head: kind.head(ctx) });
  try {
    const { offered } = await attack.offered;
    const report = await settle(server, start.sockets.length, offered, isNaive);
    const { sockets } = await attack.report();
    const served = isNaive ? null : (await call(ready.port, 'GET', '/v1/session', { token: ready.tokens.alf })).status;
    return { sockets, report, offered, cpuMs: report.cpuMs - start.cpuMs, digestBefore: start.digest, served };
  } finally {
    clearTimeout(attack.hard);
    if (attack.child.exitCode === null) attack.child.kill('SIGKILL');
  }
}

function assertRefused(run, kind, naiveCpuMs) {
  assert.equal(run.sockets.length, SOCKETS);
  const owed = [...kind.before, kind.status];
  for (const socket of run.sockets) assert.deepEqual(socket.statuses, owed.slice(0, socket.statuses.length), `the attacker read only the answers it was owed (${owed}) or a reset`);
  for (const socket of run.report.mine) {
    assert.equal(socket.closed, true, 'the server closed the attacking connection');
    assert.ok(socket.bytesRead <= READ_BOUND, `the server read ${socket.bytesRead} bytes of a refused connection (bound ${READ_BOUND}, offered ${run.offered} in all)`);
  }
  assert.equal(run.report.digest, run.digestBefore, 'the attack changed nothing');
  assert.equal(run.served, 200, 'a normal client is still served after the attack');
  if (naiveCpuMs !== undefined) assert.ok(run.cpuMs * 3 <= naiveCpuMs, `server CPU ${run.cpuMs} ms against the naive control ${naiveCpuMs} ms`);
}

let control;
test('the naive control reads the whole flood and never closes: the assertions FAIL on it, so the attack is delivered and the checks have teeth', { timeout: DEADLINE_MS + 30000 }, async () => {
  const run = await flood(naive, naiveReady, KINDS[1], true);
  control = run;
  assert.ok(run.report.mine.every((socket) => !socket.closed), 'the control never closes the attacking connection');
  assert.ok(run.report.mine.every((socket) => socket.bytesRead > READ_BOUND), `the control read more than the bound of ${READ_BOUND} bytes from every attacking connection, so the bound has teeth`);
  assert.ok(run.report.mine.reduce((sum, socket) => sum + socket.bytesRead, 0) >= 0.8 * run.offered, 'the control read what was offered');
  assert.ok(run.cpuMs > 0);
  assert.throws(() => assertRefused({ ...run, served: 200, digestBefore: '' }, KINDS[1]), 'the structural assertions reject a server that does what the control does');
});

for (const kind of KINDS) {
  test(`${kind.name}: the server ends the connection, reads at most ${READ_BOUND / 1024} KB of it, costs a fraction of the control's CPU, changes nothing and keeps serving`, { timeout: DEADLINE_MS + 30000 }, async () => {
    assert.ok(control, 'the control ran first');
    assertRefused(await flood(real, realReady, kind, false), kind, control.cpuMs);
  });
}
