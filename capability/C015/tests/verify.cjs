'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { root, inventory } = require('./provenance.cjs');

const [mode, ...extra] = process.argv.slice(2);
if (extra.length || !['focused', 'browser', 'syntax'].includes(mode)) throw new Error('Use focused, browser or syntax only.');
const before = inventory();
const scratch = path.join(root, 'test-scratch');
assert.equal(fs.existsSync(scratch) ? fs.readdirSync(scratch).length : 0, 0, 'Unclean owned scratch must be resolved explicitly before verification.');
const files = mode === 'browser' ? ['browser.acceptance.cjs'] : [
  'contract-guard.test.cjs', 'restart.test.cjs', 'storage.test.cjs', 'surface.test.cjs', 'integrity.test.cjs',
];
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
let exitCode = 0;
if (mode === 'syntax') {
  const source = Object.keys(before).filter((file) => /\.(cjs|js)$/.test(file));
  for (const file of source) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8', timeout: 30000, env });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
  }
  const ps = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
    "foreach($file in @('capability\\C015\\consent-current.ps1','.git\\kanban-orchestrator\\publish.ps1')){$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) $file),[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){$errors|Out-String|Write-Error;exit 1}}"],
  { encoding: 'utf8', timeout: 30000, env });
  assert.ifError(ps.error);
  assert.equal(ps.status, 0, ps.stderr);
  console.log(JSON.stringify({ syntaxFiles: source.length, powershellFiles: 2, ownPowerShellFiles: 1, parentApprovedStandardPublisherFiles: 1, passed: true }));
} else {
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.map((file) => path.join(__dirname, file))], {
    timeout: 600000, maxBuffer: 8 * 1024 * 1024, env, windowsHide: true,
  });
  assert.ifError(result.error);
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  exitCode = result.status === 0 ? 0 : 1;
}
assert.deepEqual(inventory(), before, 'Normal verification must not change source, retained fixtures or historical evidence.');
assert.equal(fs.existsSync(scratch) ? fs.readdirSync(scratch).length : 0, 0, 'Only explicitly created owned scratch files/subdirectories may be cleaned.');
console.log(JSON.stringify({ mode, sourceEvidenceFilesUnchanged: Object.keys(before).length, scratchNamespacesRemaining: 0, captureByVerifier: false, exitCode }));
process.exitCode = exitCode;
