'use strict';

const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { gunzipSync } = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const acceptedC020 = '2dc471daab3ffa202d83aba2df443e280cad3656';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const read = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const stage = (name) => read(path.join(evidence, `${name}.json`));
const source = (record, relative) => record.sourceHashes.find((entry) => entry.path === relative);
function rawStream(relative) {
  const bytes = fs.readFileSync(path.join(repo, relative));
  return relative.endsWith('.gz') ? gunzipSync(bytes) : bytes;
}

test('accepted C020 is byte-unchanged from RED and git-unchanged from its accepted dependency commit', () => {
  const red = stage('behavioral-red');
  for (const name of ['contract.js', 'profiles.cjs', 'inspector.js']) {
    const relative = path.join('capability', 'C020', name);
    assert.equal(hash(fs.readFileSync(path.join(repo, relative))), source(red, relative).sha256);
  }
  assert.equal(execFileSync('git', [
    '--no-pager', 'diff', '--exit-code', acceptedC020, '--', path.join('capability', 'C020')
  ], { cwd: repo, encoding: 'utf8' }), '');
});

test('actual recorded BDD/stub/behavioral RED/IaC-N-A/initial GREEN stages are chronological', () => {
  const names = ['stub-load', 'behavioral-red', 'iac-na', 'initial-green'];
  let completed = 0;
  for (const name of names) {
    const record = stage(name);
    assert.equal(record.cardId, 'C021');
    assert.equal(record.runtime, 'v22.23.4');
    assert.equal(record.exitCode, name === 'behavioral-red' ? 1 : 0);
    assert.equal(record.signal, null);
    assert.equal(record.error, null);
    assert.ok(Date.parse(record.startedAtUtc) >= completed);
    assert.ok(Date.parse(record.completedAtUtc) >= Date.parse(record.startedAtUtc));
    completed = Date.parse(record.completedAtUtc);
    for (const stream of ['stdout', 'stderr']) {
      assert.equal(hash(rawStream(record[stream])), record[`${stream}Sha256`]);
    }
    if (record.encodingMigration) {
      const originalBytes = fs.readFileSync(path.join(repo, record.encodingMigration.originalMetadata));
      assert.equal(hash(originalBytes), record.encodingMigration.originalMetadataSha256);
      const original = JSON.parse(originalBytes);
      for (const field of [
        'cardId', 'stage', 'command', 'runtime', 'startedAtUtc', 'completedAtUtc',
        'exitCode', 'signal', 'error', 'stdoutSha256', 'stderrSha256', 'sourceHashes'
      ]) assert.deepEqual(record[field], original[field], `${name}/${field} must preserve original execution metadata`);
    }
    const feature = path.join('capability', 'C021', 'C021.feature');
    assert.equal(source(record, feature).sha256, hash(rawStream(path.join('capability', 'C021', 'evidence', 'red', 'C021.feature.original.gz'))));
  }
});

