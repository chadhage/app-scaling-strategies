'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { repo, read, sha, lf, git, acceptance, filesBelow, HELPER_SHA } = require('.\\provenance.cjs');
const json = (file) => JSON.parse(read(file));

test('exact acceptance matches preserved raw CRLF, declared Git baseline and current authoritative slices', () => {
  const source = json('evidence\\source-contract.json');
  for (const [key, value] of Object.entries({
    cardId: 'A-S092', workerId: 'worker-A-S092', sourceId: 'S092', parentId: 'D-S092',
    siblingId: 'B-S092', kano: 'S', kanoUnit: 'A-S092', packet: 'SC-S092', entryGate: 'SOURCE',
  })) assert.equal(source[key], value, key);
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.equal(source.acceptanceEqualsBaseline, true);
  const working = [];
  const committed = [];
  const current = [];
  for (const item of source.sources) {
    const raw = zlib.gunzipSync(read(item.workingSnapshot));
    const baseline = zlib.gunzipSync(read(item.gitSnapshot));
    assert.equal(raw.length, item.workingBytes);
    assert.equal(baseline.length, item.gitBytes);
    assert.equal(sha(raw), item.workingSha256);
    assert.equal(sha(lf(raw)), item.workingCanonicalSha256);
    assert.equal(sha(baseline), item.gitSha256);
    assert.equal(sha(lf(baseline)), item.gitCanonicalSha256);
    assert.equal(raw.includes(Buffer.from('\r\n')), item.workingContainsCRLF);
    assert.equal(lf(raw).equals(lf(baseline)), item.fullCanonicalEqualsBaseline);
    assert.deepEqual(git(['show', `${source.baseline}:${item.path.replace(/\\/g, '/')}`]), baseline);
    working.push(raw.toString());
    committed.push(baseline.toString());
    current.push(fs.readFileSync(path.join(repo, item.path), 'utf8'));
  }
  assert.ok(source.sources.some((item) => item.workingContainsCRLF), 'Retain actual working CRLF without normalization');
  assert.deepEqual(acceptance(...working), source.acceptance);
  assert.deepEqual(acceptance(...committed), source.acceptance);
  assert.deepEqual(acceptance(...current), source.acceptance);
  assert.equal(source.nativeAcceptanceNotCompleted, true);
});

