'use strict';

// RED subject: no 5-byte prefix, no framing checks, no timeout grammar, no percent-encoding.
class GrpcFramingError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
module.exports = Object.freeze({
  GrpcFramingError,
  STATUS: Object.freeze({}),
  STATUS_NAMES: Object.freeze({}),
  frameMessage: (payload) => payload,
  createMessageReader: () => ({ push: (chunk) => [chunk], finish: () => undefined }),
  parseTimeout: () => 0,
  formatTimeout: (ms) => String(ms),
  encodeStatusMessage: (text) => text,
  decodeStatusMessage: (text) => text
});
