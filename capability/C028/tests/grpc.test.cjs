'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const grpc = require('../grpc.cjs');

const bytes = (text) => Buffer.from(text, 'hex');
const raises = (fn, code) => assert.throws(fn, (error) => error instanceof grpc.GrpcFramingError && error.code === code, `expected ${code}`);

test('status codes and names cover the seventeen canonical gRPC statuses', () => {
  assert.equal(Object.keys(grpc.STATUS).length, 17);
  for (const [name, code] of Object.entries(grpc.STATUS)) assert.equal(grpc.STATUS_NAMES[code], name);
  assert.equal(grpc.STATUS.UNAUTHENTICATED, 16);
  assert.equal(Object.isFrozen(grpc.STATUS), true);
});

test('frameMessage writes the flag byte and a big-endian length and refuses non-bytes', () => {
  assert.equal(grpc.frameMessage(Buffer.from('abc')).toString('hex'), '0000000003616263');
  assert.equal(grpc.frameMessage(new Uint8Array(300)).subarray(0, 5).toString('hex'), '000000012c');
  raises(() => grpc.frameMessage('abc'), 'BAD_PAYLOAD');
  raises(() => grpc.frameMessage(null), 'BAD_PAYLOAD');
});

test('the reader returns messages in order however the bytes are split', () => {
  const wire = Buffer.concat([grpc.frameMessage(Buffer.from('a')), grpc.frameMessage(Buffer.alloc(0)), grpc.frameMessage(Buffer.from('xyz'))]);
  for (const size of [1, 2, 3, 5, 7, wire.length]) {
    const reader = grpc.createMessageReader({ maxMessageBytes: 16 });
    const seen = [];
    for (let offset = 0; offset < wire.length; offset += size) seen.push(...reader.push(wire.subarray(offset, offset + size)).map((message) => message.toString()));
    reader.finish();
    assert.deepEqual(seen, ['a', '', 'xyz'], `chunks of ${size}`);
  }
});

test('the reader fails at the prefix: bad flag, compression and oversize never buffer a payload', () => {
  raises(() => grpc.createMessageReader({ maxMessageBytes: 16 }).push(bytes('0200000001ff')), 'BAD_PREFIX');
  raises(() => grpc.createMessageReader({ maxMessageBytes: 16 }).push(bytes('ff00000000')), 'BAD_PREFIX');
  raises(() => grpc.createMessageReader({ maxMessageBytes: 16 }).push(bytes('0100000001ff')), 'COMPRESSED');
  raises(() => grpc.createMessageReader({ maxMessageBytes: 10 }).push(bytes('000000000b')), 'TOO_LARGE');
  raises(() => grpc.createMessageReader({ maxMessageBytes: 10 }).push(bytes('00ffffffff')), 'TOO_LARGE');
  assert.equal(grpc.createMessageReader({ maxMessageBytes: 10 }).push(bytes('000000000a')).length, 0, 'exactly the limit is allowed');
});

test('finish reports a stream that ended inside a prefix or a payload', () => {
  const partialPrefix = grpc.createMessageReader({ maxMessageBytes: 16 });
  partialPrefix.push(bytes('0000'));
  raises(() => partialPrefix.finish(), 'TRUNCATED');
  const partialPayload = grpc.createMessageReader({ maxMessageBytes: 16 });
  partialPayload.push(bytes('000000000a0102'));
  raises(() => partialPayload.finish(), 'TRUNCATED');
  grpc.createMessageReader({ maxMessageBytes: 16 }).finish();
});

test('a violation after good messages delivers the good messages first and then stays sticky', () => {
  const reader = grpc.createMessageReader({ maxMessageBytes: 16 });
  const delivered = reader.push(Buffer.concat([grpc.frameMessage(Buffer.from('ok')), bytes('0900000001ff')]));
  assert.deepEqual(delivered.map((message) => message.toString()), ['ok']);
  raises(() => reader.push(Buffer.alloc(1)), 'BAD_PREFIX');
  raises(() => reader.finish(), 'BAD_PREFIX');
  const failed = grpc.createMessageReader({ maxMessageBytes: 4 });
  raises(() => failed.push(bytes('0000000009')), 'TOO_LARGE');
  raises(() => failed.push(Buffer.alloc(0)), 'TOO_LARGE');
});

