'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const files = [];
function visit(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'evidence') continue;
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) visit(file);
    else if (/\.(?:js|cjs)$/.test(entry.name)) files.push(file);
  }
}
visit(root);
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
}
for (const name of ['publish.ps1', 'transport.ps1']) {
  const source = path.join(root, 'publication', name).replaceAll("'", "''");
  const command = `$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile('${source}',[ref]$tokens,[ref]$errors)|Out-Null;`
    + 'if($errors.Count){$errors|ForEach-Object Message;exit 1}';
  const parsed = spawnSync('pwsh', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', command], { encoding: 'utf8' });
  assert.equal(parsed.status, 0, parsed.stdout + parsed.stderr);
}
console.log(`X003 SYNTAX ${files.length} JavaScript/CommonJS files and two owned PowerShell files parsed; no publication invoked.`);
