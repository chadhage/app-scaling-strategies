'use strict';

// RFC 6455 framing for the C026 fixture, written with Node built-ins only.
const { createHash } = require('node:crypto');

const GUID = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const OPCODES = Object.freeze({ continuation: 0x0, text: 0x1, binary: 0x2, close: 0x8, ping: 0x9, pong: 0xa });
const KNOWN_OPCODES = new Set(Object.values(OPCODES));
const DEFAULT_MAX_MESSAGE_BYTES = 64 * 1024;
// Every frame of a fragmented message counts, empty ones too: a zero-length continuation costs the receiver memory
// but no payload bytes, so the byte limit alone cannot bound a message.
const DEFAULT_MAX_FRAGMENTS = 64;
const KEY_PATTERN = /^[A-Za-z0-9+/]{22}==$/;
const utf8 = new TextDecoder('utf-8', { fatal: true });

class FramingError extends Error {
  constructor(code, closeCode, message) {
    super(message ?? code);
    this.name = 'FramingError';
    this.code = code;
    this.closeCode = closeCode;
  }
}

function acceptKey(key) {
  if (typeof key !== 'string' || !KEY_PATTERN.test(key)) {
    throw new FramingError('INVALID_KEY', 1002, 'Sec-WebSocket-Key must be the base64 form of 16 bytes.');
  }
  return createHash('sha1').update(key + GUID).digest('base64');
}

function isWireCloseCode(code) {
  return (code >= 1000 && code <= 1003) || (code >= 1007 && code <= 1014) || (code >= 3000 && code <= 4999);
}

function applyMask(bytes, maskKey) {
  const masked = Buffer.from(bytes);
  for (let index = 0; index < masked.length; index += 1) masked[index] ^= maskKey[index % 4];
  return masked;
}

function encodeFrame({ opcode, payload = Buffer.alloc(0), fin = true, maskKey = null }) {
  if (!KNOWN_OPCODES.has(opcode)) throw new TypeError(`Unknown opcode ${opcode}.`);
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(payload, 'utf8');
  if (opcode >= OPCODES.close && (body.length > 125 || !fin)) {
    throw new FramingError('INVALID_CONTROL_FRAME', 1002, 'Control frames must be final and carry at most 125 bytes.');
  }
  if (maskKey !== null && !(Buffer.isBuffer(maskKey) && maskKey.length === 4)) {
    throw new TypeError('A mask key is exactly 4 bytes.');
  }
  let header;
  if (body.length < 126) {
    header = Buffer.from([0, body.length]);
  } else if (body.length <= 0xffff) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }
  header[0] = (fin ? 0x80 : 0) | opcode;
  if (maskKey === null) return Buffer.concat([header, body]);
  header[1] |= 0x80;
  return Buffer.concat([header, maskKey, applyMask(body, maskKey)]);
}

function encodeClose(code, reason = '', maskKey = null) {
  if (!isWireCloseCode(code)) throw new TypeError(`Close code ${code} may not be sent on the wire.`);
  const reasonBytes = Buffer.from(reason, 'utf8');
  if (reasonBytes.length > 123) throw new TypeError('A close reason is at most 123 bytes.');
  const payload = Buffer.alloc(2 + reasonBytes.length);
  payload.writeUInt16BE(code, 0);
  reasonBytes.copy(payload, 2);
  return encodeFrame({ opcode: OPCODES.close, payload, maskKey });
}

function parseClosePayload(payload) {
  if (payload.length === 0) return { code: 1005, reason: '' };
  if (payload.length === 1) throw new FramingError('INVALID_CLOSE_PAYLOAD', 1002, 'A close payload is empty or at least 2 bytes.');
  const code = payload.readUInt16BE(0);
  if (!isWireCloseCode(code)) throw new FramingError('INVALID_CLOSE_CODE', 1002, `Close code ${code} is not valid on the wire.`);
  try {
    return { code, reason: utf8.decode(payload.subarray(2)) };
  } catch {
    throw new FramingError('INVALID_UTF8', 1007, 'The close reason is not valid UTF-8.');
  }
}

