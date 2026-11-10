'use strict';

// Resource bounds, proved against the real service: the server runs in a child process with a small heap and a hard
// external timeout, hostile clients run in their OWN process (an in-process attacker shares the event loop and hides a
// stall), and the event-loop lag is measured inside the server and REPORTED. No test here decides on a duration: no fixed
// sleeps, every wait polls a condition, and a limit only ends a wait that can never end (self-review line 12).
const assert = require('node:assert/strict');
const { fork, spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const { call } = require('./support.cjs');

const MB = 1024 * 1024;
// A hang detector and nothing else. No test below decides on how LONG something took (the scheduler of a loaded machine
// dominates every duration, L-0170): a test decides on closed sockets, answered probes, a collected heap and the configured
// timers (tests\guards.test.cjs reads them from the server). A limit only ends a wait that can never end.
const LIVENESS_MS = Number(process.env.C043_LIVENESS_MS ?? 90000);
const HARD_MS = 900000;
// The timers that would end a connection anyway are set to ten minutes in the child, so that only the rule under test can close it.
const QUIET = Object.freeze({ requestMs: 600000, headersMs: 600000, keepAliveMs: 600000, firstRequestMs: 600000, idleMs: 600000 });
const hardTimeout = (ms, label) => new Promise((resolve, reject) => { setTimeout(() => reject(new Error(`hard timeout: ${label}`)), ms).unref(); });
const settleTurn = () => new Promise((resolve) => setTimeout(resolve, 25));
const cleanEnvironment = () => {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  return env;
};

async function until(check, label, ms = LIVENESS_MS) {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) assert.fail(`never held: ${label}`);
    await settleTurn();
  }
}

async function startChild({ heapMb = 48, bounds = {} } = {}) {
  const child = fork(path.join(__dirname, 'child-server-r3.cjs'), [JSON.stringify(bounds)], { execArgv: [`--max-old-space-size=${heapMb}`, '--expose-gc'], env: cleanEnvironment(), silent: true });
  const errors = [];
  child.stderr.on('data', (chunk) => errors.push(chunk));
  const watchdog = setTimeout(() => child.kill(), HARD_MS);
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const waiting = new Map();
  child.on('message', (message) => { waiting.get(message.type)?.(message); waiting.delete(message.type); });
  const next = (type) => new Promise((resolve) => waiting.set(type, resolve));
  const early = exited.then((result) => { throw new Error(`the child exited early: ${JSON.stringify(result)} ${Buffer.concat(errors)}`); });
  const { port } = await Promise.race([next('listening'), early]);
  const ask = (type, reply = type) => { const waiter = next(reply); child.send({ type }); return Promise.race([waiter, early]); };
  return { port, exited, stats: () => ask('stats'), reads: () => ask('reads'), reset: () => ask('reset'), stop: () => ask('stop', 'closed'), dispose: () => { clearTimeout(watchdog); child.kill(); } };
}

function attack(port, kind, count, hardMs) {
  const child = spawn(process.execPath, [path.join(__dirname, 'attacker.cjs'), String(port), String(count), kind, String(hardMs)], { env: cleanEnvironment(), windowsHide: true });
  const chunks = [];
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  child.stderr.on('data', (chunk) => chunks.push(chunk));
  const watchdog = setTimeout(() => child.kill(), hardMs + 20000);
  const finished = new Promise((resolve) => child.once('close', () => { clearTimeout(watchdog); resolve(Buffer.concat(chunks).toString('utf8')); }));
  return { finished, kill: () => child.kill() };
}

function connect(port, { allowHalfOpen = false, read = true } = {}) {
  const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen });
  const chunks = [];
  socket.on('error', () => {});
  if (read) socket.on('data', (chunk) => chunks.push(chunk)); else socket.pause();
  return { socket, closed: new Promise((resolve) => socket.once('close', resolve)), received: () => Buffer.concat(chunks).toString('latin1') };
}

