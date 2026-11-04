'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? (entry.name === 'evidence' ? [] : files(path.join(directory, entry.name)))
      : [path.join(directory, entry.name)]);
}
const selected = files(root).filter((file) => /\.(js|cjs)$/.test(file));
for (const file of selected) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
console.log(`S114 syntax: ${selected.length} JavaScript/CommonJS files passed; read-only.`);
