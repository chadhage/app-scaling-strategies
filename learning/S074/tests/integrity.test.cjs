'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { root, repo, read, sha, lf, git, acceptance } = require('./provenance.cjs');
const json = (file) => JSON.parse(read(file));
function rawRun(directory, prefix) {
  const record = json(`${directory}\\${prefix}.json`);
  const stdout = zlib.gunzipSync(read(`${directory}\\${prefix}.stdout.raw.gz`));
  const stderr = zlib.gunzipSync(read(`${directory}\\${prefix}.stderr.raw.gz`));
  assert.equal(sha(stdout), record.rawStdoutSha256);
  assert.equal(sha(stderr), record.rawStderrSha256);
  return { record, stdout: stdout.toString(), stderr: stderr.toString() };
}

test('exact source acceptance matches preserved raw CRLF, committed baseline and current authoritative slices', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.cardId, 'A-S074');
  assert.equal(source.parentId, 'D-S074');
  assert.equal(source.packet, 'SC-S074');
  assert.equal(source.kanoUnit, 'A-S074');
  assert.equal(source.kano, 'S');
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.equal(source.acceptanceEqualsBaseline, true);
  assert.equal(source.nativeAcceptanceNotCompleted, true);
  assert.ok(source.sources.some((item) => item.workingContainsCRLF));
  const working = [];
  const baseline = [];
  const current = [];
  for (const item of source.sources) {
    const raw = read(item.workingSnapshot);
    const committed = read(item.gitSnapshot);
    assert.equal(raw.length, item.workingBytes);
    assert.equal(sha(raw), item.workingSha256);
    assert.equal(sha(lf(raw)), item.workingCanonicalSha256);
    assert.equal(sha(committed), item.gitSha256);
    assert.equal(raw.includes(Buffer.from('\r\n')), item.workingContainsCRLF);
    assert.equal(lf(raw).equals(committed), item.fullCanonicalEqualsBaseline);
    assert.deepEqual(git(['show', `${source.baseline}:${item.path.replace(/\\/g, '/')}`]), committed);
    working.push(raw.toString());
    baseline.push(committed.toString());
    current.push(fs.readFileSync(path.join(repo, item.path), 'utf8'));
  }
  assert.deepEqual(acceptance(...working), source.acceptance);
  assert.deepEqual(acceptance(...baseline), source.acceptance);
  assert.deepEqual(acceptance(...current), source.acceptance);
});

test('non-discovered RED snapshots retain the loadable stub, original tests and genuine assertion output', () => {
  const { record: red, stdout, stderr } = rawRun('evidence\\red', 'run');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 17);
  assert.equal(red.pass, 1);
  assert.equal(red.fail, 16);
  assert.equal(red.assertionFailures, 16);
  assert.equal(red.spawnError, null);
  assert.equal(red.missingCodeOrTools, false);
  for (const item of red.snapshots) {
    assert.ok(item.snapshot.endsWith('.snapshot'));
    const raw = read(`evidence\\red\\${item.snapshot}`);
    assert.equal(raw.length, item.bytes);
    assert.equal(sha(raw), item.sha256);
    if (item.source !== 'model.js') assert.equal(sha(lf(read(item.source))), sha(lf(raw)));
  }
  assert.match(stdout, /code: 'ERR_ASSERTION'/);
  assert.match(stdout, /actual: 'idle'/);
  assert.match(stdout, /expected: 'pressured'/);
  assert.doesNotMatch(stdout + stderr, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError/);
  const moduleObject = { exports: {} };
  new vm.Script(read('evidence\\red\\model.js.snapshot').toString()).runInNewContext({ module: moduleObject });
  const stub = moduleObject.exports.createLesson();
  assert.equal(stub.snapshot().phase, 'idle');
  assert.equal(stub.applyPressure({ pressure: 'capacity', durable: 'current', response: 'recover' }).phase, 'idle');
  assert.notEqual(sha(lf(read('model.js'))), red.snapshots.find((item) => item.source === 'model.js').sha256);
});

