'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lesson = path.resolve(__dirname, '..');
const integrityPath = path.join(lesson, 'evidence', 'integrity.json');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (file === integrityPath) return [];
    assert.ok(!entry.isSymbolicLink(), 'Owned lesson evidence must not contain links.');
    return entry.isDirectory() ? collect(file) : [file];
  }).sort();
}
const files = collect(lesson).map((file) => ({
  path: path.relative(lesson, file), bytes: fs.statSync(file).size, sha256: hash(fs.readFileSync(file)),
}));
if (process.env.CAPTURE_INTEGRITY_EVIDENCE === '1') {
  if (fs.existsSync(integrityPath)) throw new Error('Refusing to overwrite historical integrity proof.');
  fs.writeFileSync(integrityPath, `${JSON.stringify({
    schemaVersion: 1, cardId: 'A-S039', capturedAtUtc: new Date().toISOString(),
    scope: 'Every owned lesson file except this self-describing digest file.', files,
  }, null, 2)}\n`, { flag: 'wx' });
} else {
  const proof = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
  assert.equal(proof.cardId, 'A-S039');
  assert.deepEqual(files, proof.files);
}
console.log(`Integrity OK: ${files.length} owned files; ${process.env.CAPTURE_INTEGRITY_EVIDENCE === '1' ? 'deliberately captured' : 'read-only verification'}.`);
