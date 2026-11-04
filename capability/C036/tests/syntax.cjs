'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('No linked syntax input.');
    if (entry.name === 'evidence' || entry.name === 'io-scratch') return [];
    return entry.isDirectory() ? files(target) : [target];
  });
}
let nodeCount = 0;
let jsonCount = 0;
const powershell = [];
for (const file of files(root)) {
  if (/\.(?:cjs|js)$/.test(file)) {
    const run = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', timeout: 10000, windowsHide: true });
    assert.equal(run.status, 0, `${file}: ${run.stderr}`);
    nodeCount++;
  } else if (file.endsWith('.json')) {
    JSON.parse(fs.readFileSync(file, 'utf8'));
    jsonCount++;
  } else if (file.endsWith('.ps1')) powershell.push(file);
}
for (const file of powershell) {
  const escaped = file.replaceAll("'", "''");
  const command = `$tokens=$null;$errors=$null;$null=[Management.Automation.Language.Parser]::ParseFile('${escaped}',[ref]$tokens,[ref]$errors);if($errors.Count){$errors|ForEach-Object{[Console]::Error.WriteLine($_.Message)};exit 1}`;
  const run = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
    { encoding: 'utf8', timeout: 10000, windowsHide: true });
  assert.equal(run.status, 0, `${file}: ${run.stderr}`);
}
console.log(JSON.stringify({ cardId: 'C036', nodeSyntaxFiles: nodeCount, strictJsonFiles: jsonCount, powershellSyntaxFiles: powershell.length, outcome: 'passed' }));
