'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') throw new Error('Intentional sealing requires exact CAPTURE_BROWSER_EVIDENCE=1.');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function walk(directory, prefix = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error('Owned source seals do not traverse junctions or symlinks.');
    const relative = path.join(prefix, entry.name);
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(target, relative);
    if (relative === path.join('evidence', 'source-hashes.json')) return [];
    const bytes = fs.readFileSync(target);
    return [{ path: relative, bytes: bytes.length, sha256: sha(bytes) }];
  });
}
const sealedAtUtc = new Date().toISOString();
const seal = {
  schemaVersion: 1, cardId: 'A-S128', sealedAtUtc, artifacts: walk(__dirname),
  rawBytesPreserved: true, canonicalGitSeparate: true, normalVerificationReadOnly: true,
};
const relative = path.join('evidence', 'raw', `source-seal-${sealedAtUtc.replace(/[:.]/g, '-')}-${randomUUID()}.json`);
const bytes = Buffer.from(`${JSON.stringify(seal, null, 2)}\n`);
fs.writeFileSync(path.join(__dirname, relative), bytes, { flag: 'wx' });
const pointer = { schemaVersion: 1, seal: relative, sealSha256: sha(bytes), sealedFiles: seal.artifacts.length };
fs.writeFileSync(path.join(__dirname, 'evidence', 'source-hashes.json'), `${JSON.stringify(pointer, null, 2)}\n`);
console.log(JSON.stringify(pointer));
