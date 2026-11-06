'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const framing = require('../framing.cjs');

const hex = (text) => Buffer.from(text.replaceAll(' ', ''), 'hex');
const server = () => framing.createParser({ requireMask: true });
const client = () => framing.createParser({ requireMask: false });
const KEY = Buffer.from([0x37, 0xfa, 0x21, 0x3d]);
const masked = (opcode, payload, fin = true) => framing.encodeFrame({ opcode, payload, fin, maskKey: KEY });

function rejects(action, code, closeCode) {
  assert.throws(action, (error) => error instanceof framing.FramingError && error.code === code && error.closeCode === closeCode,
    `expected ${code}/${closeCode}`);
}

test('RFC 6455 examples: handshake accept key, unmasked and masked text frames', () => {
  assert.equal(framing.acceptKey('dGhlIHNhbXBsZSBub25jZQ=='), 's3pPLMBiTxaQ9kYGzzhZRbK+xOo=');
  assert.deepEqual(framing.encodeFrame({ opcode: framing.OPCODES.text, payload: 'Hello' }), hex('81 05 48 65 6c 6c 6f'));
  assert.deepEqual(masked(framing.OPCODES.text, 'Hello'), hex('81 85 37 fa 21 3d 7f 9f 4d 51 58'));
  assert.deepEqual(server().push(hex('81 85 37 fa 21 3d 7f 9f 4d 51 58')), [{ type: 'text', text: 'Hello' }]);
  assert.deepEqual(client().push(hex('81 05 48 65 6c 6c 6f')), [{ type: 'text', text: 'Hello' }]);
});

test('RFC 6455 examples: fragmented text, ping and pong with a payload', () => {
  assert.deepEqual(client().push(hex('01 03 48 65 6c 80 02 6c 6f')), [{ type: 'text', text: 'Hello' }]);
  assert.deepEqual(client().push(hex('89 05 48 65 6c 6c 6f')), [{ type: 'ping', data: Buffer.from('Hello') }]);
  assert.deepEqual(server().push(hex('8a 85 37 fa 21 3d 7f 9f 4d 51 58')), [{ type: 'pong', data: Buffer.from('Hello') }]);
});

test('16-bit and 64-bit length forms round trip and match the RFC 6455 examples', () => {
  const medium = Buffer.alloc(256, 7);
  const large = Buffer.alloc(65536, 9);
  const mediumFrame = framing.encodeFrame({ opcode: framing.OPCODES.binary, payload: medium });
  const largeFrame = framing.encodeFrame({ opcode: framing.OPCODES.binary, payload: large });
  assert.deepEqual(mediumFrame.subarray(0, 4), hex('82 7e 01 00'));
  assert.deepEqual(largeFrame.subarray(0, 10), hex('82 7f 00 00 00 00 00 01 00 00'));
  assert.deepEqual(client().push(mediumFrame), [{ type: 'binary', data: medium }]);
  assert.deepEqual(framing.createParser({ requireMask: false, maxMessageBytes: 70000 }).push(largeFrame), [{ type: 'binary', data: large }]);
});

test('a parser accepts frames split at every byte and several frames in one chunk', () => {
  const frame = masked(framing.OPCODES.text, '{"type":"hello"}');
  const parser = server();
  const seen = [];
  for (const byte of frame) seen.push(...parser.push(Buffer.from([byte])));
  assert.deepEqual(seen, [{ type: 'text', text: '{"type":"hello"}' }]);
  assert.deepEqual(server().push(Buffer.concat([frame, masked(framing.OPCODES.text, 'x'), masked(framing.OPCODES.ping, '')])),
    [{ type: 'text', text: '{"type":"hello"}' }, { type: 'text', text: 'x' }, { type: 'ping', data: Buffer.alloc(0) }]);
});

test('control frames may interleave a fragmented message; binary fragments reassemble', () => {
  const parser = server();
  const messages = parser.push(Buffer.concat([
    masked(framing.OPCODES.text, 'He', false), masked(framing.OPCODES.ping, 'p'), masked(framing.OPCODES.continuation, 'llo')
  ]));
  assert.deepEqual(messages, [{ type: 'ping', data: Buffer.from('p') }, { type: 'text', text: 'Hello' }]);
  assert.deepEqual(server().push(Buffer.concat([
    masked(framing.OPCODES.binary, Buffer.from([1, 2]), false), masked(framing.OPCODES.continuation, Buffer.from([3]))
  ])), [{ type: 'binary', data: Buffer.from([1, 2, 3]) }]);
});

test('close frames carry a valid code and a UTF-8 reason; an empty close has no status', () => {
  assert.deepEqual(client().push(framing.encodeClose(1008, 'ACK_UNSENT')), [{ type: 'close', code: 1008, reason: 'ACK_UNSENT' }]);
  assert.deepEqual(server().push(framing.encodeClose(1000, '', KEY)), [{ type: 'close', code: 1000, reason: '' }]);
  assert.deepEqual(framing.parseClosePayload(Buffer.alloc(0)), { code: 1005, reason: '' });
  assert.deepEqual(framing.parseClosePayload(Buffer.from([0x03, 0xe9])), { code: 1001, reason: '' });
  rejects(() => framing.parseClosePayload(Buffer.from([3])), 'INVALID_CLOSE_PAYLOAD', 1002);
  for (const code of [999, 1004, 1005, 1006, 1015, 1016, 2999, 5000]) {
    const payload = Buffer.alloc(2);
    payload.writeUInt16BE(code);
    rejects(() => framing.parseClosePayload(payload), 'INVALID_CLOSE_CODE', 1002);
  }
  rejects(() => framing.parseClosePayload(Buffer.from([0x03, 0xe8, 0xff, 0xfe])), 'INVALID_UTF8', 1007);
});

