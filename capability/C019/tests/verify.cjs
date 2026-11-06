'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { root, repo, sha, inventory, dependencies } = require('./provenance.cjs');
const { assessCurrent } = require('./authorization.cjs');
const manifest = require('..\\manifest.json');
const [mode, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0);
assert.ok(['authorization', 'guards', 'focused', 'browser', 'syntax', 'publication', 'coverage'].includes(mode));
const before = inventory();
const dependencyBefore = dependencies();
const publisherObservedSha256 = sha(fs.readFileSync(path.join(repo, '.git', 'kanban-orchestrator', 'publish.ps1')));
const publisherAssessment = assessCurrent();
let publicationReady = null;
let publicationBoundary = null;
const env = { ...process.env };
delete env.CAPTURE_BROWSER_EVIDENCE;
delete env.C019_CAPTURE_DIRECTORY;
let status = 0;
let counts = null;
let syntaxFiles = 0;
try {
  if (mode === 'publication') {
    const result = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-File',
      path.join(__dirname, 'publisher-wrapper.ps1'), '-Action', 'Inspect'],
    { env, encoding: 'utf8', timeout: 240000, maxBuffer: 65536, windowsHide: true });
    assert.ifError(result.error);
    assert.equal(result.status, 0);
    publicationBoundary = JSON.parse(result.stdout);
    publicationReady = publicationBoundary.publicationReady;
    status = publicationReady === true ? 0 : 1;
    assert.equal(publicationReady, true, 'Current approved source AND actual publisher-mutex HEAD==remote are required before staging.');
  } else if (mode === 'coverage') {
    const result = spawnSync(process.execPath, [path.join(__dirname, 'coverage.cjs')],
      { env, encoding: 'utf8', timeout: 1500000, maxBuffer: 64 * 1024 * 1024, windowsHide: true });
    assert.ifError(result.error);
    process.stdout.write(result.stdout || '');
    process.stderr.write(result.stderr || '');
    status = result.status === 0 ? 0 : 1;
  } else if (mode === 'syntax') {
    for (const file of Object.keys(before).filter((file) => /\.(cjs|js)$/.test(file))) {
      const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { env, timeout: 30000, windowsHide: true });
      assert.ifError(result.error);
      assert.equal(result.status, 0, result.stderr.toString());
      syntaxFiles++;
    }
    const parsed = spawnSync('pwsh.exe', ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command',
      "foreach($file in @('capability\\C019\\tests\\publisher-current.ps1','capability\\C019\\tests\\publisher-wrapper.ps1','capability\\C019\\tests\\transport.ps1','capability\\C019\\tests\\transport-probe.ps1','.git\\kanban-orchestrator\\publish.ps1')){$tokens=$null;$errors=$null;[System.Management.Automation.Language.Parser]::ParseFile((Join-Path (Get-Location) $file),[ref]$tokens,[ref]$errors)|Out-Null;if($errors.Count){exit 1}}"],
    { env, timeout: 30000, windowsHide: true });
    assert.ifError(parsed.error);
    assert.equal(parsed.status, 0);
  } else {
    const files = mode === 'browser' ? ['browser-current.test.cjs'] : mode === 'authorization'
      ? ['authorization.test.cjs', 'transport.test.cjs', 'integrity.test.cjs'] :
      ['red.test.cjs', 'core.test.cjs', 'fixture.test.cjs', 'surface.test.cjs', 'app.test.cjs', 'integrity.test.cjs',
        'current-evidence.test.cjs', 'provenance.test.cjs']
        .filter((file) => mode !== 'guards' || file !== 'fixture.test.cjs');
    const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files.map((file) => path.join(__dirname, file))], {
      env, timeout: 600000, maxBuffer: 16 * 1024 * 1024, windowsHide: true,
    });
    assert.ifError(result.error);
    process.stdout.write(result.stdout || Buffer.alloc(0));
    process.stderr.write(result.stderr || Buffer.alloc(0));
    status = result.status === 0 ? 0 : 1;
    const text = result.stdout.toString();
    const number = (name) => {
      const matches = [...text.matchAll(new RegExp(`^# ${name} (\\d+)$`, 'gm'))];
      return matches.length ? Number(matches.at(-1)[1]) : null;
    };
    counts = { tests: number('tests'), pass: number('pass'), fail: number('fail'),
      cancelled: number('cancelled'), skipped: number('skipped') };
  }
} finally {
  const after = inventory();
  assert.deepEqual(inventory(), before, 'Normal verification must not alter any source or retained evidence.');
  assert.deepEqual(dependencies(), dependencyBefore, 'C001/C002 and all C015 source/evidence/retained demonstration bytes must remain unchanged.');
  const preserved = JSON.parse(fs.readFileSync(path.join(root, manifest.historicalF6AuthorizationSnapshot))).preservation;
  for (const [file, digest] of Object.entries({ ...preserved.runtime, ...preserved.historicalEvidence })) {
    assert.equal(after[file], digest, 'Runtime and all historical proof remain immutable during same-C019 metadata repair.');
  }
  process.stdout.write('C019_VERIFY_RECORD=' + JSON.stringify({
    schemaVersion: 1, cardId: 'C019', mode, node: process.version, exitCode: status, counts, syntaxFiles,
    ownSourceEvidenceFilesUnchanged: Object.keys(before).length,
    dependencyFilesUnchanged: Object.keys(dependencyBefore).length,
    captureByVerifier: false, fixtureIO: mode === 'focused' || mode === 'coverage'
      ? 'only explicit unique C015 tests; tracked cleanup asserted by each case'
      : 'no C015 fixture writes in this mode',
    publisherAuthorizedSha256: publisherAssessment.authorizedSha256, publisherObservedSha256,
    publisherAssessment, publicationReady, publicationBoundary,
    repairScope: 'publisher metadata/provenance/wrapper/tests only',
    runtimeErrorsActionsAndOldProofUnchanged: true,
    cloudExecution: false, recoveryConfirmed: false, originalUnitCredits: 0,
  }) + '\n');
}
process.exitCode = status;
