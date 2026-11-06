'use strict';

// Test tooling, not production code: raw loopback HTTP requests with full control of headers and framing.
const http = require('node:http');
const net = require('node:net');
const { createLocalServer, listen, closeOwned } = require('../server.cjs');
const s = require('./support.cjs');

function request(origin, { method = 'GET', path = '/', headers = {}, body = null, chunked = false } = {}) {
  const { port } = new URL(origin);
  return new Promise((resolve, reject) => {
    const payload = body === null ? null : Buffer.from(body);
    const framing = payload && !chunked ? { 'Content-Length': payload.length } : {};
    const req = http.request({ host: '127.0.0.1', port, method, path, agent: false, headers: { Host: `127.0.0.1:${port}`, ...framing, ...headers } }, (res) => {
      const parts = [];
      res.on('data', (part) => parts.push(part));
      res.on('end', () => {
        const text = Buffer.concat(parts).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    req.end(payload);
  });
}

const jsonHeaders = { 'Content-Type': 'application/json' };
const post = (origin, path, value, extra = {}) => request(origin, { method: 'POST', path, body: typeof value === 'string' ? value : JSON.stringify(value), headers: { ...jsonHeaders, ...extra } });
const get = (origin, path, extra = {}) => request(origin, { path, headers: extra });

function raw(origin, initial = '', { read = true } = {}) {
  const { port } = new URL(origin);
  const socket = net.connect({ host: '127.0.0.1', port });
  const chunks = [];
  const closed = new Promise((resolve) => { socket.once('close', resolve); });
  socket.on('data', (part) => chunks.push(part));
  socket.on('error', () => {});
  if (!read) socket.pause();
  if (initial) socket.write(initial);
  return { socket, closed, text: () => Buffer.concat(chunks).toString('utf8') };
}

async function connections(server, count) {
  for (let i = 0; i < 200; i += 1) {
    const now = await new Promise((resolve) => server.getConnections((error, n) => resolve(n)));
    if (now >= count) return now;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`the server never reached ${count} connections`);
}

async function serve(t, options = {}) {
  const ctx = s.boot(options);
  const server = await listen(createLocalServer({ engine: ctx.engine, ...(options.server || {}) }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { await ctx.engine.close(); await closeOwned(server); await ctx.cleanup(); });
  return { ctx, server, origin };
}

module.exports = Object.freeze({ request, post, get, serve, raw, connections, jsonHeaders });