const get = (port, target, extra = '') => `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${extra}\r\n`;
const KINDS = (process.env.C043_KINDS ?? 'get-body,put-405,post-404,media-415,host-421,origin-403,action-body-400,key-400,query-400,invalid-preset-400').split(',');
const FLOOD = Number(process.env.C043_FLOOD ?? 8);
// The most bytes the server may read from ONE refused connection (a structural bound, measured in bytes, never in time): a
// correct server reads one 64 KB chunk (65,648 measured at most), a server that keeps parsing after the refusal reads 2 MB.
const READ_BOUND = Number(process.env.C043_READ_BOUND ?? 524288);

// Feeds one byte every 150 ms until the server closes the socket: only a timer of the server can end this client.
async function trickle(peer, byte) {
  let alive = true;
  peer.closed.then(() => { alive = false; });
  while (alive) {
    peer.socket.write(byte);
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}

test('REFUSAL FLOOD (table over every refusal the server emits, attacker in its own process): the server answers every probe and closes every attacker socket, whatever the load', { timeout: 3600000 }, async (context) => {
  const child = await startChild({ bounds: QUIET });
  try {
    for (const kind of KINDS) {
      await context.test(kind, { timeout: 1800000 }, async (subtest) => {
        await child.reset();
        const attacker = attack(child.port, kind, FLOOD, LIVENESS_MS);
        let probes = 0;
        let over = false;
        attacker.finished.then(() => { over = true; });
        while (!over) {
          const answer = await Promise.race([call(child.port, 'GET', '/v1/leases'), hardTimeout(LIVENESS_MS, `GET during the ${kind} flood`)]);
          assert.equal(answer.status, 200);
          probes += 1;
        }
        const report = JSON.parse((await attacker.finished).trim().split(/\r?\n/).pop());
        assert.deepEqual([report.closed, report.timedOut], [FLOOD, false], `the server closed ${report.closed} of ${FLOOD} attacker sockets (${kind})`);
        await until(async () => (await child.stats()).connections === 0, 'no attacker socket is left open');
        const stats = await child.stats();
        const reads = await child.reads();
        subtest.diagnostic(`flood ${kind}: server event-loop lag ${Math.round(stats.lagMaxMs)} ms, ${probes} probes, the server read at most ${reads.max} bytes from one connection (reported, never asserted)`);
        if (stats.stallObservation) subtest.diagnostic(`stall-observation ${kind}: ${JSON.stringify(stats.stallObservation)}`);
        assert.equal(reads.count >= FLOOD, true, `the server saw the ${FLOOD} attacker connections close`);
        assert.equal(reads.max <= READ_BOUND, true, `the server parsed ${reads.max} bytes from one connection, a refusal stops reading (bound ${READ_BOUND})`);
        assert.equal(stats.heapUsed < 32 * MB, true, `retained heap ${(stats.heapUsed / MB).toFixed(1)} MB once the connections are gone`);
        assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200, 'the service answers a GET after the flood');
      });
    }
  } finally {
    child.dispose();
  }
});

test('a client that pipelines requests and never reads is cut off after a bounded queue', { timeout: 600000 }, async () => {
  const child = await startChild();
  const flood = connect(child.port, { read: false });
  try {
    const baseline = await child.stats();
    flood.socket.write(get(child.port, '/transcript.json').repeat(3000));
    await until(async () => (await child.stats()).connections === 0, 'the server dropped the flooding connection');
    const stats = await child.stats();
    assert.equal(stats.heapUsed < 32 * MB && stats.rss - baseline.rss < 64 * MB, true);
    assert.equal((await call(child.port, 'GET', '/v1/leases')).status, 200);
  } finally {
    flood.socket.destroy();
    child.dispose();
  }
});

test('connection cap: more open sockets than the bound are dropped, not served', { timeout: 600000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, connections: 6 } });
  const idle = Array.from({ length: 20 }, () => connect(child.port));
  try {
    await Promise.all(idle.map((peer) => new Promise((resolve) => { peer.socket.once('connect', resolve); peer.socket.once('close', resolve); })));
    await until(async () => { const { connections } = await child.stats(); assert.equal(connections <= 6, true, `${connections} connections are open, the cap is 6`); return idle.filter((peer) => peer.socket.destroyed).length >= 14; }, 'the surplus sockets were dropped');
    assert.equal((await child.stats()).connections <= 6, true);
  } finally {
    for (const peer of idle) peer.socket.destroy();
    child.dispose();
  }
});

