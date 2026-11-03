'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const raw = (file) => fs.readFileSync(path.join(root, file));
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
const json = (file) => JSON.parse(raw(file).toString('utf8'));
const git = (args) => {
  const result = cp.spawnSync('git', args, { encoding: null });
  assert.equal(result.status, 0, result.stderr?.toString());
  return result.stdout;
};
function walk(directory, relative = '') {
  return fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name)).flatMap((entry) => {
    assert.equal(entry.isSymbolicLink(), false);
    const name = path.join(relative, entry.name);
    return entry.isDirectory() ? walk(path.join(directory, entry.name), name) : [name];
  });
}
function checkRun(stage, expected) {
  const run = json(path.join('evidence', stage, 'run.json'));
  assert.equal(run.exitCode, expected);
  assert.equal(run.missingCodeOrTools, false);
  for (const stream of ['stdout', 'stderr']) {
    const bytes = raw(path.join('evidence', stage, run[stream].path));
    assert.equal(bytes.length, run[stream].bytes);
    assert.equal(sha(bytes), run[stream].rawSha256);
  }
  return run;
}

test('raw source excerpts exactly qualify against their immutable canonical Git-source blobs', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.equal(source.originalParentDependency, 'D-S081');
  assert.equal(source.packet, 'SC-S082');
  for (const record of source.records) {
    const bytes = raw(record.snapshot);
    assert.equal(bytes.length, record.bytes);
    assert.equal(sha(bytes), record.rawSha256);
    assert.equal(sha(canonical(bytes)), record.canonicalLfSha256);
    const blob = git(['cat-file', 'blob', record.gitBlob]);
    assert.equal(sha(blob), record.gitBlobSha256);
    assert.ok(blob.includes(canonical(bytes)), record.source);
  }
  assert.ok(source.records.some((record) => record.rawCRLF > 0), 'raw CRLF source provenance is retained');
});

test('retained RED is an actual loadable behavioral failure, not missing code, and uses the same acceptance tests', () => {
  const run = checkRun('red', 1);
  assert.deepEqual([run.tests, run.passed, run.failed], [6, 2, 4]);
  assert.equal(run.actualAssertionFailure, true);
  for (const snapshot of run.snapshots) {
    const bytes = raw(path.join('evidence', 'red', snapshot.path));
    assert.equal(bytes.length, snapshot.bytes);
    assert.equal(sha(bytes), snapshot.rawSha256);
    assert.ok(snapshot.path.endsWith('.snapshot'));
  }
  const legacyModule = { exports: {} };
  vm.runInNewContext(raw('evidence\\red\\model.js.snapshot').toString('utf8'), { module: legacyModule });
  const legacy = legacyModule.exports;
  const result = legacy.deliver(legacy.createState(), { epoch: 'stale', field: 'both', guard: 'enforced', observation: 'complete' }).records[0];
  assert.notEqual(result.after.routing.green, result.before.routing.green);
  assert.notEqual(result.after.readiness.green, result.before.readiness.green);
  assert.equal(result.command.disposition, 'APPLIED');
  assert.deepEqual(canonical(raw('tests\\acceptance.test.cjs')), canonical(raw('evidence\\red\\tests_acceptance.test.cjs.snapshot')));
});

