'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    assert.equal(entry.isSymbolicLink(), false);
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(file);
    else if (/\.(c?js)$/.test(entry.name)) files.push(file);
  }
}
walk(root);
for (const file of files) {
  const run = spawnSync(process.execPath, ['--check', file], {
    encoding: 'utf8', timeout: 10000, maxBuffer: 32768, windowsHide: true
  });
  assert.equal(run.status, 0, `${file}\n${run.stderr}`);
}
const run = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive',
  '-File', path.join(__dirname, 'syntax.ps1')], {
  encoding: 'utf8', timeout: 30000, maxBuffer: 32768, windowsHide: true
});
assert.equal(run.status, 0, run.stderr);
console.log(JSON.stringify({ javaScriptSyntaxFiles: files.length, powerShell: JSON.parse(run.stdout), sourceWrites: 0 }));
