'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file));
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const files = (directory = root) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => {
    assert.equal(entry.isSymbolicLink(), false);
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [path.relative(root, target)];
  }).sort();

test('closed owned inventory preserves exact raw evidence and canonical Git-source integrity', () => {
  const index = json('evidence\\content-index.json');
  assert.deepEqual(index.excluded, ['evidence\\content-index.json']);
  assert.deepEqual(index.entries.map((entry) => entry.file).sort(),
    files().filter((file) => file !== 'evidence\\content-index.json'));
  for (const entry of index.entries) {
    assert.equal(path.isAbsolute(entry.file), false);
    assert.equal(entry.file.split(/[\\/]/).includes('..'), false);
    const raw = read(entry.file);
    const bytes = entry.mode === 'raw' ? raw : canonical(raw);
    assert.equal(bytes.length, entry.bytes, entry.file);
    assert.equal(sha(bytes), entry.sha256, entry.file);
  }
});

test('evidence chain keeps the genuine RED and failed CSP instrumentation distinct from final GREEN', () => {
  const red = json('evidence\\red\\run.json');
  const green = json('evidence\\green\\run.json');
  const firstBrowser = json('evidence\\browser\\run.json');
  const failedProof = json('evidence\\browser-acceptance.json');
  const browser = json('evidence\\browser-final\\run.json');
  const proof = json('evidence\\browser-verified.json');
  const final = json('evidence\\final-green\\run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.assertionFailures, 5);
  assert.equal(green.exitCode, 0);
  assert.equal(green.passed, 24);
  assert.equal(firstBrowser.exitCode, 1);
  assert.equal(failedProof.outcome, 'FAIL');
  assert.match(failedProof.failure.message, /page\.addScriptTag/);
  assert.equal(failedProof.cleanup.awaitedFinallyClose, true);
  assert.equal(sha(canonical(read('evidence\\browser\\browser.test.cjs.snapshot'))),
    failedProof.canonicalSourceHashes['tests\\browser.test.cjs']);
  for (const [run, folder] of [[red, 'red'], [green, 'green'], [firstBrowser, 'browser'], [browser, 'browser-final'], [final, 'final-green']]) {
    assert.equal(sha(read(`evidence\\${folder}\\stdout.raw`)), run.rawStdoutSha256);
    assert.equal(sha(read(`evidence\\${folder}\\stderr.raw`)), run.rawStderrSha256);
    assert.equal(run.spawnError, null);
  }
  assert.equal(browser.exitCode, 0);
  assert.equal(browser.passed, 1);
  assert.equal(browser.browserCaptureExplicitlyEnabled, true);
  assert.equal(final.exitCode, 0);
  assert.equal(final.passed, 25);
  assert.equal(final.browserCaptureExplicitlyEnabled, false);
  assert.equal(proof.outcome, 'PASS');
  assert.equal(proof.cleanup.awaitedFinallyClose, true);
  assert.equal(proof.actualSyntheticAttempts, 13);
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.match(proof.browserVersion, /^156\./);
  assert.equal(proof.captureExplicitlyEnabled, true);
  assert.deepEqual(proof.pageErrors, []);
  assert.deepEqual(proof.exerciseNetworkRequests, []);
  assert.deepEqual(proof.egressGuardHits, []);
  assert.deepEqual(proof.probeResponses, []);
  for (const prefix of ['script-src', 'style-src', 'connect-src', 'frame-src', 'form-action']) {
    assert.ok(proof.csp.violations.some((event) => event.directive.startsWith(prefix)), prefix);
  }
  assert.equal(proof.csp.inlineGlobalAbsent, true);
  assert.equal(proof.csp.inlineStyleAbsent, true);
  assert.equal(proof.csp.fetchRejected, true);
  assert.equal(sha(read(proof.domSnapshot.path)), proof.domSnapshot.rawSha256);
  for (const [file, hash] of Object.entries(proof.canonicalSourceHashes)) assert.equal(sha(canonical(read(file))), hash, file);
  for (const [file, hash] of Object.entries(final.canonicalSourceHashes)) assert.equal(sha(canonical(read(file))), hash, file);
  assert.ok(new Date(red.completedAtUtc) <= new Date(green.startedAtUtc));
  assert.ok(new Date(green.completedAtUtc) <= new Date(firstBrowser.startedAtUtc));
  assert.ok(new Date(firstBrowser.completedAtUtc) <= new Date(browser.startedAtUtc));
});

test('qualified tooling, syntax and raw-byte attributes remain accurate without rewriting observations', () => {
  const tooling = json('evidence\\tooling.json');
  assert.equal(tooling.outcome, 'PASS');
  assert.equal(tooling.node, process.version);
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.browser.status, 'Valid');
  assert.match(tooling.browser.signer, /Microsoft Corporation/);
  assert.equal(tooling.browser.version, json('evidence\\browser-verified.json').browserVersion);
  assert.equal(sha(read(tooling.signatureStdoutPath)), tooling.signatureStdoutSha256);
  assert.equal(tooling.helper.publication, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(tooling.helper.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(sha(fs.readFileSync(path.join(repo, tooling.helper.path))), tooling.helper.sha256);
  assert.equal(tooling.downloads, 0);
  assert.equal(tooling.installs, 0);
  assert.equal(tooling.foregroundLease, false);
  const syntax = json('evidence\\syntax-final.json');
  assert.equal(syntax.outcome, 'PASS');
  for (const run of syntax.runs) {
    assert.equal(run.exitCode, 0);
    assert.equal(sha(canonical(read(run.file))), run.canonicalSha256, run.file);
  }
  const attributes = json('evidence\\attribute-qualification.json');
  assert.equal(attributes.outcome, 'PASS');
  for (const raw of attributes.raw) {
    assert.match(raw.attributes, /: text: unset/);
    assert.equal(raw.rawGitObject, raw.filteredGitObject);
    assert.equal(sha(read(raw.file)), raw.rawSha256, raw.file);
  }
});
