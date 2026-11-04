'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'captures') walk(target);
    else if (entry.isFile() && /\.(js|cjs)$/.test(entry.name)) files.push(target);
  }
}
walk(root);
for (const file of files) {
  const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 10000 });
  assert.equal(run.status, 0, `${path.relative(root, file)}: ${run.stderr}`);
}
const shell = path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe');
const command = "$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) 'capability\\C045\\consent.ps1'),[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|ForEach-Object {$_.Message};exit 1}";
const parsed = spawnSync(shell, ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
  cwd: path.resolve(root, '..', '..'), encoding: 'utf8', timeout: 10000
});
assert.equal(parsed.status, 0, parsed.stdout + parsed.stderr);
console.log(JSON.stringify({ event: 'C045-syntax-passed', nodeScripts: files.length, powershellScripts: 1, runtime: process.version, checkedHistoricalRed: true }));
