'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { fs, path, root, repo, read, sha, lf, git, acceptance, helperPath, helperSha256, testedHashes } = require('./provenance.cjs');
const json = (file) => JSON.parse(read(file));

test('exact source acceptance matches raw CRLF provenance and canonical baseline/current Git slices', () => {
  const source = json('evidence\\source-contract.json');
  for (const [key, value] of Object.entries({
    cardId: 'A-S085', workerId: 'worker-A-S085', sourceId: 'S085', parentId: 'D-S085',
    kano: 'S', kanoUnit: 'A-S085', packet: 'SC-S085', entryGate: 'SOURCE',
  })) assert.equal(source[key], value, key);
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.equal(source.acceptanceEqualsBaseline, true);
  assert.equal(source.registryProjection.id, source.cardId);
  assert.equal(source.registryProjection.kanoUnit, source.kanoUnit);
  assert.equal(source.registryProjection.packet, source.packet);
  const rawSources = [];
  const gitSources = [];
  const workingSources = [];
  const currentGitSources = [];
  for (const item of source.sources) {
    const raw = zlib.gunzipSync(read(item.workingSnapshot));
    const baseline = zlib.gunzipSync(read(item.gitSnapshot));
    assert.equal(raw.length, item.workingBytes);
    assert.equal(sha(raw), item.workingSha256);
    assert.equal(sha(lf(raw)), item.workingCanonicalSha256);
    assert.equal(sha(baseline), item.gitSha256);
    assert.equal(raw.includes(Buffer.from('\r\n')), item.workingContainsCRLF);
    assert.equal(item.workingContainsCRLF, true, 'Original raw CRLF must remain unmodified');
    assert.equal(lf(raw).equals(lf(baseline)), item.fullCanonicalEqualsBaseline);
    const gitPath = item.path.replace(/\\/g, '/');
    assert.deepEqual(git(['show', `${source.baseline}:${gitPath}`]), baseline);
    rawSources.push(raw.toString());
    gitSources.push(baseline.toString());
    workingSources.push(fs.readFileSync(path.join(repo, item.path), 'utf8'));
    currentGitSources.push(git(['show', `HEAD:${gitPath}`]).toString());
  }
  for (const sources of [rawSources, gitSources, workingSources, currentGitSources]) {
    assert.deepEqual(acceptance(...sources), source.acceptance);
  }
  assert.match(source.acceptance.parent, /Locks\/conditional epochs serialize or reject conflict; unrelated leases remain unaffected/);
  assert.equal(source.nativeAcceptanceNotCompleted, true);
});