test('RED is non-auto-discovered, loadable and preserves unchanged BDD/fixtures/assertions plus genuine failure output', () => {
  const red = json('evidence\\red\\run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 16);
  assert.equal(red.pass, 1);
  assert.equal(red.fail, 15);
  assert.equal(red.assertionFailures, 15);
  assert.equal(red.spawnError, null);
  assert.equal(red.missingCodeOrTools, false);
  const snapshots = json('evidence\\red\\snapshots.json');
  for (const item of snapshots) {
    assert.ok(item.snapshot.endsWith('.snapshot'));
    const raw = read(`evidence\\red\\${item.snapshot}`);
    assert.equal(raw.length, item.bytes);
    assert.equal(sha(raw), item.sha256);
    assert.equal(sha(lf(raw)), item.canonicalSha256);
    if (item.source !== 'model.js') assert.equal(sha(lf(read(item.source))), item.canonicalSha256);
  }
  const stdout = zlib.gunzipSync(read('evidence\\red\\run.stdout.raw.gz'));
  const stderr = zlib.gunzipSync(read('evidence\\red\\run.stderr.raw.gz'));
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  assert.match(stdout.toString(), /code: 'ERR_ASSERTION'/);
  assert.match(stdout.toString(), /Missing expected exception/);
  assert.doesNotMatch(stdout.toString() + stderr.toString(), /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError/);
  const moduleObject = { exports: {} };
  new vm.Script(read('evidence\\red\\model.js.snapshot').toString()).runInNewContext({ module: moduleObject });
  assert.equal(moduleObject.exports.createLesson().start({}).phase, 'IDLE');
  assert.notEqual(sha(lf(read('model.js'))), snapshots.find((item) => item.source === 'model.js').canonicalSha256);
});

test('explicit resource-free IaC N/A follows actual RED and precedes focused GREEN', () => {
  const red = json('evidence\\red\\run.json');
  const iac = json('evidence\\iac-decision.json');
  const green = json('evidence\\verification\\green.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeImplementation, true);
  assert.equal(iac.cloudOrResourceOperations, false);
  assert.equal(iac.nativeCanaryOrRollbackCertified, false);
  assert.equal(iac.productionNode24Validated, false);
  assert.ok(Date.parse(iac.decidedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.ok(Date.parse(green.startedAtUtc) >= Date.parse(iac.decidedAtUtc));
  assert.equal(green.exitCode, 0);
  assert.equal(green.tests, 21);
  assert.equal(green.pass, 21);
  assert.equal(green.fail, 0);
  assert.equal(green.spawnError, null);
  assert.equal(sha(zlib.gunzipSync(read('evidence\\verification\\green.stdout.raw.gz'))), green.rawStdoutSha256);
  assert.equal(sha(zlib.gunzipSync(read('evidence\\verification\\green.stderr.raw.gz'))), green.rawStderrSha256);
});

test('actual syntax checks cover all current JavaScript sources without changing their canonical content', () => {
  const syntax = json('evidence\\syntax.json');
  const scripts = filesBelow().filter((file) => /\.(?:js|cjs)$/.test(file));
  assert.deepEqual(syntax.results.map((item) => item.file), scripts);
  for (const item of syntax.results) {
    assert.equal(item.exitCode, 0, item.file);
    assert.equal(item.spawnError, null);
    assert.equal(sha(lf(read(item.file))), item.canonicalSha256);
    const prefix = `evidence\\raw\\syntax\\${item.file.replace(/\\/g, '_')}`;
    assert.equal(sha(zlib.gunzipSync(read(`${prefix}.stdout.raw.gz`))), item.stdoutSha256);
    assert.equal(sha(zlib.gunzipSync(read(`${prefix}.stderr.raw.gz`))), item.stderrSha256);
  }
});

test('actual browser proof qualifies the exact helper, signed offline tooling, DOM checks, CSP and awaited cleanup', () => {
  const proof = json('evidence\\browser.json');
  const tooling = json('evidence\\tooling.json');
  assert.equal(proof.outcome, 'PASS');
  assert.equal(proof.captureExplicitlyEnabled, true);
  assert.equal(proof.checks.length, 8);
  assert.ok(proof.checks.every((item) => item.pass === true));
  assert.equal(proof.helperSha256, HELPER_SHA);
  assert.equal(tooling.helperSha256, HELPER_SHA);
  assert.equal(proof.helperAPI, 'openIsolatedLesson');
  assert.equal(tooling.helperPublication, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(proof.node, 'v22.23.4');
  assert.equal(proof.playwright, '1.56.1');
  assert.equal(proof.browserVersion, '156.0.4314.50');
  assert.equal(tooling.edge.signatureStatus, 'Valid');
  assert.match(tooling.edge.signer, /CN=Microsoft Corporation/);
  assert.equal(tooling.abandonedLifecyclePrototypeQualified, false);
  assert.equal(proof.cleanup.awaitedInFinally, true);
  assert.equal(proof.cleanup.completed, true);
  assert.equal(proof.normalVerificationReadOnly, true);
  assert.equal(proof.nativeCanaryRollbackOrContinuityCertified, false);
  assert.equal(proof.productionNode24Validated, false);
  for (const item of proof.sourceDigests) assert.equal(sha(lf(read(item.file))), item.canonicalLFSourceSha256, item.file);
  assert.equal(sha(zlib.gunzipSync(read('evidence\\raw\\isolated.cjs.raw.gz'))), HELPER_SHA);
  const signature = JSON.parse(zlib.gunzipSync(read('evidence\\raw\\edge-signature.stdout.raw.gz')).toString().trim());
  assert.deepEqual(signature, tooling.edge);
  for (const item of proof.screenshots) {
    const raw = read(item.file);
    assert.equal(raw.length, item.bytes);
    assert.equal(sha(raw), item.rawSha256);
    assert.deepEqual(raw.subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
  const csp = proof.checks.at(-1).observations;
  assert.equal(csp.blocked.inlineRan, false);
  assert.equal(csp.blocked.evalRan, false);
  assert.equal(csp.blocked.evalBlocked, true);
  assert.equal(csp.blocked.connectionBlocked, true);
  for (const directive of ['script-src-elem', 'script-src', 'connect-src', 'frame-src', 'object-src', 'form-action']) {
    assert.ok(csp.violations.some((event) => event.directive === directive), directive);
  }
  assert.equal(csp.noRemoteRequests, true);
  assert.equal(csp.noPageErrors, true);
  assert.equal(csp.securityBypassUsed, false);
});

test('canonical owned source and byte-exact proof inventory qualify Git objects without rewriting evidence', () => {
  const index = json('evidence\\content-index.json');
  assert.equal(index.cardId, 'A-S092');
  assert.equal(index.normalVerificationReadOnly, true);
  for (const item of index.sources) assert.equal(sha(lf(read(item.file))), item.canonicalLFSourceSha256, item.file);
  for (const item of index.proof) {
    assert.equal(read(item.file).length, item.bytes, item.file);
    assert.equal(sha(read(item.file)), item.rawSha256, item.file);
  }
  const indexed = [...index.sources.map((item) => item.file), ...index.proof.map((item) => item.file), 'evidence\\content-index.json'].sort();
  assert.deepEqual(filesBelow(), indexed);
  const attributes = read('.gitattributes').toString();
  assert.match(attributes, /evidence\/raw\/\*\* -text/);
  assert.match(attributes, /evidence\/red\/\*\.snapshot -text/);
  const rawPaths = index.proof.filter((item) => /\.snapshot$|\.gz$|\.png$|\\browser\.json$/.test(item.file))
    .map((item) => `learning/S092/${item.file.replace(/\\/g, '/')}`);
  const attr = git(['check-attr', 'text', '--', ...rawPaths]).toString().trim().split(/\r?\n/);
  assert.equal(attr.length, rawPaths.length);
  assert.ok(attr.every((line) => line.endsWith(': text: unset')), 'Raw evidence must never be text-normalized');
  const tracked = git(['ls-files', '--', 'learning\\S092']).toString().trim();
  if (!tracked) return;
  const entries = tracked.split(/\r?\n/).map((file) => file.replace(/^learning\/S092\//, '').replace(/\//g, '\\')).sort();
  assert.deepEqual(entries, indexed, 'Published scope must contain the entire owned inventory');
  const refs = indexed.map((file) => `HEAD:learning/S092/${file.replace(/\\/g, '/')}`);
  const blobs = git(['cat-file', '--batch'], Buffer.from(`${refs.join('\n')}\n`));
  let offset = 0;
  for (const file of indexed) {
    const end = blobs.indexOf(10, offset);
    const header = blobs.subarray(offset, end).toString().split(' ');
    assert.equal(header[1], 'blob', file);
    const size = Number(header[2]);
    const raw = blobs.subarray(end + 1, end + 1 + size);
    offset = end + 1 + size + 1;
    if (index.proof.some((item) => item.file === file)) assert.equal(sha(raw), sha(read(file)), `raw Git proof ${file}`);
    else assert.equal(sha(lf(raw)), sha(lf(read(file))), `canonical Git source ${file}`);
  }
  assert.equal(offset, blobs.length);
});
