'use strict';

// Resource bounds, proved against the real service: the server runs in a child process with a small heap and a hard
// external timeout, hostile clients run in their OWN process (an in-process attacker shares the event loop and hides a
// stall), and the event-loop lag is measured inside the server. No fixed sleeps: every wait polls a condition.
const assert = require('node:assert/strict');
const { fork, spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');
const test = require('node:test');
const { call } = require('./support.cjs');

const MB = 1024 * 1024;
const HARD_MS = 150000;
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

async function until(check, label, ms = 30000) {
  const deadline = Date.now() + ms;
  while (!(await check())) {
    if (Date.now() > deadline) assert.fail(`never held: ${label}`);
    await settleTurn();
  }
}

async function startChild({ heapMb = 48, bounds = {} } = {}) {
  const child = fork(path.join(__dirname, 'child-server.cjs'), [JSON.stringify(bounds)], { execArgv: [`--max-old-space-size=${heapMb}`], env: cleanEnvironment(), silent: true });
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
  return { port, exited, stats: () => ask('stats'), reset: () => ask('reset'), stop: () => ask('stop', 'closed'), dispose: () => { clearTimeout(watchdog); child.kill(); } };
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
const MS = (start) => Number(process.hrtime.bigint() - start) / 1e6;
const KINDS = (process.env.C043_KINDS ?? 'get-body,put-405,post-404,media-415,host-421,origin-403,action-body-400,key-400,query-400,invalid-preset-400').split(',');
const FLOOD = Number(process.env.C043_FLOOD ?? 8);

test('REFUSAL FLOOD (table over every refusal the server emits, attacker in its own process): the server stays responsive and closes every attacker socket', { timeout: 240000 }, async (context) => {
  const child = await startChild({ bounds: QUIET });
  try {
    for (const kind of KINDS) {
      await context.test(kind, { timeout: 60000 }, async () => {
        await child.reset();
        const started = process.hrtime.bigint();
        const attacker = attack(child.port, kind, FLOOD, 15000);
        let worst = 0;
        let probes = 0;
        let over = false;
        attacker.finished.then(() => { over = true; });
        while (!over) {
          const before = process.hrtime.bigint();
          const answer = await Promise.race([call(child.port, 'GET', '/v1/leases'), hardTimeout(15000, `GET during the ${kind} flood`)]);
          assert.equal(answer.status, 200);
          worst = Math.max(worst, MS(before));
          probes += 1;
        }
        const report = JSON.parse((await attacker.finished).trim().split(/\r?\n/).pop());
        assert.deepEqual([report.closed, report.timedOut], [FLOOD, false], `the server closed ${report.closed} of ${FLOOD} attacker sockets (${kind})`);
        assert.equal(MS(started) < 12000, true, `the flood ended within ${MS(started).toFixed(0)} ms`);
        const stats = await child.stats();
        assert.equal(stats.lagMaxMs < 4000, true, `event-loop lag ${stats.lagMaxMs.toFixed(0)} ms during the ${kind} flood`);
        assert.equal(worst < 6000, true, `a concurrent GET took ${worst.toFixed(0)} ms (${probes} probes)`);
        assert.equal(stats.heapUsed < 32 * MB, true, `heap ${(stats.heapUsed / MB).toFixed(1)} MB`);
        await until(async () => (await child.stats()).connections === 0, 'no attacker socket is left open');
      });
    }
  } finally {
    child.dispose();
  }
});

test('a client that pipelines requests and never reads is cut off after a bounded queue', { timeout: 120000 }, async () => {
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

test('connection cap: more open sockets than the bound are dropped, not served', { timeout: 60000 }, async () => {
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

test('a socket that never sends a request is closed after the first-request bound', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, firstRequestMs: 300 } });
  const silent = connect(child.port);
  try {
    await Promise.race([silent.closed, hardTimeout(10000, 'the silent socket was kept open')]);
  } finally {
    silent.socket.destroy();
    child.dispose();
  }
});

test('a client that trickles its headers is cut off by headersTimeout, enforced every connectionsCheckingInterval', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, headersMs: 400, checkMs: 100 } });
  const slow = connect(child.port);
  const started = process.hrtime.bigint();
  let alive = true;
  try {
    slow.socket.write(`GET /v1/leases HTTP/1.1\r\nHost: 127.0.0.1:${child.port}\r\nX-Slow: `);
    slow.closed.then(() => { alive = false; });
    while (alive && MS(started) < 8000) { slow.socket.write('a'); await new Promise((resolve) => setTimeout(resolve, 150)); }
    assert.equal(alive, false, 'the trickling client was still connected after 8 s');
    assert.equal(MS(started) < 6000, true, `cut off after ${MS(started).toFixed(0)} ms, not after the default 30 s check interval`);
  } finally {
    slow.socket.destroy();
    child.dispose();
  }
});

