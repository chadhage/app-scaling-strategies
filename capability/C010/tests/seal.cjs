'use strict';

// Test tooling, not production code: writes evidence/seal.json LAST (flag wx, so it can never be rewritten): the SHA-256 (raw and LF-normalized) of
// the README, the feature, imports.json, every production file, every file under tests\ and every evidence file that no recorder manifest pins by
// itself. evidence.test.cjs recomputes it. Run it once, after every capture and after the README figures block was written.
//   node capability\C010\tests\seal.cjs
const fs = require('node:fs');
const path = require('node:path');
const { buildSeal } = require('./evidence-verify.cjs');

const root = path.resolve(__dirname, '..');
const seal = buildSeal(root);
fs.writeFileSync(path.join(root, 'evidence', 'seal.json'), `${JSON.stringify(seal, null, 1)}\n`, { flag: 'wx' });
console.log(`sealed ${Object.keys(seal.files).length} files`);
