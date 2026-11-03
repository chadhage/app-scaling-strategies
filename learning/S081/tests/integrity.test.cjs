'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { root, repo, read, sha, lf, git, acceptance } = require('./provenance.cjs');
const json = (file) => JSON.parse(read(file));

test('exact source acceptance matches preserved raw CRLF, declared Git baseline and authoritative current slices', () => {
  const source = json('evidence\\source-contract.json');
  for (const [key, value] of Object.entries({
    cardId: 'A-S081', workerId: 'worker-A-S081', sourceId: 'S081', parentId: 'D-S081',
    kano: 'S', kanoUnit: 'A-S081', packet: 'SC-S081', entryGate: 'SOURCE',
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
    assert.equal(sha(lf(raw)), item.workingCanonicalSha256);
    assert.equal(sha(baseline), item.gitSha256);
    assert.equal(raw.includes(Buffer.from('\r\n')), item.workingContainsCRLF);
    assert.equal(lf(raw).equals(lf(baseline)), item.fullCanonicalEqualsBaseline);
    assert.deepEqual(git(['show', `${source.baseline}:${item.path.replace(/\\/g, '/')}`]), baseline);
    working.push(raw.toString());
    committed.push(baseline.toString());
    current.push(fs.readFileSync(path.join(repo, item.path), 'utf8'));
  }
  assert.deepEqual(acceptance(...working), source.acceptance);
  assert.deepEqual(acceptance(...committed), source.acceptance);
  assert.deepEqual(acceptance(...current), source.acceptance);
  assert.equal(source.nativeAcceptanceNotCompleted, true);
});

test('non-auto-discovered RED preserves a loadable stub and 14 genuine assertion failures, not missing tools', () => {
  const red = json('evidence\\red\\run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 15);
  assert.equal(red.pass, 1);
  assert.equal(red.fail, 14);
  assert.equal(red.assertionFailures, 14);
  assert.equal(red.spawnError, null);
  assert.equal(red.missingCodeOrTools, false);
  for (const item of red.snapshots) {
    assert.ok(item.snapshot.endsWith('.snapshot'));
    const raw = read(`evidence\\red\\${item.snapshot}`);
    assert.equal(raw.length, item.bytes);
    assert.equal(sha(raw), item.sha256);
    if (item.source !== 'model.js') assert.equal(sha(lf(read(item.source))), sha(lf(raw)));
  }
  const stdout = zlib.gunzipSync(read('evidence\\red\\run.stdout.raw.gz'));
  const stderr = zlib.gunzipSync(read('evidence\\red\\run.stderr.raw.gz'));
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  assert.match(stdout.toString(), /NOT_STARTED/);
  assert.match(stdout.toString(), /code: 'ERR_ASSERTION'/);
  assert.match(stdout.toString(), /Missing expected exception/);
  assert.doesNotMatch(stdout.toString() + stderr.toString(),
    /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError/);
  const moduleObject = { exports: {} };
  new vm.Script(read('evidence\\red\\model.js.snapshot').toString()).runInNewContext({ module: moduleObject });
  const stub = moduleObject.exports.createLesson();
  assert.equal(stub.snapshot().phase, 'idle');
  assert.equal(stub.start({}).desired, 'NOT_STARTED');
  assert.notEqual(sha(lf(read('model.js'))), red.snapshots.find((item) => item.source === 'model.js').sha256);
});

test('explicit IaC N/A follows actual assertion RED and precedes implementation GREEN', () => {
  const red = json('evidence\\red\\run.json');
  const iac = json('evidence\\iac-decision.json');
  const green = json('evidence\\verification\\model-green.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeImplementation, true);
  assert.equal(iac.actualControllerDeploymentRoutingDrainOwnershipCertification, false);
  assert.ok(Date.parse(iac.decidedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.ok(Date.parse(green.startedAtUtc) >= Date.parse(iac.decidedAtUtc));
  assert.equal(green.exitCode, 0);
  assert.equal(green.tests, 15);
  assert.equal(green.fail, 0);
});

test('actual DOM proof qualifies canonical sources, published helper, offline signed tooling, CSP and cleanup', () => {
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
  assert.equal(tooling.productionNode24Validated, false);
  assert.equal(proof.helper.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(proof.helper.publication, '53c0c0d');
  assert.equal(sha(fs.readFileSync(path.join(repo, proof.helper.path))), proof.helper.sha256);
  assert.equal(tooling.helperSha256, proof.helper.sha256);
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
  for (const phrase of ['Tab skip link', 'eight observed gates', 'empty prediction', 'partial routing FAILURE',
    'drain clients/work/ownership FAILURE', 'retention deadline', 'endpoint UNKNOWN', 'known stale epoch FAILURE',
    'seventh attempt rejected', 'explicit reset clears', 'stale readiness FAILURE', 'capacity compatibility health FAILURE',
    'missing routing UNKNOWN', 'missing drain UNKNOWN', 'missing retention UNKNOWN', 'invalid injected enum',
    'out-of-order', 'repeated observation', 'reload clears']) {
    assert.ok(proof.observations.some((entry) => entry.name.includes(phrase)), phrase);
  }
  for (const [file, hash] of Object.entries(proof.testedSourceHashes)) assert.equal(sha(lf(read(file))), hash, file);
  assert.equal(proof.screenshots.length, 2);
  for (const file of proof.screenshots) {
    assert.deepEqual(read(file).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
});

test('owned inventory qualifies canonical Git text and exact raw bytes after clean filters without writes', () => {
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
    const raw = read(item.path);
    const canonical = item.mode === 'raw' ? raw : lf(raw);
    assert.equal(canonical.length, item.bytes, item.path);
    assert.equal(sha(canonical), item.sha256, item.path);
    const clean = git(['hash-object', `--path=learning/S081/${item.path.replace(/\\/g, '/')}`, '--stdin'], raw);
    assert.deepEqual(clean, git(['hash-object', '--stdin'], canonical), item.path);
  }
});
