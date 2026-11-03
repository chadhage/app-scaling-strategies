'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');

const owned = path.resolve(__dirname, '..');
function scripts(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'evidence') return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? scripts(file) : /\.(?:cjs|js)$/.test(entry.name) ? [file] : [];
  });
}
const files = scripts(owned);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, `${file}\n${result.stderr}`);
}
for (const name of ['manifest.json', 'evidence.json']) {
  const file = path.join(owned, name);
  if (fs.existsSync(file)) JSON.parse(fs.readFileSync(file, 'utf8'));
}
console.log(JSON.stringify({ verifier: 'PASS', syntaxFiles: files.map((file) => path.relative(owned, file)), redSnapshotsExcluded: true }, null, 2));
