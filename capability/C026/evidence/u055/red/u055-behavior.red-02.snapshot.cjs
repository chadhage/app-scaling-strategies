'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const subject = require('./u055-subject.cjs');

test('U055 n1: README states the 18-byte minimum and 3,639 complete requests per 64 KiB read', () => {
  const request = Buffer.from('GET / HTTP/1.1\r\n\r\n', 'latin1');
  assert.equal(request.length, 18);
  assert.equal(Math.floor(65536 / request.length), 3639);
  const readme = subject.text('README.md');
  assert.ok(readme.includes('18-byte `GET / HTTP/1.1\\r\\n\\r\\n`'), 'the documented minimum request');
  assert.ok(readme.includes('3,639 complete requests per 64 KiB read'), 'the documented per-read count');
  assert.ok(!readme.includes('about 1,000 of the smallest requests'), 'the false minimum-request claim is absent');
});

test('U055 n1: README attributes about 6 MB per socket, 0.8 GB at the cap, and the 32-socket stall to the review', () => {
  const readme = subject.text('README.md');
  for (const sentence of [
    'The accepted U040 review measured about 6 MB per socket for this shape, about 0.8 GB extrapolated at the 128-connection cap, and a 12 to 15 s event-loop stall with 32 such sockets.',
    'These are historical observations and an extrapolation, not a memory or latency guarantee.'
  ]) assert.ok(readme.includes(sentence), sentence);
});

test('U055 n1: the production drop-budget comment gives the corrected parser cost without a frozen-source claim', () => {
  const source = subject.text('server.cjs');
  assert.ok(source.includes('18-byte GET / HTTP/1.1 without Host: 3,639 complete requests per 64 KiB read'), 'the source comment states the actual minimum shape');
  assert.ok(!source.includes('about 1,000 of the smallest requests'), 'the stale source-comment claim is absent');
});

test('U055 n2: README states exact [T]+16 and [T]+17 transcript-answer loss in one write', () => {
  const readme = subject.text('README.md');
  const sentence = 'In one write, [T]+16 GETs gives [200] and no limit event; [T]+17 GETs gives [] and exactly one DROPPED_REQUEST_BACKLOG event: the transcript answer itself is lost.';
  assert.ok(readme.includes(sentence), 'the missing transcript-drop sentence and exact boundary');
  assert.ok(readme.includes('A held transcript follows the same 16/17 boundary; at 16 the connection remains open until the producer resolves or the peer closes it.'), 'the held-transcript boundary');
});

test('U055 n5: an informational-byte edit of the current last addendum fails by that addendum name', () => {
  const original = subject.read(subject.headPath);
  assert.ok(original !== null, 'the published chain has a last addendum');
  const changed = Buffer.from(original);
  const marker = Buffer.from('"item": "U');
  const at = changed.indexOf(marker);
  assert.ok(at >= 0, 'the informational item field exists');
  changed[at + marker.length] ^= 1;
  const verify = subject.verify((relative) => relative === subject.headPath ? changed : subject.read(relative));
  assert.equal(verify.ok, false, 'the old verifier silently accepted this informational-byte tamper');
  assert.ok(verify.errors.includes(`HEAD_BYTES_CHANGED ${subject.headPath}`), 'the failure identifies the last addendum');
});

test('U055 n6: the current command notes say four final flood variants and disclose the unavailable retained README', () => {
  const commands = subject.text('evidence\\u040-2\\COMMANDS.md');
  for (const sentence of [
    'The final suite and control have four flood variants: real, refuse, hold, expect.',
    'The first RED had three variants; the final RED added expect, whose survival test passed while its budget assertion failed.',
    'Retained attempt f2-loop-01-20x4 recorded an intermediate README.md (raw SHA-256 032309f138894613fb377fd16e983acd0247db0c2f8c09ab015f43d11b105349); no byte-exact copy was retained, so that input remains unavailable and unverified.'
  ]) assert.ok(commands.includes(sentence), sentence);
});
