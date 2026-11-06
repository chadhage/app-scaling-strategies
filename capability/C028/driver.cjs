'use strict';

// The driver port: a gRPC client library on node:http2. It connects only to a 127.0.0.1 origin with an explicit port.
// client.call(path, request, { timeoutMs, metadata }) starts a call and returns { result, messages(), cancel(), write(), end() }.
// call.result always resolves with a report (never rejects for a gRPC or transport failure); ok is true only for a
// clean conversation that ended in OK trailers.
const http2 = require('node:http2');
const { createCall } = require('./driver-call.cjs');
const { METHODS, SCHEMAS } = require('./service.cjs');

const DEFAULT_MAX_MESSAGE_BYTES = 4194304;
const DEFAULT_MAX_MESSAGES = 100000;
const BY_PATH = new Map(Object.values(METHODS).map((method) => [method.path, method]));
const UNKNOWN_METHOD = Object.freeze({ kind: 'server-streaming', request: SCHEMAS.WatchRequest, response: SCHEMAS.Tick });

class DriverError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'DriverError';
    this.code = code;
  }
}

function checkOrigin(origin) {
  let url = null;
  try {
    url = new URL(origin);
  } catch {
    throw new DriverError('ORIGIN_REFUSED', 'the origin is not a URL');
  }
  if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1' || url.port === '' || url.pathname !== '/'
    || url.search !== '' || url.hash !== '' || url.username !== '' || url.password !== '') {
    throw new DriverError('ORIGIN_REFUSED', 'only http://127.0.0.1:<port> is allowed: this driver never leaves the loopback interface');
  }
  return url.origin;
}

async function connect(origin, options = {}) {
  const target = checkOrigin(origin);
  const config = {
    timers: options.timers ?? { setTimeout, clearTimeout }, maxMessageBytes: options.maxMessageBytes ?? DEFAULT_MAX_MESSAGE_BYTES,
    maxMessages: options.maxMessages ?? DEFAULT_MAX_MESSAGES
  };
  const session = http2.connect(target);
  const sessionState = { closed: false };
  session.once('close', () => { sessionState.closed = true; });
  await new Promise((resolve, reject) => {
    session.once('connect', resolve);
    session.once('error', reject);
  });
  session.on('error', () => undefined);
  return {
    origin: target,
    call(method, request, callOptions = {}) {
      const descriptor = typeof method === 'string' ? (BY_PATH.get(method) ?? { ...UNKNOWN_METHOD, path: method }) : method;
      return createCall({ session, sessionState, descriptor, request, options: callOptions, config });
    },
    get closed() {
      return sessionState.closed;
    },
    close() {
      session.destroy();
    }
  };
}

module.exports = Object.freeze({ connect, checkOrigin, DriverError, DEFAULT_MAX_MESSAGE_BYTES });
