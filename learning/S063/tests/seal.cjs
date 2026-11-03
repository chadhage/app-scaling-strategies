'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const version = process.argv[2];
assert.match(version || '', /^\d{3}$/);
const folder = path.resolve(__dirname, '..');
const evidence = path.join(folder, 'evidence');
const active = `integrity-${version}.json`;
const pointer = path.join(evidence, 'integrity.json');
const target = path.join(evidence, active);
assert.equal(fs.existsSync(target), false, 'Integrity versions are append-only.');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    assert.equal(entry.isSymbolicLink(), false);
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const files = walk(folder).filter((file) => file !== pointer && file !== target)
  .sort().map((file) => {
    const relative = path.relative(folder, file);
    const raw = fs.readFileSync(file);
    const proof = relative.startsWith(`evidence${path.sep}raw${path.sep}`);
    const bytes = proof ? raw : Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    return {
      path: relative, mode: proof ? 'raw-proof-bytes' : 'canonical-lf-git-source',
      bytes: bytes.length, sha256: sha(bytes),
      gitBlobSha1: execFileSync('git', ['hash-object', `--path=${path.basename(file)}`, file], {
        cwd: path.dirname(file), encoding: 'utf8',
      }).trim(),
    };
  });
const index = {
  cardId: 'A-S063', kanoUnit: 'A-S063', packet: 'SC-S063', version,
  generatedAtUtc: new Date().toISOString(),
  exclusions: ['evidence\\integrity.json', `evidence\\${active}`],
  reason: 'Only the mutable active pointer and its current index are self-excluded. Older indexes and captured integrity receipts are covered by the final index.',
  files,
};
const raw = Buffer.from(`${JSON.stringify(index, null, 2)}\n`);
fs.writeFileSync(target, raw, { flag: 'wx' });
fs.writeFileSync(pointer, `${JSON.stringify({ active, sha256: sha(raw) }, null, 2)}\n`);
console.log(`Sealed ${active}: ${files.length} files; ${sha(raw)}. Normal tests do not write proof.`);
