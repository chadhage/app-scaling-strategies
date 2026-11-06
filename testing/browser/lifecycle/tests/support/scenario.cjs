'use strict';

// Real-process harness (test tooling, not production code). It starts a marked Node fixture tree and look-alikes,
// learns every pid from the fixtures themselves over loopback, and judges liveness by the loopback connections, which
// the operating system closes when a process dies. The oracle therefore never depends on pids, on the code under test
// or on any process listing. It terminates nothing except by closing its own sockets and, as a last resort,
// ChildProcess.kill() on the four direct children it spawned (a handle it holds, so no pid is ever guessed).

const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { randomUUID } = require('node:crypto');

const FIXTURE = path.join(__dirname, '..', 'fixtures', 'node-fixture.cjs');
const OWNED = ['R', 'A', 'B', 'C', 'A1', 'B1', 'C1'];
const LOOKALIKES = ['L1', 'L2', 'S'];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function until(predicate, timeoutMs, stepMs = 25) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return true;
    await sleep(stepMs);
  }
  return predicate();
}

async function startScenario({ helloTimeoutMs = 90000 } = {}) {
  const run = `u004-run-${randomUUID()}`;
  const marker = `u004-marker-${randomUUID()}`;
  const hellos = new Map();
  const sockets = new Map();
  const closed = new Set();
  const pongs = new Set();

  const server = net.createServer((socket) => {
    let buffered = '';
    let name = null;
    socket.on('data', (chunk) => {
      buffered += chunk.toString('utf8');
      for (let at = buffered.indexOf('\n'); at >= 0; at = buffered.indexOf('\n')) {
        const message = JSON.parse(buffered.slice(0, at));
        buffered = buffered.slice(at + 1);
        if (message.type === 'hello') {
          name = message.name;
          hellos.set(name, message);
          sockets.set(name, socket);
        }
        if (message.type === 'pong') pongs.add(message.name);
      }
    });
    socket.on('close', () => { if (name) closed.add(name); });
    socket.on('error', () => {});
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;

  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const launch = (role, name, withMarker) => spawn(process.execPath, [
    FIXTURE, `--role=${role}`, `--name=${name}`, `--port=${port}`, `--run=${run}`, ...(withMarker ? [`--marker=${marker}`] : []),
  ], { stdio: 'ignore', windowsHide: true, env });
  const direct = { R: launch('root', 'R', true), L1: launch('idle', 'L1', true), L2: launch('idle', 'L2', false), S: launch('idle', 'S', false) };

  const scenario = {
    run,
    marker,
    pid: (name) => hellos.get(name).pid,
    hello: (name) => hellos.get(name),
    isClosed: (name) => closed.has(name),
    send: (name, message) => sockets.get(name).write(`${JSON.stringify(message)}\n`),
    waitClosed: (names, timeoutMs) => until(() => names.every((name) => closed.has(name)), timeoutMs),
    async ping(name, timeoutMs = 10000) {
      pongs.delete(name);
      if (closed.has(name)) return false;
      sockets.get(name).write(`${JSON.stringify({ cmd: 'ping' })}\n`);
      return until(() => pongs.has(name) && !closed.has(name), timeoutMs);
    },
    async close() {
      server.close();
      for (const socket of sockets.values()) socket.destroy();
      const exits = Object.values(direct).map((child) => (child.exitCode !== null || child.signalCode !== null
        ? Promise.resolve() : new Promise((resolve) => child.once('exit', resolve))));
      const settled = await Promise.race([Promise.all(exits).then(() => true), sleep(15000).then(() => false)]);
      if (!settled) for (const child of Object.values(direct)) child.kill();
      await until(() => [...sockets.keys()].every((name) => closed.has(name)), 15000);
    },
  };
  try {
    const ready = await until(() => [...OWNED, ...LOOKALIKES].every((name) => hellos.has(name)), helloTimeoutMs);
    if (!ready) throw new Error(`fixtures did not report in time: ${[...OWNED, ...LOOKALIKES].filter((n) => !hellos.has(n)).join(',')}`);
  } catch (error) {
    await scenario.close();
    throw error;
  }
  return scenario;
}

// Wraps adapters so that no kill can ever reach a pid outside mayKill (every process this test or its fixtures created)
// and records every requested identity; the forbidden pids are the look-alikes and their helpers.
function guardAdapters(adapters, { mayKill, forbidden }) {
  const requested = [];
  return {
    requested,
    forbiddenRequests: () => requested.filter((identity) => forbidden.has(identity.pid)),
    adapters: {
      ...adapters,
      kill: async (identities, options) => {
        for (const identity of identities) {
          requested.push({ pid: identity.pid, createdAt: identity.createdAt });
          if (!mayKill.has(identity.pid)) throw new Error(`guard: kill requested for pid ${identity.pid}, which this test did not create`);
        }
        return adapters.kill(identities, { ...options, guard: true });
      },
    },
  };
}

module.exports = { startScenario, guardAdapters, until, OWNED, LOOKALIKES };
