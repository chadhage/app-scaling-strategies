'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const text = (file) => bytes(file).toString('utf8');
const json = (file) => JSON.parse(text(file));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');
const canonical = (value) => Buffer.from(value.toString('utf8').replace(/\r\n/g, '\n'));
function git(args, input) {
  const run = spawnSync('git', args, { cwd: repo, input, encoding: null });
  assert.equal(run.status, 0, run.stderr.toString());
  return run.stdout;
}
function sourceAcceptance(readme, backlog, kanban) {
  const line = (source, id) => {
    const rows = source.split(/\r?\n/).filter((entry) => entry.startsWith(`| ${id} |`));
    assert.equal(rows.length, 1, id);
    return rows[0];
  };
  const section = (source, start, end) => {
    const from = source.indexOf(start);
    const to = source.indexOf(end, from + start.length);
    assert.ok(from >= 0 && to > from);
    return source.slice(from, to).replace(/\r\n/g, '\n').trimEnd();
  };
  return {
    readmeS066: line(readme, 'S066'), backlogDS066: line(backlog, 'D-S066'),
    cardAS066: line(kanban, 'A-S066'), siblingBS066: line(kanban, 'B-S066'),
    atomic: section(kanban, '## Atomic card contract', '### Portable A-card lesson contract'),
    portable: section(kanban, '### Portable A-card lesson contract', '## Concurrent pull and one-piece flow'),
    packet: kanban.split(/\r?\n/).find((entry) => entry.startsWith('Packet membership is fixed before admission.')),
    evidencePolicy: section(readme, '## Acceptance and evidence', '## Recommended demonstration sequence'),
  };
}

test('exact source acceptance matches declared baseline, retained raw source and current authoritative slices', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.cardId, 'A-S066');
  assert.equal(source.packet, 'SC-S066');
  assert.equal(source.kanoUnit, 'A-S066');
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.equal(source.acceptanceEqualsBaseline, true);
  const working = [];
  const baseline = [];
  const current = [];
  for (const item of source.sources) {
    const raw = bytes(item.workingSnapshot);
    const committed = bytes(item.gitSnapshot);
    assert.equal(raw.length, item.workingBytes);
    assert.equal(sha(raw), item.workingSha256);
    assert.equal(sha(canonical(raw)), item.workingCanonicalSha256);
    assert.equal(sha(committed), item.gitSha256);
    assert.equal(raw.includes(Buffer.from('\r\n')), item.workingContainsCRLF);
    assert.equal(canonical(raw).equals(committed), item.fullCanonicalEqualsBaseline);
    assert.deepEqual(git(['show', `${source.baseline}:${item.path.replace(/\\/g, '/')}`]), committed);
    working.push(raw.toString());
    baseline.push(committed.toString());
    current.push(fs.readFileSync(path.join(repo, item.path), 'utf8'));
  }
  assert.deepEqual(sourceAcceptance(...working), source.acceptance);
  assert.deepEqual(sourceAcceptance(...baseline), source.acceptance);
  assert.deepEqual(sourceAcceptance(...current), source.acceptance);
  assert.equal(source.nativeAcceptanceNotCompleted, true);
});

