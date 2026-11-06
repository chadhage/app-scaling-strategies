'use strict';

// Test tooling, not production code: loopback HTTP helpers for the service tests (real sockets, no sleeps), a raw socket
// connector, a poll-to-quiescence helper with a hard bound, and a child-process starter (small heap, hard external timeout).
const crypto = require('node:crypto');
const { fork } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const assert = require('node:assert/strict');
// RED support: the in-process service of the parse-error test is the one in C059_RED_SUBJECT (old, loaded as if it lived in the namespace root) or the final code.
const { startLocal, closeServer } = process.env.C059_RED_SUBJECT ? require('../helpers-4/old-server-loader.cjs') : require('../../../server.cjs');

// The held executor of the harness (copied: the harness reads the page subject, this group's subject is the server).
function gate() {
  const slots = new Map();
  const slot = (key) => {
    if (!slots.has(key)) {
      const entry = {};
      entry.entered = new Promise((resolve) => { entry.enter = resolve; });
      entry.released = new Promise((resolve) => { entry.release = resolve; });
      slots.set(key, entry);
    }
    return slots.get(key);
  };
  return { executor: async ({ key }) => { slot(key).enter(); await slot(key).released; }, entered: (key) => slot(key).entered, release: (key) => slot(key).release() };
}

const scratchRoot = path.join(__dirname, 'scratch');
const MB = 1024 * 1024;
const settleTurn = () => new Promise((resolve) => setImmediate(resolve));

// Polls a condition to quiescence; the bound turns a stuck condition into a failed test, never a hang.
async function until(check, label, turns = 200000) {
  for (let turn = 0; turn < turns; turn += 1) {
    if (await check()) return;
    await settleTurn();
  }
  assert.fail(`never held: ${label}`);
}

function call(port, method, target, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const request = http.request({
      host: '127.0.0.1', port, method, path: target, agent: false,
      headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}), ...headers },
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        let json = null;
        try { json = JSON.parse(bytes.toString('utf8')); } catch { json = null; }
        resolve({ status: response.statusCode, headers: response.headers, bytes, json });
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
}

// A raw socket exchange: write the bytes, collect everything until the server closes (or the bound hits), report the socket state.
function raw(port, bytes, { half = false } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: half });
    const chunks = [];
    socket.on('error', () => {});
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.once('close', () => {
      const received = Buffer.concat(chunks).toString('latin1');
      const split = received.indexOf('\r\n\r\n');
      const head = (split < 0 ? received : received.slice(0, split)).split('\r\n');
      const headers = Object.fromEntries(head.slice(1).map((line) => [line.slice(0, line.indexOf(':')).toLowerCase(), line.slice(line.indexOf(':') + 1).trim()]));
      let json = null;
      try { json = JSON.parse(received.slice(split + 4)); } catch { json = null; }
      resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(head[0])?.[1] ?? 0), headers, json, received, closed: true });
    });
    socket.write(bytes);
    if (half) socket.end();
  });
}

function connect(port, { allowHalfOpen = false, read = true } = {}) {
  const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen });
  const chunks = [];
  socket.on('error', () => {});
  if (read) socket.on('data', (chunk) => chunks.push(chunk)); else socket.pause();
  return { socket, closed: new Promise((resolve) => socket.once('close', resolve)), received: () => Buffer.concat(chunks).toString('latin1') };
}

const get = (port, target, extra = '') => `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${extra}\r\n`;

async function startService(options = {}) {
  const held = options.hold ? gate() : null;
  const server = await startLocal({ ...options, ...(held ? { executor: held.executor } : {}) });
  return { server, port: server.address().port, held, stop: () => closeServer(server) };
}

function scratch() {
  const dir = path.join(scratchRoot, `t-${crypto.randomUUID()}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// The service in a child process with a small heap and a hard external watchdog: a hang or an out-of-memory death is a failed test.
async function startChild({ heapMb = 48, bounds = {}, watchdogMs = 120000 } = {}) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = fork(path.join(__dirname, '..', 'helpers-4', 'child-server.cjs'), [JSON.stringify(bounds)], { execArgv: [`--max-old-space-size=${heapMb}`], env, silent: true });
  const errors = [];
  child.stderr.on('data', (chunk) => errors.push(chunk));
  const watchdog = setTimeout(() => child.kill(), watchdogMs);
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => resolve({ code, signal })));
  const waiting = new Map();
  child.on('message', (message) => { waiting.get(message.type)?.(message); waiting.delete(message.type); });
  const next = (type) => new Promise((resolve) => waiting.set(type, resolve));
  const early = exited.then((result) => { throw new Error(`the child exited early: ${JSON.stringify(result)} ${Buffer.concat(errors)}`); });
  const { port } = await Promise.race([next('listening'), early]);
  return {
    port, exited, errors: () => Buffer.concat(errors).toString('utf8'),
    stats: (reset = false) => { const reply = next('stats'); child.send({ type: 'stats', reset }); return reply; },
    stop: () => { const reply = next('closed'); child.send({ type: 'stop' }); return reply; },
    dispose: () => { clearTimeout(watchdog); child.kill(); },
  };
}

module.exports = { MB, call, connect, get, raw, scratch, scratchRoot, settleTurn, startChild, startService, until };
