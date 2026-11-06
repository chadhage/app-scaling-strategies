'use strict';

// Test tooling, not production code: syntax-checks every JavaScript file of the namespace without running it.
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');

function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'raw' ? [] : files(file);
    return /\.c?js$/.test(entry.name) ? [file] : [];
  });
}

const checked = [];
for (const file of files(root).sort()) {
  const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true });
  if (run.status !== 0) {
    console.error(`SYNTAX ERROR ${path.relative(root, file)}\n${run.stderr}`);
    process.exitCode = 1;
  } else {
    checked.push(path.relative(root, file));
  }
}
console.log(`C028 syntax: ${checked.length} JavaScript files parsed, no execution.`);
console.log(checked.join('\n'));