test('retained RED is a loadable original stub plus real assertion failures, not infrastructure errors', () => {
  const red = stage('behavioral-red');
  const stub = rawStream(path.join('capability', 'C021', 'evidence', 'red', 'compatibility.stub.original.js.gz'));
  assert.equal(hash(stub), source(red, path.join('capability', 'C021', 'compatibility.js')).sha256);
  const historical = path.join('capability', 'C021', 'evidence', 'red', 'compatibility.initial.snapshot.cjs');
  const historicalBytes = rawStream(path.join('capability', 'C021', 'evidence', 'red', 'compatibility.initial.original.cjs.gz'));
  assert.equal(hash(historicalBytes), source(red, historical).sha256);
  for (const [original, runnable] of [
    [stub, path.join(root, 'compatibility.stub.snapshot.js')],
    [historicalBytes, path.join(repo, historical)],
    [rawStream(path.join('capability', 'C021', 'evidence', 'red', 'C021.feature.original.gz')), path.join(root, 'C021.feature')]
  ]) {
    assert.equal(original.toString('utf8').replace(/\r\n/g, '\n'), fs.readFileSync(runnable, 'utf8'),
      'Runnable historical copies may differ from byte-exact archives only in CRLF-to-LF terminators');
  }
  const stdout = rawStream(red.stdout).toString('utf8');
  assert.match(stdout, /# tests 6\b/);
  assert.match(stdout, /# pass 1\b/);
  assert.match(stdout, /# fail 5\b/);
  assert.equal((stdout.match(/code: 'ERR_ASSERTION'/g) || []).length, 5);
  assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
  assert.match(rawStream(stage('initial-green').stdout).toString('utf8'), /# pass 6\b/);
  assert.equal(/(?:^test-|[._-]test\.)/.test(path.basename(historical)), false);
  const normalTests = ['compatibility.test.cjs', 'guards.test.cjs', 'integrity.test.cjs'];
  for (const name of normalTests.filter((name) => name !== 'integrity.test.cjs')) {
    assert.doesNotMatch(fs.readFileSync(path.join(__dirname, name), 'utf8'), /C021_RED_SUBJECT/);
  }
});

test('the portable surface directly reuses the actual C020 scripts with restrictive CSP and no inline handlers', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['../C020/contract.js', '../C020/inspector.js', 'compatibility.js', 'page.js']);
  assert.equal((html.match(/<script\b/g) || []).length, 4);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|\sstyle\s*=/i);
  assert.match(html, /script-src 'self'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /Bundled synthetic catalog replay/);
  assert.match(html, /not a live implementation or HTTP observation/);
  assert.equal(fs.existsSync(path.join(root, 'package.json')), false);
  assert.equal(fs.existsSync(path.join(root, 'server.cjs')), false);
  const attributes = fs.readFileSync(path.join(root, '.gitattributes'), 'utf8');
  assert.equal(attributes.trim(), '* -text', 'Hashed byte preservation must not suppress diffs or publisher checks.');
});

test('captured actual browser proof is explicit, isolated, closed, and limited to signed Edge156/Playwright1.56.1/Node22', () => {
  const proof = read(path.join(evidence, 'browser-acceptance.json'));
  assert.equal(proof.cardId, 'C021');
  assert.equal(proof.outcome, 'passed');
  assert.equal(proof.deliberateCapture, true);
  assert.equal(proof.mode, 'isolated-headless-local-file');
  assert.equal(proof.testRuntime, 'v22.23.4');
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.match(proof.browserVersion, /^156\./);
  assert.equal(proof.installedBrowserProvenance.recordedSignatureStatus, 'Valid');
  assert.equal(proof.cleanup.browserClosed, true);
  assert.equal(proof.helperQualification.publishedCommit, '53c0c0d82cc1');
  assert.equal(proof.helperQualification.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(proof.helperQualification.finalSha256, proof.helperQualification.sha256);
  assert.equal(proof.helperQualification.prototypeUsed, false);
  assert.ok(proof.checks.length >= 26);
  assert.equal(proof.checks.every((check) => check.passed === true), true);
  assert.equal(proof.integratedForegroundLeaseUsed, false);
  for (const key of ['productionRuntimeValidated', 'nativeTargetQualified', 'identityVerified', 'durableStoreImplemented']) {
    assert.equal(proof[key], false);
  }
  for (const key of ['newListenersStarted', 'liveAzureRuns', 'authorizedCloudSpend']) assert.equal(proof[key], 0);
  for (const term of ['Tab/Tab/Enter', 'raw-breaking', 'missing dependency', 'reset', 'CSP']) {
    assert.ok(proof.checks.some((check) => check.name.includes(term)), term);
  }
  assert.equal(fs.statSync(path.join(repo, proof.screenshot)).isFile(), true);
});

test('manifest source hashes and every linked historical verification record match committed proof bytes', () => {
  const manifest = read(path.join(root, 'evidence.json'));
  assert.equal(manifest.cardId, 'C021');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnits, 1);
  assert.equal(manifest.acceptedDependency.commit, acceptedC020);
  assert.deepEqual(manifest.parents, ['H005']);
  for (const entry of manifest.sourceHashes) {
    assert.equal(hash(fs.readFileSync(path.join(repo, entry.path))), entry.sha256, entry.path);
  }
  for (const entry of manifest.evidenceFiles) {
    assert.equal(hash(fs.readFileSync(path.join(repo, entry.path))), entry.sha256, entry.path);
  }
  for (const entry of manifest.workflow.filter((item) => item.record)) {
    const record = read(path.join(repo, entry.record));
    assert.equal(record.exitCode, entry.expectedExitCode, entry.stage);
  }
});
