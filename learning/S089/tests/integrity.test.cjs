'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const zlib = require('node:zlib');
const vm = require('node:vm');
const {
  fs, path, repo, read, sha, lf, git, gitPath, acceptance, helperPath, helperSha256,
  testedHashes, ownedFiles,
} = require('./provenance.cjs');
const json = (file) => JSON.parse(read(file));

test('exact acceptance agrees with original raw CRLF, immutable canonical Git and current source slices', () => {
  const source = json('evidence\\source-contract.json');
  for (const [key, value] of Object.entries({
    cardId: 'A-S089', workerId: 'worker-A-S089', sourceId: 'S089', parentId: 'D-S089',
    nativeSiblingId: 'B-S089', kano: 'S', kanoUnit: 'A-S089', packet: 'SC-S089', entryGate: 'SOURCE',
  })) assert.equal(source[key], value, key);
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.equal(source.acceptanceEqualsBaseline, true);
  assert.equal(source.nativeAcceptanceNotCompleted, true);
  assert.equal(source.registryProjection.packet, source.packet);
  assert.equal(source.registryProjection.kanoUnit, source.kanoUnit);
  const raw = [];
  const canonical = [];
  const working = [];
  const current = [];
  for (const item of source.sources) {
    const bytes = zlib.gunzipSync(read(item.workingSnapshot));
    const baseline = zlib.gunzipSync(read(item.gitSnapshot));
    assert.equal(sha(bytes), item.workingSha256);
    assert.equal(bytes.length, item.workingBytes);
    assert.equal(sha(lf(bytes)), item.workingCanonicalSha256);
    assert.equal(bytes.includes(Buffer.from('\r\n')), item.workingContainsCRLF);
    assert.equal(item.workingContainsCRLF, true, 'Original CRLF provenance is retained');
    assert.equal(sha(baseline), item.gitSha256);
    assert.equal(lf(bytes).equals(lf(baseline)), item.fullCanonicalEqualsBaseline);
    assert.deepEqual(git(['show', `${source.baseline}:${gitPath(item.path)}`]), baseline);
    raw.push(bytes.toString());
    canonical.push(baseline.toString());
    working.push(fs.readFileSync(path.join(repo, item.path), 'utf8'));
    current.push(git(['show', `HEAD:${gitPath(item.path)}`]).toString());
  }
  for (const group of [raw, canonical, working, current]) assert.deepEqual(acceptance(...group), source.acceptance);
  assert.match(source.acceptance.parent, /shared harness remains able to report\/recover the bounded fault/);
  assert.match(source.acceptance.scenario, /without requiring the controller for every request/);
  assert.match(source.acceptance.packetRule, /every other A\/B card belongs to SC-Snnn/);
});