test('raw RED retains a loadable stub, the original BDD/tests, actual assertion failures and no tooling failure', () => {
  const red = json('evidence\\red\\run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 15);
  assert.equal(red.pass, 1);
  assert.equal(red.fail, 14);
  assert.equal(red.assertionFailures, 14);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  for (const item of red.snapshots) {
    assert.ok(item.snapshot.endsWith('.snapshot'));
    const raw = bytes(`evidence\\red\\${item.snapshot}`);
    assert.equal(raw.length, item.bytes);
    assert.equal(sha(raw), item.sha256);
  }
  const output = zlib.gunzipSync(bytes('evidence\\red\\run.stdout.raw.gz'));
  const errors = zlib.gunzipSync(bytes('evidence\\red\\run.stderr.raw.gz'));
  assert.equal(sha(output), red.rawStdoutSha256);
  assert.equal(sha(errors), red.rawStderrSha256);
  assert.match(output.toString(), /code: 'ERR_ASSERTION'/);
  assert.doesNotMatch(output.toString() + errors.toString(), /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError/);
  const moduleObject = { exports: {} };
  const loadableStub = new vm.Script(text('evidence\\red\\model.js.snapshot'));
  loadableStub.runInNewContext({
    module: moduleObject,
    require(name) {
      assert.equal(name, './fixtures.js');
      return require('../fixtures.js');
    },
  });
  const stub = moduleObject.exports.createLesson();
  assert.equal(stub.snapshot().phase, 'idle');
  for (const name of ['begin', 'fault', 'reconcile', 'recover', 'predict', 'next', 'reset']) {
    assert.equal(typeof stub[name], 'function');
  }
  assert.notEqual(sha(bytes('model.js')), red.snapshots.find((item) => item.source === 'model.js').sha256);
});

test('explicit resource-free IaC N/A lies after genuine RED and before first implementation green', () => {
  const red = json('evidence\\red\\run.json');
  const iac = json('evidence\\iac-decision.json');
  const green = json('evidence\\verification\\model-green.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.beforeBehaviorImplementation, true);
  assert.equal(iac.nativeDatabaseCommitTransactionFailoverProof, false);
  assert.ok(Date.parse(iac.decidedAtUtc) >= Date.parse(red.completedAtUtc));
  assert.ok(Date.parse(green.startedAtUtc) >= Date.parse(iac.decidedAtUtc));
  assert.equal(green.exitCode, 0);
  assert.equal(green.tests, 15);
  assert.equal(green.fail, 0);
});

test('recorded browser proof belongs to current canonical lesson sources and the exact offline tooling', () => {
  const browser = json('evidence\\browser.json');
  const tooling = json('evidence\\tooling.json');
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.equal(browser.runtime, 'v22.23.4');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.browserVersion, tooling.browserVersion);
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /Microsoft Corporation/);
  assert.equal(tooling.packagesInstalled, false);
  assert.equal(tooling.browserDownloaded, false);
  assert.equal(tooling.foregroundLease, false);
  assert.equal(tooling.unsafeFlags, false);
  assert.equal(browser.helper.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.helper.sha256, sha(fs.readFileSync(path.join(repo, browser.helper.path))));
  assert.equal(tooling.helperSha256, browser.helper.sha256);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.deepEqual(browser.probeResponses, []);
  assert.equal(browser.csp.inlineRan, false);
  assert.equal(browser.csp.connection, 'TypeError');
  assert.ok(browser.csp.violations.some((entry) => entry.directive === 'connect-src'));
  assert.ok(browser.csp.violations.some((entry) => entry.directive.startsWith('script-src')));
  assert.equal(browser.cleanup.closeAwaited, true);
  assert.equal(browser.cleanup.closed, true);
  assert.equal(browser.narrowViewport.bodyOverflow, false);
  assert.equal(browser.narrowViewport.visibleKeyboardFocus, true);
  assert.ok(browser.observations.some((entry) => entry.name.includes('safe recovery remains UNKNOWN')));
  assert.ok(browser.observations.some((entry) => entry.name.includes('blind fresh-key retry duplicates')));
  assert.ok(browser.observations.some((entry) => entry.name.includes('six attempts retained without eviction')));
  for (const [file, hash] of Object.entries(browser.testedSourceHashes)) assert.equal(sha(canonical(bytes(file))), hash, file);
  assert.equal(browser.screenshots.length, 2);
  for (const screenshot of browser.screenshots) {
    assert.equal(sha(bytes(`evidence\\${screenshot.file}`)), screenshot.sha256);
    assert.equal(bytes(`evidence\\${screenshot.file}`).length, screenshot.bytes);
  }
});

test('sealed owned files qualify canonical Git-source integrity while raw CRLF snapshots remain exact', () => {
  const index = json('evidence\\content-index.json');
  assert.equal(index.cardId, 'A-S066');
  assert.ok(index.files.length > 20);
  const expectedPaths = new Set(index.files.map((entry) => entry.path));
  assert.equal(expectedPaths.size, index.files.length);
  for (const item of index.files) {
    const file = path.resolve(root, item.path);
    assert.ok(file.startsWith(root + path.sep), item.path);
    const raw = bytes(item.path);
    const content = item.mode === 'raw' ? raw : canonical(raw);
    assert.equal(content.length, item.bytes, item.path);
    assert.equal(sha(content), item.sha256, item.path);
    const gitPath = `learning/S066/${item.path.replace(/\\/g, '/')}`;
    if (item.mode === 'raw') {
      assert.match(git(['check-attr', 'diff', '--', gitPath]).toString(), /: diff: unset\s*$/,
        `Exact raw provenance must not be interpreted as a text whitespace diff: ${item.path}`);
    }
    const filteredBlob = git(['hash-object', `--path=${gitPath}`, '--stdin'], raw).toString().trim();
    const expectedBlob = crypto.createHash('sha1')
      .update(Buffer.from(`blob ${content.length}\0`)).update(content).digest('hex');
    assert.equal(filteredBlob, expectedBlob, `Git filters must preserve declared mode: ${item.path}`);
  }
  function checkNoUnexpected(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const file = path.join(directory, entry.name);
      const relative = path.relative(root, file);
      if (relative === path.join('evidence', 'verification')) continue;
      if (entry.isDirectory()) checkNoUnexpected(file);
      else if (relative !== path.join('evidence', 'content-index.json')) assert.ok(expectedPaths.has(relative), relative);
    }
  }
  checkNoUnexpected(root);
});
