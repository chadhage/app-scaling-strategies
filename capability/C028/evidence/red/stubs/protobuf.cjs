'use strict';

// RED subject: the schema data is correct but nothing encodes or decodes anything.
class ProtobufError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
module.exports = Object.freeze({
  ProtobufError,
  encode: () => Buffer.alloc(0),
  decode: () => ({}),
  readVarint: () => ({ value: 0, next: 0 }),
  writeVarint: () => Buffer.alloc(0)
});
