'use strict';
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const checker = require(process.env.U007_CURRENT_VERIFIER || './u007-current-evidence.cjs');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => fs.readFileSync(path.join(root, file));
test('U007-E002: append-only authority verifies repaired production while preserving the original index and captures', () => {
  assert.equal(sha(read('evidence\\u007\\capture-index.json')), '896cf0c32a87ca3b4db487628dfd48498076638cfb14bb6151a1cdd010c2a82e');
  assert.deepEqual(checker.verify(root), [], 'current production needs a separate authority, not a rewritten historical seal or stale source pin');
});
test('U007-E003: every current source, retained predecessor and authority byte has a named tamper refusal', () => {
  const base = JSON.parse(read('evidence\\u007\\amendments\\authority-base.json'));
  const addendum = JSON.parse(read('evidence\\u007\\amendments\\authority-addendum-1.json'));
  const targets = [...base.originals.map((entry) => entry.retained), ...addendum.amendments.map((entry) => entry.path),
    ...addendum.files.map((entry) => entry.path), addendum.helper.path,
    'evidence\\u007\\amendments\\authority-base.json',
    'evidence\\u007\\amendments\\authority-addendum-1.json',
    'evidence\\u007\\amendments\\authority-head-1.json'];
  for (const target of new Set(targets)) {
    const changed = Buffer.from(read(target)); changed[Math.floor(changed.length / 2)] ^= 1;
    const failures = checker.verify(root, (file) => file === target ? changed : read(file));
    assert.ok(failures.some((failure) => /PIN_CHANGED|AUTHORITY_|ORIGINAL_CHANGED/.test(failure)), target);
  }
});
test('U007-E004: raw or exact LF provenance is accepted but a mixed newline rewrite is not', () => {
  for (const file of ['scratch.cjs', 'scratch-session.cjs']) {
    const raw = read(file), lf = Buffer.from(raw.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
    assert.deepEqual(checker.verify(root, (target) => target === file ? lf : read(target)), []);
    const crlf = Buffer.from(lf.toString('latin1').replace(/\n/g, '\r\n'), 'latin1');
    const text = crlf.toString('latin1'), first = text.indexOf('\r\n');
    assert.ok(first >= 0);
    const mixed = Buffer.from(text.slice(0, first) + '\n' + text.slice(first + 2), 'latin1');
    assert.ok(checker.verify(root, (target) => target === file ? mixed : read(target)).some((failure) => failure.includes('PIN_CHANGED:' + file)));
  }
});
test('U007-E005: malformed and missing current authority is an explicit refusal rather than historical fallback', () => {
  const target = 'evidence\\u007\\amendments\\authority-head-1.json';
  assert.ok(checker.verify(root, (file) => file === target ? Buffer.from('{') : read(file)).some((failure) => failure.startsWith('AUTHORITY_JSON:')));
  assert.ok(checker.verify(root, (file) => { if (file === target) throw Object.assign(Error('missing'), { code: 'ENOENT' }); return read(file); })
    .some((failure) => failure.startsWith('AUTHORITY_MISSING:')));
});
