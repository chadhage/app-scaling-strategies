'use strict';

// F1 (review of the first publication): a pinned file of another namespace is accepted in its LF form (fresh checkout, git archive) and in its
// CRLF form (owner tree), and refused when one byte changed, when the endings are mixed or when a pin is forged. Built from fixtures in memory.
const test = require('node:test');
const assert = require('node:assert/strict');
const { sha, lf, crlf, problems } = require('.\\pins-check.cjs');

const text = Buffer.from('const a = 1;\nconst b = 2;\nmodule.exports = a + b;\n');
const entryFor = (bytes, overrides = {}) => ({ card: 'C044', path: 'capability\\C044\\reducer.js', rawSha256: sha(crlf(bytes)), crlfToLfSha256: sha(lf(bytes)), acceptedGitSha256: sha(lf(bytes)), ...overrides });
const documentOf = (entry) => ({ dependencies: [entry], own: [] });
const check = (entry, working, accepted = lf(text)) => problems(documentOf(entry), () => working, () => accepted);
const flip = (bytes) => Buffer.from(bytes.toString('latin1').replace('b = 2', 'b = 3'), 'latin1');

test('the LF form and the CRLF form of an imported file both match the pin', () => {
  const pin = entryFor(text);
  assert.deepEqual(check(pin, lf(text)), [], 'LF form (fresh checkout)');
  assert.deepEqual(check(pin, crlf(text)), [], 'CRLF form (owner tree)');
  assert.notEqual(sha(lf(text)), sha(crlf(text)));
});

test('one changed byte is refused in the LF form and in the CRLF form', () => {
  const pin = entryFor(text);
  for (const [name, bytes] of [['LF', flip(lf(text))], ['CRLF', flip(crlf(text))]]) {
    assert.match(check(pin, bytes).join('\n'), /bytes differ from the pin/, name);
    assert.match(check(pin, bytes).join('\n'), /LF form differs from the pin/, name);
  }
});

test('mixed line endings are neither form', () => {
  const mixed = Buffer.concat([crlf(text).subarray(0, 14), lf(text).subarray(14)]);
  assert.notEqual(sha(mixed), sha(lf(text)));
  assert.notEqual(sha(mixed), sha(crlf(text)));
  assert.match(check(entryFor(text), mixed).join('\n'), /bytes differ from the pin/);
});

test('a forged raw pin is reported whichever form the working copy has', () => {
  const forged = entryFor(text, { rawSha256: '0'.repeat(64) });
  for (const working of [lf(text), crlf(text)]) assert.match(check(forged, working).join('\n'), /the raw pin is neither the LF nor the CRLF form/);
});

test('a pin that disagrees with the accepted blob, and a blob that disagrees with the pin, are reported', () => {
  assert.match(check(entryFor(text, { acceptedGitSha256: '1'.repeat(64) }), lf(text)).join('\n'), /pin does not match the accepted git blob/);
  assert.match(check(entryFor(text), lf(text), flip(lf(text))).join('\n'), /pin does not match the accepted git blob/);
  assert.match(check(entryFor(text, { crlfToLfSha256: sha(flip(text)) }), lf(text)).join('\n'), /LF form differs from the pin/);
});

test('an own pin stays byte-exact', () => {
  const own = Buffer.from('a\nb\n');
  const pin = { path: 'capability\\X001\\saved.js', rawSha256: sha(own) };
  assert.deepEqual(problems({ dependencies: [], own: [pin] }, () => own, () => null), []);
  assert.match(problems({ dependencies: [], own: [pin] }, () => crlf(own), () => null).join('\n'), /own pin differs/);
});
