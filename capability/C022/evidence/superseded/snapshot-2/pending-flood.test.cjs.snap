'use strict';

// The OPPOSITE failure of the lane design (rev-C017 F24, L-0209, L-0210, L-0213): a request that is still PENDING on a connection (a valid
// mutation held open by a hook) and tens of thousands of tiny requests pipelined behind it. A server that drops them without answering,
// pausing or cutting the socket keeps an IncomingMessage and a ServerResponse for each (about 1.8 KB) and dies of memory. The server runs in
// a child with a 48 MB heap, the attackers in this process. NOTHING here is a wall-clock bound: the facts are COUNTED (requests Node parsed
// per socket, sockets closed by the server, requests offered, heap after a forced GC, the answer to a legitimate GET). The waits are on the
// server's own account (close events, parsed counters); the 15 s deadline only ends a wait that cannot succeed (it keeps a RED against the
// naive stub inside the runner's 60 s per-file cap; the real server has closed every socket before the first poll). A NAIVE control server (it
// holds the first request and drops the rest unanswered) runs in the same file under the same load: it parses what is offered and cuts
// nothing, so the assertions have teeth. What a pending socket costs (one read of up to 64 KB is parsed before any lane can cut it: about
// 6 MB per socket, L-0213) and the connection cap that bounds the sockets are stated in the README limits.
const assert = require('node:assert/strict');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { after, before, test } = require('node:test');
const { call } = require('./helpers.cjs');

const CHILD = path.join(__dirname, 'pending-child.cjs');
const SOCKETS = 3;
const TARGET = 50000;
const DEADLINE_MS = 15000;
const PENDING_COST_MB = 10;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function startPending({ mode, heapMb }) {
  const env = { ...process.env, C022_MODE: mode };
  delete env.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [`--max-old-space-size=${heapMb}`, '--expose-gc', CHILD], { env, stdio: ['ignore', 'inherit', 'inherit', 'ipc'], windowsHide: true });
  const hard = setTimeout(() => child.kill('SIGKILL'), 240000);
  hard.unref();
  let exit = null;
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => { exit = { code, signal }; resolve(); }));
  const receive = (type, ms = DEADLINE_MS) => new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); child.off('message', listener); child.off('exit', onExit); };
    const timer = setTimeout(() => { done(); reject(new Error(`no ${type} message from the server child within ${ms} ms`)); }, ms);
    const listener = (message) => { if (message.type === type) { done(); resolve(message); } };
    const onExit = () => { done(); reject(new Error(`the server child ended before it sent ${type}`)); };
    child.on('message', listener);
    child.once('exit', onExit);
  });
  return {
    receive, alive: () => exit === null, exitInfo: () => exit,
    send: (message) => child.send(message),
    ask(message, type = 'report', ms = DEADLINE_MS) { const answer = receive(type, ms); child.send(message); return answer; },
    async stop() {
      clearTimeout(hard);
      if (exit === null && child.connected) child.send('close');
      const timer = setTimeout(() => { if (exit === null) child.kill('SIGKILL'); }, 15000);
      await exited;
      clearTimeout(timer);
    }
  };
}

const FRAMINGS = {
  '1.1': { unit: Buffer.from('GET /x HTTP/1.1\r\n\r\n'), extra: '' },
  '1.0': { unit: Buffer.from('GET /x HTTP/1.0\r\nConnection: keep-alive\r\n\r\n'), extra: 'Connection: keep-alive\r\n' }
};

