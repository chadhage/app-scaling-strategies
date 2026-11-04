'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
function scripts(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ?
    scripts(path.join(directory, entry.name)) : /\.(?:js|cjs)$/.test(entry.name) ? [path.join(directory, entry.name)] : []);
}
const files = scripts(root);
for (const file of files) {
  const output = spawnSync(process.execPath, ['--check', file], { windowsHide: true, timeout: 15000, encoding: 'utf8' });
  assert.equal(output.status, 0, `${file}\n${output.stderr}`);
}
const powershell = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'syntax.ps1')], {
  windowsHide: true, timeout: 15000, encoding: 'utf8'
});
assert.equal(powershell.status, 0, powershell.stderr);
console.log(JSON.stringify({ cardId: 'C030', javaScriptScripts: files.length, nodeSyntaxPassed: true, ...JSON.parse(powershell.stdout) }));
