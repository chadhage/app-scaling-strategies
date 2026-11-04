'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { root, repo, sha, readOwned } = require('./provenance.cjs');
const snapshot = require('..\\observed-snapshot.js');

function report(file) {
  assert.match(file, /^[a-z]+-[0-9a-f-]{36}\.raw\.json$/);
  return JSON.parse(readOwned(path.join('evidence', file)).toString('utf8'));
}
function index() {
  return JSON.parse(readOwned('evidence-index.json').toString('utf8'));
}
function checkRaw(entry) {
  const bytes = readOwned(path.join('evidence', entry.file));
  assert.equal(bytes.length, entry.bytes);
  assert.equal(sha(bytes), entry.sha256);
  return bytes;
}

test('accepted shared raw CRLF and Git canonical contract bytes are verified separately and unchanged', () => {
  const captured = report(index().acceptedContracts);
  assert.equal(captured.kind, 'accepted-contract-bytes');
  assert.equal(captured.records.length, 7);
  for (const entry of captured.records) {
    assert.match(entry.file, /^capability\\C00[12]\\[^\\]+$/);
    const raw = fs.readFileSync(path.join(repo, entry.file));
    assert.equal(sha(raw), entry.rawSha256);
    assert.equal(raw.length, entry.rawBytes);
    assert.equal((raw.toString('utf8').match(/\r\n/g) || []).length, entry.rawCRLF);
    const gitCanonical = execFileSync('git', ['--no-pager', 'show',
      `${entry.acceptedCommit}:${entry.file.split(path.sep).join('/')}`], { cwd: repo, maxBuffer: 1024 * 1024 });
    assert.equal(sha(gitCanonical), entry.gitCanonicalSha256);
    assert.equal(gitCanonical.length, entry.gitCanonicalBytes);
    assert.equal(entry.gitCanonicalCRLF, 0);
    assert.deepEqual(Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n')), gitCanonical);
  }
});

test('every preserved raw capture, stdout/stderr and genuine RED source snapshot retains its recorded bytes', () => {
  const files = fs.readdirSync(path.join(root, 'evidence')).filter((file) => file.endsWith('.raw.json'));
  assert.ok(files.length >= 7);
  for (const file of files) {
    const bytes = readOwned(path.join('evidence', file));
    const text = bytes.toString('utf8');
    assert.ok(text.includes('\r\n'), `${file}: raw report retains CRLF`);
    assert.doesNotMatch(text, /(?<!\r)\n/, `${file}: no silent newline rewrite`);
    const captured = report(file);
    if (captured.stdout) checkRaw(captured.stdout);
    if (captured.stderr) checkRaw(captured.stderr);
    for (const entry of captured.sourceSnapshots || []) {
      assert.equal(sha(readOwned(path.join('evidence', entry.file))), entry.sha256);
    }
    for (const entry of captured.processes || []) {
      const stdout = checkRaw(entry.stdout);
      checkRaw(entry.stderr);
      if (entry.value !== null) assert.deepEqual(JSON.parse(stdout.toString('utf8')), entry.value);
    }
  }
  const red = report(index().red);
  assert.equal(red.exitCode, 1);
  const output = checkRaw(red.stdout).toString('utf8');
  assert.match(output, /A fresh process must restore the actual persisted epoch/);
  assert.match(output, /\+ null/);
  assert.doesNotMatch(output, /MODULE_NOT_FOUND|Cannot find module/);
  assert.equal(red.sourceSnapshots.length, 2);
  for (const failed of index().failedAttempts) assert.equal(report(failed).exitCode, 1);
  for (const failed of index().failedPublicationChecks || []) {
    const captured = report(failed);
    assert.equal(captured.exitCode, 2);
    assert.match(checkRaw(captured.stdout).toString('utf8'), /trailing whitespace/);
  }
  const boundary = JSON.parse(readOwned('publisher-boundary.json').toString('utf8'));
  assert.equal(sha(readOwned(path.join('evidence', boundary.approvedSourceSnapshot))), boundary.parentApprovedSha256);
  assert.equal(sha(readOwned(path.join('evidence', boundary.retiredOwnedAdapterSnapshot))), boundary.retiredOwnedAdapterSha256);
  assert.equal(boundary.historicalSharedBytesPreviouslyPinned, false);
  assert.equal(boundary.sharedSourceEdits, 0);
  for (const version of boundary.approvedVersionHistory) {
    assert.equal(sha(readOwned(path.join('evidence', version.sourceSnapshot))), version.sha256);
  }
  const currentPublisher = readOwned(path.join('evidence', boundary.approvedSourceSnapshot)).toString('utf8');
  const previousPublisher = readOwned(path.join('evidence', boundary.approvedVersionHistory[0].sourceSnapshot)).toString('utf8');
  const correctedCall = "Run-Git (@('-c','core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol','diff','--cached','--check','--')+$Paths)";
  const priorCall = "Run-Git (@('diff','--cached','--check','--')+$Paths)";
  assert.equal(currentPublisher.split(correctedCall).length, 2);
  assert.equal(currentPublisher.replace(correctedCall, priorCall), previousPublisher, 'The approved publisher change must be exactly the command-local whitespace validation line.');
  const priorBoundary = JSON.parse(readOwned(path.join('evidence', boundary.preservedPriorBoundarySnapshot)).toString('utf8'));
  assert.equal(priorBoundary.parentApprovedSha256, boundary.supersededParentApprovedSha256);
  const priorPublication = JSON.parse(readOwned(path.join('evidence', boundary.preservedPriorPublicationSnapshot)).toString('utf8'));
  assert.equal(priorPublication.commit, '2402a7110e97bf2a4dfe9d3180ae6ab93e153eb1');
  assert.equal(priorPublication.tag, 'kanban/C015/2402a7110e97');
});

test('retained actual demo files and fresh reader state exactly match observed acknowledgments and history', () => {
  const observed = report(snapshot.evidenceFile);
  assert.equal(observed.passed, true);
  assert.equal(observed.processes.filter((entry) => entry.action === 'write').length, 5);
  for (const run of observed.runs) {
    for (const file of run.files) {
      const bytes = readOwned(file.file);
      assert.equal(bytes.length, file.bytes);
      assert.equal(sha(bytes), file.rawSha256);
    }
    const result = spawnSync(process.execPath, [path.join(root, 'cli.cjs'), 'read', run.runId], {
      encoding: 'utf8', timeout: 60000, windowsHide: true,
    });
    assert.ifError(result.error);
    assert.equal(result.status, 0, result.stderr);
    const fresh = JSON.parse(result.stdout);
    assert.notEqual(fresh.pid, process.pid);
    assert.ok(!run.writerPids.includes(fresh.pid));
    assert.deepEqual(fresh.state, run.result.state);
    assert.deepEqual(fresh.acknowledgment, run.result.acknowledgment);
    assert.deepEqual(fresh.history, run.result.history);
    assert.equal(fresh.writesPerformed, 0);
    assert.equal(fresh.stateSha256, run.result.stateSha256);
  }
});

test('actual signed Edge evidence is separate from Node filesystem and bundled snapshot proof', () => {
  const browser = report(index().browserObservation);
  assert.equal(browser.kind, 'signed-edge-dom');
  assert.equal(browser.passed, true);
  assert.equal(browser.closed, true);
  assert.equal(browser.signature.status, 'Valid');
  assert.equal(browser.signature.fileVersion, '156.0.4314.50');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.equal(browser.checks.length, 8);
  assert.ok(browser.checks.every((entry) => entry.passed === true));
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.nonFileRequests, []);
  assert.equal(browser.filesystemExecutionByBrowser, false);
  assert.equal(browser.nativeAzureExecution, false);
  assert.equal(browser.originalUnitCredits, 0);
});

test('retained IaC N/A and manifest leave original class and parent/cloud/production incompleteness honest', () => {
  const iac = JSON.parse(readOwned('evidence\\iac.json').toString('utf8'));
  assert.equal(iac.outcome, 'N/A');
  assert.equal(iac.generatedInfrastructure, false);
  const manifest = JSON.parse(readOwned('manifest.json').toString('utf8'));
  assert.equal(manifest.kano, 'D');
  assert.equal(manifest.maximumOriginalUnitCredits, 1);
  for (const incomplete of ['H001', 'H004', 'cloud durability', 'production Node 24']) {
    assert.ok(manifest.incomplete.includes(incomplete));
  }
});
