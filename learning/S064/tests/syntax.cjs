'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const folder = path.resolve(__dirname, '..');
function sources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error('Owned syntax inputs cannot be symlinks');
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'evidence' ? [] : sources(file);
    return /\.(?:js|cjs)$/.test(entry.name) ? [file] : [];
  });
}
const files = sources(folder).sort();
for (const file of files) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe', windowsHide: true });
console.log(`Syntax OK for ${files.length} owned JS/CJS source files; RED snapshots are not discovered.`);
