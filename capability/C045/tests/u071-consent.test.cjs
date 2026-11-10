'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { randomUUID, createHash } = require('node:crypto');
const { test } = require('node:test');
test('whole unchanged-shape consent reader covers all AST lines, branch sides and script entries with real positive/negative controls', () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  const runtime = path.join(root, '.git', 'u071-consent-observations', randomUUID());
  fs.mkdirSync(runtime, { recursive: true });
  const source = path.join(__dirname, '..', 'consent.ps1');
  const output = path.join(runtime, 'coverage.json');
  const run = spawnSync(path.join(process.env.ProgramFiles, 'PowerShell', '7', 'pwsh.exe'),
    ['-NoLogo', '-NoProfile', '-NonInteractive', '-File', path.join(__dirname, 'u071-consent-coverage.ps1'),
      '-Source', source, '-Output', output],
    { encoding: 'utf8', windowsHide: true, timeout: 180000, maxBuffer: 8 * 1024 * 1024 });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(fs.readFileSync(output));
  assert.equal(report.sourceSha256, createHash('sha256').update(fs.readFileSync(source)).digest('hex'));
  for (const key of ['lines', 'branches', 'functionsOrScriptEntries']) assert.ok(report[key] >= 85, key);
  assert.equal(report.cases.length, 6);
  assert.ok(report.cases.every(row => row.passed && row.mutexDisposed));
  assert.ok(report.lineRows.length > 20);
  assert.equal(report.branchRows.length, 12);
  assert.equal(report.entryRows.length, 2);
  assert.ok(report.actualTrace.length > 100);
});