test('actual focused, browser, syntax and signed offline-tooling evidence preserve their stated boundaries', () => {
  const focused = checkRun('focused-green', 0);
  assert.deepEqual([focused.tests, focused.passed, focused.failed], [17, 17, 0]);
  const browserRun = checkRun('browser-green-v2', 0);
  assert.deepEqual([browserRun.tests, browserRun.passed, browserRun.failed], [1, 1, 0]);
  assert.equal(browserRun.browserCaptureDeliberate, true);
  const browser = json('evidence\\browser-acceptance-v2.json');
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.equal(browser.cleanup.awaitedFinallyClose, true);
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.node, /^v22\./);
  assert.match(browser.browserVersion, /^156\./);
  assert.ok(browser.observations.length >= 14);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.deepEqual(browser.probeResponses, []);
  assert.deepEqual(browser.routedProbes, []);
  assert.equal(browser.consoleErrors.filter((entry) => entry.stage === 'exercise').length, 0);
  assert.equal(browser.cspChecks.workerSrcIndependentlyQualified, false);
  for (const [file, hash] of Object.entries(browser.sourceCanonicalLfHashes)) assert.equal(sha(canonical(raw(file))), hash);
  assert.equal(sha(raw(browser.failureFixtureScreenshot.path)), browser.failureFixtureScreenshot.rawSha256);
  const priorRun = checkRun('browser-green', 1);
  assert.equal(priorRun.actualAssertionFailure, true);
  const prior = json('evidence\\browser-acceptance.json');
  assert.equal(prior.outcome, 'FAIL');
  assert.match(prior.failure.message, /frame-src/);
  assert.equal(prior.cleanup.awaitedFinallyClose, true);
  assert.equal(sha(canonical(raw('evidence\\browser-green\\browser.test.cjs.snapshot'))),
    prior.sourceCanonicalLfHashes['tests\\browser.test.cjs']);
  assert.ok(prior.cspViolations.some((event) => event.directive === 'frame-src'
    && event.blockedURI === 'https://s082.invalid' && event.disposition === 'enforce'));
  const tooling = json('evidence\\tooling.json');
  assert.equal(tooling.browser.signatureStatus, 'Valid');
  assert.match(tooling.browser.signer, /Microsoft Corporation/);
  assert.equal(tooling.helper.abandonedLifecyclePrototypeQualified, false);
  assert.equal(tooling.helper.sha256, browser.helper.sha256);
  for (const stream of Object.values(tooling.raw)) assert.equal(sha(raw(path.join('evidence', stream.path))), stream.sha256);
  assert.equal(sha(raw('evidence\\tooling\\stdout.raw')), tooling.priorProbe.rawStdoutSha256);
  assert.equal(sha(raw('evidence\\tooling\\stderr.raw')), tooling.priorProbe.rawStderrSha256);
  const syntax = json('evidence\\syntax.json');
  assert.equal(syntax.outcome, 'PASS');
  assert.ok(syntax.checks.length >= 9);
  for (const check of syntax.checks) assert.equal(check.exitCode, 0);
});

test('the owned content index verifies every file and narrow attributes preserve raw evidence', () => {
  const index = json('evidence\\content-index.json');
  const expected = walk(root).filter((file) => file !== 'evidence\\content-index.json');
  assert.deepEqual(index.entries.map((entry) => entry.path), expected);
  for (const entry of index.entries) {
    const bytes = entry.mode === 'raw' ? raw(entry.path) : canonical(raw(entry.path));
    assert.equal(bytes.length, entry.bytes, entry.path);
    assert.equal(sha(bytes), entry.sha256, entry.path);
  }
  for (const file of ['evidence\\source\\README.S082.snapshot', 'evidence\\red\\model.js.snapshot', 'evidence\\red\\stdout.raw', 'evidence\\tooling-v2\\stdout.raw']) {
    const attrs = git(['check-attr', 'text', 'diff', 'merge', '--', path.join('learning', 'S082', file)]).toString();
    assert.match(attrs, /text: unset/);
    assert.match(attrs, /diff: unset/);
    assert.match(attrs, /merge: unset/);
  }
});

test('actual published owned Git blobs match the canonical-source and raw-evidence seal', (t) => {
  const gitIndex = 'HEAD:learning/S082/evidence/content-index.json';
  const exists = cp.spawnSync('git', ['cat-file', '-e', gitIndex], { encoding: null });
  if (exists.status !== 0) {
    t.skip('Owned files are not published yet; actual HEAD qualification must run read-only after the scoped publication.');
    return;
  }
  const index = json('evidence\\content-index.json');
  assert.deepEqual(canonical(git(['cat-file', 'blob', gitIndex])), canonical(raw('evidence\\content-index.json')));
  for (const entry of index.entries) {
    const gitPath = ['learning', 'S082', ...entry.path.split(path.sep)].join('/');
    const bytes = git(['cat-file', 'blob', `HEAD:${gitPath}`]);
    assert.equal(sha(entry.mode === 'raw' ? bytes : canonical(bytes)), entry.sha256, gitPath);
  }
});
