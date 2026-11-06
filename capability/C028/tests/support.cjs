'use strict';

// Test tooling, not production code. The helpers here deliberately re-implement the protobuf and framing bytes the
// assertions need, so the expectations never depend on the production codec they check.
const http2 = require('node:http2');
const { createGrpcServer } = require('../grpc-server.cjs');
const { connect } = require('../driver.cjs');

const WATCH = '/acme.ticker.v1.Ticker/Watch';
const CHAT = '/acme.ticker.v1.Ticker/Chat';
const GRPC = Object.freeze({ ':status': 200, 'content-type': 'application/grpc' });

const varint = (n) => {
  const out = [];
  let value = n;
  while (value > 0x7f) {
    out.push((value & 0x7f) | 0x80);
    value = Math.floor(value / 128);
  }
  return Buffer.from([...out, value]);
};
const lenField = (no, bytes) => Buffer.concat([varint(no * 8 + 2), varint(bytes.length), bytes]);
const numField = (no, n) => Buffer.concat([varint(no * 8), varint(n)]);
// WatchRequest: 1 topic, 2 count, 3 interval_ms, 4 payload_bytes
const watchRequest = (topic, count, intervalMs = 0, payloadBytes = 0) => Buffer.concat([
  lenField(1, Buffer.from(topic)), numField(2, count), numField(3, intervalMs), numField(4, payloadBytes)]);
const noteMessage = (text) => lenField(1, Buffer.from(text));
const frame = (payload, flag = 0) => {
  const prefix = Buffer.alloc(5);
  prefix[0] = flag;
  prefix.writeUInt32BE(payload.length, 1);
  return Buffer.concat([prefix, payload]);
};
const tickPayload = (seq, topic = 'alpha', body = 'tick') => Buffer.concat([lenField(1, Buffer.from(topic)), numField(2, seq), lenField(3, Buffer.from(body))]);

function splitFrames(buffer) {
  const out = [];
  let offset = 0;
  while (offset < buffer.length) {
    if (buffer.length - offset < 5) throw new Error('a partial prefix at the end of the data');
    const length = buffer.readUInt32BE(offset + 1);
    if (buffer.length - offset - 5 < length) throw new Error('a payload shorter than its prefix promised');
    out.push({ flag: buffer[offset], payload: buffer.subarray(offset + 5, offset + 5 + length) });
    offset += 5 + length;
  }
  return out;
}

// Reads a message payload into { fieldNumber: string | number } (independent of the production codec).
function fields(payload) {
  const found = {};
  let offset = 0;
  const varintAt = () => {
    let value = 0;
    let shift = 1;
    while (payload[offset] & 0x80) {
      value += (payload[offset++] & 0x7f) * shift;
      shift *= 128;
    }
    return value + payload[offset++] * shift;
  };
  while (offset < payload.length) {
    const tag = varintAt();
    if ((tag & 7) === 2) {
      const length = varintAt();
      found[Math.floor(tag / 8)] = payload.subarray(offset, offset + length).toString();
      offset += length;
    } else {
      found[Math.floor(tag / 8)] = varintAt();
    }
  }
  return found;
}

async function until(predicate, limitMs = 3000) {
  const end = Date.now() + limitMs;
  while (!predicate() && Date.now() < end) await new Promise((resolve) => setImmediate(resolve));
  return predicate();
}

function once(emitter, name, limitMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`no ${name} event within ${limitMs} ms`)), limitMs);
    emitter.once(name, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

function rawCall(origin, { path = WATCH, method = 'POST', headers = {}, body = [], end = true } = {}) {
  return new Promise((resolve, reject) => {
    const session = http2.connect(origin);
    const timer = setTimeout(() => { session.destroy(); reject(new Error('rawCall timed out')); }, 8000);
    session.on('error', (error) => { clearTimeout(timer); reject(error); });
    const request = session.request({ ':method': method, ':path': path, 'content-type': 'application/grpc', te: 'trailers', ...headers }, { endStream: method === 'GET' });
    const seen = { headers: null, trailers: null, chunks: [], trailersEvents: 0 };
    request.on('response', (value) => { seen.headers = value; });
    request.on('trailers', (value) => { seen.trailers = value; seen.trailersEvents += 1; });
    request.on('data', (chunk) => seen.chunks.push(chunk));
    request.on('error', () => undefined);
    request.on('close', () => {
      clearTimeout(timer);
      session.destroy();
      resolve({ ...seen, data: Buffer.concat(seen.chunks), rstCode: request.rstCode });
    });
    if (method !== 'GET') {
      for (const piece of body) request.write(piece);
      if (end) request.end();
    }
  });
}

async function withServer(options, fn) {
  const server = createGrpcServer({ ...options, limits: { closeGraceMs: 100, ...options?.limits } });
  await server.start();
  try {
    await fn(server);
  } finally {
    await server.close();
  }
}

async function withDriver(options, fn) {
  await withServer(options.server ?? {}, async (server) => {
    const client = await connect(server.origin, options.client);
    try {
      await fn(client, server);
    } finally {
      client.close();
    }
  });
}

// A hostile raw http2 server: `behavior(stream, sockets)` decides exactly what goes wrong.
async function evilServer(behavior) {
  const server = http2.createServer();
  const sessions = new Set();
  const sockets = new Set();
  server.on('connection', (socket) => { sockets.add(socket); socket.on('error', () => undefined); });
  server.on('session', (session) => { sessions.add(session); session.on('error', () => undefined); });
  server.on('sessionError', () => undefined);
  server.on('stream', (stream, headers) => {
    stream.on('error', () => undefined);
    stream.resume();
    behavior(stream, sockets, headers);
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    async close() {
      for (const session of sessions) session.destroy();
      for (const socket of sockets) socket.destroy();
      await new Promise((resolve) => server.close(resolve));
    }
  };
}

// Collects whole length-prefixed frames from a response stream as they arrive.
function frameCollector(request) {
  const state = { frames: [], pending: Buffer.alloc(0) };
  request.on('data', (chunk) => {
    state.pending = Buffer.concat([state.pending, chunk]);
    while (state.pending.length >= 5 && state.pending.length >= 5 + state.pending.readUInt32BE(1)) {
      const length = state.pending.readUInt32BE(1);
      state.frames.push({ flag: state.pending[0], payload: state.pending.subarray(5, 5 + length) });
      state.pending = state.pending.subarray(5 + length);
    }
  });
  return state;
}

function openStream(origin, headers = {}, path = WATCH) {
  const session = http2.connect(origin);
  session.on('error', () => undefined);
  const request = session.request({ ':method': 'POST', ':path': path, 'content-type': 'application/grpc', te: 'trailers', ...headers });
  request.on('error', () => undefined);
  const seen = { headers: null, trailers: null };
  request.on('response', (value) => { seen.headers = value; });
  request.on('trailers', (value) => { seen.trailers = value; });
  const closed = new Promise((resolve) => request.once('close', resolve));
  return { session, request, seen, closed, ...{ collector: frameCollector(request) } };
}

module.exports = Object.freeze({
  WATCH, CHAT, GRPC, varint, lenField, numField, watchRequest, noteMessage, frame, tickPayload, splitFrames, fields, until, once,
  rawCall, withServer, withDriver, evilServer, frameCollector, openStream
});
