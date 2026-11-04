'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { Script } = require('node:vm');
const root = path.resolve(__dirname, '..');
function files(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(directory, entry.name);
    if (entry.isSymbolicLink()) throw new Error('Linked source is unsupported.');
    return entry.isDirectory() ? files(file) : [file];
  });
}
const javascript = files(root).filter((file) => /\.(?:cjs|js)$/.test(file));
for (const file of javascript) new Script(fs.readFileSync(file, 'utf8'), { filename: file });
const command = "Get-ChildItem -LiteralPath 'capability\\C034' -Recurse -Filter '*.ps1' | ForEach-Object {$errors=$null;$tokens=$null;[System.Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){throw ($errors|Out-String)}};'C034 PowerShell syntax passed.'";
execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command],
  { cwd: path.resolve(root, '..', '..'), windowsHide: true, timeout: 10000, stdio: 'pipe' });
for (const file of files(root).filter((file) => /\.(?:cjs|js|ps1|html|css|feature|md)$/.test(file))) {
  const text = fs.readFileSync(file, 'utf8');
  assert.doesNotMatch(text, /[ \t]+\r?$/m, `Genuine trailing whitespace: ${path.relative(root, file)}`);
  assert.doesNotMatch(text, /\r?\n[ \t]*\r?\n$/, `Blank EOF: ${path.relative(root, file)}`);
}
console.log(`C034 syntax GREEN: ${javascript.length} own JS/CJS files compiled without execution by Node ${process.version}, own PowerShell parser and real source whitespace checks.`);
