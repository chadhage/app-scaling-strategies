'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { gunzipSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const pins = require(path.join(root, 'imports.json'));
const manifest = require(path.join(root, 'evidence.json'));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalized = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');
const gitPath = (file) => file.replaceAll('\\', '/');
const readOwned = (relative) => {
  const file = path.resolve(repository, relative);
  assert.ok(file.startsWith(`${root}${path.sep}`), 'Evidence and seals must be own-only.');
  return fs.readFileSync(file);
};
const json = (relative) => JSON.parse(readOwned(relative).toString('utf8'));
const seal = json(manifest.seal.path);
const git = (args) => execFileSync('git', ['--no-pager', ...args], { cwd: repository, timeout: 10000, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });

test('own sources and retained raw evidence/seal bytes are immutable; no normal refresh', () => {
  assert.equal(hash(readOwned(manifest.seal.path)), manifest.seal.rawSha256);
  for (const entry of [...seal.sourceHashes, ...seal.evidenceHashes]) {
    const raw = readOwned(entry.path);
    assert.equal(hash(raw), entry.rawSha256, entry.path);
    if (entry.crlfToLfSha256) assert.equal(hash(normalized(raw)), entry.crlfToLfSha256, `canonical text ${entry.path}`);
  }
  assert.equal(manifest.maximumOriginalUnits, 1);
  assert.equal(manifest.repairsTestsProofRefinementExtraCredits, 0);
  assert.equal(manifest.H006Complete, false);
});

