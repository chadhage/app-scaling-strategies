'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const folder = path.resolve(__dirname, '..');
function scripts(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name === 'evidence') return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? scripts(file) : /\.(js|cjs)$/.test(entry.name) ? [file] : [];
  });
}
const files = scripts(folder);
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
for (const file of ['manifest.json', path.join('evidence', 'source-contract.json'), path.join('evidence', 'iac-stage.json')]) {
  JSON.parse(fs.readFileSync(path.join(folder, file), 'utf8'));
}
console.log(`Syntax OK: ${files.length} JS/CJS sources and three JSON contracts; no proof files written.`);
