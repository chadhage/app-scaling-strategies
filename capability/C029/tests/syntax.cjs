'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Own syntax paths must not be links.');
    return entry.isDirectory() ? walk(file) : [file];
  });
}
const files = walk(root).filter((file) => /\.(?:cjs|js)$/.test(file));
for (const file of files) execFileSync(process.execPath, ['--check', file], {
  timeout: 10000, maxBuffer: 131072, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
});
execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
  path.join(__dirname, 'syntax.ps1')], { timeout: 30000, maxBuffer: 131072, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
console.log(`Syntax GREEN: ${files.length} own JavaScript scripts and own PowerShell parsers; no source/evidence writes.`);
