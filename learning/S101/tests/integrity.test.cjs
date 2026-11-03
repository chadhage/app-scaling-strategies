'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const proof = require('.\\provenance.cjs');

test('exact source rows, portable contract, packet and immutable Git-source snapshots', () => {
  proof.verifySource();
});

test('loadable stub produced genuine RED before explicit IaC N/A and implementation', () => {
  proof.verifyRed();
});

test('owned final source and raw proof inventory integrity uses separate byte policies', () => {
  const index = proof.verifyIndex();
  assert.ok(index.files.length > 20);
  const rawPaths = index.files.filter((record) => record.kind === 'raw-bytes')
    .map((record) => path.join('learning', 'S101', record.path));
  const attributes = proof.git(['check-attr', 'text', '--', ...rawPaths]).toString('utf8').trim().split(/\r?\n/);
  assert.equal(attributes.length, rawPaths.length);
  assert.ok(attributes.every((line) => line.endsWith(': text: unset')));
  const diffs = proof.git(['check-attr', 'diff', '--', ...rawPaths]).toString('utf8').trim().split(/\r?\n/);
  assert.equal(diffs.length, rawPaths.length);
  assert.ok(diffs.every((line) => line.endsWith(': diff: unset')));
});

test('focused, syntax, tooling and actual-browser receipts retain hashed raw observations', () => {
  for (const stage of ['stub-syntax', 'model-green', 'focused', 'syntax', 'syntax-final', 'syntax-complete',
    'syntax-publication-repair', 'source-integrity',
    'tooling-final', 'browser-run']) {
    const receipt = proof.readJSON(path.join('evidence', `${stage}.json`));
    assert.equal(receipt.cardId, 'A-S101');
    assert.equal(receipt.exitCode, 0, stage);
    proof.verifyRaw(receipt.stdout); proof.verifyRaw(receipt.stderr);
  }
  const failedQualification = proof.readJSON(path.join('evidence', 'tooling.json'));
  assert.equal(failedQualification.exitCode, 1);
  proof.verifyRaw(failedQualification.stdout);
  assert.match(proof.verifyRaw(failedQualification.stderr).toString('utf8'), /ERR_ASSERTION/);
  const failedSignatureHost = proof.readJSON(path.join('evidence', 'tooling-source-repair.json'));
  assert.equal(failedSignatureHost.exitCode, 1);
  proof.verifyRaw(failedSignatureHost.stdout);
  assert.match(proof.verifyRaw(failedSignatureHost.stderr).toString('utf8'), /CouldNotAutoloadMatchingModule/);
  const tooling = JSON.parse(proof.verifyRaw(proof.readJSON(path.join('evidence', 'tooling-final.json')).stdout));
  assert.equal(tooling.playwrightVersion, '1.56.1');
  assert.equal(tooling.edge.signatureStatus, 'Valid');
  assert.match(tooling.edge.signerSubject, /Microsoft Corporation/);
  assert.match(tooling.edge.fileVersion, /^156\./);
  assert.equal(tooling.lifecycleQualified, false);
  assert.equal(tooling.helperRawWorkingSHA256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(tooling.helperCanonicalGitSHA256, '2ccb4ee2e708d4e3131b73acb5efcf0a2ee6f0e73966388a846e0d22f07571b0');
  assert.equal(tooling.helperWorkingCRLFCount, 166);
  assert.equal(tooling.helperGitCRLFCount, 0);
  const browser = proof.readJSON(path.join('evidence', 'browser.json'));
  assert.equal(browser.passed, true);
  assert.equal(browser.deliberateCapture, true);
  assert.equal(browser.closeAwaitedInFinally, true);
  assert.equal(browser.lifecycleQualified, false);
  assert.equal(browser.helperSHA256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.observations.length, 14);
  assert.ok(browser.observations.every((observation) => observation.passed));
  for (const screenshot of browser.screenshots) proof.verifyRaw(screenshot);
  assert.ok(browser.observations.some((observation) => observation.id.startsWith('enforced-csp')));
  assert.ok(browser.observations.some((observation) => observation.id.startsWith('actual-load-failure')));
});

test('normal browser verification cannot silently replace frozen browser evidence', () => {
  const browser = proof.readJSON(path.join('evidence', 'browser.json'));
  assert.ok(browser.limits.includes('not unattended lifecycle qualification'));
  const summary = proof.readJSON('evidence.json');
  assert.equal(summary.nativeSiblingComplete, false);
  assert.equal(summary.sourceParentComplete, false);
  assert.equal(summary.productionNode24Certified, false);
  assert.equal(summary.testsRepairsAndProofCredits, 0);
  const qualification = proof.readJSON(path.join('evidence', 'publication-raw-diff-failure.json'));
  assert.equal(qualification.exitCode, 2);
  assert.equal(qualification.testsRepairsAndProofCredits, 0);
  const expanded = zlib.gunzipSync(proof.verifyRaw(qualification.stdout));
  assert.equal(expanded.length, qualification.stdout.uncompressedBytes);
  assert.equal(proof.sha256(expanded), qualification.stdout.uncompressedSHA256);
  assert.match(expanded.toString('utf8'), /evidence\/raw\/bdd\.feature\.snapshot:1: trailing whitespace/);
  proof.verifyRaw(qualification.stderr);
  proof.verifyRaw(qualification.preRepairAttributes);
  proof.verifyRaw(qualification.preRepairContentIndex);
  const indexHashes = [
    proof.sha256(proof.canonicalText(fs.readFileSync(path.join(proof.lesson, 'evidence', 'content-index.json')))),
    proof.sha256(proof.canonicalText(proof.verifyRaw(qualification.preRepairContentIndex))),
  ];
  for (const stage of ['integrity-green', 'verification-green',
    'integrity-publication-repair', 'verification-publication-repair']) {
    const receiptPath = path.join(proof.lesson, 'evidence', `${stage}.json`);
    if (fs.existsSync(receiptPath)) {
      const receipt = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
      assert.equal(receipt.exitCode, 0);
      proof.verifyRaw(receipt.stdout); proof.verifyRaw(receipt.stderr);
      assert.equal(receipt.browserEvidenceCaptureEnabled, false);
      assert.equal(receipt.verificationReadOnly.unchanged, true);
      assert.equal(receipt.verificationReadOnly.beforeRawByteInventorySHA256,
        receipt.verificationReadOnly.afterRawByteInventorySHA256);
      assert.ok(indexHashes.includes(receipt.verificationReadOnly.inputIndexSHA256));
    }
  }
});

test('published owned Git-source bytes agree with raw snapshots and canonical text, when present', () => {
  const index = proof.verifyIndex();
  const exists = spawnSync('git', ['--no-pager', 'cat-file', '-e', 'HEAD:learning/S101/manifest.json'], {
    cwd: proof.root, encoding: 'utf8',
  });
  if (exists.status !== 0) {
    assert.equal(process.env.VERIFY_PUBLISHED_S101, undefined,
      'Published-source verification was required, but this lesson is absent from HEAD.');
    return;
  }
  for (const record of index.files) {
    const relative = path.join('learning', 'S101', record.path).split(path.sep).join('/');
    const bytes = proof.git(['show', `HEAD:${relative}`]);
    assert.equal(proof.sha256(proof.rawKind(record.path) ? bytes : proof.canonicalText(bytes)),
      record.sha256, record.path);
  }
});