test('non-discovered RED contains a loadable stub and twelve real assertion failures, not missing code/tools', () => {
  const red = json('evidence\\red\\run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 13);
  assert.equal(red.pass, 1);
  assert.equal(red.fail, 12);
  assert.equal(red.assertionFailures, 12);
  assert.equal(red.spawnError, null);
  assert.equal(red.missingCodeOrTools, false);
  for (const item of red.snapshots) {
    assert.ok(item.snapshot.endsWith('.snapshot'));
    const raw = read(`evidence\\red\\${item.snapshot}`);
    assert.equal(raw.length, item.bytes);
    assert.equal(sha(raw), item.sha256);
    if (item.source !== 'model.js') assert.deepEqual(lf(read(item.source)), lf(raw));
  }
  const stdout = zlib.gunzipSync(read('evidence\\verification\\red.stdout.raw.gz'));
  const stderr = zlib.gunzipSync(read('evidence\\verification\\red.stderr.raw.gz'));
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  assert.match(stdout.toString(), /code: 'ERR_ASSERTION'/);
  assert.match(stdout.toString(), /Missing expected exception/);
  assert.doesNotMatch(stdout.toString() + stderr.toString(),
    /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError/);
  const moduleObject = { exports: {} };
  new vm.Script(read('evidence\\red\\model.js.snapshot').toString()).runInNewContext({ module: moduleObject });
  assert.equal(moduleObject.exports.createLesson().start({}).phase, 'idle');
});

test('IaC N/A follows behavioral RED and precedes implementation GREEN; raw command records are intact', () => {
  const red = json('evidence\\red\\run.json');
  const iac = json('evidence\\iac-decision.json');
  const green = json('evidence\\verification\\model-green.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeImplementation, true);
  assert.equal(iac.actualConcurrentControllerLockEpochPromotionCertification, false);
  assert.equal(iac.postRedStubCanonicalSha256, sha(lf(read('evidence\\red\\model.js.snapshot'))));
  assert.notEqual(iac.postRedStubCanonicalSha256, sha(lf(read('model.js'))));
  assert.ok(Date.parse(iac.decidedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.ok(Date.parse(green.startedAtUtc) >= Date.parse(iac.decidedAtUtc));
  const records = fs.readdirSync(path.join(root, 'evidence\\verification')).filter((file) => file.endsWith('.json'));
  for (const required of ['red.json', 'model-green.json', 'browser-green.json']) assert.ok(records.includes(required));
  for (const file of records) {
    const record = json(`evidence\\verification\\${file}`);
    const stdout = zlib.gunzipSync(read(`evidence\\verification\\${record.name}.stdout.raw.gz`));
    const stderr = zlib.gunzipSync(read(`evidence\\verification\\${record.name}.stderr.raw.gz`));
    assert.equal(sha(stdout), record.rawStdoutSha256);
    assert.equal(sha(stderr), record.rawStderrSha256);
    assert.equal(record.spawnError, null);
    assert.equal(record.signal, null);
    assert.equal(record.exitCode, record.name === 'red' ? 1 : 0);
    assert.equal(record.fail, record.name === 'red' ? 12 : 0);
    assert.ok(record.tests > 0);
    if (record.name !== 'red') assert.deepEqual(record.inputHashes, testedHashes());
    if (['model-green', 'focused-green'].includes(record.name)) {
      assert.equal(record.browserCaptureEnabled, false);
      assert.equal(record.verificationReadOnly, true);
      assert.equal(record.ownedTreeBeforeSha256, record.ownedTreeAfterSha256);
      assert.equal(record.ownedFilesBefore, record.ownedFilesAfter);
    }
    if (record.name === 'browser-green') {
      assert.equal(record.browserCaptureEnabled, true);
      assert.equal(record.ownedFilesAfter - record.ownedFilesBefore, 3);
    }
  }
  assert.equal(green.tests, 15);
});

test('actual browser proof records published helper, signed offline tooling, real controls and enforced CSP', () => {
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
  for (const key of ['packagesInstalled', 'browserDownloaded', 'foregroundLease', 'unsafeFlags']) assert.equal(tooling[key], false);
  assert.equal(proof.helper.path, helperPath);
  assert.equal(proof.helper.sha256, helperSha256);
  assert.equal(proof.helper.publication, '53c0c0d');
  assert.equal(sha(fs.readFileSync(path.join(repo, helperPath))), helperSha256);
  assert.equal(tooling.helperSha256, helperSha256);
  for (const key of ['actualConcurrentControllerLockEpochPromotionCertification',
    'nativeSourceParentCompleted', 'productionNode24Validated']) assert.equal(proof[key], false);
  assert.deepEqual(proof.pageErrors, []);
  assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
  assert.deepEqual(proof.exerciseNetworkRequests, []);
  assert.deepEqual(proof.probeResponses, []);
  assert.equal(proof.csp.inlineRan, false);
  assert.equal(proof.csp.connection, 'TypeError');
  assert.ok(proof.csp.violations.some((entry) => entry.directive.startsWith('script-src')));
  assert.ok(proof.csp.violations.some((entry) => entry.directive === 'connect-src'));
  assert.equal(proof.cleanup.closeAwaited, true);
  assert.equal(proof.cleanup.closed, true);
  assert.equal(proof.narrowViewport.bodyOverflow, false);
  assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
  assert.deepEqual(proof.testedSourceHashes, testedHashes());
  for (const phrase of ['Tab skip link', 'out-of-order', 'invalid injected input',
    'repeated first submission', 'keyboard Enter/Space busy-lock FAILURE', 'empty prediction',
    'wrong prediction', 'new attempt', 'stale-epoch alpha-first FAILURE',
    'serialized alpha-first SUCCESS', 'missing-owner alpha-first UNKNOWN',
    'serialized bravo-first SUCCESS', 'busy-lock bravo-first FAILURE', 'invalid injected prediction',
    'seventh attempt refused', 'narrow viewport', 'CSP actually blocks', 'explicit reset clears', 'reload clears']) {
    assert.ok(proof.observations.some((entry) => entry.name.includes(phrase)), phrase);
  }
  assert.equal(proof.screenshots.length, 2);
  for (const file of proof.screenshots) {
    assert.deepEqual(read(file).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
});

test('owned inventory qualifies canonical Git text and exact raw evidence without writing objects', () => {
  const index = json('evidence\\content-index.json');
  const found = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      const relative = path.relative(root, absolute);
      if (relative === 'evidence\\verification') continue;
      if (entry.isDirectory()) walk(absolute);
      else if (relative !== 'evidence\\content-index.json') found.push(relative);
    }
  }
  walk(root);
  assert.deepEqual(found.sort(), index.files.map((item) => item.path).sort());
  for (const item of index.files) {
    const raw = read(item.path);
    const bytes = item.mode === 'raw' ? raw : lf(raw);
    assert.ok(['raw', 'canonical-lf'].includes(item.mode));
    assert.equal(sha(bytes), item.sha256, item.path);
    const expectedBlob = crypto.createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    assert.equal(expectedBlob, item.gitBlob, item.path);
    const gitPath = path.relative(repo, path.join(root, item.path)).replace(/\\/g, '/');
    assert.equal(git(['hash-object', '--stdin', `--path=${gitPath}`], raw).toString().trim(),
      item.gitBlob, item.path);
  }
  assert.equal(index.rawProvenancePreserved, true);
  assert.equal(index.gitCleanFilterCheckedWithoutWritingObjects, true);
});
