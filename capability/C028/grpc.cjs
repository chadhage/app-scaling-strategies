'use strict';

// gRPC wire primitives (PROTOCOL-HTTP2): status codes, the 5-byte length-prefixed message framing, the grpc-timeout
// grammar, grpc-message percent-encoding and request metadata rules. Node built-ins only.
const STATUS = Object.freeze({
  OK: 0, CANCELLED: 1, UNKNOWN: 2, INVALID_ARGUMENT: 3, DEADLINE_EXCEEDED: 4, NOT_FOUND: 5, ALREADY_EXISTS: 6,
  PERMISSION_DENIED: 7, RESOURCE_EXHAUSTED: 8, FAILED_PRECONDITION: 9, ABORTED: 10, OUT_OF_RANGE: 11,
  UNIMPLEMENTED: 12, INTERNAL: 13, UNAVAILABLE: 14, DATA_LOSS: 15, UNAUTHENTICATED: 16
});
const STATUS_NAMES = Object.freeze(Object.fromEntries(Object.entries(STATUS).map(([name, code]) => [code, name])));
const PREFIX_BYTES = 5;
const MAX_TIMEOUT_DIGITS = 8;
// Node timers wrap to 1 ms above this delay, so a valid grpc-timeout of 99999999H must be clamped, never wrapped.
const MAX_TIMER_MS = 2147483647;
const TIMEOUT = /^([0-9]{1,8})([HMSmun])$/;
const TIMEOUT_UNITS = Object.freeze({ H: [3600000, 1], M: [60000, 1], S: [1000, 1], m: [1, 1], u: [1, 1000], n: [1, 1000000] });
const RESERVED_METADATA = new Set(['content-type', 'te', 'user-agent', 'host', 'connection', 'keep-alive', 'proxy-connection',
  'transfer-encoding', 'upgrade', 'content-length', 'accept-encoding', 'content-encoding']);
const METADATA_KEY = /^[0-9a-z][0-9a-z._-]{0,63}$/;
const METADATA_VALUE = /^[\x20-\x7e]{0,256}$/;
const MAX_METADATA_ENTRIES = 16;

class GrpcFramingError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'GrpcFramingError';
    this.code = code;
  }
}

// Thrown by a service handler to end its call with an honest non-OK status.
class GrpcError extends Error {
  constructor(grpcCode, message) {
    super(message);
    this.name = 'GrpcError';
    this.grpcCode = grpcCode;
  }
}

function frameMessage(payload) {
  if (!(payload instanceof Uint8Array)) throw new GrpcFramingError('BAD_PAYLOAD', 'a message payload is a byte array');
  const prefix = Buffer.alloc(PREFIX_BYTES);
  prefix.writeUInt32BE(payload.length, 1);
  return Buffer.concat([prefix, payload]);
}

// Incremental reader: push() returns the whole messages completed by a chunk; finish() fails when the stream ended
// inside a message. A bad flag, a compressed message (no compression is negotiated) or a length above the limit
// fails as soon as the 5-byte prefix is complete, before any payload is buffered.
function createMessageReader({ maxMessageBytes }) {
  let pending = Buffer.alloc(0);
  let failure = null;
  const fail = (code, message) => {
    failure = new GrpcFramingError(code, message);
    throw failure;
  };
  return {
    push(chunk) {
      if (failure) throw failure;
      pending = pending.length === 0 ? chunk : Buffer.concat([pending, chunk]);
      const messages = [];
      try {
        while (pending.length >= PREFIX_BYTES) {
          const flag = pending[0];
          if (flag > 1) fail('BAD_PREFIX', `the compression flag is ${flag}, expected 0`);
          if (flag === 1) fail('COMPRESSED', 'a compressed message arrived but no compression was negotiated');
          const length = pending.readUInt32BE(1);
          if (length > maxMessageBytes) fail('TOO_LARGE', `a message of ${length} bytes exceeds the ${maxMessageBytes} byte limit`);
          if (pending.length < PREFIX_BYTES + length) break;
          messages.push(pending.subarray(PREFIX_BYTES, PREFIX_BYTES + length));
          pending = pending.subarray(PREFIX_BYTES + length);
        }
      } catch (error) {
        // whole messages that precede the violation are still delivered, in order; the failure stays sticky
        if (messages.length === 0) throw error;
      }
      return messages;
    },
    finish() {
      if (failure) throw failure;
      if (pending.length > 0) fail('TRUNCATED', `the stream ended inside a message (${pending.length} bytes pending)`);
    }
  };
}

function parseTimeout(text) {
  const match = typeof text === 'string' ? TIMEOUT.exec(text) : null;
  if (match === null) throw new GrpcFramingError('BAD_TIMEOUT', 'grpc-timeout is 1 to 8 ASCII digits and one of H M S m u n');
  const [multiplier, divisor] = TIMEOUT_UNITS[match[2]];
  return Math.ceil((Number(match[1]) * multiplier) / divisor);
}

function formatTimeout(ms) {
  if (!Number.isSafeInteger(ms) || ms < 0) throw new GrpcFramingError('BAD_TIMEOUT', 'a timeout is a non-negative integer number of milliseconds');
  const limit = 10 ** MAX_TIMEOUT_DIGITS - 1;
  for (const [unit, size] of [['m', 1], ['S', 1000], ['M', 60000]]) {
    if (Math.ceil(ms / size) <= limit) return `${Math.ceil(ms / size)}${unit}`;
  }
  return `${Math.min(Math.ceil(ms / 3600000), limit)}H`;
}

function encodeStatusMessage(text) {
  let encoded = '';
  for (const byte of Buffer.from(String(text), 'utf8')) {
    encoded += byte >= 0x20 && byte <= 0x7e && byte !== 0x25 ? String.fromCharCode(byte) : `%${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  }
  return encoded;
}

function decodeStatusMessage(text) {
  return String(text).replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => Buffer.from(run.replaceAll('%', ''), 'hex').toString('utf8'));
}

function isGrpcContentType(value) {
  return typeof value === 'string' && /^application\/grpc(?:\+proto)?$/i.test(value);
}

// Caller metadata may carry only ordinary lowercase keys: pseudo, grpc-* and transport headers are reserved so a caller
// can never forge a deadline, a content type or a server-owned stamp through it.
function normalizeMetadata(input) {
  if (input === undefined) return {};
  if (input === null || typeof input !== 'object' || Array.isArray(input)) throw new GrpcFramingError('BAD_METADATA', 'metadata is a plain object');
  const entries = Object.entries(input);
  if (entries.length > MAX_METADATA_ENTRIES) throw new GrpcFramingError('BAD_METADATA', `at most ${MAX_METADATA_ENTRIES} metadata entries`);
  const result = {};
  for (const [key, value] of entries) {
    if (!METADATA_KEY.test(key) || key.startsWith('grpc-') || key.endsWith('-bin') || RESERVED_METADATA.has(key)) {
      throw new GrpcFramingError('BAD_METADATA', `metadata key ${JSON.stringify(key)} is invalid or reserved`);
    }
    if (typeof value !== 'string' || !METADATA_VALUE.test(value)) throw new GrpcFramingError('BAD_METADATA', `metadata value for ${key} is invalid`);
    result[key] = value;
  }
  return result;
}

module.exports = Object.freeze({
  STATUS, STATUS_NAMES, MAX_TIMER_MS, GrpcFramingError, GrpcError, frameMessage, createMessageReader, parseTimeout, formatTimeout,
  encodeStatusMessage, decodeStatusMessage, isGrpcContentType, normalizeMetadata
});
