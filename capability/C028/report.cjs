'use strict';

// Pure helpers of the driver: how HTTP and HTTP/2 failures map to gRPC status codes (PROTOCOL-HTTP2 status mapping),
// how trailers are read, and how the final report is assembled. A report says ok only when the evidence allows it.
const http2 = require('node:http2');
const { STATUS, STATUS_NAMES, decodeStatusMessage } = require('./grpc.cjs');

const H2 = http2.constants;
const HTTP_TO_STATUS = Object.freeze({
  400: STATUS.INTERNAL, 401: STATUS.UNAUTHENTICATED, 403: STATUS.PERMISSION_DENIED, 404: STATUS.UNIMPLEMENTED,
  429: STATUS.UNAVAILABLE, 502: STATUS.UNAVAILABLE, 503: STATUS.UNAVAILABLE, 504: STATUS.UNAVAILABLE
});
const RESET_TO_STATUS = Object.freeze({
  [H2.NGHTTP2_CANCEL]: STATUS.CANCELLED, [H2.NGHTTP2_REFUSED_STREAM]: STATUS.UNAVAILABLE,
  [H2.NGHTTP2_ENHANCE_YOUR_CALM]: STATUS.RESOURCE_EXHAUSTED, [H2.NGHTTP2_INADEQUATE_SECURITY]: STATUS.PERMISSION_DENIED
});
const GRPC_STATUS = /^(?:0|[1-9][0-9]?)$/;

const statusForHttp = (httpStatus) => HTTP_TO_STATUS[httpStatus] ?? STATUS.UNKNOWN;
const statusForReset = (rstCode) => RESET_TO_STATUS[rstCode] ?? STATUS.INTERNAL;
const makeStatus = (code, message, origin) => ({ code, name: STATUS_NAMES[code], message, origin });

// The status the server sent in trailers (or in a Trailers-Only headers frame), or the reason it cannot be trusted.
function readServerStatus(fields) {
  const raw = fields['grpc-status'];
  if (raw === undefined) return { violation: { code: 'STATUS_MISSING', message: 'the trailers carry no grpc-status' } };
  const code = typeof raw === 'string' && GRPC_STATUS.test(raw) ? Number(raw) : -1;
  if (code < 0 || code > STATUS.UNAUTHENTICATED) {
    return { violation: { code: 'STATUS_INVALID', message: `grpc-status ${JSON.stringify(raw)} is not a gRPC status code` } };
  }
  const message = fields['grpc-message'];
  return { status: makeStatus(code, typeof message === 'string' ? decodeStatusMessage(message) : '', 'server-trailers') };
}

function outcomeOf(status, violations) {
  if (status.origin === 'client-validation') return 'client-error';
  if (status.origin === 'transport') return 'transport-failure';
  if (violations.length > 0) return 'protocol-violation';
  if (status.code === STATUS.OK) return 'ok';
  if (status.code === STATUS.CANCELLED) return 'cancelled';
  if (status.code === STATUS.DEADLINE_EXCEEDED) return 'deadline-exceeded';
  return 'server-error';
}

// ok needs: a status from server trailers, code OK, no violation. Nothing else can make a call successful.
function buildReport({ path, kind, status, violations, httpStatus, trailersOnly, headers, trailers, messages, rstCode, events }) {
  const ok = status.origin === 'server-trailers' && status.code === STATUS.OK && violations.length === 0;
  return {
    ok, path, kind, outcome: outcomeOf(status, violations), status, violations: [...violations], httpStatus, trailersOnly,
    headers, trailers, messages: [...messages], messageCount: messages.length, rstCode, events: [...events]
  };
}

module.exports = Object.freeze({ statusForHttp, statusForReset, makeStatus, readServerStatus, outcomeOf, buildReport });
