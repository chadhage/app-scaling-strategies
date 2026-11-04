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
    else if (/\.(?:cjs|js|ps1)$/.test(entry.name)) files.push(file);
  }
}
walk(root);
for (const file of files) {
  if (file.endsWith('.ps1')) continue;
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8', windowsHide: true, timeout: 15000 });
  assert.equal(result.status, 0, `${file}\n${result.stderr}`);
}
const ps = files.filter((file) => file.endsWith('.ps1'));
if (ps.length) {
  const script = `$ErrorActionPreference='Stop'; $files = @(${ps.map((file) => `'${file.replaceAll("'", "''")}'`).join(',')}); foreach($file in $files){$tokens=$null;$errors=$null;$null=[Management.Automation.Language.Parser]::ParseFile($file,[ref]$tokens,[ref]$errors);if($errors.Count){throw ($errors|Out-String)}}; Write-Output 'PowerShell AST syntax passed'`;
  const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script],
    { encoding: 'utf8', windowsHide: true, timeout: 20000 });
  assert.equal(result.status, 0, result.stderr);
}
console.log(`C038 syntax GREEN: ${files.length} owned JavaScript/PowerShell files, including retained RED; no execution or evidence write.`);
