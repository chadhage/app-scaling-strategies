'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const pb = require('../protobuf.cjs');
const { SCHEMAS } = require('../service.cjs');

const hex = (buffer) => Buffer.from(buffer).toString('hex');
const bytes = (text) => Buffer.from(text, 'hex');
const raises = (fn, code) => assert.throws(fn, (error) => error instanceof pb.ProtobufError && error.code === code, `expected ${code}`);

test('varints round trip across the byte boundaries and the safe-integer ceiling', () => {
  for (const value of [0, 1, 127, 128, 300, 16383, 16384, 2 ** 31, 2 ** 32 - 1, 2 ** 32, 2 ** 53 - 1]) {
    const encoded = pb.writeVarint(value);
    assert.deepEqual(pb.readVarint(encoded, 0), { value, next: encoded.length }, `value ${value}`);
  }
  assert.equal(hex(pb.writeVarint(300)), 'ac02');
  assert.deepEqual(pb.readVarint(bytes('ffff03'), 0), { value: 65535, next: 3 });
  assert.deepEqual(pb.readVarint(bytes('00aa01'), 1), { value: 170, next: 3 });
});

test('writeVarint and readVarint refuse values and bytes outside the supported range', () => {
  for (const bad of [-1, 1.5, 2 ** 53, Number.NaN, '1', null]) raises(() => pb.writeVarint(bad), 'OUT_OF_RANGE');
  raises(() => pb.readVarint(bytes('ffffffffffffffff7f'), 0), 'OUT_OF_RANGE');
  raises(() => pb.readVarint(bytes('80'.repeat(10) + '00'), 0), 'VARINT_TOO_LONG');
  raises(() => pb.readVarint(bytes('80'), 0), 'TRUNCATED');
  raises(() => pb.readVarint(Buffer.alloc(0), 0), 'TRUNCATED');
});

test('encode writes proto3 canonical bytes and omits default values', () => {
  assert.equal(hex(pb.encode(SCHEMAS.Tick, { topic: 'a', seq: 300, body: 'hi' })), '0a016110ac021a026869');
  assert.equal(hex(pb.encode(SCHEMAS.Tick, { topic: '', seq: 0, body: '' })), '');
  assert.equal(hex(pb.encode(SCHEMAS.Tick, {})), '');
  assert.equal(hex(pb.encode(SCHEMAS.Tick, { topic: undefined, seq: 1 })), '1001');
  assert.equal(hex(pb.encode(SCHEMAS.Note, { text: 'é' })), '0a02c3a9');
  assert.equal(hex(pb.encode(SCHEMAS.WatchRequest, { count: 2 ** 32 - 1 })), '10ffffffff0f');
});

test('encode rejects values the schema cannot carry', () => {
  for (const bad of [null, 'text', 7, [], undefined]) raises(() => pb.encode(SCHEMAS.Tick, bad), 'BAD_VALUE');
  raises(() => pb.encode(SCHEMAS.Tick, { nope: 1 }), 'UNKNOWN_FIELD');
  raises(() => pb.encode(SCHEMAS.Tick, { __proto__: null, constructor: 1 }), 'UNKNOWN_FIELD');
  raises(() => pb.encode(SCHEMAS.Tick, { topic: 5 }), 'BAD_VALUE');
  raises(() => pb.encode(SCHEMAS.Tick, { topic: '\ud800' }), 'BAD_VALUE');
  raises(() => pb.encode(SCHEMAS.Tick, { seq: -1 }), 'OUT_OF_RANGE');
  raises(() => pb.encode(SCHEMAS.Tick, { seq: 1.5 }), 'OUT_OF_RANGE');
  raises(() => pb.encode(SCHEMAS.Tick, { seq: '1' }), 'OUT_OF_RANGE');
  raises(() => pb.encode(SCHEMAS.Tick, { seq: 2 ** 53 }), 'OUT_OF_RANGE');
  raises(() => pb.encode(SCHEMAS.WatchRequest, { count: 2 ** 32 }), 'OUT_OF_RANGE');
});

test('decode returns every schema field with proto3 defaults and the last duplicate wins', () => {
  assert.deepEqual(pb.decode(SCHEMAS.Echo, Buffer.alloc(0)), { text: '', seq: 0, received: 0 });
  assert.deepEqual(pb.decode(SCHEMAS.Tick, bytes('0a0161' + '0a0162' + '1005' + '1006')), { topic: 'b', seq: 6, body: '' });
  assert.deepEqual(pb.decode(SCHEMAS.Tick, new Uint8Array(bytes('1a02c3a9'))), { topic: '', seq: 0, body: 'é' });
  assert.equal(pb.decode(SCHEMAS.Note, bytes('0a03efbbbf')).text, '\ufeff', 'a leading byte order mark is data, never stripped');
  assert.equal(pb.decode(SCHEMAS.Tick, bytes('10ffffffffffff0f')).seq, 2 ** 46 - 1);
});

test('decode skips unknown fields of every supported wire type', () => {
  const unknown = ['7807', `79${'00'.repeat(8)}`, '7a03616263', `7d${'00'.repeat(4)}`, '800101'];
  for (const skipped of unknown) assert.equal(pb.decode(SCHEMAS.Tick, bytes(`${skipped}0a0161`)).topic, 'a', skipped);
});

test('decode rejects every malformed byte sequence with its typed code', () => {
  raises(() => pb.decode(SCHEMAS.Tick, 'text'), 'BAD_VALUE');
  raises(() => pb.decode(SCHEMAS.Tick, [1, 2]), 'BAD_VALUE');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('0b')), 'BAD_WIRE_TYPE');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('0c')), 'BAD_WIRE_TYPE');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('7e')), 'BAD_WIRE_TYPE');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('0801')), 'WIRE_TYPE_MISMATCH');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('120161')), 'WIRE_TYPE_MISMATCH');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('0a0561')), 'TRUNCATED');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('0a')), 'TRUNCATED');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('79' + '00'.repeat(7))), 'TRUNCATED');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('7d000000')), 'TRUNCATED');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('7a05616263')), 'TRUNCATED');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('0a01ff')), 'BAD_UTF8');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('0a02c328')), 'BAD_UTF8');
  raises(() => pb.decode(SCHEMAS.WatchRequest, bytes('108080808010')), 'OUT_OF_RANGE');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('10ffffffffffffffffff01')), 'OUT_OF_RANGE');
  raises(() => pb.decode(SCHEMAS.Tick, bytes('10' + '80'.repeat(11) + '00')), 'VARINT_TOO_LONG');
});

test('every ProtobufError is a typed Error with a name and a code', () => {
  const error = new pb.ProtobufError('X', 'message');
  assert.equal(error.name, 'ProtobufError');
  assert.equal(error.code, 'X');
  assert.ok(error instanceof Error);
  assert.deepEqual(Object.keys(pb.WIRE).sort(), ['FIXED32', 'FIXED64', 'LENGTH', 'VARINT']);
});
