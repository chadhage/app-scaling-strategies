'use strict';

// Test tooling, not production code: small helpers for real loopback sockets.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const net = require('node:net');
const framing = require('../framing.cjs');

async function listen(server) {
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return server.address().port;
}

// One raw HTTP exchange; the request must ask for Connection: close or be refused by the server.
function rawHttp(port, request) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port }, () => socket.write(request));
    const chunks = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', reject);
    socket.on('close', () => {
      const bytes = Buffer.concat(chunks);
      const split = bytes.indexOf('\r\n\r\n');
      const head = bytes.subarray(0, split).toString('latin1').split('\r\n');
      const headers = Object.fromEntries(head.slice(1).map((line) => {
        const colon = line.indexOf(':');
        return [line.slice(0, colon).toLowerCase(), line.slice(colon + 1).trim()];
      }));
      resolve({ status: Number(head[0].split(' ')[1]), headers, body: bytes.subarray(split + 4).toString('utf8') });
    });
  });
}

function request(port, { method = 'GET', target = '/', headers = {} } = {}) {
  const all = { Host: `127.0.0.1:${port}`, Connection: 'close', ...headers };
  const lines = Object.entries(all).filter(([, value]) => value !== undefined).map(([name, value]) => `${name}: ${value}`);
  return `${method} ${target} HTTP/1.1\r\n${lines.join('\r\n')}\r\n\r\n`;
}

function upgradeRequest(port, { target = '/stream', method = 'GET', headers = {} } = {}) {
  return request(port, {
    method, target,
    headers: {
      Connection: 'Upgrade', Upgrade: 'websocket', 'Sec-WebSocket-Version': '13',
      'Sec-WebSocket-Key': crypto.randomBytes(16).toString('base64'), ...headers
    }
  });
}

async function until(check, label) {
  for (let attempt = 0; attempt < 300; attempt += 1) {
    if (check()) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.fail(`condition never held: ${label}`);
}

// A raw WebSocket peer that shows exactly which frames the server wrote.
function upgradeRaw(port, { trailer = null } = {}) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const parser = framing.createParser({ requireMask: false });
    const queue = [];
    const waiters = [];
    let head = Buffer.alloc(0);
    let upgraded = false;
    const key = crypto.randomBytes(16).toString('base64');
    const push = (chunk) => {
      for (const message of parser.push(chunk)) {
        if (waiters.length > 0) waiters.shift()(message); else queue.push(message);
      }
    };
    const peer = {
      socket,
      send: (bytes) => socket.write(bytes),
      next: () => new Promise((resolveNext, rejectNext) => {
        if (queue.length > 0) { resolveNext(queue.shift()); return; }
        const timer = setTimeout(() => rejectNext(new assert.AssertionError({ message: 'no frame within 3000 ms' })), 3000);
        waiters.push((message) => { clearTimeout(timer); resolveNext(message); });
      }),
      ended: () => new Promise((resolveEnd) => (socket.destroyed ? resolveEnd() : socket.once('close', resolveEnd)))
    };
    socket.once('connect', () => {
      const bytes = Buffer.from(upgradeRequest(port, { headers: { 'Sec-WebSocket-Key': key } }));
      socket.write(trailer === null ? bytes : Buffer.concat([bytes, trailer]));
    });
    socket.on('error', reject);
    socket.on('data', (chunk) => {
      if (upgraded) { push(chunk); return; }
      head = Buffer.concat([head, chunk]);
      const end = head.indexOf('\r\n\r\n');
      if (end === -1) return;
      upgraded = true;
      const lines = head.subarray(0, end).toString('latin1').split('\r\n');
      resolve({ ...peer, status: lines[0], headers: lines.slice(1), key });
      if (head.length > end + 4) push(head.subarray(end + 4));
    });
  });
}

// The global WebSocket is an independent RFC 6455 client (undici), so it checks the server's framing from outside.
function openSocket(url) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(url);
    const queue = [];
    const waiters = [];
    const state = { closed: null };
    socket.addEventListener('message', (event) => {
      const value = JSON.parse(event.data);
      if (waiters.length > 0) waiters.shift().resolve(value); else queue.push(value);
    });
    socket.addEventListener('close', (event) => {
      state.closed = { code: event.code, reason: event.reason };
      for (const waiter of waiters.splice(0)) waiter.reject(new assert.AssertionError({ message: `closed ${event.code} while waiting for a frame` }));
      reject(new assert.AssertionError({ message: `upgrade to ${url} refused (close ${event.code})` }));
    });
    socket.addEventListener('error', (event) => {
      reject(new assert.AssertionError({ message: `upgrade to ${url} refused: ${event.message}` }));
    });
    socket.addEventListener('open', () => resolve({
      state, socket,
      say: (message) => socket.send(JSON.stringify(message)),
      next: () => new Promise((ok, fail) => {
        if (queue.length > 0) { ok(queue.shift()); return; }
        const timer = setTimeout(() => fail(new assert.AssertionError({ message: 'no frame within 3000 ms' })), 3000);
        waiters.push({ resolve: (value) => { clearTimeout(timer); ok(value); }, reject: fail });
      }),
      closed: () => new Promise((ok) => (state.closed ? ok(state.closed) : socket.addEventListener('close', () => ok(state.closed))))
    }));
  });
}

module.exports = Object.freeze({ listen, rawHttp, request, upgradeRequest, until, upgradeRaw, openSocket });
