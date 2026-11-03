'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
assert.notEqual(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Normal verification is read-only to proof; deliberately capture separately.');
assert.notEqual(process.env.CAPTURE_SOURCE_INTEGRITY, '1', 'Normal verification never re-seals proof.');
function proof(directory) {
  return Object.fromEntries(fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? Object.entries(proof(file))
      : [[file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]];
  }));
}
const before = proof(__dirname);
const commands = [
  ['--test', '--test-reporter=tap', ...[
    'model.test.cjs', 'surface.test.cjs', 'red-evidence.test.cjs', 'integrity.test.cjs', 'browser.cjs',
  ].map((file) => path.join(__dirname, 'tests', file))],
  [path.join(__dirname, 'tests', 'syntax.cjs')],
  [path.join(__dirname, 'tests', 'tooling.cjs')],
];
let status = 0;
try {
  for (const args of commands) {
    const result = spawnSync(process.execPath, args, {
      cwd: path.resolve(__dirname, '..', '..'), stdio: 'inherit', timeout: 180000,
    });
    if (result.error || result.status !== 0) {
      status = 1;
      console.error(result.error?.message || `Verification command exited ${result.status}.`);
      break;
    }
  }
} finally {
  assert.deepEqual(proof(__dirname), before, 'Ordinary verification must not modify, create or remove proof/source files.');
}
console.log(JSON.stringify({ cardId: 'A-S058', focusedVerification: status === 0 ? 'passed' : 'failed', proofUnchanged: true }));
process.exitCode = status;
