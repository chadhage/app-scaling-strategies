'use strict';

// Test tooling, not production code: `node --check` on every JavaScript file of the namespace (evidence and scratch excluded).
// Exits 1 on the first syntax error; prints one line per file.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const files = [];
const walk = (directory) => {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) { if (!['evidence', 'scratch', 'data'].includes(entry.name)) walk(full); } else if (/\.c?js$/.test(entry.name)) files.push(full);
  }
};
walk(root);
let failed = 0;
for (const file of files.sort()) {
  const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (run.status !== 0) { failed += 1; console.log(`FAIL ${path.relative(root, file)}\n${run.stderr}`); } else console.log(`OK   ${path.relative(root, file)}`);
}
console.log(`${files.length - failed} of ${files.length} files pass node --check`);
process.exitCode = failed === 0 ? 0 : 1;