// One attacking connection: the held mutation first, then 64 KB blocks of tiny requests until `target` were offered or the server ended it.
function attacker(port, token, version, target) {
  const { unit, extra } = FRAMINGS[version];
  const perBlock = Math.floor(65536 / unit.length);
  const block = Buffer.concat(Array.from({ length: perBlock }, () => unit));
  const body = JSON.stringify({ name: 'held', units: 1 });
  const first = `POST /v1/projects HTTP/${version}\r\nHost: 127.0.0.1:${port}\r\nAuthorization: Bearer ${token}\r\nContent-Type: application/json\r\n${extra}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
  const result = { offered: 0, perBlock, closed: false };
  const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
  result.socket = socket;
  socket.resume();
  let stop = () => {};
  result.offering = new Promise((resolve) => { stop = resolve; });
  const end = () => { result.closed = true; stop(); };
  socket.on('error', end);
  socket.on('end', end);
  socket.on('close', end);
  const pump = () => {
    if (result.closed || result.offered >= target) { stop(); return; }
    result.offered += perBlock;
    if (socket.write(block)) setImmediate(pump); else socket.once('drain', pump);
  };
  socket.write(first);
  setImmediate(pump);
  return result;
}

// Waits for the server's own account (never for a clock): every attacking socket closed (a server that cuts), or every offered request parsed
// (the control, which never cuts). The deadline (absolute, shared with the offering phase) only ends a wait that cannot succeed.
async function settle(server, since, offered, isNaive, deadline) {
  for (;;) {
    let peek;
    try { peek = await server.ask('peek', 'report', 8000); } catch { return null; }
    const mine = peek.sockets.slice(since, since + SOCKETS);
    const done = isNaive ? mine.reduce((sum, socket) => sum + socket.parsed, 0) >= 0.9 * offered() : mine.length === SOCKETS && mine.every((socket) => socket.closed);
    if (done || Date.now() > deadline || !server.alive()) return peek;
    await sleep(50);
  }
}

async function flood(server, { port, token }, { version, sockets, target, isNaive }) {
  const baseline = await server.ask('report');
  const since = baseline.sockets.length;
  const deadlineAt = Date.now() + DEADLINE_MS;
  server.send('arm');
  const attackers = Array.from({ length: sockets }, () => attacker(port, token, version, target));
  let timer = null;
  try {
    // Offering ends when everything was offered or the server ended the connection; a server that stops READING (backpressure) never
    // drains the attacker, so this wait has the same deadline.
    const expired = new Promise((resolve) => { timer = setTimeout(resolve, DEADLINE_MS); });
    await Promise.race([Promise.all(attackers.map((one) => one.offering)), expired]);
    const offered = () => attackers.reduce((sum, one) => sum + one.offered, 0);
    await settle(server, since, offered, isNaive, deadlineAt);
    const alive = server.alive();
    // An unresponsive server is reported by the assertions (no report, no answer), and nothing waits twice for it.
    const report = alive ? await server.ask('report', 'report', 8000).catch(() => ({ heapMb: NaN, sockets: [] })) : { heapMb: NaN, sockets: [] };
    const mine = report.sockets.slice(since, since + sockets);
    const served = alive && !isNaive && mine.length === sockets && mine.every((socket) => socket.closed) ? (await call(port, 'GET', '/v1/projects', { token })).status : null;
    return { alive, exit: server.exitInfo(), offered: offered(), perBlock: attackers[0].perBlock, sockets: mine, growthMb: report.heapMb - baseline.heapMb, heapMb: report.heapMb, served };
  } finally {
    clearTimeout(timer);
    if (server.alive()) server.send('release');
    for (const one of attackers) one.socket.destroy();
  }
}

let real;
let naive;
let realReady;
let naiveReady;
before(async () => {
  real = startPending({ mode: 'real', heapMb: 48 });
  naive = startPending({ mode: 'naive', heapMb: 192 });
  [realReady, naiveReady] = await Promise.all([real.receive('ready'), naive.receive('ready')]);
});
after(async () => { await Promise.all([real.stop(), naive.stop()]); });

test('the NAIVE control holds the first request and drops the rest unanswered: it parses what is offered and cuts no socket, so the checks below have teeth', { timeout: 180000 }, async () => {
  const run = await flood(naive, naiveReady, { version: '1.1', sockets: 2, target: 10000, isNaive: true });
  assert.equal(run.alive, true);
  assert.ok(run.sockets.every((socket) => !socket.closed), 'the control closes nothing');
  assert.ok(run.sockets.reduce((sum, socket) => sum + socket.parsed, 0) >= 0.9 * run.offered, `the control parsed what was offered (${run.offered})`);
  assert.ok(run.offered >= 2 * 10000, 'the attack was delivered in full');
  assert.ok(run.growthMb > 2 * PENDING_COST_MB, `the retained requests are visible in its heap: ${run.growthMb} MB for 2 sockets, more than the ${2 * PENDING_COST_MB} MB that the real server is held to`);
});

for (const version of ['1.1', '1.0']) {
  test(`HTTP/${version}: one request stays pending on each of ${SOCKETS} sockets and ${TARGET} tiny requests are pipelined behind it: the server cuts every socket, parses a bounded number, stays alive, and answers a legitimate GET`, { timeout: 180000 }, async (t) => {
    const run = await flood(real, realReady, { version, sockets: SOCKETS, target: TARGET, isNaive: false });
    t.diagnostic(`pending flood HTTP/${version}: parsed per socket ${run.sockets.map((socket) => socket.parsed).join(',')} of up to ${TARGET} offered each (${run.offered} offered in all), heap growth ${run.growthMb} MB, heap ${run.heapMb} MB of 48`);
    assert.equal(run.alive, true, `the server process is alive (${JSON.stringify(run.exit)})`);
    assert.equal(run.sockets.length, SOCKETS, 'the server accepted every attacking connection');
    const bound = 2 * run.perBlock;
    for (const socket of run.sockets) {
      assert.equal(socket.closed, true, 'the server ended the attacking connection');
      assert.ok(socket.parsed <= bound, `Node parsed ${socket.parsed} requests of a connection with a pending first request (bound ${bound}: two 64 KB reads, offered up to ${TARGET} per connection)`);
    }
    assert.ok(run.growthMb <= SOCKETS * PENDING_COST_MB, `the heap grew by ${run.growthMb} MB for ${SOCKETS} pending sockets (bound ${SOCKETS * PENDING_COST_MB} MB, cap 48 MB)`);
    assert.equal(run.served, 200, 'a legitimate GET is answered while the first requests are still pending');
  });
}
