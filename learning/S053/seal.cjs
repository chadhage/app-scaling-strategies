'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
assert.equal(process.env.CAPTURE_SOURCE_INTEGRITY, '1', 'Sealing is deliberate only: CAPTURE_SOURCE_INTEGRITY=1.');
const folder = __dirname;
const evidence = path.join(folder, 'evidence');
const pointerName = path.join('evidence', 'content-hashes.json');
const previous = fs.readdirSync(evidence)
  .map((file) => file.match(/^content-hashes-(\d{3})\.json$/)?.[1])
  .filter(Boolean).map(Number);
const sequence = Math.max(0, ...previous) + 1;
assert.ok(sequence < 1000, 'Integrity index bound exceeded.');
const name = `content-hashes-${String(sequence).padStart(3, '0')}.json`;
const currentName = path.join('evidence', name);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))
    .flatMap((entry) => {
      const file = path.join(directory, entry.name);
      assert.equal(entry.isSymbolicLink(), false, `No linked scope: ${file}`);
      return entry.isDirectory() ? walk(file) : [file];
    });
}
const files = walk(folder)
  .filter((file) => ![pointerName, currentName].includes(path.relative(folder, file)))
  .map((file) => {
    const relative = path.relative(folder, file);
    const raw = fs.readFileSync(file);
    const mode = relative.startsWith(`evidence${path.sep}`) ? 'raw-proof-bytes' : 'canonical-git-lf-text';
    const bytes = mode === 'raw-proof-bytes' ? raw : Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    const gitBlobSha1 = createHash('sha1')
      .update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');
    return { path: relative, mode, bytes: bytes.length, sha256: hash(bytes), gitBlobSha1 };
  });
const index = {
  schemaVersion: 1, cardId: 'A-S053', packet: 'SC-S053', kanoUnit: 'A-S053',
  sealedAtUtc: new Date().toISOString(),
  policy: 'Canonical LF Git-source hashes for module code/docs; exact raw proof bytes, including CRLF source/RED snapshots. Earlier indexes remain immutable.',
  files,
};
const raw = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
fs.writeFileSync(path.join(evidence, name), raw, { flag: 'wx' });
fs.writeFileSync(path.join(evidence, 'content-hashes.json'), `${JSON.stringify({
  schemaVersion: 1, active: name, sha256: hash(raw),
  policy: 'Derived active-index pointer; updated only by deliberate sealing, never verification.',
}, null, 2)}\n`);
console.log(JSON.stringify({ active: name, files: files.length, sha256: hash(raw), sealedAtUtc: index.sealedAtUtc }));
