'use strict';

// Gaps that the hand list of argument and iteration mutants (hand-mutants.cjs) found in the suite as it stood before the review fix, each closed by a
// test of its own. They are NOT in an older file on purpose: a test file that killed a mutant of an earlier pass stays byte-identical.
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { createIdentity } = require('../identity.cjs');
const { manualClock, seededBytes } = require('./helpers.cjs');

test('a token is judged by its WHOLE shape: a live token with something before it, after it or around it is malformed, never merely unknown', () => {
  const identity = createIdentity({ now: manualClock().now, randomBytes: seededBytes('gap-token') });
  const { token } = identity.startAnonymous();
  assert.equal(identity.authenticate(token).ok, true, 'the token itself is accepted');
  const wrapped = [`x${token}`, `c022_${token}`, ` ${token}`, `\n${token}`, `${token}x`, `${token}\n`, `${token} `, `${token}${token}`, token.slice(1), token.slice(0, -1)];
  for (const candidate of wrapped) assert.deepEqual(identity.authenticate(candidate), { ok: false, code: 'TOKEN_MALFORMED' }, JSON.stringify(candidate));
  assert.deepEqual(identity.authenticate(`${token.slice(0, -1)}!`), { ok: false, code: 'TOKEN_MALFORMED' }, 'a character outside the alphabet');
  assert.deepEqual(identity.authenticate(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`), { ok: false, code: 'TOKEN_UNKNOWN' }, 'a well-formed token that was never issued is unknown, the one answer left');
});
