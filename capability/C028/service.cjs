'use strict';

// The fictional service acme.ticker.v1.Ticker. All data is synthetic. The SERVER owns every sequence number: a request
// can never name the seq of a Tick or an Echo.
//
//   service Ticker {
//     rpc Watch (WatchRequest) returns (stream Tick);   // server streaming
//     rpc Chat  (stream Note)  returns (stream Echo);   // bidirectional
//   }
const { GrpcError, STATUS } = require('./grpc.cjs');

const PACKAGE = 'acme.ticker.v1';
const SERVICE_NAME = `${PACKAGE}.Ticker`;
const MAX_COUNT = 10000;
const MAX_INTERVAL_MS = 10000;
const MAX_PAYLOAD_BYTES = 131072;
const MAX_NOTE_CHARS = 1024;
const TOPIC = /^[a-z][a-z0-9-]{0,31}$/;

const schema = (name, fields) => Object.freeze({ name, fields: Object.freeze(fields.map((field) => Object.freeze(field))) });
const SCHEMAS = Object.freeze({
  WatchRequest: schema('WatchRequest', [
    { no: 1, name: 'topic', type: 'string' }, { no: 2, name: 'count', type: 'uint32' },
    { no: 3, name: 'interval_ms', type: 'uint32' }, { no: 4, name: 'payload_bytes', type: 'uint32' }]),
  Tick: schema('Tick', [{ no: 1, name: 'topic', type: 'string' }, { no: 2, name: 'seq', type: 'uint64' }, { no: 3, name: 'body', type: 'string' }]),
  Note: schema('Note', [{ no: 1, name: 'text', type: 'string' }]),
  Echo: schema('Echo', [{ no: 1, name: 'text', type: 'string' }, { no: 2, name: 'seq', type: 'uint64' }, { no: 3, name: 'received', type: 'uint32' }])
});
const method = (name, kind, request, response) => Object.freeze({ name, path: `/${SERVICE_NAME}/${name}`, kind, request, response });
const METHODS = Object.freeze({
  Watch: method('Watch', 'server-streaming', SCHEMAS.WatchRequest, SCHEMAS.Tick),
  Chat: method('Chat', 'bidirectional', SCHEMAS.Note, SCHEMAS.Echo)
});

function invalid(message) {
  return new GrpcError(STATUS.INVALID_ARGUMENT, message);
}

function validateWatch(request) {
  if (!TOPIC.test(request.topic)) throw invalid('topic must match [a-z][a-z0-9-]{0,31}');
  if (request.count < 1 || request.count > MAX_COUNT) throw invalid(`count must be 1 to ${MAX_COUNT}`);
  if (request.interval_ms > MAX_INTERVAL_MS) throw invalid(`interval_ms must be at most ${MAX_INTERVAL_MS}`);
  if (request.payload_bytes > MAX_PAYLOAD_BYTES) throw invalid(`payload_bytes must be at most ${MAX_PAYLOAD_BYTES}`);
}

// Resolves true after ms, or false as soon as the call is over (cancel, deadline, abort).
function sleep(timers, ms, signal) {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false);
      return;
    }
    const onAbort = () => {
      timers.clearTimeout(timer);
      resolve(false);
    };
    const timer = timers.setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function createService({ timers = { setTimeout, clearTimeout } } = {}) {
  async function* watch({ request, signal }) {
    for (let seq = 1; seq <= request.count; seq += 1) {
      if (request.interval_ms > 0 && !(await sleep(timers, request.interval_ms, signal))) return;
      if (signal.aborted) return;
      yield { topic: request.topic, seq, body: request.payload_bytes > 0 ? 'x'.repeat(request.payload_bytes) : `tick-${seq}` };
    }
  }

  async function* chat({ requests }) {
    let received = 0;
    for await (const note of requests) {
      if (note.text.length > MAX_NOTE_CHARS) throw invalid(`a note is at most ${MAX_NOTE_CHARS} characters`);
      received += 1;
      yield { text: `echo: ${note.text}`, seq: received, received };
    }
  }

  return Object.freeze({
    methods: Object.freeze({
      [METHODS.Watch.path]: Object.freeze({ ...METHODS.Watch, validate: validateWatch, handler: watch }),
      [METHODS.Chat.path]: Object.freeze({ ...METHODS.Chat, handler: chat })
    })
  });
}

module.exports = Object.freeze({
  PACKAGE, SERVICE_NAME, SCHEMAS, METHODS, createService, LIMITS: Object.freeze({ MAX_COUNT, MAX_INTERVAL_MS, MAX_PAYLOAD_BYTES, MAX_NOTE_CHARS })
});