test('parseTimeout follows the 1 to 8 digit grammar and rounds sub-millisecond units up', () => {
  const cases = { '1S': 1000, '250m': 250, '2H': 7200000, '3M': 180000, '1500u': 2, '1000u': 1, '1n': 1, '99999999n': 100, '0m': 0, '0S': 0, '99999999H': 359999996400000 };
  for (const [text, ms] of Object.entries(cases)) assert.equal(grpc.parseTimeout(text), ms, text);
  for (const bad of ['', '5', 'S', '123456789S', '-1S', '1.5S', '5s', ' 5S', '5S ', '5SS', '٣S', '5\n', undefined, null, 5, {}]) {
    raises(() => grpc.parseTimeout(bad), 'BAD_TIMEOUT');
  }
});

test('formatTimeout picks the finest unit that fits eight digits and round trips through parseTimeout', () => {
  assert.equal(grpc.formatTimeout(0), '0m');
  assert.equal(grpc.formatTimeout(1500), '1500m');
  assert.equal(grpc.formatTimeout(99999999), '99999999m');
  assert.equal(grpc.formatTimeout(100000000), '100000S');
  assert.equal(grpc.formatTimeout(99999999000), '99999999S');
  assert.equal(grpc.formatTimeout(99999999001), '1666667M');
  assert.equal(grpc.formatTimeout(6000000000000), '1666667H');
  assert.equal(grpc.formatTimeout(Number.MAX_SAFE_INTEGER), '99999999H');
  for (const ms of [0, 1, 999, 1500, 99999999, 100000000]) assert.ok(grpc.parseTimeout(grpc.formatTimeout(ms)) >= ms);
  for (const bad of [-1, 1.5, '5', undefined, Number.NaN, 2 ** 53]) raises(() => grpc.formatTimeout(bad), 'BAD_TIMEOUT');
});

test('grpc-message percent-encoding escapes controls, non-ASCII and the percent sign only', () => {
  assert.equal(grpc.encodeStatusMessage('plain text ~!'), 'plain text ~!');
  assert.equal(grpc.encodeStatusMessage('a b%é\n'), 'a b%25%C3%A9%0A');
  assert.equal(grpc.encodeStatusMessage('\u007f'), '%7F');
  assert.equal(grpc.encodeStatusMessage(42), '42');
  assert.equal(grpc.decodeStatusMessage('a b%25%C3%A9%0A'), 'a b%é\n');
  assert.equal(grpc.decodeStatusMessage('100%'), '100%');
  assert.equal(grpc.decodeStatusMessage('%zz%4'), '%zz%4');
  assert.equal(grpc.decodeStatusMessage('%e2%82%ac'), '€');
  const text = 'ünïcode ✓ 100% «x»';
  assert.equal(grpc.decodeStatusMessage(grpc.encodeStatusMessage(text)), text);
});

test('only application/grpc and application/grpc+proto count as gRPC content types', () => {
  for (const good of ['application/grpc', 'application/grpc+proto', 'Application/GRPC']) assert.equal(grpc.isGrpcContentType(good), true, good);
  for (const bad of ['application/json', 'application/grpc+json', 'application/grpc-web', 'application/grpc; charset=utf-8', 'text/plain', '', undefined, null, 5]) {
    assert.equal(grpc.isGrpcContentType(bad), false, String(bad));
  }
});

test('request metadata is normalized and reserved or malformed entries are refused', () => {
  assert.deepEqual(grpc.normalizeMetadata(undefined), {});
  assert.deepEqual(grpc.normalizeMetadata({ 'x-client-tag': 'demo', a: 'b c' }), { 'x-client-tag': 'demo', a: 'b c' });
  for (const reserved of ['grpc-timeout', 'grpc-status', 'content-type', 'te', 'user-agent', ':path', 'Upper', 'x-bin', 'x-data-bin', '', '-x', `x${'y'.repeat(64)}`, 'host', 'content-length']) {
    raises(() => grpc.normalizeMetadata({ [reserved]: 'v' }), 'BAD_METADATA');
  }
  for (const bad of [null, 'x', 5, []]) raises(() => grpc.normalizeMetadata(bad), 'BAD_METADATA');
  for (const value of [5, null, 'line\nbreak', 'é', 'x'.repeat(257)]) raises(() => grpc.normalizeMetadata({ x: value }), 'BAD_METADATA');
  raises(() => grpc.normalizeMetadata(Object.fromEntries(Array.from({ length: 17 }, (_, index) => [`k${index}`, 'v']))), 'BAD_METADATA');
});

test('GrpcError carries the status a handler wants and GrpcFramingError a typed code', () => {
  const failure = new grpc.GrpcError(grpc.STATUS.NOT_FOUND, 'nothing here');
  assert.equal(failure.grpcCode, 5);
  assert.equal(failure.name, 'GrpcError');
  assert.equal(new grpc.GrpcFramingError('X', 'm').name, 'GrpcFramingError');
});
