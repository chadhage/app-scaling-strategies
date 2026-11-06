'use strict';

// The gRPC server: gRPC over cleartext HTTP/2 (prior knowledge) on 127.0.0.1, built on node:http2. It refuses everything
// that is not gRPC, answers immediate errors in the Trailers-Only form and records every call it handled in `calls`.
const { EventEmitter } = require('node:events');
const http2 = require('node:http2');
const grpc = require('./grpc.cjs');
const { createFront } = require('./front.cjs');
const { startCall } = require('./call.cjs');
const { createService } = require('./service.cjs');

const { STATUS, STATUS_NAMES } = grpc;
const DEFAULT_LIMITS = Object.freeze({
  maxRequestBytes: 16384, maxResponseBytes: 1048576, maxActiveCalls: 64, maxConcurrentStreams: 32, maxConnections: 128,
  firstByteTimeoutMs: 5000, requestTimeoutMs: 10000, maxCallRecords: 1000, closeGraceMs: 1000
});
const SCOPE_STAMP = 'synthetic-loopback-only';
const HTTP_REFUSAL = 'This endpoint serves gRPC only: POST with content-type application/grpc.\n';
const CLIENT_TAG = /^[\x20-\x7e]{1,64}$/;

class GrpcServer extends EventEmitter {
  #active = new Map();
  #sessions = new Set();
  #idle = [];
  #nextId = 1;
  #h2;
  #front;
  #sockets;

  constructor({ service, limits = {}, timers } = {}) {
    super();
    this.limits = Object.freeze({ ...DEFAULT_LIMITS, ...limits });
    this.timers = timers ?? { setTimeout, clearTimeout };
    this.methods = new Map(Object.entries((service ?? createService({ timers: this.timers })).methods));
    this.calls = [];
    this.draining = false;
    this.port = 0;
    this.origin = '';
    this.#h2 = http2.createServer({ settings: { maxConcurrentStreams: this.limits.maxConcurrentStreams, enablePush: false } });
    this.#h2.on('session', (session) => {
      this.#sessions.add(session);
      session.once('close', () => this.#sessions.delete(session));
      session.on('error', () => undefined);
    });
    this.#h2.on('sessionError', () => undefined);
    this.#h2.on('stream', (stream, headers) => this.#onStream(stream, headers));
    const front = createFront({ h2: this.#h2, firstByteTimeoutMs: this.limits.firstByteTimeoutMs });
    this.#front = front.server;
    this.#front.maxConnections = this.limits.maxConnections;
    this.#sockets = front.sockets;
  }

  get active() {
    return this.#active.size;
  }

  async start() {
    await new Promise((resolve, reject) => {
      this.#front.once('error', reject);
      this.#front.listen(0, '127.0.0.1', resolve);
    });
    this.port = this.#front.address().port;
    this.origin = `http://127.0.0.1:${this.port}`;
    return this;
  }

  // New calls get UNAVAILABLE; resolves once every call in flight has finished.
  async drain() {
    this.draining = true;
    if (this.#active.size > 0) await new Promise((resolve) => this.#idle.push(resolve));
  }

  // In-flight calls end with UNAVAILABLE trailers, then every session is closed gracefully so those trailers flush.
  abort() {
    for (const call of [...this.#active.values()]) call.finish(STATUS.UNAVAILABLE, 'the server aborted the call', 'abort');
    for (const session of this.#sessions) session.close();
  }

  async close() {
    this.draining = true;
    this.abort();
    await new Promise((resolve) => {
      const cut = setTimeout(() => {
        for (const session of this.#sessions) session.destroy();
        for (const socket of this.#sockets) socket.destroy();
      }, this.limits.closeGraceMs);
      this.#front.close(() => {
        clearTimeout(cut);
        resolve();
      });
    });
  }

  #record(path, kind) {
    return {
      id: this.#nextId++, path, kind, outcome: null, status: null, message: '', finishedBy: null,
      produced: 0, received: 0, backpressureWaits: 0, writesAfterFinish: 0
    };
  }

  #finished(record) {
    this.#active.delete(record);
    this.calls.push(record);
    if (this.calls.length > this.limits.maxCallRecords) this.calls.shift();
    this.emit('call-finished', record);
    if (this.#active.size === 0) for (const resolve of this.#idle.splice(0)) resolve();
  }

  #refuse(stream, record, outcome, status, message, respond) {
    Object.assign(record, { outcome, status, message, finishedBy: 'refused' });
    try { respond(); } catch { /* the peer is already gone */ }
    stream.resume();
    this.#finished(record);
  }

  #httpRefusal(stream, path, status, extra) {
    this.#refuse(stream, this.#record(path, 'refused'), `HTTP_${status}`, null, HTTP_REFUSAL, () => {
      stream.respond({ ':status': status, 'content-type': 'text/plain; charset=utf-8', 'content-length': String(Buffer.byteLength(HTTP_REFUSAL)), ...extra });
      stream.end(HTTP_REFUSAL);
    });
  }

