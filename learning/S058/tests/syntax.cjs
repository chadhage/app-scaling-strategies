'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const folder = path.resolve(__dirname, '..');
function scripts(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'evidence' ? [] : scripts(file);
    return /\.(?:js|cjs)$/.test(entry.name) ? [file] : [];
  });
}
const files = scripts(folder);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 15000 });
  assert.equal(result.error, undefined, file);
  assert.equal(result.status, 0, `${file}\n${result.stderr}`);
}
for (const file of ['manifest.json', 'evidence.json']) JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
console.log(JSON.stringify({ cardId: 'A-S058', syntax: 'passed', scripts: files.length, jsonDocuments: 2 }));