test('encoders refuse what RFC 6455 forbids', () => {
  assert.throws(() => framing.encodeFrame({ opcode: 3, payload: '' }), TypeError);
  assert.throws(() => framing.encodeFrame({ opcode: framing.OPCODES.text, payload: '', maskKey: Buffer.alloc(3) }), TypeError);
  assert.throws(() => framing.encodeFrame({ opcode: framing.OPCODES.text, payload: '', maskKey: 'abcd' }), TypeError);
  rejects(() => framing.encodeFrame({ opcode: framing.OPCODES.ping, payload: Buffer.alloc(126) }), 'INVALID_CONTROL_FRAME', 1002);
  rejects(() => framing.encodeFrame({ opcode: framing.OPCODES.pong, payload: '', fin: false }), 'INVALID_CONTROL_FRAME', 1002);
  assert.throws(() => framing.encodeClose(1005), TypeError);
  assert.throws(() => framing.encodeClose(1000, 'x'.repeat(124)), TypeError);
  assert.equal(framing.encodeClose(1000, 'x'.repeat(123)).length, 2 + 2 + 123);
  for (const key of [undefined, 42, 'short', 'dGhlIHNhbXBsZSBub25jZQ', 'dGhlIHNhbXBsZSBub25jZQ===']) {
    rejects(() => framing.acceptKey(key), 'INVALID_KEY', 1002);
  }
});

test('the parser demands an explicit role', () => {
  assert.throws(() => framing.createParser(), TypeError);
  assert.throws(() => framing.createParser({ requireMask: 'yes' }), TypeError);
});

test('protocol violations map to the RFC 6455 close codes', () => {
  rejects(() => server().push(hex('81 05 48 65 6c 6c 6f')), 'UNMASKED_CLIENT_FRAME', 1002);
  rejects(() => client().push(hex('81 85 37 fa 21 3d 7f 9f 4d 51 58')), 'MASKED_SERVER_FRAME', 1002);
  for (const first of [0xc1, 0xa1, 0x91]) rejects(() => server().push(Buffer.from([first, 0x80, 0, 0, 0, 0])), 'RESERVED_BITS_SET', 1002);
  for (const opcode of [0x3, 0x7, 0xb, 0xf]) rejects(() => server().push(Buffer.from([0x80 | opcode, 0x80, 0, 0, 0, 0])), 'UNKNOWN_OPCODE', 1002);
  rejects(() => server().push(masked(framing.OPCODES.continuation, 'x')), 'UNEXPECTED_CONTINUATION', 1002);
  rejects(() => server().push(Buffer.concat([masked(framing.OPCODES.text, 'a', false), masked(framing.OPCODES.text, 'b')])), 'FRAGMENT_INTERLEAVED', 1002);
  rejects(() => server().push(Buffer.from([0x09, 0x80, 0, 0, 0, 0])), 'INVALID_CONTROL_FRAME', 1002);
  rejects(() => server().push(Buffer.from([0x89, 0xfe, 0x00, 0x7e, 0, 0, 0, 0])), 'INVALID_CONTROL_FRAME', 1002);
  rejects(() => server().push(masked(framing.OPCODES.text, Buffer.from([0xc3, 0x28]))), 'INVALID_UTF8', 1007);
  rejects(() => server().push(masked(framing.OPCODES.close, Buffer.from([0x03]))), 'INVALID_CLOSE_PAYLOAD', 1002);
});

test('lengths must be minimal, below the 63-bit limit and within the configured maximum', () => {
  rejects(() => client().push(hex('82 7e 00 05 01 02 03 04 05')), 'NON_MINIMAL_LENGTH', 1002);
  rejects(() => client().push(hex('82 7f 00 00 00 00 00 00 ff ff')), 'NON_MINIMAL_LENGTH', 1002);
  rejects(() => client().push(hex('82 7f 80 00 00 00 00 01 00 00')), 'INVALID_LENGTH', 1002);
  rejects(() => framing.createParser({ requireMask: false, maxMessageBytes: 70000 }).push(hex('82 7f 00 00 00 00 00 02 00 00')), 'MESSAGE_TOO_BIG', 1009);
  rejects(() => framing.createParser({ requireMask: false, maxMessageBytes: 100 }).push(hex('82 7e 01 00')), 'MESSAGE_TOO_BIG', 1009);
  rejects(() => framing.createParser({ requireMask: false, maxMessageBytes: 4 }).push(hex('81 05 48 65 6c 6c 6f')), 'MESSAGE_TOO_BIG', 1009);
  const limited = framing.createParser({ requireMask: true, maxMessageBytes: 4 });
  rejects(() => limited.push(Buffer.concat([masked(framing.OPCODES.text, 'abc', false), masked(framing.OPCODES.continuation, 'de')])), 'MESSAGE_TOO_BIG', 1009);
});

test('a parser that failed keeps failing with the same error', () => {
  const parser = server();
  let first;
  try { parser.push(hex('81 05 48 65 6c 6c 6f')); } catch (error) { first = error; }
  assert.equal(first.code, 'UNMASKED_CLIENT_FRAME');
  assert.throws(() => parser.push(masked(framing.OPCODES.text, 'ok')), (error) => error === first);
});

test('an oversized frame is refused from its header, before its payload is buffered', () => {
  const parser = framing.createParser({ requireMask: true, maxMessageBytes: 16 });
  rejects(() => parser.push(Buffer.from([0x81, 0xfe, 0x10, 0x00])), 'MESSAGE_TOO_BIG', 1009);
});