test('original RED is 18 actual assertions against a loadable stub with non-discovered intact snapshots', () => {
  const red = json('evidence\\verification\\red.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 19);
  assert.equal(red.pass, 1);
  assert.equal(red.fail, 18);
  assert.equal(red.assertionFailures, 18);
  assert.equal(red.spawnError, null);
  assert.equal(red.missingCodeOrTools, false);
  const stdout = read('evidence\\raw\\red.stdout');
  const stderr = read('evidence\\raw\\red.stderr');
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  assert.match(stdout.toString(), /'idle' !== 'prepared'/);
  assert.match(stdout.toString(), /Missing expected exception/);
  assert.doesNotMatch(stdout.toString() + stderr.toString(), /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError/);
  for (const item of json('evidence\\red\\snapshots.json')) {
    assert.ok(item.snapshot.endsWith('.snapshot'));
    const bytes = read(`evidence\\red\\${item.snapshot}`);
    assert.equal(sha(bytes), item.sha256);
    assert.equal(bytes.length, item.bytes);
    if (item.source !== 'model.js') assert.deepEqual(lf(bytes), lf(read(item.source)));
  }
  const module = { exports: {} };
  new vm.Script(read('evidence\\red\\model.js.snapshot').toString()).runInNewContext({ module });
  assert.equal(module.exports.createLesson().start({}).phase, 'idle');
});

test('BDD/RED then explicit IaC N/A then GREEN retain exact raw command provenance and read-only runs', () => {
  const red = json('evidence\\verification\\red.json');
  const iac = json('evidence\\iac-decision.json');
  const green = json('evidence\\verification\\model-green.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeImplementation, true);
  assert.equal(iac.actualNetworkManagementOrDataPlaneCertification, false);
  assert.equal(iac.postRedStubSha256, sha(read('evidence\\red\\model.js.snapshot')));
  assert.notEqual(iac.postRedStubSha256, sha(read('model.js')));
  assert.ok(Date.parse(iac.decidedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.ok(Date.parse(green.startedAtUtc) >= Date.parse(iac.decidedAtUtc));
  const files = ownedFiles().filter((file) => file.startsWith('evidence\\verification\\') && file.endsWith('.json'));
  for (const required of ['red', 'model-green', 'browser-green', 'syntax']) {
    assert.ok(files.includes(`evidence\\verification\\${required}.json`));
  }
  for (const file of files) {
    const record = json(file);
    assert.equal(record.spawnError, null);
    assert.equal(record.signal, null);
    assert.equal(sha(read(`evidence\\raw\\${record.name}.stdout`)), record.rawStdoutSha256);
    assert.equal(sha(read(`evidence\\raw\\${record.name}.stderr`)), record.rawStderrSha256);
    assert.equal(record.exitCode, record.name === 'red' ? 1 : 0);
    assert.equal(record.fail, record.name === 'red' ? 18 : 0);
    if (record.name !== 'red') assert.deepEqual(record.inputHashes, testedHashes());
    if (!record.browserCaptureEnabled) {
      assert.equal(record.verificationReadOnly, true);
      assert.deepEqual(record.ownedTreeBefore, record.ownedTreeAfter);
    } else {
      assert.equal(record.name, 'browser-green');
      assert.equal(record.verificationReadOnly, false);
    }
  }
});

test('actual browser proof uses the qualified published helper, offline signed pair and awaited cleanup', () => {
  const proof = json('evidence\\browser.json');
  const tooling = json('evidence\\tooling.json');
  assert.equal(proof.cardId, 'A-S089');
  assert.equal(proof.workerId, 'worker-A-S089');
  assert.equal(proof.mode, 'synthetic');
  assert.equal(proof.outcome, 'PASS');
  assert.equal(proof.captureExplicitlyEnabled, true);
  assert.equal(proof.runtime, 'v22.23.4');
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.equal(proof.browserVersion, '156.0.4314.50');
  assert.equal(tooling.node, proof.runtime);
  assert.equal(tooling.playwrightVersion, proof.playwrightVersion);
  assert.equal(tooling.browserVersion, proof.browserVersion);
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /Microsoft Corporation/);
  assert.deepEqual(proof.helper, { path: helperPath, sha256: helperSha256, publication: '53c0c0d' });
  assert.deepEqual(tooling.helper, proof.helper);
  assert.equal(sha(fs.readFileSync(path.join(repo, helperPath))), helperSha256);
  assert.equal(sha(read('evidence\\raw\\tooling.stdout')), tooling.rawStdoutSha256);
  assert.equal(sha(read('evidence\\raw\\tooling.stderr')), tooling.rawStderrSha256);
  for (const key of ['packagesInstalled', 'browserDownloaded', 'foregroundLease', 'unsafeFlags']) assert.equal(tooling[key], false);
  for (const key of ['actualNetworkManagementOrDataPlaneCertification', 'nativeSourceParentCompleted',
    'productionNode24Validated', 'unattendedLifecycleRunnerQualified', 'foregroundLease', 'unsafeFlags']) assert.equal(proof[key], false);
  assert.deepEqual(proof.cleanup, { attempted: true, awaited: true, completed: true });
  assert.deepEqual(proof.inputHashes, testedHashes());
  for (const item of proof.screenshots) {
    const bytes = read(item.path);
    assert.equal(bytes.length, item.bytes);
    assert.equal(sha(bytes), item.sha256);
    assert.deepEqual([...bytes.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
  }
});

test('retained real DOM proof separates positive, failure, unknown control/data and prediction outcomes', () => {
  const proof = json('evidence\\browser.json');
  assert.equal(proof.checks.length, 12);
  const checks = Object.fromEntries(proof.checks.map((check) => [check.name, check]));
  const positive = checks['keyboard-independent-pass'];
  assert.deepEqual(positive.keys, ['Tab', 'Enter', 'Space', 'ArrowDown']);
  assert.equal(positive.duringOutage.control, 'unavailable');
  assert.deepEqual(positive.duringOutage.active, { attempted: 3, success: 3, failure: 0, unknown: 0 });
  assert.equal(positive.observed.verification, 'Verification: PASS');
  const failure = checks['independent-service-failure'].observed;
  assert.equal(failure.control, 'available');
  assert.equal(failure.verification, 'Verification: FAIL');
  assert.equal(failure.active.failure, 1);
  assert.match(checks['controller-dependency-failure-wrong-prediction'].observed.prediction, /Incorrect prediction PASS/);
  const missingData = checks['missing-data-unknown'].observed;
  assert.equal(missingData.control, 'available');
  assert.equal(missingData.data, 'unverified');
  assert.equal(missingData.active.unknown, 1);
  const missingControl = checks['missing-recovery-unknown-control-successful-data'].observed;
  assert.equal(missingControl.control, 'unknown');
  assert.equal(missingControl.data, 'continuing-established-service');
  assert.equal(missingControl.active.success, 3);
  assert.deepEqual(checks['retained-history-capacity'].observed.retained, { attempted: 18, success: 13, failure: 4, unknown: 1 });
  assert.match(checks['state-guard'].visibleError, /Invalid state/);
  assert.match(checks['invalid-input-focused-error'].visibleError, /Invalid input/);
  assert.equal(checks['partial-and-idempotent-reset'].observed.phase, 'idle');
  assert.deepEqual(checks['partial-and-idempotent-reset'].observed.history, []);
  assert.ok(checks['narrow-keyboard-layout'].layout.document <= 360);
});

test('CSP violations are deliberate diagnostics; normal exercise has no errors, network or responses', () => {
  const proof = json('evidence\\browser.json');
  assert.deepEqual(proof.pageErrors, []);
  assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
  assert.deepEqual(proof.exerciseNetworkRequests, []);
  assert.deepEqual(proof.probeResponses, []);
  assert.equal(proof.csp.inlineRan, false);
  assert.equal(proof.csp.connection, 'TypeError');
  assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith('script-src') && entry.blockedURI === 'inline'));
  assert.ok(proof.csp.violations.some((entry) => entry.directive === 'connect-src'));
  assert.equal(sha(read('evidence\\raw\\csp-diagnostic.json')), proof.rawCspDiagnosticSha256);
  assert.match(read('tests\\browser.test.cjs').toString(), /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(read('tests\\browser.test.cjs').toString(), /finally \{[\s\S]*await session\.close\(\)/);
});

test('complete owned index preserves raw evidence and qualifies canonical LF Git blobs without rewriting', () => {
  const index = json('evidence\\content-index.json');
  const blocker = json('evidence\\raw\\publication-blocker.json');
  assert.equal(blocker.exitCode, 2);
  assert.equal(blocker.noCommitCreated, true);
  assert.equal(blocker.publicationPresent, false);
  assert.equal(blocker.behavioralRedCredit, false);
  assert.equal(sha(read('evidence\\raw\\publication-blocker.stdout')), blocker.rawStdoutSha256);
  assert.equal(sha(read('evidence\\raw\\publication-blocker.stderr')), blocker.rawStderrSha256);
  assert.match(read('evidence\\raw\\publication-blocker.stdout').toString(), /trailing whitespace/);
  assert.equal(index.cardId, 'A-S089');
  assert.deepEqual(index.files.map((item) => item.path).sort(),
    ownedFiles().filter((file) => file !== 'evidence\\content-index.json'));
  const published = git(['ls-tree', 'HEAD', '--', 'learning\\S089\\index.html']).toString().trim().length > 0;
  for (const item of index.files) {
    const bytes = read(item.path);
    const relative = `learning\\S089\\${item.path}`;
    assert.equal(sha(item.mode === 'raw' ? bytes : lf(bytes)), item.sha256, item.path);
    assert.equal(git(['hash-object', `--path=${gitPath(relative)}`, '--stdin'], bytes).toString().trim(), item.gitBlob, item.path);
    if (item.mode === 'raw') {
      assert.match(git(['check-attr', 'text', '--', relative]).toString(), /text: unset/);
      if (!item.path.endsWith('.png')) {
        assert.match(git(['check-attr', 'diff', '--', relative]).toString(), /diff: unset/);
      }
    }
    if (published) {
      const committed = git(['show', `HEAD:${gitPath(relative)}`]);
      assert.equal(sha(item.mode === 'raw' ? committed : lf(committed)), item.sha256, `Canonical committed ${item.path}`);
      assert.equal(git(['rev-parse', `HEAD:${gitPath(relative)}`]).toString().trim(), item.gitBlob);
    }
  }
});
