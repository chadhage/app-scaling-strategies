'use strict';

// Initial behavioral tests (written before any implementation) for the protobuf codec and the gRPC wire primitives.
// Retained as a snapshot: `node --test` discovery skips it; run it against the RED stubs by setting C028_RED_SUBJECT.
const assert = require('node:assert/strict');
const path = require('node:path');
const { test } = require('node:test');

const root = path.resolve(__dirname, '..', '..');
const subjectRoot = process.env.C028_RED_SUBJECT ? path.resolve(process.env.C028_RED_SUBJECT) : root;
const load = (name) => require(path.join(subjectRoot, name));
const pb = load('protobuf.cjs');
const grpc = load('grpc.cjs');
const { SCHEMAS } = load('service.cjs');
const hex = (buffer) => Buffer.from(buffer).toString('hex');
const raises = (fn, code, label) => {
  let caught;
  try { fn(); } catch (error) { caught = error; }
  assert.ok(caught, `${label}: must throw`);
  assert.equal(caught.code, code, `${label}: typed code`);
};

test('protobuf encodes the exact wire bytes and decodes them back', () => {
  const value = { topic: 'a', seq: 300, body: 'hi' };
  assert.equal(hex(pb.encode(SCHEMAS.Tick, value)), '0a016110ac021a026869');
  assert.deepEqual(pb.decode(SCHEMAS.Tick, Buffer.from('0a016110ac021a026869', 'hex')), value);
  assert.deepEqual(pb.decode(SCHEMAS.Tick, Buffer.alloc(0)), { topic: '', seq: 0, body: '' });
});

test('protobuf skips unknown fields and rejects hostile bytes with typed errors', () => {
  assert.equal(pb.decode(SCHEMAS.Tick, Buffer.from('7807' + '0a0161', 'hex')).topic, 'a');
  raises(() => pb.decode(SCHEMAS.Tick, Buffer.from('10ac', 'hex')), 'TRUNCATED', 'truncated varint');
  raises(() => pb.decode(SCHEMAS.Tick, Buffer.from('0a0561', 'hex')), 'TRUNCATED', 'truncated string');
  raises(() => pb.decode(SCHEMAS.Tick, Buffer.from('0a01ff', 'hex')), 'BAD_UTF8', 'invalid UTF-8');
  raises(() => pb.decode(SCHEMAS.Tick, Buffer.from('0801', 'hex')), 'WIRE_TYPE_MISMATCH', 'string sent as varint');
  raises(() => pb.decode(SCHEMAS.WatchRequest, Buffer.from('108080808010', 'hex')), 'OUT_OF_RANGE', 'uint32 overflow');
  raises(() => pb.decode(SCHEMAS.Tick, Buffer.from('0b', 'hex')), 'BAD_WIRE_TYPE', 'group wire type');
  raises(() => pb.decode(SCHEMAS.Tick, Buffer.from('10' + '80'.repeat(11) + '00', 'hex')), 'VARINT_TOO_LONG', 'eleven byte varint');
});

test('gRPC framing prefixes a flag byte and a big-endian length', () => {
  assert.equal(hex(grpc.frameMessage(Buffer.from('abc'))), '0000000003616263');
  assert.equal(hex(grpc.frameMessage(Buffer.alloc(0))), '0000000000');
});

test('the message reader reassembles split frames in order and refuses broken ones', () => {
  const wire = Buffer.concat([grpc.frameMessage(Buffer.from('a')), grpc.frameMessage(Buffer.from('bc'))]);
  const reader = grpc.createMessageReader({ maxMessageBytes: 16 });
  const seen = [];
  for (const byte of wire) seen.push(...reader.push(Buffer.from([byte])).map((message) => message.toString()));
  reader.finish();
  assert.deepEqual(seen, ['a', 'bc']);
  const truncated = grpc.createMessageReader({ maxMessageBytes: 16 });
  truncated.push(wire.subarray(0, 7));
  raises(() => truncated.finish(), 'TRUNCATED', 'stream ends inside a message');
  raises(() => grpc.createMessageReader({ maxMessageBytes: 16 }).push(Buffer.from('0200000001ff', 'hex')), 'BAD_PREFIX', 'flag 2');
  raises(() => grpc.createMessageReader({ maxMessageBytes: 16 }).push(Buffer.from('0100000001ff', 'hex')), 'COMPRESSED', 'flag 1');
  raises(() => grpc.createMessageReader({ maxMessageBytes: 10 }).push(Buffer.from('000000000b', 'hex')), 'TOO_LARGE', 'prefix alone');
});

test('grpc-timeout follows the 1 to 8 digit plus unit grammar', () => {
  assert.equal(grpc.parseTimeout('1S'), 1000);
  assert.equal(grpc.parseTimeout('250m'), 250);
  assert.equal(grpc.parseTimeout('2H'), 7200000);
  assert.equal(grpc.parseTimeout('3M'), 180000);
  assert.equal(grpc.parseTimeout('1500u'), 2);
  assert.equal(grpc.parseTimeout('1n'), 1);
  for (const bad of ['', '5', 'S', '123456789S', '-1S', '1.5S', '5s', ' 5S', '5S ', '5SS', '٣S']) {
    raises(() => grpc.parseTimeout(bad), 'BAD_TIMEOUT', `timeout ${JSON.stringify(bad)}`);
  }
  assert.equal(grpc.formatTimeout(1500), '1500m');
});

test('grpc-message is percent-encoded outside space to tilde and at the percent sign', () => {
  assert.equal(grpc.encodeStatusMessage('a b%é\n'), 'a b%25%C3%A9%0A');
  assert.equal(grpc.decodeStatusMessage('a b%25%C3%A9%0A'), 'a b%é\n');
  assert.equal(grpc.decodeStatusMessage('100%'), '100%');
});

test('status names follow the sixteen canonical gRPC codes', () => {
  assert.equal(grpc.STATUS.OK, 0);
  assert.equal(grpc.STATUS.CANCELLED, 1);
  assert.equal(grpc.STATUS.INVALID_ARGUMENT, 3);
  assert.equal(grpc.STATUS.DEADLINE_EXCEEDED, 4);
  assert.equal(grpc.STATUS.RESOURCE_EXHAUSTED, 8);
  assert.equal(grpc.STATUS.UNIMPLEMENTED, 12);
  assert.equal(grpc.STATUS.UNAVAILABLE, 14);
  assert.equal(grpc.STATUS_NAMES[14], 'UNAVAILABLE');
});
