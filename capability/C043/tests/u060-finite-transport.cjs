'use strict';

const assert = require('node:assert/strict');
const http = require('node:http');
const { EventEmitter } = require('node:events');

class Socket extends EventEmitter {
  constructor() {
    super();
    this.remoteAddress = '127.0.0.1';
    this.writable = true;
    this.destroyed = false;
    this.sent = [];
    this.events = [];
  }
  destroy() {
    this.events.push('destroy');
    if (!this.destroyed) { this.destroyed = true; this.emit('close'); }
  }
  pause() { this.events.push('pause'); }
  end(bytes, callback) { this.events.push('end'); this.sent.push(bytes); callback?.(); }
}

class Response extends EventEmitter {
  constructor(socket) {
    super();
    this.socket = socket;
    this.destroyed = false;
    this.writableEnded = false;
    this.writes = [];
    socket.once('close', () => { this.destroyed = true; this.emit('close'); });
  }
  writeHead(status, headers) { this.statusCode = status; this.headers = headers; this.writes.push(['head', status]); }
  writeContinue() { this.writes.push(['continue']); }
  end(bytes) {
    this.bytes = bytes;
    this.writableEnded = true;
    this.writes.push(['end']);
    this.emit('finish'); this.emit('close');
  }
}

async function turns() {
  for (let count = 0; count < 300; count += 1) await Promise.resolve();
}

function fixture(context, options = {}) {
  const calls = [];
  const transports = [];
  const response = (method, key, status = 200) => ({ status, body: { method, key } });
  const engine = options.engine ?? { snapshot: () => { calls.push(['snapshot']); return { fixture: 'leases' }; }, tornTailBytes: 0, halt: () => calls.push(['engine.halt']) };
  const runner = options.runner ?? {
    health: () => { calls.push(['health']); return { fixture: 'journal' }; },
    run: async (bytes) => { calls.push(['run', bytes]); return response('run', null, 201); },
    inspect: (key) => { calls.push(['inspect', key]); return response('inspect', key); },
    cancel: async (key) => { calls.push(['cancel', key]); return response('cancel', key, 202); },
    resume: async (key) => { calls.push(['resume', key]); return response('resume', key); },
    unsupportedAction: (key) => { calls.push(['unsupported', key]); return response('unsupported', key, 422); },
    halt: () => calls.push(['runner.halt']),
  };
  context.mock.method(http, 'createServer', (configuration, handler) => {
    const transport = new EventEmitter();
    Object.assign(transport, {
      configuration, handler, address: () => ({ address: '127.0.0.1', port: 43210 }),
      close: (callback) => { calls.push(['close']); callback(); },
      closeAllConnections: () => calls.push(['closeAllConnections']),
      listen: (...args) => { calls.push(['listen', ...args.slice(0, -1)]); args.at(-1)(); },
    });
    transports.push(transport);
    return transport;
  });
  const api = require('../server.cjs');
  assert.equal(typeof api.createLocalServer, 'function', 'the actual HTTP service factory remains exported');
  const server = api.createLocalServer({ engine, runner, transcript: options.transcript === undefined ? async () => ({ fixture: 'transcript' }) : options.transcript, bounds: options.bounds });
  assert.equal(transports.includes(server), true, 'the actual factory returns its configured transport');
  const pending = ({ url = '/v1/leases', method = 'GET', headers = {}, socket = new Socket(), event } = {}) => {
    const request = new EventEmitter();
    Object.assign(request, { url, method, headers: { host: '127.0.0.1:43210', ...headers }, socket });
    const outgoing = new Response(socket);
    const state = { request, response: outgoing, socket, settled: false, error: undefined };
    try {
      const work = event ? server.emit(event, request, outgoing) : server.handler(request, outgoing);
      Promise.resolve(work).then(() => { state.settled = true; }, (error) => { state.settled = true; state.error = error; });
    } catch (error) { state.settled = true; state.error = error; }
    return state;
  };
  const finish = async (state, body) => {
    await turns();
    if (body !== undefined) {
      for (const chunk of Array.isArray(body) ? body : [body]) state.request.emit('data', chunk);
      state.request.emit('end');
    }
    await turns();
    assert.equal(state.error, undefined, 'finite injected request work must not reject');
    assert.equal(state.response.writableEnded, true, 'the response must answer the finite injected request');
    return state;
  };
  const request = async (options = {}) => finish(pending(options), options.body);
  return { api, server, engine, runner, calls, transports, pending, finish, request };
}

module.exports = { Socket, Response, turns, fixture };
