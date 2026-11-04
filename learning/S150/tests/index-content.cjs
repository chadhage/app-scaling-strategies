'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  root, read, sha, canonical, git, blobHash, ownedFiles, gitAttributePath,
} = require('.\\provenance.cjs');
if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Only exact CAPTURE_BROWSER_EVIDENCE=1 permits deliberate initial integrity index capture.');
}
const destination = path.join(root, 'evidence', 'content-index.json');
if (fs.existsSync(destination)) throw new Error('Refusing to overwrite the original content index.');
const entries = ownedFiles().map((file) => {
  const raw = read(file);
  const byteExact = /\.(?:raw|raw\.json|snapshot|gz)$/.test(file);
  const clean = byteExact ? raw : canonical(raw);
  const repositoryPath = gitAttributePath(file);
  const observedBlob = git(['hash-object', `--path=${repositoryPath}`, '--stdin'], raw).toString().trim();
  if (observedBlob !== blobHash(clean)) throw new Error(`Declared Git-clean bytes differ: ${file}`);
  return { file, gitAttributePath: repositoryPath, byteExact,
    rawSha256: sha(raw), canonicalSha256: sha(clean), gitBlobId: observedBlob };
});
fs.writeFileSync(destination, `${JSON.stringify({
  schemaVersion: 1, cardId: 'A-S150', capturedAtUtc: new Date().toISOString(),
  captureExplicitlyEnabled: true, entries,
  policy: 'Original source/raw proof index; later exact-flag unique browser/focused captures are separately validated. Normal verification never writes.',
}, null, 2)}\n`, { flag: 'wx' });
console.log(`Original integrity index captured for ${entries.length} files with independent raw/canonical Git qualification.`);