test('a body that trickles is cut off by requestTimeout', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, requestMs: 400, headersMs: 400, checkMs: 100 } });
  const slow = connect(child.port);
  const started = process.hrtime.bigint();
  let alive = true;
  try {
    slow.socket.write(`POST /v1/presets HTTP/1.1\r\nHost: 127.0.0.1:${child.port}\r\nContent-Type: application/json\r\nContent-Length: 500\r\n\r\n`);
    slow.closed.then(() => { alive = false; });
    while (alive && MS(started) < 8000) { slow.socket.write('{'); await new Promise((resolve) => setTimeout(resolve, 150)); }
    assert.equal(alive, false, 'the trickling upload was still connected after 8 s');
    assert.equal(MS(started) < 6000, true, `cut off after ${MS(started).toFixed(0)} ms`);
  } finally {
    slow.socket.destroy();
    child.dispose();
  }
});

test('an idle keep-alive socket is closed after keepAliveTimeout', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: { ...QUIET, keepAliveMs: 300, checkMs: 100 } });
  const peer = connect(child.port);
  try {
    peer.socket.write(get(child.port, '/v1/leases', 'Connection: keep-alive\r\n'));
    const started = process.hrtime.bigint();
    await Promise.race([peer.closed, hardTimeout(10000, 'the idle keep-alive socket was kept open')]);
    assert.equal(MS(started) < 3000, true, `closed after ${MS(started).toFixed(0)} ms, not after the 5 s default`);
    assert.match(peer.received(), /^HTTP\/1\.1 200 /);
  } finally {
    peer.socket.destroy();
    child.dispose();
  }
});

test('headers beyond the size bound are refused', { timeout: 60000 }, async () => {
  const child = await startChild();
  const peer = connect(child.port);
  try {
    peer.socket.write(get(child.port, '/v1/leases', `X-Big: ${'a'.repeat(9000)}\r\n`));
    await Promise.race([peer.closed, hardTimeout(10000, 'the oversized header was not refused')]);
    assert.doesNotMatch(peer.received(), /^HTTP\/1\.1 200 /);
    assert.match(peer.received(), /^HTTP\/1\.1 431 /);
  } finally {
    peer.socket.destroy();
    child.dispose();
  }
});

test('a graceful stop of the child answers and exits without waiting for a half-open peer', { timeout: 60000 }, async () => {
  const child = await startChild({ bounds: QUIET });
  const half = connect(child.port, { allowHalfOpen: true });
  try {
    half.socket.write('GET /v1/leases HTTP/1.1\r\nHost: x\r\n');
    await until(async () => (await child.stats()).connections === 1, 'the half-open peer is connected');
    const started = process.hrtime.bigint();
    await child.stop();
    assert.equal(MS(started) < 5000, true, 'closeServer did not wait for the half-open peer');
    await Promise.race([child.exited, hardTimeout(20000, 'the child did not exit')]);
  } finally {
    half.socket.destroy();
    child.dispose();
  }
});