test('a socket that never sends a request is closed after the first-request bound', { timeout: 600000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, firstRequestMs: 300 } });
  const silent = connect(child.port);
  try {
    await Promise.race([silent.closed, hardTimeout(LIVENESS_MS, 'the silent socket was kept open')]);
  } finally {
    silent.socket.destroy();
    child.dispose();
  }
});

test('a client that trickles its headers is cut off by headersTimeout, enforced every connectionsCheckingInterval', { timeout: 600000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, headersMs: 400, checkMs: 100 } });
  const slow = connect(child.port);
  try {
    slow.socket.write(`GET /v1/leases HTTP/1.1\r\nHost: 127.0.0.1:${child.port}\r\nX-Slow: `);
    await Promise.race([trickle(slow, 'a'), hardTimeout(LIVENESS_MS, 'the trickling client was never cut off')]);
    assert.doesNotMatch(slow.received(), /^HTTP\/1\.1 200 /);
  } finally {
    slow.socket.destroy();
    child.dispose();
  }
});

test('a body that trickles is cut off by requestTimeout', { timeout: 600000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, requestMs: 400, headersMs: 400, checkMs: 100 } });
  const slow = connect(child.port);
  try {
    slow.socket.write(`POST /v1/presets HTTP/1.1\r\nHost: 127.0.0.1:${child.port}\r\nContent-Type: application/json\r\nContent-Length: 500\r\n\r\n`);
    await Promise.race([trickle(slow, '{'), hardTimeout(LIVENESS_MS, 'the trickling upload was never cut off')]);
    assert.doesNotMatch(slow.received(), /^HTTP\/1\.1 201 /);
  } finally {
    slow.socket.destroy();
    child.dispose();
  }
});

test('an idle keep-alive socket is closed after keepAliveTimeout', { timeout: 600000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, keepAliveMs: 300, checkMs: 100 } });
  const peer = connect(child.port);
  try {
    peer.socket.write(get(child.port, '/v1/leases', 'Connection: keep-alive\r\n'));
    await Promise.race([peer.closed, hardTimeout(LIVENESS_MS, 'the idle keep-alive socket was kept open')]);
    assert.match(peer.received(), /^HTTP\/1\.1 200 /);
  } finally {
    peer.socket.destroy();
    child.dispose();
  }
});

test('headers beyond the size bound are refused', { timeout: 600000 }, async () => {
  const child = await startChild();
  const peer = connect(child.port);
  try {
    peer.socket.write(get(child.port, '/v1/leases', `X-Big: ${'a'.repeat(9000)}\r\n`));
    await Promise.race([peer.closed, hardTimeout(LIVENESS_MS, 'the oversized header was not refused')]);
    assert.doesNotMatch(peer.received(), /^HTTP\/1\.1 200 /);
    assert.match(peer.received(), /^HTTP\/1\.1 431 /);
  } finally {
    peer.socket.destroy();
    child.dispose();
  }
});

test('a graceful stop of the child answers and exits without waiting for a half-open peer', { timeout: 600000 }, async () => {
  const child = await startChild({ bounds: QUIET });
  const half = connect(child.port, { allowHalfOpen: true });
  try {
    half.socket.write('GET /v1/leases HTTP/1.1\r\nHost: x\r\n');
    await until(async () => (await child.stats()).connections === 1, 'the half-open peer is connected');
    // Every timer of the child is ten minutes: a closeServer that waited for the peer could only be ended by the hang detector.
    await Promise.race([child.stop(), hardTimeout(LIVENESS_MS, 'closeServer waited for the half-open peer')]);
    await Promise.race([child.exited, hardTimeout(LIVENESS_MS, 'the child did not exit')]);
  } finally {
    half.socket.destroy();
    child.dispose();
  }
});
