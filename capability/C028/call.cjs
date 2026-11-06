'use strict';

// One gRPC call on one HTTP/2 stream: reads length-prefixed request messages, runs the service handler, writes
// length-prefixed responses behind HEADERS, and ends with TRAILERS (or Trailers-Only when nothing was sent yet).
// A call finishes exactly once; after that nothing is produced or written.
const http2 = require('node:http2');
const grpc = require('./grpc.cjs');
const protobuf = require('./protobuf.cjs');

const { STATUS, STATUS_NAMES, GrpcError, GrpcFramingError } = grpc;
const REQUEST_QUEUE_LIMIT = 16;
const turn = () => new Promise((resolve) => setImmediate(resolve));

function statusOf(error) {
  if (error instanceof GrpcError) return { code: error.grpcCode, message: error.message };
  if (error instanceof protobuf.ProtobufError) return { code: STATUS.INVALID_ARGUMENT, message: `malformed request message (${error.code})` };
  if (error instanceof GrpcFramingError) {
    return { code: error.code === 'TOO_LARGE' ? STATUS.RESOURCE_EXHAUSTED : STATUS.INVALID_ARGUMENT, message: error.message };
  }
  return { code: STATUS.INTERNAL, message: 'the handler failed' };
}

function createRequestQueue({ onPause, onResume }) {
  const items = [];
  let ended = false;
  let waiting = null;
  const wake = () => {
    const resume = waiting;
    waiting = null;
    if (resume) resume();
  };
  return {
    push(value) {
      items.push(value);
      wake();
      if (items.length >= REQUEST_QUEUE_LIMIT) onPause();
    },
    end() {
      ended = true;
      wake();
    },
    async* [Symbol.asyncIterator]() {
      for (;;) {
        if (items.length > 0) {
          const value = items.shift();
          if (items.length < REQUEST_QUEUE_LIMIT) onResume();
          yield value;
        } else if (ended) {
          return;
        } else {
          await new Promise((resolve) => { waiting = resolve; });
        }
      }
    }
  };
}

function startCall({ stream, method, record, timers, limits, deadlineMs, responseHeaders, metadata, onFinished, onBackpressure }) {
  const controller = new AbortController();
  const reader = grpc.createMessageReader({ maxMessageBytes: limits.maxRequestBytes });
  const requests = method.kind === 'bidirectional'
    ? createRequestQueue({ onPause: () => stream.pause(), onResume: () => stream.resume() })
    : undefined;
  let done = false;
  let received = 0;
  let wakeProducer = null;
  let pendingTrailers = null;
  let deadlineTimer = null;
  let requestTimer = null;
  const attempt = (action) => {
    try { action(); } catch { /* the stream is already gone; the call record says how it ended */ }
  };

  function finish(code, message, by) {
    if (done) return;
    done = true;
    Object.assign(record, { outcome: STATUS_NAMES[code], status: code, message, finishedBy: by });
    if (deadlineTimer !== null) timers.clearTimeout(deadlineTimer);
    clearTimeout(requestTimer);
    controller.abort();
    if (requests) requests.end();
    if (wakeProducer) wakeProducer();
    if (!stream.closed && !stream.destroyed) {
      const trailers = { 'grpc-status': String(code), ...(message ? { 'grpc-message': grpc.encodeStatusMessage(message) } : {}) };
      if (stream.headersSent) {
        pendingTrailers = trailers;
        attempt(() => stream.end());
      } else {
        attempt(() => stream.respond({ ':status': 200, 'content-type': 'application/grpc', ...trailers }, { endStream: true }));
      }
      stream.resume();
    }
    onFinished(record);
  }

  const fail = (error) => {
    const { code, message } = statusOf(error);
    finish(code, message, 'bad-request');
  };
  if (deadlineMs !== null) {
    deadlineTimer = timers.setTimeout(() => finish(STATUS.DEADLINE_EXCEEDED, 'the deadline expired', 'deadline'), Math.min(deadlineMs, grpc.MAX_TIMER_MS));
  }

  function drained() {
    return new Promise((resolve) => {
      const release = () => {
        stream.off('drain', release);
        wakeProducer = null;
        resolve();
      };
      wakeProducer = release;
      stream.once('drain', release);
    });
  }

  function encodeResponse(value) {
    let payload;
    try {
      payload = protobuf.encode(method.response, value);
    } catch {
      throw new GrpcError(STATUS.INTERNAL, 'the handler produced a response message the schema cannot carry');
    }
    if (payload.length > limits.maxResponseBytes) throw new GrpcError(STATUS.RESOURCE_EXHAUSTED, 'a response message exceeds the server limit');
    return grpc.frameMessage(payload);
  }

  async function produce(iterator) {
    try {
      for (;;) {
        const step = await iterator.next();
        if (done) break;
        if (step.done) {
          finish(STATUS.OK, '', 'handler');
          break;
        }
        const frame = encodeResponse(step.value);
        record.writesAfterFinish += Number(done);
        if (!stream.write(frame)) {
          record.backpressureWaits += 1;
          onBackpressure(record);
          await drained();
        }
        record.produced += 1;
        await turn();
        if (done) break;
      }
    } catch (error) {
      const { code, message } = statusOf(error);
      finish(code, message, 'handler');
    } finally {
      attempt(() => { iterator.return().catch(() => undefined); });
    }
  }

  function begin(request) {
    attempt(() => stream.respond({ ':status': 200, 'content-type': 'application/grpc', ...responseHeaders }, { waitForTrailers: true }));
    stream.on('wantTrailers', () => { if (pendingTrailers) attempt(() => stream.sendTrailers(pendingTrailers)); });
    let iterator;
    try {
      iterator = method.handler({ request, requests, signal: controller.signal, timers, metadata })[Symbol.asyncIterator]();
    } catch (error) {
      fail(error);
      return;
    }
    produce(iterator);
  }

  function accept(payload) {
    received += 1;
    record.received = received;
    clearTimeout(requestTimer);
    const message = protobuf.decode(method.request, payload);
    if (requests) {
      requests.push(message);
    } else if (received > 1) {
      throw new GrpcError(STATUS.INVALID_ARGUMENT, 'exactly one request message is expected');
    } else {
      if (method.validate) method.validate(message);
      begin(message);
    }
  }

  stream.on('data', (chunk) => {
    if (done) return;
    try {
      for (const payload of reader.push(chunk)) accept(payload);
    } catch (error) {
      fail(error);
    }
  });
  stream.on('end', () => {
    if (done) return;
    try {
      reader.finish();
      if (!requests && received === 0) throw new GrpcError(STATUS.INVALID_ARGUMENT, 'a request message is required');
    } catch (error) {
      fail(error);
      return;
    }
    if (requests) requests.end();
  });
  stream.on('close', () => {
    finish(STATUS.CANCELLED, 'the client ended the call before it finished',
      stream.rstCode === http2.constants.NGHTTP2_NO_ERROR ? 'connection-closed' : 'client-reset');
  });
  if (requests) {
    begin(undefined);
  } else {
    // A stream that opens and then never sends its request must not hold a call slot forever (real time, never manual).
    requestTimer = setTimeout(() => finish(STATUS.DEADLINE_EXCEEDED, 'no request message arrived in time', 'request-timeout'), limits.requestTimeoutMs);
    requestTimer.unref();
  }
  return { finish };
}

module.exports = Object.freeze({ startCall, statusOf });
