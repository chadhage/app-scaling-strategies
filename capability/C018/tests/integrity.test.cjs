'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { root, repo, sha, checkDependencies, publisherBoundary } = require('./provenance.cjs');

test('accepted API, retained demo and current documentation raw/Git canonical bytes remain exactly pinned', () => {
  const files = checkDependencies();
  assert.equal(Object.keys(files).length > 25, true);
  const pins = JSON.parse(fs.readFileSync(path.join(root, 'evidence', 'dependencies.json'), 'utf8'));
  assert.equal(pins.files.some((entry) => entry.rawCRLF), true);
  assert.equal(pins.files.filter((entry) => entry.path.includes(`${path.sep}fixtures${path.sep}`)).length, 5);
  assert.equal(pins.files.filter((entry) => entry.originalGitBlob !== entry.referenceGitBlob).length, 1);
});

test('publisher activation uses explicit current parent scope and retains the dispatch pin and real hold failure', () => {
  const boundary = JSON.parse(fs.readFileSync(path.join(root, 'publisher-boundary.json'), 'utf8'));
  const observed = JSON.parse(fs.readFileSync(path.join(root, boundary.parentAuthorizationEvidence), 'utf8'));
  const previous = JSON.parse(fs.readFileSync(path.join(root, boundary.previousBoundaryArchive), 'utf8'));
  assert.equal(previous.expectedSha256, boundary.previousExpectedSha256);
  assert.equal(observed.originalDispatchSha256, boundary.previousExpectedSha256);
  assert.equal(observed.actualPublisherSha256, boundary.expectedSha256);
  assert.equal(observed.currentParentAuthorization.approvedBy, 'parent-controller');
  assert.equal(observed.currentParentAuthorization.exactAddedClasses.C018, 'S');
  assert.equal(observed.currentParentAuthorization.savedTraceRevision.publisherSha256, boundary.expectedSha256);
  assert.equal(observed.currentParentAuthorization.savedTraceRevision.previousPublisherSha256, boundary.previousExpectedSha256);
  assert.equal(observed.currentParentAuthorization.savedTraceRevision.namespaceFrozenClassAdminHeadAndWhitespaceRulesUnchanged, true);
  assert.equal(observed.currentParentAuthorization.savedTraceRevision.cloudIdentityOrInfrastructureAuthorityExpanded, false);
  assert.equal(observed.currentParentAuthorization.savedTraceRevision.extraCredits, 0);
  assert.equal(observed.currentCard.id, 'C018');
  assert.equal(observed.currentCard.kano, 'S');
  assert.equal(observed.scopeExpanded, false);
  assert.equal(publisherBoundary().exactAuthorizedBytes, true);
});

test('every explicitly observed own test UUID from raw captures is absent without inspecting or deleting other workers UUIDs', () => {
  const namespaces = new Set();
  for (const name of fs.readdirSync(path.join(root, 'evidence')).filter((name) => name.endsWith('.stdout.raw'))) {
    const text = fs.readFileSync(path.join(root, 'evidence', name), 'utf8');
    for (const match of text.matchAll(/test-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g)) namespaces.add(match[0]);
  }
  assert.equal(namespaces.size > 5, true);
  for (const namespace of namespaces) {
    assert.equal(fs.existsSync(path.join(repo, 'capability', 'C015', 'test-scratch', namespace)), false, namespace);
  }
});

test('genuine loadable-stub RED and every uniquely captured raw failure retain exact bytes', () => {
  const evidence = path.join(root, 'evidence');
  const reports = fs.readdirSync(evidence).filter((name) => name.endsWith('.raw.json'));
  const red = reports.filter((name) => name.startsWith('red-'));
  assert.equal(red.length, 1);
  for (const name of reports) {
    const report = JSON.parse(fs.readFileSync(path.join(evidence, name), 'utf8'));
    for (const entry of [report.stdout, report.stderr, ...(report.snapshots || [])]) {
      assert.equal(sha(fs.readFileSync(path.join(root, entry.path))), entry.sha256, entry.path);
    }
    if (report.phase === 'red') {
      assert.equal(report.exitCode, 1);
      const output = fs.readFileSync(path.join(root, report.stdout.path), 'utf8');
      assert.match(output, /ERR_ASSERTION/);
      assert.match(output, /completedStep: 'prepare'/);
      assert.match(output, /pendingStep: 'advance'/);
      assert.match(output, /namespaceAbsent.*true/);
      const stub = report.snapshots.find((entry) => entry.path.endsWith('-reader.cjs.snapshot'));
      assert.match(fs.readFileSync(path.join(root, stub.path), 'utf8'), /return null/);
    }
  }
});

test('ordinary source whitespace stays strict while raw reports and CRLF snapshots are never normalized', () => {
  function visit(directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, item.name);
      if (directory === root && item.name === 'evidence') continue;
      if (item.isDirectory()) visit(target);
      else if (/\.(?:cjs|js|ts|md|html|css|json|feature)$/.test(item.name)) {
        const text = fs.readFileSync(target, 'utf8');
        assert.equal(/[ \t]+\r?$/m.test(text), false, target);
        assert.equal(/\r?\n[ \t]*\r?\n$/.test(text), false, target);
      }
    }
  }
  visit(root);
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /Static|static file/);
  assert.doesNotMatch(html, /<script\b[^>]*>[^<\s]/i);
  const source = ['reader.cjs', 'process-reader.cjs', 'server.cjs', 'app.js', 'inspection.js']
    .map((name) => fs.readFileSync(path.join(root, name), 'utf8')).join('\n');
  assert.doesNotMatch(source, /localStorage|sessionStorage|indexedDB|innerHTML|writeFile|mkdirSync|\.persist\(/);
});
