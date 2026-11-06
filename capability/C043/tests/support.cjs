'use strict';

// Test tooling, not production code: real loopback sockets, a gated executor, a manual clock, a spy at the shared step
// boundary and scratch directories under tests\scratch (git-ignored, removed by each test). No sleeps, no wall clock.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { openEngine } = require('../../C042/engine.cjs');
const { createFileIo, createMemoryIo } = require('../../C042/journal.cjs');
const { openRunner } = require('../runner.cjs');
const { closeServer, createLocalServer } = require('../server.cjs');

const root = path.resolve(__dirname, '..');
const scratchRoot = path.join(__dirname, 'scratch');
const scratchPath = () => path.join(scratchRoot, `t-${crypto.randomUUID()}`);

function scratch() {
  const dir = scratchPath();
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

const cleanup = (...dirs) => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); };
const step = (n, extra = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: `preset-a-step-${n}`, leaseId: 'synthetic-lease-001', units: 5, ...extra });
const doc = (extra = {}) => ({
  schemaVersion: 1, preset: 'bounded-sequence', idempotencyKey: 'preset-run-0001',
  bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 40 }, steps: [step(1), step(2), step(3)], ...extra,
});
const clock = () => { let now = 0; return { now: () => now, advance: (ms) => { now += ms; }, set: (value) => { now = value; } }; };

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

function gate() {
  const entered = new Map();
  const released = new Map();
  const slot = (map, key) => { if (!map.has(key)) map.set(key, deferred()); return map.get(key); };
  return {
    executor: async ({ key }) => { slot(entered, key).resolve(); await slot(released, key).promise; },
    entered: (key) => slot(entered, key).promise,
    release: (key) => slot(released, key).resolve(),
  };
}

async function inFlight(held, key, pending) {
  const first = await Promise.race([held.entered(key).then(() => 'in-flight'), Promise.allSettled(pending).then(() => 'answered-first')]);
  assert.equal(first, 'in-flight', `step ${key} must be in flight while its executor holds it`);
}

const settle = async () => { for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve)); };

// A spy at the shared boundary: every call of the step service with its arguments and its result.
function spy(real, log) {
  const record = (method, args, result) => {
    log.push({ method, args: JSON.parse(JSON.stringify(args)), result: JSON.parse(JSON.stringify(result)) });
    return result;
  };
  const wrap = (method) => (...args) => {
    const out = real[method](...args);
    return out && typeof out.then === 'function' ? out.then((value) => record(method, args, value)) : record(method, args, out);
  };
  return {
    submit: wrap('submit'), inspect: wrap('inspect'), cancel: wrap('cancel'), resume: wrap('resume'),
    unsupportedAction: wrap('unsupportedAction'), leases: () => real.leases(), snapshot: () => real.snapshot(),
    halt: () => real.halt(), get tornTailBytes() { return real.tornTailBytes; },
  };
}

// An io that fails on demand: `fail(text)` returns 'lost' (nothing written), 'landed' (written, then reported as failed) or falsy.
function flaky(io, fail = () => false) {
  return {
    kind: 'flaky', read: () => io.read(), truncate: (bytes) => io.truncate(bytes),
    append(text) {
      const mode = fail(text);
      if (mode === 'landed') io.append(text);
      if (mode) throw new Error('synthetic disk failure');
      io.append(text);
    },
  };
}

async function boot({ executor, stepIo = createMemoryIo(), runIo = createMemoryIo(), clk = clock() } = {}) {
  const real = await openEngine({ io: stepIo, executor });
  const log = [];
  const engine = spy(real, log);
  const runner = await openRunner({ engine, io: runIo, clock: clk.now });
  return { real, engine, log, runner, stepIo, runIo, clk };
}

const committed = (real, lease = 'synthetic-lease-001') => real.leases()[lease].committed;
const statuses = (body) => body.steps.map((entry) => entry.status);
const methods = (log) => log.map((call) => call.method);

function call(port, method, target, body, headers = {}) {
  return new Promise((resolve, reject) => {
    let payload;
    if (body !== undefined) payload = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const request = http.request({
      host: '127.0.0.1', port, method, path: target, agent: false,
      headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}), ...headers },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { json = null; }
        resolve({ status: response.statusCode, headers: response.headers, text, json });
      });
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

// One raw HTTP exchange over a bare socket, for requests that node:http would refuse to send or would normalize.
function rawHttp(port, bytes) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => socket.write(bytes));
    const chunks = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', reject);
    socket.on('close', () => {
      const received = Buffer.concat(chunks);
      const split = received.indexOf('\r\n\r\n');
      if (split < 0) return resolve({ status: 0, headers: {}, text: received.toString('utf8'), json: null });
      const head = received.subarray(0, split).toString('latin1').split('\r\n');
      const headers = Object.fromEntries(head.slice(1).map((line) => [line.slice(0, line.indexOf(':')).toLowerCase(), line.slice(line.indexOf(':') + 1).trim()]));
      const text = received.subarray(split + 4).toString('utf8');
      let json = null;
      try { json = JSON.parse(text); } catch { json = null; }
      return resolve({ status: Number(head[0].split(' ')[1]), headers, text, json });
    });
  });
}

const raw = (port, lines, tail = '') => rawHttp(port, `${lines.join('\r\n')}\r\n\r\n${tail}`);

async function startService(options = {}) {
  const booted = await boot(options);
  const server = createLocalServer({ engine: booted.real, runner: booted.runner, transcript: options.transcript ?? null, bounds: options.bounds });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { ...booted, server, port: server.address().port, stop: () => closeServer(server) };
}

const has = (envelope, code) => envelope.didNot.some((item) => item.code === code);
const text = (value) => JSON.stringify(value);

module.exports = {
  assert, boot, call, cleanup, clock, committed, deferred, doc, flaky, gate, has, inFlight, methods, raw, rawHttp, root, scratch, scratchRoot,
  settle, spy, startService, statuses, step, text, createFileIo, createMemoryIo, openEngine, openRunner,
};
