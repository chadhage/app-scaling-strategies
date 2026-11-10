'use strict';

// The scanner is a test tool, so it gets its own controls: every encoding the sweep plants is found by it (positive), a different canary is not
// (negative), and a canary split across chunks is found by the stream scanner and missed by the per-chunk control.
const test = require('node:test');
const assert = require('node:assert/strict');
const { ENCODERS, scan, createStreamScanner, scanChunksSeparately } = require('./scanner.cjs');
const { canaryList, seedConfig } = require('./canaries.cjs');

const canaries = canaryList(seedConfig());
const [first, second] = canaries;

test('every encoder is found by the scanner, with the right canary id, and a different canary is not reported', () => {
  assert.ok(Object.keys(ENCODERS).length >= 20);
  for (const [name, encode] of Object.entries(ENCODERS)) {
    for (const canary of [first, canaries.find((entry) => entry.id === 'connection-string'), canaries.find((entry) => entry.id === 'phone-operator')]) {
      const hits = scan(`prefix ${encode(canary.value)} suffix`, canaries);
      assert.ok(hits.some((hit) => hit.id === canary.id), `${name}: ${canary.id} found`);
    }
    assert.equal(scan(`prefix ${encode(first.value)} suffix`, [second]).length, 0, `${name}: the other canary is not reported`);
  }
});

test('the stream scanner finds a canary split across one-byte chunks; the per-chunk control does not', () => {
  const bytes = Buffer.from(`noise ${first.value} noise ${Buffer.from(second.value).toString('base64')} noise`);
  const chunks = [...bytes].map((byte) => Buffer.from([byte]));
  const stream = createStreamScanner([first, second]);
  for (const chunk of chunks) stream.push(chunk);
  assert.deepEqual([...new Set(stream.hits().map((hit) => hit.id))].sort(), [first.id, second.id].sort());
  assert.deepEqual(scanChunksSeparately(chunks, [first, second]), [], 'a per-chunk scan sees nothing');
  assert.ok(scan(bytes, [first, second]).length > 0, 'the reassembled bytes do');
  assert.deepEqual(createStreamScanner([first]).hits(), [], 'nothing pushed, nothing found');
});

test('the scanner reports ids and form names only, never a value', () => {
  const hits = scan(first.value, canaries);
  assert.ok(hits.length > 0 && hits.every((hit) => Object.keys(hit).sort().join() === 'form,id'));
  assert.ok(!JSON.stringify(hits).includes(first.value));
});
