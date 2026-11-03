'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file).toString('utf8'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

function files(directory, result = []) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    assert.equal(entry.isSymbolicLink(), false);
    if (entry.isDirectory()) files(file, result);
    else result.push(path.relative(root, file).split(path.sep).join('/'));
  }
  return result;
}

test('sealed owned scope has exact raw-byte and canonical Git-text integrity without writes', () => {
  const index = json('evidence/content-index.json');
  assert.equal(index.cardId, 'A-S083');
  const actual = files(root).filter((file) => file !== 'evidence/content-index.json').sort();
  assert.deepEqual(index.entries.map((entry) => entry.file).sort(), actual);
  assert.equal(new Set(index.entries.map((entry) => entry.file)).size, actual.length);
  for (const entry of index.entries) {
    const bytes = read(entry.file);
    assert.equal(entry.representation, entry.file.startsWith('evidence/raw/') ? 'byte-exact' : 'canonical-utf8-lf');
    assert.equal(hash(entry.representation === 'byte-exact' ? bytes : canonical(bytes)), entry.sha256, entry.file);
  }
});

test('captured green commands passed, preserve raw output and attest the actual executed inputs', () => {
  for (const file of ['evidence/focused-green-002.json', 'evidence/browser-green-002.json']) {
    const capture = json(file);
    assert.equal(capture.cardId, 'A-S083');
    assert.equal(capture.exitCode, 0);
    assert.equal(capture.signal, null);
    assert.match(capture.node, /^v22\./);
    for (const stream of ['stdout', 'stderr']) {
      assert.equal(hash(read(capture[stream].file)), capture[stream].sha256);
      assert.equal(read(capture[stream].file).length, capture[stream].bytes);
    }
    const text = read(capture.stdout.file).toString('utf8');
    assert.match(text, /# fail 0/);
    assert.doesNotMatch(text, /not ok /);
    for (const input of capture.capturedInputs) {
      assert.equal(hash(canonical(read(input.file))), input.canonicalSha256, input.file);
    }
    assert.ok(Date.parse(capture.startedAtUtc) > Date.parse(json('evidence/red.json').finishedAtUtc));
  }
  const syntax = json('evidence/syntax-003.json');
  assert.ok(syntax.checks.length >= 8);
  for (const check of syntax.checks) {
    assert.equal(check.exitCode, 0);
    assert.equal(check.stderr, '');
    assert.equal(check.stdout, '');
  }
  const failedBrowser = json('evidence/browser-green.json');
  assert.equal(failedBrowser.exitCode, 1, 'the first CSP-loader test failure must not be relabeled as green');
  assert.equal(hash(read(failedBrowser.stdout.file)), failedBrowser.stdout.sha256);
  assert.equal(hash(read(failedBrowser.stderr.file)), failedBrowser.stderr.sha256);
  const archivedInput = read('evidence/raw/runs/browser-green/browser.test.cjs.snapshot');
  assert.equal(hash(canonical(archivedInput)), failedBrowser.capturedInputs.find((input) => input.file === 'tests/browser.test.cjs').canonicalSha256);
  assert.match(read(failedBrowser.stdout.file).toString('utf8'), /page\.addScriptTag: Executing inline script violates/);
  const preflight = json('evidence/publisher-check.json');
  assert.equal(preflight.exitCode, 2);
  assert.equal(preflight.classifiedAsBehaviorRed, false);
  assert.equal(hash(read(preflight.stdout.file)), preflight.stdout.sha256);
  assert.equal(hash(read(preflight.stderr.file)), preflight.stderr.sha256);
  assert.match(read(preflight.stdout.file).toString('utf8'), /trailing whitespace/);
  assert.equal(hash(read(preflight.priorSealedIndex.file)), preflight.priorSealedIndex.sha256);
  const priorIndex = JSON.parse(read(preflight.priorSealedIndex.file).toString('utf8'));
  for (const input of preflight.preservedPriorInputs) {
    const bytes = read(input.snapshot);
    assert.equal(hash(bytes), input.sha256);
    const entry = priorIndex.entries.find((item) => item.file === input.file.replace(/\\/g, '/'));
    assert.equal(hash(canonical(bytes)), entry.sha256);
  }
  const originalFocused = json('evidence/focused-green.json');
  assert.equal(originalFocused.exitCode, 0);
  const previousProvenance = preflight.preservedPriorInputs.find((input) => input.file === 'tests\\provenance.test.cjs');
  assert.equal(hash(canonical(read(previousProvenance.snapshot))), originalFocused.capturedInputs.find((input) => input.file === 'tests/provenance.test.cjs').canonicalSha256);
});

test('browser evidence uses only the pinned published helper and approved installed tooling', () => {
  const browser = json('evidence/browser-acceptance.json');
  const tooling = json('evidence/tooling.json');
  assert.equal(browser.helper.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.helper.sourceCommit, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(browser.playwright, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(tooling.edge.signatureStatus, 'Valid');
  assert.match(tooling.edge.signer, /Microsoft Corporation/);
  assert.equal(browser.browserVersion, tooling.edge.productVersion);
  assert.equal(browser.closeAwaitedInFinally, true);
  assert.equal(browser.ownedFilesUnchanged, true);
  assert.equal(browser.externalRequests.length, 0);
  assert.equal(browser.pageErrors.length, 0);
  assert.ok(browser.checks.length >= 12);
  assert.ok(browser.checks.every((check) => check.passed === true));
  assert.match(browser.limits, /not.*unattended/i);
  assert.match(browser.limits, /No actual controller restart/);
  const rawTooling = read(tooling.stdout.file);
  assert.equal(hash(rawTooling), tooling.stdout.sha256);
  assert.deepEqual(JSON.parse(rawTooling.toString('utf8')), tooling.edge);
});
