'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isSymbolicLink()) throw new Error('No linked syntax targets.');
    const file = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'evidence') walk(file);
    else if (entry.isFile() && /\.(?:cjs|js)$/.test(entry.name)) files.push(file);
  }
}
walk(root);
for (const file of files) execFileSync(process.execPath, ['--check', file], { windowsHide: true, stdio: 'pipe' });
const ps = files.length;
const script = "$errors=@();Get-ChildItem -LiteralPath 'capability\\C037' -Recurse -File -Filter '*.ps1' | Where-Object {$_.FullName -notmatch '\\\\evidence\\\\'} | ForEach-Object {$t=$null;$e=$null;$null=[Management.Automation.Language.Parser]::ParseFile($_.FullName,[ref]$t,[ref]$e);$errors+=@($e)};if($errors.Count){$errors|ForEach-Object {$_.Message};exit 1};'PowerShell syntax passed'";
const output = execFileSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', script], {
  cwd: path.resolve(root, '..', '..'), windowsHide: true, encoding: 'utf8', timeout: 30000
});
assert.match(output, /syntax passed/);
console.log(`Syntax GREEN: ${ps} JavaScript modules; PowerShell AST syntax passed.`);
