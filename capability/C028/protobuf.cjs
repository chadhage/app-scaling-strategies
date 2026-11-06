'use strict';

// A minimal protobuf codec for a tiny fictional schema: strings, uint32 and uint64 (as safe integers). It is strict:
// every malformed byte sequence raises a typed ProtobufError and nothing is guessed. Unknown fields are skipped.
const WIRE = Object.freeze({ VARINT: 0, FIXED64: 1, LENGTH: 2, FIXED32: 5 });
const WIRE_OF_TYPE = Object.freeze({ string: WIRE.LENGTH, uint32: WIRE.VARINT, uint64: WIRE.VARINT });
const MAX_VARINT_BYTES = 10;
const UINT32_MAX = 0xffffffff;
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

class ProtobufError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ProtobufError';
    this.code = code;
  }
}

function writeVarint(value) {
  if (!Number.isSafeInteger(value) || value < 0) throw new ProtobufError('OUT_OF_RANGE', 'a varint is a non-negative safe integer');
  const bytes = [];
  let rest = value;
  while (rest > 0x7f) {
    bytes.push((rest % 128) | 0x80);
    rest = Math.floor(rest / 128);
  }
  bytes.push(rest);
  return Buffer.from(bytes);
}

function readVarint(buffer, offset) {
  let value = 0;
  let multiplier = 1;
  for (let index = 0; index < MAX_VARINT_BYTES; index += 1) {
    if (offset + index >= buffer.length) throw new ProtobufError('TRUNCATED', 'a varint runs past the end of the message');
    const byte = buffer[offset + index];
    value += (byte & 0x7f) * multiplier;
    if ((byte & 0x80) === 0) {
      if (!Number.isSafeInteger(value)) throw new ProtobufError('OUT_OF_RANGE', 'a varint exceeds 2^53 - 1');
      return { value, next: offset + index + 1 };
    }
    multiplier *= 128;
  }
  throw new ProtobufError('VARINT_TOO_LONG', 'a varint is at most 10 bytes');
}

function readLength(buffer, offset) {
  const length = readVarint(buffer, offset);
  if (length.value > buffer.length - length.next) throw new ProtobufError('TRUNCATED', 'a length-delimited field runs past the end of the message');
  return { start: length.next, end: length.next + length.value };
}

function skip(buffer, offset, wire) {
  if (wire === WIRE.VARINT) return readVarint(buffer, offset).next;
  if (wire === WIRE.LENGTH) return readLength(buffer, offset).end;
  const size = wire === WIRE.FIXED64 ? 8 : 4;
  if (buffer.length - offset < size) throw new ProtobufError('TRUNCATED', 'a fixed-width field runs past the end of the message');
  return offset + size;
}

function defaults(schema) {
  const value = {};
  for (const field of schema.fields) value[field.name] = field.type === 'string' ? '' : 0;
  return value;
}

function decode(schema, buffer) {
  if (!(buffer instanceof Uint8Array)) throw new ProtobufError('BAD_VALUE', 'a message is decoded from bytes');
  const fields = new Map(schema.fields.map((field) => [field.no, field]));
  const value = defaults(schema);
  let offset = 0;
  while (offset < buffer.length) {
    const tag = readVarint(buffer, offset);
    const wire = tag.value % 8;
    const field = fields.get(Math.floor(tag.value / 8));
    if (![WIRE.VARINT, WIRE.FIXED64, WIRE.LENGTH, WIRE.FIXED32].includes(wire)) {
      throw new ProtobufError('BAD_WIRE_TYPE', `wire type ${wire} is not supported (groups are not part of this schema)`);
    }
    if (field === undefined) {
      offset = skip(buffer, tag.next, wire);
      continue;
    }
    if (wire !== WIRE_OF_TYPE[field.type]) throw new ProtobufError('WIRE_TYPE_MISMATCH', `field ${field.name} arrived with wire type ${wire}`);
    if (field.type === 'string') {
      const span = readLength(buffer, tag.next);
      try {
        value[field.name] = decoder.decode(buffer.subarray(span.start, span.end));
      } catch {
        throw new ProtobufError('BAD_UTF8', `field ${field.name} is not valid UTF-8`);
      }
      offset = span.end;
    } else {
      const number = readVarint(buffer, tag.next);
      if (field.type === 'uint32' && number.value > UINT32_MAX) throw new ProtobufError('OUT_OF_RANGE', `field ${field.name} exceeds uint32`);
      value[field.name] = number.value;
      offset = number.next;
    }
  }
  return value;
}

function encode(schema, value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new ProtobufError('BAD_VALUE', 'a message is a plain object');
  const names = new Set(schema.fields.map((field) => field.name));
  for (const key of Object.keys(value)) if (!names.has(key)) throw new ProtobufError('UNKNOWN_FIELD', `the schema has no field ${key}`);
  const parts = [];
  for (const field of schema.fields) {
    const item = value[field.name];
    if (item === undefined) continue;
    if (field.type === 'string') {
      if (typeof item !== 'string' || !item.isWellFormed()) throw new ProtobufError('BAD_VALUE', `field ${field.name} must be a well-formed string`);
      if (item === '') continue;
      const bytes = Buffer.from(item, 'utf8');
      parts.push(writeVarint(field.no * 8 + WIRE.LENGTH), writeVarint(bytes.length), bytes);
    } else {
      if (!Number.isSafeInteger(item) || item < 0 || (field.type === 'uint32' && item > UINT32_MAX)) {
        throw new ProtobufError('OUT_OF_RANGE', `field ${field.name} is outside its ${field.type} range`);
      }
      if (item === 0) continue;
      parts.push(writeVarint(field.no * 8 + WIRE.VARINT), writeVarint(item));
    }
  }
  return Buffer.concat(parts);
}

module.exports = Object.freeze({ WIRE, ProtobufError, encode, decode, readVarint, writeVarint });
