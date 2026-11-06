'use strict';

// Retained initial test support (RED archive). Self-contained: the subject modules come from C042_RED_SUBJECT
// (the behaviorless stubs of the RED run) or, when unset, from the namespace root (the implementation).
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');

const namespaceRoot = path.resolve(__dirname, '..', '..');
const subject = process.env.C042_RED_SUBJECT ? path.resolve(process.env.C042_RED_SUBJECT) : namespaceRoot;
const load = (name) => require(path.join(subject, name));
const scratchRoot = path.join(namespaceRoot, 'tests', 'scratch');

function scratch() {
  const dir = path.join(scratchRoot, `red-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

// A step executor that holds every step until the test releases it: no sleeps, no wall clock.
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

async function startService(options = {}) {
  const { openEngine } = load('engine.cjs');
  const { createLocalServer, closeServer } = load('server.cjs');
  const journal = load('journal.cjs');
  const dir = options.dir ?? scratch();
  const engine = await openEngine({ io: options.io ?? journal.createFileIo(dir), executor: options.executor });
  const server = createLocalServer({ engine });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { dir, engine, server, port: server.address().port, stop: () => closeServer(server) };
}

function journalLines(dir) {
  const file = path.join(dir, 'journal.jsonl');
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

const valid = (overrides = {}) => ({
  schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'key-0001-aaaa', leaseId: 'synthetic-lease-001', units: 5, ...overrides,
});

const cleanup = (...dirs) => { for (const dir of dirs) fs.rmSync(dir, { recursive: true, force: true }); };

// Waits until the gated executor holds the step; if every pending request is answered first, the step was never in flight.
async function inFlight(held, key, pending) {
  const first = await Promise.race([held.entered(key).then(() => 'in-flight'), Promise.allSettled(pending).then(() => 'answered-first')]);
  assert.equal(first, 'in-flight', 'the step must still be in flight when the executor holds it');
}

module.exports = { call, cleanup, deferred, gate, inFlight, journalLines, load, scratch, startService, valid };