test('accepted C020 raw CRLF is distinguished from exact immutable Git-canonical source; shared helper stays raw-pinned', () => {
  for (const [file, expected] of Object.entries(pins.c020CanonicalSha256)) {
    const raw = fs.readFileSync(path.join(root, '..', 'C020', file));
    const blob = git(['show', `${pins.acceptedC020.commit}:capability/C020/${file}`]);
    assert.equal(hash(blob), expected);
    assert.equal(hash(normalized(raw)), expected);
    console.log(JSON.stringify({ file: `C020 ${file}`, workingRawSha256: hash(raw), acceptedGitSha256: hash(blob), workingCRLFToLfSha256: hash(normalized(raw)), rawEqualsGit: raw.equals(blob) }));
  }
  const helper = fs.readFileSync(path.join(repository, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(hash(helper), pins.browserHelperRawSha256);
  const helperGit = git(['show', 'HEAD:testing/browser/isolated.cjs']);
  assert.deepEqual(normalized(helper), normalized(helperGit));
  console.log(JSON.stringify({ file: 'published helper', workingRawSha256: hash(helper), gitBlobSha256: hash(helperGit), rawEqualsGit: helper.equals(helperGit) }));
});

test('published own Git blobs preserve raw bytes; before publication that gate is explicitly pending, not silently qualified', () => {
  let published = 0;
  for (const entry of seal.sourceHashes) {
    const ref = `HEAD:${gitPath(entry.path)}`;
    let exists = false;
    try { git(['cat-file', '-e', ref]); exists = true; } catch {}
    assert.match(git(['check-attr', 'text', '--', entry.path]).toString('utf8'), /: text: unset/);
    if (exists) {
      published++;
      assert.equal(hash(git(['show', ref])), entry.rawSha256, `own Git raw-byte preservation: ${entry.path}`);
    }
  }
  if (published) assert.equal(published, seal.sourceHashes.length, 'Partial own publication is not a complete qualification.');
  console.log(JSON.stringify({ ownGitRawByteChecks: published, ownSealedSources: seal.sourceHashes.length, publicationByteGate: published ? 'verified' : 'pending publication; working-tree seal only' }));
});

test('original BDD/loadable-stub/behavioral RED/IaC-N/A precede implementation evidence; all failure bytes remain readable', () => {
  const stages = Object.fromEntries(Object.entries(manifest.workflow).map(([stage, file]) => [stage, json(file)]));
  for (const [before, after] of [['bdd', 'stub'], ['stub', 'red'], ['red', 'iac'], ['iac', 'green'], ['green', 'browser']]) {
    assert.ok(stages[before].completedAtUtc < stages[after].startedAtUtc);
  }
  assert.equal(stages.red.exitCode, 1);
  const red = gunzipSync(readOwned(stages.red.stdout)).toString('utf8');
  assert.equal((red.match(/name: 'AssertionError'/g) || []).length, 4);
  assert.doesNotMatch(red, /Cannot find module|SyntaxError/);
  assert.notEqual(manifest.redProvenanceRecheck, manifest.workflow.red);
  const recheck = json(manifest.redProvenanceRecheck);
  assert.equal(recheck.exitCode, 1);
  for (const file of ['journey.stub.cjs', 'journey.initial.snapshot.cjs']) {
    const relative = path.join('capability', 'C033', 'evidence', 'red', file);
    assert.equal(recheck.sourceHashes.find((entry) => entry.path === relative)?.rawSha256, hash(readOwned(relative)));
  }
  const rawRoot = path.join(root, 'evidence', 'raw');
  for (const directory of fs.readdirSync(rawRoot, { withFileTypes: true }).filter((entry) => entry.isDirectory())) {
    assert.match(directory.name, /^[a-z]+-[0-9a-f-]{36}$/);
    const file = path.join(rawRoot, directory.name, 'run.json');
    if (!fs.existsSync(file)) continue;
    const run = JSON.parse(fs.readFileSync(file, 'utf8'));
    assert.equal(hash(gunzipSync(readOwned(run.stdout))), run.stdoutSha256);
    assert.equal(hash(gunzipSync(readOwned(run.stderr))), run.stderrSha256);
  }
  assert.ok(manifest.retainedExecutionHistory.some((run) => run.stage === 'green' && run.exitCode === null), 'The initial bounded CLI lifecycle failure must remain retained.');
  assert.ok(manifest.retainedExecutionHistory.some((run) => run.stage === 'consent' && run.exitCode === 1), 'The original unavailable-consent failure must remain retained.');
});

test('sealed browser proof is actual Edge/HTTP/DOM with measured holds, original budget miss and awaited cleanup, not native qualification', () => {
  const run = json(manifest.workflow.browser);
  const browser = json(manifest.browser.summary);
  assert.equal(run.exitCode, 0);
  assert.equal(run.captureBrowserEvidence, '1');
  assert.equal(browser.outcome, 'passed');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.actualSignedEdge.authenticodeStatus, 'Valid');
  assert.ok(browser.actualSignedEdge.actualOwnedBrowserPid > 0);
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.testRuntime, /^v22\./);
  assert.ok(Object.values(browser.cleanup).every((value) => value === true));
  assert.equal(browser.nativeTransportQualified, false);
  assert.equal(browser.fullJourneyQualified, false);
  assert.equal(browser.productionRuntimeValidated, false);
  for (const file of ['server.cjs', 'journey.js', 'page.js', 'index.html', 'style.css', 'read-consent.ps1']) {
    const relative = path.join('capability', 'C033', file);
    assert.equal(run.sourceHashes.find((entry) => entry.path === relative)?.rawSha256, hash(readOwned(relative)), `The current production fixture must be the actually observed source: ${file}`);
  }
  for (const index of [2, 3]) {
    const observed = browser.checks[index].observed;
    assert.ok(observed.actualClockDelta > 0);
    assert.ok(observed.actualElapsedDelta > 0);
    assert.ok(observed.actualPausedDelta > 0);
    assert.equal(observed.before.state.startedAt, observed.after.state.startedAt);
    assert.equal(observed.before.state.deadline, observed.after.state.deadline);
    assert.deepEqual(observed.before.state.original, observed.after.state.original);
    assert.equal(observed.actualServerRequestsHeld, index === 2 ? 0 : 1);
  }
  const budget = browser.checks[4].observed;
  assert.equal(budget.held.state.budgetExceeded, true);
  assert.equal(budget.held.state.requests, 0);
  assert.ok(budget.finalElapsedMs >= budget.originalBudgetMs);
  assert.equal(budget.originalDeadline, budget.originalStartedAt + budget.originalBudgetMs);
});
