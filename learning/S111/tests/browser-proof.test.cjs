'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const { sha256 } = require(path.join(root, 'tools', 'proof.cjs'));

test('browser proof binds the published helper raw CRLF and canonical Git bytes separately', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
  const helper = fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'));
  const canonical = execFileSync('git', ['show', '53c0c0d:testing/browser/isolated.cjs'], { cwd: repo });
  assert.equal(sha256(helper), manifest.verification.helperWorkingSha256);
  assert.equal(sha256(canonical), manifest.verification.helperCanonicalGitSha256);
  assert.notEqual(sha256(helper), sha256(canonical));
  const proof = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'browser.json'), 'utf8'));
  assert.equal(proof.passed, true);
  assert.equal(proof.helperWorkingSha256, sha256(helper));
  assert.equal(proof.helperCanonicalGitSha256, sha256(canonical));
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.match(proof.browserVersion, /^156\./);
  assert.match(proof.runtime, /^v22\./);
  assert.equal(proof.cleanup, 'awaited session.close() in finally completed');
  assert.equal(proof.externalRequests, 0);
  assert.equal(proof.pageErrors.length, 0);
  assert.equal(proof.additionalKanoCredits, 0);
  assert.ok(proof.checks.length >= 10);
  assert.ok(proof.checks.every(check => check.passed === true));
  assert.equal(sha256(fs.readFileSync(path.join(root, 'evidence', proof.rawObservation))), proof.rawObservationSha256);
  for (const pointer of [path.join('evidence', 'browser.json'), path.join('evidence', 'verification.json')]) {
    assert.ok(proof.mutableProofPointers.includes(pointer));
    assert.equal(Object.hasOwn(proof.protectedFileSha256, pointer), false);
  }
  for (const [file, hash] of Object.entries(proof.protectedFileSha256)) {
    assert.equal(hash, sha256(fs.readFileSync(path.join(root, file))), file);
  }
});
