'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const sourceFiles = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
  const file = path.join(directory, entry.name);
  if (entry.isDirectory()) return entry.name === 'raw' ? [] : sourceFiles(file);
  return [file];
});
let count = 0;
for (const file of sourceFiles(root)) {
  if (/\.(?:cjs|js)$/.test(file)) {
    execFileSync(process.execPath, ['--check', file], { timeout: 10000, windowsHide: true, stdio: 'pipe' });
    count++;
  }
  if (/\.json$/.test(file)) { JSON.parse(fs.readFileSync(file, 'utf8')); count++; }
}
let powershellCount = 0;
for (const file of sourceFiles(root).filter((file) => /\.ps1$/.test(file))) {
  const script = file.replace(/'/g, "''");
  const command = `$tokens = $null; $errors = $null; [void][Management.Automation.Language.Parser]::ParseFile('${script}', [ref]$tokens, [ref]$errors); if ($errors.Count -ne 0) { throw ($errors.Message -join '; ') }`;
  execFileSync('powershell.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], {
    timeout: 10000, windowsHide: true, stdio: 'pipe'
  });
  powershellCount++;
}
console.log(`PASS syntax: ${count} JavaScript/JSON sources and ${powershellCount} own PowerShell scripts; no listeners or writes.`);