test('IaC N/A follows actual RED and precedes implementation GREEN; raw verification outputs are qualified', () => {
  const red = json('evidence\\red\\run.json');
  const iac = json('evidence\\iac-decision.json');
  const model = rawRun('evidence\\verification', 'model-green').record;
  const browser = rawRun('evidence\\verification', 'browser-green').record;
  const syntax = rawRun('evidence\\verification', 'syntax').record;
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeBehaviorImplementation, true);
  assert.equal(iac.actualSessionEvictionCacheDurabilityCertification, false);
  assert.ok(Date.parse(iac.decidedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.ok(Date.parse(model.startedAtUtc) >= Date.parse(iac.decidedAtUtc));
  for (const run of [model, browser, syntax]) {
    assert.equal(run.exitCode, 0);
    assert.equal(run.spawnError, null);
    assert.equal(run.missingCodeOrTools, false);
    assert.equal(run.fail, 0);
  }
  assert.equal(model.tests, 17);
  assert.equal(browser.tests, 1);
  assert.equal(browser.captureBrowserEvidence, true);
  assert.equal(syntax.commands.length, 9);
});

test('real browser proof qualifies current canonical sources, exact helper, signed offline tooling and cleanup', () => {
  const proof = json('evidence\\browser.json');
  const tooling = json('evidence\\tooling.json');
  assert.equal(proof.outcome, 'PASS');
  assert.equal(proof.captureExplicitlyEnabled, true);
  assert.equal(proof.runtime, 'v22.23.4');
  assert.equal(proof.playwrightVersion, '1.56.1');
  assert.match(proof.browserVersion, /^156\./);
  assert.equal(proof.browserVersion, tooling.browserVersion);
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /Microsoft Corporation/);
  for (const field of ['packagesInstalled', 'browserDownloaded', 'foregroundLease', 'unsafeFlags',
    'abandonedLifecyclePrototypeUsed', 'productionNode24Validated']) assert.equal(tooling[field], false, field);
  assert.equal(proof.helper.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(sha(fs.readFileSync(path.join(repo, proof.helper.path))), proof.helper.sha256);
  assert.equal(tooling.helperSha256, proof.helper.sha256);
  assert.deepEqual(proof.pageErrors, []);
  assert.deepEqual(proof.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
  assert.deepEqual(proof.exerciseNetworkRequests, []);
  assert.deepEqual(proof.probeResponses, []);
  assert.deepEqual(proof.guardedNetworkAttempts, []);
  assert.equal(proof.csp.inlineRan, false);
  assert.equal(proof.csp.connection, 'TypeError');
  for (const directive of ['script-src-elem', 'connect-src', 'form-action']) {
    assert.ok(proof.csp.violations.some((entry) => entry.directive === directive), directive);
  }
  assert.equal(proof.cleanup.closeAwaited, true);
  assert.equal(proof.cleanup.closed, true);
  assert.equal(proof.narrowViewport.bodyOverflow, false);
  assert.equal(proof.narrowViewport.visibleKeyboardFocus, true);
  for (const expected of ['capacity eviction', 'missing required state', 'empty synthetic 200', 'acceptable optional',
    'TTL equality', 'holds UNKNOWN', 'seventh attempt', 'reset clears', 'invalid injected']) {
    assert.ok(proof.observations.some((entry) => entry.name.includes(expected)), expected);
  }
  for (const [file, hash] of Object.entries(proof.testedSourceHashes)) assert.equal(sha(lf(read(file))), hash, file);
  assert.equal(proof.screenshots.length, 2);
  for (const file of proof.screenshots) {
    assert.deepEqual(read(file).subarray(0, 8), Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  }
});

test('owned inventory matches canonical text and exact raw bytes through actual Git clean filters without writes', () => {
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
    const expected = item.mode === 'raw' ? raw : lf(raw);
    assert.equal(expected.length, item.bytes, item.path);
    assert.equal(sha(expected), item.sha256, item.path);
    const clean = git(['hash-object', `--path=learning/S074/${item.path.replace(/\\/g, '/')}`, '--stdin'], raw);
    const canonical = git(['hash-object', '--stdin'], expected);
    assert.equal(clean.toString().trim(), canonical.toString().trim(), `Git-source bytes: ${item.path}`);
  }
});