  #trailersOnly(stream, path, code, message, extra = {}) {
    this.#refuse(stream, this.#record(path, 'refused'), STATUS_NAMES[code], code, message, () => {
      stream.respond({
        ':status': 200, 'content-type': 'application/grpc', 'grpc-status': String(code),
        'grpc-message': grpc.encodeStatusMessage(message), ...extra
      }, { endStream: true });
    });
  }

  #onStream(stream, headers) {
    stream.on('error', () => undefined);
    const path = String(headers[':path']);
    const immediate = (code, message, extra) => this.#trailersOnly(stream, path, code, message, extra);
    if (headers[':method'] !== 'POST') return this.#httpRefusal(stream, path, 405, { allow: 'POST' });
    if (!grpc.isGrpcContentType(headers['content-type'])) return this.#httpRefusal(stream, path, 415, {});
    if (this.draining) return immediate(STATUS.UNAVAILABLE, 'the server is draining and accepts no new calls');
    if (this.#active.size >= this.limits.maxActiveCalls) return immediate(STATUS.RESOURCE_EXHAUSTED, 'too many concurrent calls');
    const method = this.methods.get(path);
    if (method === undefined) return immediate(STATUS.UNIMPLEMENTED, `unknown method ${path.slice(0, 96)}`);
    const encoding = headers['grpc-encoding'];
    if (encoding !== undefined && encoding !== 'identity') {
      return immediate(STATUS.UNIMPLEMENTED, 'only identity message encoding is supported', { 'grpc-accept-encoding': 'identity' });
    }
    let deadlineMs = null;
    if (headers['grpc-timeout'] !== undefined) {
      try {
        deadlineMs = grpc.parseTimeout(headers['grpc-timeout']);
      } catch (error) {
        return immediate(STATUS.INVALID_ARGUMENT, error.message);
      }
    }
    const tag = headers['x-client-tag'];
    if (tag !== undefined && !CLIENT_TAG.test(tag)) {
      return immediate(STATUS.INVALID_ARGUMENT, 'x-client-tag must be 1 to 64 printable ASCII characters');
    }
    const record = this.#record(path, method.kind);
    const call = startCall({
      stream, method, record, timers: this.timers, limits: this.limits, deadlineMs,
      responseHeaders: { 'x-fixture-scope': SCOPE_STAMP, ...(tag === undefined ? {} : { 'x-echo-client-tag': tag }) },
      metadata: Object.freeze(tag === undefined ? {} : { 'x-client-tag': tag }),
      onFinished: (finished) => this.#finished(finished),
      onBackpressure: (current) => this.emit('backpressure', current)
    });
    if (record.outcome === null) this.#active.set(record, call);
    return undefined;
  }
}

function createGrpcServer(options) {
  return new GrpcServer(options);
}

module.exports = Object.freeze({ createGrpcServer, GrpcServer, DEFAULT_LIMITS });
