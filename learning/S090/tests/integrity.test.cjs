'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { root, repo, read, sha, canonical, git, acceptance } = require('.\\provenance.cjs');
const json = (file) => JSON.parse(read(file));

test('exact source acceptance matches preserved CRLF, immutable Git baseline and current authoritative slices', () => {
  const source = json('evidence\\source-contract.json');
  for (const [key, value] of Object.entries({
    cardId: 'A-S090', workerId: 'worker-A-S090', sourceId: 'S090', parentId: 'D-S090',
    siblingId: 'B-S090', kano: 'S', kanoUnit: 'A-S090', packet: 'SC-S090', entryGate: 'SOURCE',
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
    assert.equal(sha(raw), item.workingSha256);
    assert.equal(sha(canonical(raw)), item.workingCanonicalSha256);
    assert.equal(sha(baseline), item.gitSha256);
    assert.equal(raw.includes(Buffer.from('\r\n')), item.workingContainsCRLF);
    assert.equal(item.workingContainsCRLF, true);
    assert.equal(canonical(raw).equals(canonical(baseline)), item.fullCanonicalEqualsBaseline);
    assert.deepEqual(git(['show', `${source.baseline}:${item.path.replace(/\\/g, '/')}`]), baseline);
    working.push(raw.toString());
    committed.push(baseline.toString());
    current.push(fs.readFileSync(path.join(repo, item.path), 'utf8'));
  }
  assert.deepEqual(acceptance(...working), source.acceptance);
  assert.deepEqual(acceptance(...committed), source.acceptance);
  assert.deepEqual(acceptance(...current), source.acceptance);
  assert.match(source.acceptance.readmeS090, /traffic, work, state ownership, or rollback requirements/);
  assert.equal(source.nativeAcceptanceNotCompleted, true);
});

test('genuine non-auto-discovered RED preserves a loadable stub and nineteen assertion failures', () => {
  const red = json('evidence\\red\\run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 21);
  assert.equal(red.pass, 2);
  assert.equal(red.fail, 19);
  assert.equal(red.assertionFailures, 19);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  for (const item of red.snapshots) {
    assert.ok(item.snapshot.endsWith('.snapshot'));
    const bytes = read(`evidence\\red\\${item.snapshot}`);
    assert.equal(bytes.length, item.bytes);
    assert.equal(sha(bytes), item.sha256);
    if (item.source !== 'model.js') assert.equal(sha(canonical(read(item.source))), sha(canonical(bytes)));
  }
  const stdout = zlib.gunzipSync(read('evidence\\red\\run.stdout.raw.gz'));
  const stderr = zlib.gunzipSync(read('evidence\\red\\run.stderr.raw.gz'));
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  assert.match(stdout.toString(), /NOT_IMPLEMENTED/);
  assert.match(stdout.toString(), /code: 'ERR_ASSERTION'/);
  assert.match(stdout.toString(), /Missing expected exception/);
  assert.doesNotMatch(stdout.toString() + stderr.toString(), /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError:/);
  const sandbox = { module: { exports: {} } };
  new vm.Script(read('evidence\\red\\model.js.snapshot').toString()).runInNewContext(sandbox);
  const stub = sandbox.module.exports.createLesson();
  assert.equal(stub.snapshot().phase, 'idle');
  assert.equal(stub.begin('all-dependencies').current.lastAttempt.outcome, 'NOT_IMPLEMENTED');
  assert.equal(stub.act('attempt-retirement').current.lastAttempt.outcome, 'NOT_IMPLEMENTED');
  assert.notEqual(sha(canonical(read('model.js'))), red.snapshots.find((item) => item.source === 'model.js').sha256);
});

test('IaC N/A follows actual assertion RED and precedes unchanged model GREEN', () => {
  const source = json('evidence\\source-contract.json');
  const red = json('evidence\\red\\run.json');
  const iac = json('evidence\\iac-decision.json');
  const green = json('evidence\\verification\\model-green.json');
  assert.ok(Date.parse(source.recordedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeImplementation, true);
  assert.equal(iac.retirementIsTeachingTraceOnly, true);
  assert.equal(iac.nativeDrainRetentionRetirementCertified, false);
  assert.ok(Date.parse(iac.decidedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.ok(Date.parse(green.startedAtUtc) >= Date.parse(iac.decidedAtUtc));
  assert.equal(green.exitCode, 0);
  assert.equal(green.tests, 21);
  assert.equal(green.fail, 0);
});

test('actual browser proof binds source, authorized helper, signed offline tooling, CSP and awaited cleanup', () => {
  const proof = json('evidence\\browser.json');
  const tooling = json('evidence\\tooling.json');
  assert.equal(proof.outcome, 'PASS');
  assert.equal(proof.captureExplicitlyEnabled, true);
  assert.equal(proof.runtime, 'v22.23.4');
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.equal(proof.browserVersion, tooling.browserVersion);
  assert.match(proof.browserVersion, /^156\./);
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /Microsoft Corporation/);
  assert.equal(tooling.helperPublication, '53c0c0d82cc1db6780a87ac2b1085734af6d5c60');
  assert.equal(proof.helper.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(sha(fs.readFileSync(path.join(repo, proof.helper.path))), proof.helper.sha256);
  assert.deepEqual(canonical(fs.readFileSync(path.join(repo, proof.helper.path))),
    canonical(git(['show', `${tooling.helperPublication}:testing/browser/isolated.cjs`])));
  for (const key of ['packagesInstalled', 'browserDownloaded', 'foregroundLease', 'unsafeFlags',
    'productionNode24Validated', 'abandonedLifecyclePrototypeQualified', 'nativeDrainRetentionRetirementCertified']) {
    assert.equal(tooling[key], false, key);
  }
  assert.equal(proof.retirementIsTeachingTraceOnly, true);
  assert.equal(proof.nativeDrainRetentionRetirementCertified, false);
  assert.equal(proof.productionNode24Validated, false);
  assert.deepEqual(proof.pageErrors, []);
  assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
  assert.deepEqual(proof.exerciseNetworkRequests, []);
  assert.deepEqual(proof.probeNetworkRequests, []);
  assert.deepEqual(proof.probeResponses, []);
  assert.equal(proof.csp.inlineRan, false);
  assert.equal(proof.csp.handlerRan, false);
  assert.equal(proof.csp.inlineStyle, '');
  assert.equal(proof.csp.connection, 'TypeError');
  for (const prefix of ['script-src', 'style-src', 'connect-src', 'frame-src', 'form-action']) {
    assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith(prefix)), prefix);
  }
  assert.equal(proof.cleanup.closeAwaited, true);
  assert.equal(proof.cleanup.closed, true);
  assert.equal(proof.narrowViewport.bodyOverflow, false);
  assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
  for (const phrase of ['Tab skip', 'Out-of-order', 'Early retirement FAILURE', 'empty predictions',
    'teaching-only SUCCESS', 'Forged retired', 'Missing inventory UNKNOWN', 'Injected action enum',
    'Known work FAILURE', 'Four complete histories', 'Explicit Space reset',
    'traffic-only', 'users-only', 'work-only', 'ownership-only', 'retention-only',
    'prototype fixture', 'Six-attempt bound', 'Narrow viewport', 'Reload', 'light/dark', 'Actual CSP']) {
    assert.ok(proof.groups.some((name) => name.includes(phrase)), phrase);
  }
  assert.equal(new Set(proof.groups).size, proof.groups.length);
  for (const [file, hash] of Object.entries(proof.testedSourceHashes)) assert.equal(sha(canonical(read(file))), hash, file);
  assert.equal(proof.screenshots.length, 2);
  for (const file of proof.screenshots) {
    assert.deepEqual(read(`evidence\\${file}`).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
});

test('owned content index qualifies canonical Git-source text and exact raw evidence without writes', () => {
  const index = json('evidence\\content-index.json');
  const found = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relative = path.relative(root, file);
      if (relative === path.join('evidence', 'verification')) continue;
      if (entry.isDirectory()) walk(file);
      else if (relative !== path.join('evidence', 'content-index.json')) found.push(relative);
    }
  }
  walk(root);
  assert.deepEqual(found.sort(), index.files.map((entry) => entry.path).sort());
  for (const item of index.files) {
    const bytes = read(item.path);
    const qualified = item.mode === 'raw' ? bytes : canonical(bytes);
    assert.equal(qualified.length, item.bytes, item.path);
    assert.equal(sha(qualified), item.sha256, item.path);
    const gitPath = `learning/S090/${item.path.replace(/\\/g, '/')}`;
    const cleanedHash = git(['hash-object', `--path=${gitPath}`, '--stdin'], bytes).toString().trim();
    const expectedHash = git(['hash-object', '--stdin'], qualified).toString().trim();
    assert.equal(cleanedHash, expectedHash, `Read-only clean-filter integrity: ${item.path}`);
    if (item.mode === 'raw') assert.match(git(['check-attr', 'text', '--', gitPath]).toString(), /: text: unset/);
  }
});

test('all explicit run records preserve raw stdout/stderr and report their actual result', () => {
  const failed = json('evidence\\verification\\browser-check.json');
  const failedSource = json('evidence\\raw\\browser-check.source.json');
  assert.equal(failed.exitCode, 1);
  assert.equal(failed.tests, 1);
  assert.equal(failed.fail, 1);
  assert.equal(failed.assertionFailures, 1);
  assert.equal(failed.missingCodeOrTools, false);
  assert.equal(sha(read('evidence\\raw\\browser-check.browser.test.cjs.snapshot')), failedSource.sha256);
  assert.match(zlib.gunzipSync(read('evidence\\verification\\browser-check.stdout.raw.gz')).toString(), /'light' !== 'dark'/);
  assert.match(failedSource.cause, /skip-link fragment/);
  assert.equal(failedSource.unchangedSinceFailedRun, true);
  assert.notEqual(sha(read('tests\\browser.test.cjs')), failedSource.sha256);
  const recovered = json('evidence\\verification\\browser-check-2.json');
  assert.equal(recovered.exitCode, 0);
  assert.equal(recovered.tests, 1);
  assert.equal(recovered.fail, 0);
  assert.ok(Date.parse(recovered.startedAtUtc) > Date.parse(failed.completedAtUtc));
  const directory = path.join(root, 'evidence', 'verification');
  for (const file of fs.readdirSync(directory).filter((name) => name.endsWith('.json'))) {
    const record = json(`evidence\\verification\\${file}`);
    assert.equal(record.cardId, 'A-S090');
    assert.equal(record.workerId, 'worker-A-S090');
    assert.equal(record.runtime, 'v22.23.4');
    assert.equal(record.spawnError, null);
    assert.equal(record.missingCodeOrTools, false);
    const name = path.basename(file, '.json');
    assert.equal(sha(zlib.gunzipSync(read(`evidence\\verification\\${name}.stdout.raw.gz`))), record.rawStdoutSha256);
    assert.equal(sha(zlib.gunzipSync(read(`evidence\\verification\\${name}.stderr.raw.gz`))), record.rawStderrSha256);
    if (record.exitCode === 0 && record.stage !== 'syntax') {
      assert.equal(record.pass, record.tests);
      assert.equal(record.fail, 0);
    }
  }
});
