'use strict';

// One client call on one HTTP/2 stream. The report it resolves with says ok only for a clean gRPC conversation: HTTP 200,
// application/grpc, every message whole and decodable, TRAILERS (or Trailers-Only) with grpc-status 0 and no violation.
// Everything else is a status plus the violations that were seen; a missing, forged or truncated response is never ok.
const http2 = require('node:http2');
const grpc = require('./grpc.cjs');
const protobuf = require('./protobuf.cjs');
const report = require('./report.cjs');

const { STATUS } = grpc;
const H2 = http2.constants;
const BACKLOG_HIGH_WATER = 8;
const USER_AGENT = 'c028-driver/1';
const FRAMING_VIOLATIONS = Object.freeze({
  TOO_LARGE: ['MESSAGE_TOO_LARGE', STATUS.RESOURCE_EXHAUSTED], BAD_PREFIX: ['BAD_PREFIX', STATUS.INTERNAL],
  COMPRESSED: ['COMPRESSED_MESSAGE', STATUS.INTERNAL], TRUNCATED: ['TRUNCATED_MESSAGE', STATUS.INTERNAL],
  TOO_MANY: ['TOO_MANY_MESSAGES', STATUS.RESOURCE_EXHAUSTED]
});
const plain = (fields) => Object.fromEntries(Object.entries(fields));

