'use strict';

// Mutant M20 (the base64 guard of the shell answer dropped) was the one survivor of the mutation run of the second fix. It is NOT
// equivalent: Node's base64 decoder skips every character outside the alphabet, so without the guard an answer with a stray
// character or embedded whitespace would be decoded around it. The guard must refuse such an answer as "not base64".
const assert = require('node:assert/strict');
const test = require('node:test');
const { decodeInspection } = require('../adapters.cjs');

const good = Buffer.from(JSON.stringify({ status: 'Valid', fileVersion: '156.0.4314.58' }), 'utf8').toString('base64');

test('M20: a character outside the base64 alphabet anywhere inside the shell answer is refused as not base64, never decoded around', () => {
  const bad = [`!${good}`, `${good}!`, `${good.slice(0, 6)} ${good.slice(6)}`, `${good.slice(0, 4)}\n${good.slice(4)}`, `${good.slice(0, 8)}\u00e9${good.slice(8)}`, `${good.slice(0, 5)}-${good.slice(5)}`];
  for (const answer of bad) {
    assert.throws(() => decodeInspection(answer), { code: 'INSPECT_OUTPUT_INVALID', message: 'the shell answer is not base64' }, JSON.stringify(answer));
  }
});

test('M20: outer whitespace around a good answer is trimmed and the answer decodes', () => {
  assert.equal(decodeInspection(` \r\n${good}\r\n`).status, 'Valid');
  assert.equal(decodeInspection(good).fileVersion, '156.0.4314.58');
});
