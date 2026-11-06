'use strict';

// Test tooling, not production code: node --check over every JavaScript file of the namespace (the page scripts are also vm-loaded by page tests).
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return ['evidence', 'scratch', 'state'].includes(entry.name) ? [] : files(file);
    return /\.c?js$/.test(entry.name) ? [file] : [];
  });
}
const checked = files(root).sort();
let failed = 0;
for (const file of checked) {
  const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true, timeout: 30000 });
  if (run.status !== 0) {
    failed += 1;
    console.error(`SYNTAX FAIL ${path.relative(root, file)}\n${run.stderr}`);
  }
}
console.log(`C044 syntax: ${checked.length - failed}/${checked.length} files parse with node --check (${process.version}).`);
process.exitCode = failed ? 1 : 0;