function createCall({ session, sessionState, descriptor, request, options, config }) {
  const events = [];
  const violations = [];
  const received = [];
  const reader = grpc.createMessageReader({ maxMessageBytes: config.maxMessageBytes });
  let stream = null;
  let settled = false;
  let headers = null;
  let trailers = null;
  let httpStatus = null;
  let trailersOnly = false;
  let cursor = 0;
  let sent = 0;
  let autoDrain = false;
  let deadlineTimer = null;
  let wake = null;
  let resolveResult;
  const resultPromise = new Promise((resolve) => { resolveResult = resolve; });
  const event = (ev, fields = {}) => events.push({ n: events.length + 1, ev, ...fields });
  const notify = () => {
    const resume = wake;
    wake = null;
    if (resume) resume();
  };
  const terminate = () => {
    if (stream && !stream.closed && !stream.destroyed) stream.close(H2.NGHTTP2_CANCEL);
  };

  function settle(status) {
    if (settled) return;
    settled = true;
    if (deadlineTimer !== null) config.timers.clearTimeout(deadlineTimer);
    event('end', { code: status.code, name: status.name, origin: status.origin });
    resolveResult(Object.freeze(report.buildReport({
      path: descriptor.path, kind: descriptor.kind, status, violations, httpStatus, trailersOnly, headers, trailers,
      messages: received, rstCode: stream && Number.isInteger(stream.rstCode) ? stream.rstCode : null, events
    })));
    notify();
  }

  function violate(code, message, status = report.makeStatus(STATUS.INTERNAL, message, 'protocol-violation')) {
    if (settled) return;
    violations.push({ code, message });
    event('violation', { code, message });
    settle(status);
    terminate();
  }

  function bodyFailure(error) {
    if (error instanceof grpc.GrpcFramingError) {
      const [code, grpcCode] = FRAMING_VIOLATIONS[error.code];
      violate(code, error.message, report.makeStatus(grpcCode, error.message, 'protocol-violation'));
    } else {
      violate('MESSAGE_MALFORMED', `a response message is not valid protobuf (${error.code})`);
    }
  }

  function onHeaders(fields, flags) {
    if (settled) return;
    headers = plain(fields);
    httpStatus = fields[':status'];
    const endsStream = (flags & H2.NGHTTP2_FLAG_END_STREAM) !== 0;
    event('headers', { httpStatus, contentType: headers['content-type'] ?? null, endsStream });
    if (httpStatus !== 200) {
      violate('HTTP_STATUS', `the server answered HTTP ${httpStatus}`, report.makeStatus(report.statusForHttp(httpStatus), `HTTP ${httpStatus}`, 'http-status'));
    } else if (!grpc.isGrpcContentType(headers['content-type'])) {
      violate('CONTENT_TYPE', `the response content-type ${JSON.stringify(headers['content-type'] ?? null)} is not application/grpc`);
    } else if (headers['grpc-status'] !== undefined && !endsStream) {
      violate('STATUS_IN_HEADERS_WITH_BODY', 'grpc-status in the response headers is only valid when it ends the stream (Trailers-Only)');
    } else if (headers['grpc-status'] !== undefined) {
      trailersOnly = true;
      trailers = { 'grpc-status': headers['grpc-status'], 'grpc-message': headers['grpc-message'] };
      event('trailers', { trailers, trailersOnly: true });
    }
  }

  function onData(chunk) {
    if (settled) return;
    try {
      for (const payload of reader.push(chunk)) {
        if (received.length >= config.maxMessages) throw new grpc.GrpcFramingError('TOO_MANY', `more than ${config.maxMessages} messages arrived`);
        received.push(protobuf.decode(descriptor.response, payload));
        event('message', { index: received.length, bytes: payload.length, message: received[received.length - 1] });
      }
    } catch (error) {
      bodyFailure(error);
      return;
    }
    notify();
    if (!autoDrain && received.length - cursor >= BACKLOG_HIGH_WATER) stream.pause();
  }

  function onEnd() {
    if (settled) return;
    try {
      reader.finish();
    } catch (error) {
      bodyFailure(error);
    }
  }

  function onClose() {
    if (settled) return;
    if (trailers !== null) {
      const parsed = report.readServerStatus(trailers);
      if (parsed.violation) violate(parsed.violation.code, parsed.violation.message);
      else settle(parsed.status);
    } else if (sessionState.closed || session.destroyed) {
      const message = 'the connection closed before the call finished';
      violate('TRANSPORT_CLOSED', message, report.makeStatus(STATUS.UNAVAILABLE, message, 'transport'));
    } else if (stream.rstCode !== H2.NGHTTP2_NO_ERROR) {
      const message = `the server reset the stream (HTTP/2 error code ${stream.rstCode})`;
      violate('STREAM_RESET', message, report.makeStatus(report.statusForReset(stream.rstCode), message, 'server-reset'));
    } else {
      violate('TRAILERS_MISSING', 'the stream ended without trailers, so no grpc-status was received');
    }
  }

  function writeMessage(message) {
    try {
      const payload = protobuf.encode(descriptor.request, message);
      sent += 1;
      event('request-message', { index: sent, bytes: payload.length });
      return stream.write(grpc.frameMessage(payload));
    } catch (error) {
      settle(report.makeStatus(STATUS.INVALID_ARGUMENT, `the request message cannot be encoded (${error.code})`, 'client-validation'));
      terminate();
      return false;
    }
  }

  function cancel() {
    if (settled) return;
    event('cancel');
    settle(report.makeStatus(STATUS.CANCELLED, 'the call was cancelled by the caller', 'client-cancel'));
    cursor = received.length;
    terminate();
  }

  function expire() {
    if (settled) return;
    event('deadline', { timeoutMs: options.timeoutMs });
    settle(report.makeStatus(STATUS.DEADLINE_EXCEEDED, 'the client deadline expired', 'client-deadline'));
    terminate();
  }

  async function* messages() {
    for (;;) {
      if (cursor < received.length) {
        cursor += 1;
        if (!autoDrain && received.length - cursor < BACKLOG_HIGH_WATER) stream.resume();
        yield received[cursor - 1];
      } else if (settled) {
        return;
      } else {
        await new Promise((resolve) => { wake = resolve; });
      }
    }
  }

  let prepared = null;
  try {
    const metadata = grpc.normalizeMetadata(options.metadata);
    const timeout = options.timeoutMs === undefined ? {} : { 'grpc-timeout': grpc.formatTimeout(options.timeoutMs) };
    prepared = {
      metadata, timeout, first: request === undefined ? null : grpc.frameMessage(protobuf.encode(descriptor.request, request))
    };
  } catch (error) {
    settle(report.makeStatus(STATUS.INVALID_ARGUMENT, `the call cannot be made (${error.code})`, 'client-validation'));
  }
  if (prepared !== null) {
    try {
      stream = session.request({
        ':method': 'POST', ':path': descriptor.path, 'content-type': 'application/grpc', te: 'trailers',
        'user-agent': USER_AGENT, 'grpc-accept-encoding': 'identity', ...prepared.timeout, ...prepared.metadata
      });
    } catch (error) {
      const message = `the call cannot be started (${error.code})`;
      violate('TRANSPORT_CLOSED', message, report.makeStatus(STATUS.UNAVAILABLE, message, 'transport'));
    }
  }
  if (stream !== null) {
    event('request', { path: descriptor.path, metadata: prepared.metadata, timeout: prepared.timeout['grpc-timeout'] ?? null });
    stream.on('response', onHeaders);
    stream.on('data', onData);
    stream.on('trailers', (fields) => {
      if (!settled) {
        trailers = plain(fields);
        event('trailers', { trailers });
      }
    });
    stream.on('end', onEnd);
    stream.on('error', () => undefined);
    stream.on('close', onClose);
    if (prepared.first !== null) {
      event('request-message', { index: 1, bytes: prepared.first.length - 5 });
      sent = 1;
      stream.end(prepared.first);
    }
    if (options.timeoutMs !== undefined) deadlineTimer = config.timers.setTimeout(expire, Math.min(options.timeoutMs, grpc.MAX_TIMER_MS));
  }

  return {
    get result() {
      autoDrain = true;
      if (stream && !stream.closed && !stream.destroyed) stream.resume();
      return resultPromise;
    },
    messages,
    cancel,
    write: writeMessage,
    end() {
      if (stream && !settled) stream.end();
    }
  };
}

module.exports = Object.freeze({ createCall });
