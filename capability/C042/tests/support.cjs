'use strict';

// Test tooling, not production code: real loopback sockets, a gated executor (no sleeps, no wall clock) and scratch
// directories under tests\scratch (git-ignored, removed by each test).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { openEngine } = require('../engine.cjs');
const journal = require('../journal.cjs');
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
  assert.equal(first, 'in-flight', 'the step must still be in flight when the executor holds it');
}

const settle = async () => { for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve)); };

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
  const dir = options.dir ?? (options.io ? null : scratchPath());
  const engine = await openEngine({ io: options.io ?? journal.createFileIo(dir), executor: options.executor });
  const server = createLocalServer({ engine, transcript: options.transcript ?? null });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { dir, engine, server, port: server.address().port, stop: () => closeServer(server) };
}

function journalLines(dir) {
  const file = path.join(dir, journal.FILE);
  return fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line)) : [];
}

const journalBytes = (dir) => (fs.existsSync(path.join(dir, journal.FILE)) ? fs.readFileSync(path.join(dir, journal.FILE)) : Buffer.alloc(0));
const types = (dir) => journalLines(dir).map((line) => line.type);
const valid = (overrides = {}) => ({
  schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'key-0001-aaaa', leaseId: 'synthetic-lease-001', units: 5, ...overrides,
});
const has = (envelope, code) => envelope.didNot.some((item) => item.code === code);
const lease = async (port, id = 'synthetic-lease-001') => (await call(port, 'GET', '/v1/leases')).json.leases[id];

module.exports = {
  assert, call, cleanup, deferred, gate, has, inFlight, journalBytes, journalLines, lease, raw, rawHttp, root, scratch,
  scratchRoot, settle, startService, types, valid,
};
