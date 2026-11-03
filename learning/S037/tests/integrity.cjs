'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const lesson = path.resolve(__dirname, '..');
const integrityPath = path.join(lesson, 'evidence', 'integrity.json');
function collect(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      if (target === integrityPath) return [];
      assert.ok(!entry.isSymbolicLink(), 'Owned evidence must not contain links.');
      return entry.isDirectory() ? collect(target) : [target];
    }).sort();
}
const files = collect(lesson).map((file) => ({
  path: path.relative(lesson, file),
  bytes: fs.statSync(file).size,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
}));
if (process.env.CAPTURE_INTEGRITY_EVIDENCE === '1') {
  if (fs.existsSync(integrityPath)) throw new Error('Integrity proof already exists.');
  fs.writeFileSync(integrityPath, `${JSON.stringify({
    schemaVersion: 1, cardId: 'A-S037', capturedAtUtc: new Date().toISOString(),
    scope: 'Every owned lesson file except this self-describing digest file.',
    files,
  }, null, 2)}\n`, { flag: 'wx' });
} else {
  const expected = JSON.parse(fs.readFileSync(integrityPath, 'utf8'));
  assert.equal(expected.cardId, 'A-S037');
  assert.deepEqual(files, expected.files);
}
console.log(`Integrity OK: ${files.length} owned files; ${process.env.CAPTURE_INTEGRITY_EVIDENCE === '1' ? 'deliberately captured' : 'read-only verification'}.`);