function createParser({ requireMask, maxMessageBytes = DEFAULT_MAX_MESSAGE_BYTES, maxFragments = DEFAULT_MAX_FRAGMENTS } = {}) {
  if (typeof requireMask !== 'boolean') throw new TypeError('requireMask must be stated: true for a server, false for a client.');
  if (!Number.isSafeInteger(maxFragments) || maxFragments < 1) throw new TypeError('maxFragments must be a positive integer.');
  let buffer = Buffer.alloc(0);
  let partial = null;
  let failure = null;

  function readLength(second, masked, control) {
    let length = second & 0x7f;
    let offset = 2;
    if (length === 126) {
      if (buffer.length < 4) return null;
      length = buffer.readUInt16BE(2);
      offset = 4;
      if (length < 126) throw new FramingError('NON_MINIMAL_LENGTH', 1002, 'The shortest length encoding must be used.');
    } else if (length === 127) {
      if (buffer.length < 10) return null;
      const wide = buffer.readBigUInt64BE(2);
      if (wide >> 63n) throw new FramingError('INVALID_LENGTH', 1002, 'The most significant length bit must be zero.');
      if (wide <= 0xffffn) throw new FramingError('NON_MINIMAL_LENGTH', 1002, 'The shortest length encoding must be used.');
      if (control) throw new FramingError('INVALID_CONTROL_FRAME', 1002, 'Control frames must be final and carry at most 125 bytes.');
      if (wide > BigInt(maxMessageBytes)) throw new FramingError('MESSAGE_TOO_BIG', 1009, `A frame may carry at most ${maxMessageBytes} bytes.`);
      length = Number(wide);
      offset = 10;
    }
    return { length, offset: offset + (masked ? 4 : 0), maskAt: offset };
  }

  function readFrame() {
    if (buffer.length < 2) return null;
    const first = buffer[0];
    const second = buffer[1];
    const fin = (first & 0x80) !== 0;
    const opcode = first & 0x0f;
    const masked = (second & 0x80) !== 0;
    if ((first & 0x70) !== 0) throw new FramingError('RESERVED_BITS_SET', 1002, 'No extension is negotiated, so reserved bits must be zero.');
    if (!KNOWN_OPCODES.has(opcode)) throw new FramingError('UNKNOWN_OPCODE', 1002, `Opcode ${opcode} is reserved.`);
    if (requireMask && !masked) throw new FramingError('UNMASKED_CLIENT_FRAME', 1002, 'Every client frame must be masked.');
    if (!requireMask && masked) throw new FramingError('MASKED_SERVER_FRAME', 1002, 'A server frame must not be masked.');
    const header = readLength(second, masked, opcode >= OPCODES.close);
    if (header === null) return null;
    if (opcode >= OPCODES.close && (!fin || header.length > 125)) {
      throw new FramingError('INVALID_CONTROL_FRAME', 1002, 'Control frames must be final and carry at most 125 bytes.');
    }
    if (header.length > maxMessageBytes) throw new FramingError('MESSAGE_TOO_BIG', 1009, `A frame may carry at most ${maxMessageBytes} bytes.`);
    if (buffer.length < header.offset + header.length) return null;
    const payload = buffer.subarray(header.offset, header.offset + header.length);
    const bytes = masked ? applyMask(payload, buffer.subarray(header.maskAt, header.maskAt + 4)) : Buffer.from(payload);
    buffer = buffer.subarray(header.offset + header.length);
    return { fin, opcode, payload: bytes };
  }

  function control(opcode, payload) {
    if (opcode === OPCODES.ping) return { type: 'ping', data: payload };
    if (opcode === OPCODES.pong) return { type: 'pong', data: payload };
    return { type: 'close', ...parseClosePayload(payload) };
  }

  function assemble({ fin, opcode, payload }) {
    if (opcode >= OPCODES.close) return control(opcode, payload);
    if (opcode === OPCODES.continuation) {
      if (partial === null) throw new FramingError('UNEXPECTED_CONTINUATION', 1002, 'A continuation needs an unfinished message.');
      partial.size += payload.length;
      partial.fragments += 1;
      if (partial.size > maxMessageBytes) throw new FramingError('MESSAGE_TOO_BIG', 1009, `A message may carry at most ${maxMessageBytes} bytes.`);
      if (partial.fragments > maxFragments) throw new FramingError('TOO_MANY_FRAGMENTS', 1009, `A message may arrive in at most ${maxFragments} frames.`);
      partial.chunks.push(payload);
    } else {
      if (partial !== null) throw new FramingError('FRAGMENT_INTERLEAVED', 1002, 'A new data frame arrived inside a fragmented message.');
      partial = { opcode, chunks: [payload], size: payload.length, fragments: 1 };
    }
    if (!fin) return null;
    const done = partial;
    partial = null;
    const data = Buffer.concat(done.chunks);
    if (done.opcode === OPCODES.binary) return { type: 'binary', data };
    try {
      return { type: 'text', text: utf8.decode(data) };
    } catch {
      throw new FramingError('INVALID_UTF8', 1007, 'A text message must be valid UTF-8.');
    }
  }

  return Object.freeze({
    push(chunk) {
      if (failure !== null) throw failure;
      buffer = buffer.length === 0 ? Buffer.from(chunk) : Buffer.concat([buffer, chunk]);
      const messages = [];
      try {
        for (let frame = readFrame(); frame !== null; frame = readFrame()) {
          const message = assemble(frame);
          if (message !== null) messages.push(message);
        }
      } catch (error) {
        failure = error;
        throw error;
      }
      return messages;
    }
  });
}

module.exports = Object.freeze({
  GUID, OPCODES, DEFAULT_MAX_MESSAGE_BYTES, DEFAULT_MAX_FRAGMENTS, FramingError, acceptKey, encodeFrame, encodeClose, parseClosePayload, createParser
});
