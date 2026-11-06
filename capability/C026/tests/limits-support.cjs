'use strict';

// Test tooling, not production code: bounded helpers for hostile-client tests (raw sockets, heap-limited child, floods).
// Nothing here waits without a timer: every wait ends, so a defect shows up as a failed assertion, never as a hang.
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const framing = require('../framing.cjs');
const { upgradeRequest } = require('./support.cjs');

const HEAP_MB = 96;
const KEY = Buffer.from([1, 2, 3, 4]);
const clientFrame = (opcode, payload, fin = true) => framing.encodeFrame({ opcode, payload, fin, maskKey: KEY });
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function cleanEnvironment() {
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
  return env;
}

// The fixture in its own process with a 96 MB old-space limit; the child is killed after hardMs and again by stop().
async function startChild({ hardMs = 60000 } = {}) {
  const child = spawn(process.execPath, [`--max-old-space-size=${HEAP_MB}`, path.join(__dirname, 'fixture-child.cjs')], {
    stdio: ['pipe', 'pipe', 'ignore'], env: cleanEnvironment(), windowsHide: true
  });
  child.stdin.on('error', () => {});
  const state = { alive: true, exit: null };
  const exited = new Promise((resolve) => child.once('exit', (code, signal) => {
    state.alive = false;
    state.exit = { code, signal };
    resolve(state.exit);
  }));
  const killer = setTimeout(() => child.kill('SIGKILL'), hardMs);
  exited.then(() => clearTimeout(killer));
  const port = await new Promise((resolve, reject) => {
    let text = '';
    child.stdout.on('data', (chunk) => {
      text += chunk;
      if (text.includes('\n')) resolve(JSON.parse(text.split('\n')[0]).port);
    });
    exited.then(() => reject(new Error('the fixture child exited before it listened')));
  });
  return {
    port, state,
    async stop() {
      child.stdin.end();
      await Promise.race([exited, delay(5000)]);
      if (state.alive) child.kill('SIGKILL');
      return exited;
    }
  };
}

// An upgraded raw client. closeFrame() is the close the server sent, or says why none arrived; it never waits more than ms.
function openUpgraded(port, { read = true } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const parser = framing.createParser({ requireMask: false });
    const seen = { close: null };
    let head = Buffer.alloc(0);
    let upgraded = false;
    const take = (chunk) => {
      try {
        for (const message of parser.push(chunk)) if (message.type === 'close') seen.close = { code: message.code, reason: message.reason };
      } catch (error) {
        seen.close = { code: null, reason: `unparsable server frame ${error.code}` };
      }
    };
    socket.on('error', () => {});
    socket.on('close', () => { if (!upgraded) reject(new Error('the socket closed before the upgrade finished')); });
    socket.on('data', (chunk) => {
      if (upgraded) { take(chunk); return; }
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end === -1) return;
      upgraded = true;
      resolve({
        socket, seen, status: head.subarray(0, head.indexOf('\r\n')).toString('latin1'),
        async closeFrame(ms = 3000) {
          for (let waited = 0; seen.close === null && waited < ms; waited += 10) await delay(10);
          return seen.close ?? { code: null, reason: socket.destroyed ? 'socket closed without a close frame' : `no close frame within ${ms} ms` };
        }
      });
      if (head.length > end + 4) take(head.subarray(end + 4));
      if (!read) socket.pause();
    });
    socket.once('connect', () => socket.write(upgradeRequest(port)));
  });
}

// Writes batches until the peer is gone, stop() says so or maxBatches are written. Returns how many batches were accepted.
async function flood(socket, batch, maxBatches, stop = () => false) {
  let sent = 0;
  while (sent < maxBatches && !socket.destroyed && !stop()) {
    const failed = await new Promise((resolve) => socket.write(batch, (error) => resolve(Boolean(error))));
    if (failed) break;
    sent += 1;
  }
  return sent;
}

// One raw exchange that ends at the response head (plus Content-Length body), at close, or after ms; never waits for close.
function firstResponse(port, text, ms = 3000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => socket.write(text));
    let bytes = Buffer.alloc(0);
    const finish = (timedOut) => {
      clearTimeout(timer);
      socket.destroy();
      const end = bytes.indexOf('\r\n\r\n');
      const lines = end === -1 ? [] : bytes.subarray(0, end).toString('latin1').split('\r\n');
      const headers = Object.fromEntries(lines.slice(1).map((line) => [line.slice(0, line.indexOf(':')).toLowerCase(), line.slice(line.indexOf(':') + 1).trim()]));
      resolve({
        status: lines.length > 0 ? Number(lines[0].split(' ')[1]) : null, headers, timedOut,
        body: end === -1 ? '' : bytes.subarray(end + 4).toString('utf8')
      });
    };
    const timer = setTimeout(() => finish(true), ms);
    socket.on('error', () => finish(false));
    socket.on('close', () => finish(false));
    socket.on('data', (chunk) => {
      bytes = Buffer.concat([bytes, chunk]);
      const end = bytes.indexOf('\r\n\r\n');
      if (end === -1) return;
      const length = Number(/content-length:\s*(\d+)/i.exec(bytes.subarray(0, end).toString('latin1'))?.[1] ?? 0);
      if (bytes.length >= end + 4 + length || bytes.toString('latin1', 0, 12).includes(' 101 ')) finish(false);
    });
  });
}

module.exports = Object.freeze({ HEAP_MB, KEY, clientFrame, delay, startChild, openUpgraded, flood, firstResponse });
