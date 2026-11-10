'use strict';

// Test tooling, not production code: writes evidence/seal.json LAST (flag wx, so it can never be rewritten): the SHA-256 (raw and
// LF-normalized) of the README, the feature, imports.json, every production file, every file under tests\ and every evidence file that no
// recorder manifest pins by itself (sealedEvidence: the manifests, the mutation, loop and fresh figures, the retained snapshots, the stub).
// evidence.test.cjs recomputes it.
//   node capability\C022\tests\seal.cjs
const fs = require('node:fs');
const path = require('node:path');
const { PRODUCTION, lf, sealedEvidence, sha } = require('./evidence-verify.cjs');

const root = path.resolve(__dirname, '..');
const names = [...PRODUCTION, 'README.md', 'C022.feature', 'imports.json', ...fs.readdirSync(__dirname).filter((name) => /\.c?js$/.test(name)).map((name) => `tests/${name}`), ...sealedEvidence(root)].sort();
const files = {};
const lfs = {};
for (const name of names) {
  const bytes = fs.readFileSync(path.join(root, name));
  files[name] = sha(bytes);
  lfs[name] = sha(lf(bytes));
}
fs.writeFileSync(path.join(root, 'evidence', 'seal.json'), `${JSON.stringify({ schemaVersion: 1, note: 'written last by tests/seal.cjs; a consistent rewrite of seal plus inputs is not detectable by this test (the published commit is the anchor)', files, lf: lfs }, null, 1)}\n`, { flag: 'wx' });
console.log(`sealed ${names.length} files`);
