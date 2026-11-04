'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hash, normalize, checkImports, readRegular } = require('..\\pins.cjs');
const { readCurrent, inspect } = require('..\\authority.cjs');
const { scan, latestGreen, evidenceFiles } = require('./evidence.cjs');
const { inventory } = require('./support.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const production = ['routing.js', 'cli.cjs', 'page.js', 'authority.cjs', 'pins.cjs'];
const addendumName = /^evidence-index\.addendum-([1-9][0-9]*)\.json$/;
// Later evidence is appended, never rewritten: each addendum chains to the previous index by hash and lists only new files.
function verifyAddenda(firstIndex) {
  const addenda = fs.readdirSync(root).map((name) => addendumName.exec(name)).filter(Boolean).sort((a, b) => Number(a[1]) - Number(b[1]));
  assert.deepEqual(addenda.map((match) => Number(match[1])), addenda.map((_, index) => index + 1), 'Consecutive addendum numbers only.');
  const indexed = new Set(firstIndex.files.map((entry) => entry.path));
  // Indexes are chained by their LF-canonical bytes, so a CRLF checkout of these text files verifies the same way.
  let previous = { name: 'evidence-index.json', bytes: normalize(fs.readFileSync(path.join(root, 'evidence-index.json'))) };
  let own = null;
  for (const [name] of addenda) {
    const raw = fs.readFileSync(path.join(root, name));
    const addendum = JSON.parse(raw);
    assert.equal(addendum.cardId, 'C037');
    assert.deepEqual(addendum.previousIndex, { path: previous.name, rawSha256: hash(previous.bytes), size: previous.bytes.length });
    for (const entry of addendum.files) {
      assert.ok(entry.path.startsWith('evidence\\') && !entry.path.split('\\').includes('..'));
      assert.ok(!indexed.has(entry.path), `${entry.path} is listed by exactly one index.`);
      const file = fs.readFileSync(path.join(root, entry.path));
      assert.equal(hash(file), entry.rawSha256, entry.path);
      assert.equal(file.length, entry.size);
      indexed.add(entry.path);
    }
    previous = { name, bytes: normalize(raw) };
    own = addendum.ownRunDirectory;
  }
  const unindexed = evidenceFiles().filter((file) => !indexed.has(file.path) && !(own && file.path.startsWith(`${own}\\`)));
  assert.deepEqual(unindexed.map((file) => file.path), [], 'Every retained evidence file is hash-indexed by the sealed index or an addendum.');
  return { addenda: addenda.length, indexedEvidenceFiles: indexed.size };
}
function verifyCoverage(runs) {
  const bdd = latestGreen(runs, 'coverbdd');
  const red = runs.find((run) => run.stage === 'coverred' && run.exitCode === 1);
  const green = latestGreen(runs, 'coverage');
  assert.ok(red);
  for (const file of ['cli.cjs', 'page.js', 'pins.cjs']) assert.match(red.stdout, new RegExp(`below the 85% bar - ${file.replace('.', '\\.')}`));
  assert.match(red.stdout, /page\.js: lines 0%, branches 0%, functions 0%, unloaded counts as 0%/);
  const redSource = readRegular(path.join('capability', 'C037', 'evidence', 'red', 'coverage-bar.initial.test.cjs'));
  assert.equal(red.sourceHashes.find((entry) => entry.path === 'capability\\C037\\evidence\\red\\coverage-bar.initial.test.cjs').rawSha256, hash(redSource));
  assert.ok(bdd.completedAtUtc <= red.startedAtUtc && red.completedAtUtc <= green.startedAtUtc, 'BDD, then RED, then GREEN coverage.');
  assert.match(green.stdout, /C037 coverage GREEN: 5 enumerated production files/);
  const measured = {};
  for (const file of production) {
    const row = new RegExp(`^${file.replace('.', '\\.')}\\s+([0-9.]+) / +([0-9.]+) / +([0-9.]+)$`, 'm').exec(green.stdout);
    assert.ok(row && row.slice(1).every((value) => Number(value) >= 85), `${file} coverage row`);
    measured[file] = { lines: Number(row[1]), branches: Number(row[2]), functions: Number(row[3]) };
    const relative = path.join('capability', 'C037', file);
    assert.equal(hash(readRegular(relative)), green.sourceHashes.find((entry) => entry.path === relative).rawSha256, `Current ${file} differs from the measured coverage proof.`);
  }
  for (const file of ['page.test.cjs', 'cli.test.cjs', 'pins.test.cjs', 'coverage.cjs']) {
    const relative = path.join('capability', 'C037', 'tests', file);
    assert.equal(hash(readRegular(relative)), green.sourceHashes.find((entry) => entry.path === relative).rawSha256, `Current ${file} differs from the measured coverage proof.`);
  }
  return { measured, bdd: bdd.directory, red: red.directory, green: green.directory };
}
function verify() {
  if (arguments.length) throw new Error('No verification or evidence overrides.');
  const before = inventory(root);
  const dependencies = checkImports();
  const { snapshot, assessment } = readCurrent();
  assert.equal(assessment.approved, true);
  const privateBytes = readRegular(path.join('.git', 'kanban-orchestrator', 'publish.ps1'));
  assert.equal(inspect(snapshot, hash(privateBytes)).exactAuthorizedBytes, true);
  const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence-index.json'), 'utf8'));
  for (const entry of index.files) {
    assert.ok(entry.path.startsWith('evidence\\') && !entry.path.split('\\').includes('..'));
    const bytes = fs.readFileSync(path.join(root, entry.path));
    assert.equal(hash(bytes), entry.rawSha256, entry.path);
    assert.equal(bytes.length, entry.size);
  }
  const { runs, emptyUnqualifiedDirectories } = scan();
  const stages = ['bdd', 'stub', 'iac', 'pins', 'authority', 'focused', 'syntax', 'browser'];
  const latest = Object.fromEntries(stages.map((stage) => [stage, latestGreen(runs, stage)]));
  const red = runs.find((run) => run.stage === 'red' && run.exitCode === 1);
  assert.ok(red);
  assert.match(red.stdout, /ERR_ASSERTION/);
  assert.match(red.stdout, /10 !== 0/);
  const stub = fs.readFileSync(path.join(root, 'evidence', 'red', 'routing.initial.cjs'));
  assert.equal(red.sourceHashes.find((entry) => entry.path === 'capability\\C037\\routing.js').rawSha256, hash(stub));
  assert.ok(latest.bdd.completedAtUtc <= latest.stub.startedAtUtc && latest.stub.completedAtUtc <= red.startedAtUtc &&
    red.completedAtUtc <= latest.iac.startedAtUtc && latest.iac.completedAtUtc <= latest.focused.startedAtUtc);
  const critical = ['routing.js', 'cli.cjs', 'page.js', 'index.html', 'style.css', 'pins.cjs', 'authority.cjs', 'read-state.ps1'];
  for (const stage of ['focused', 'syntax', 'browser']) {
    for (const file of critical) {
      const relative = path.join('capability', 'C037', file);
      const pinned = latest[stage].sourceHashes.find((entry) => entry.path === relative);
      assert.ok(pinned, `Recorded ${stage} must actually cover current ${file}.`);
      assert.equal(hash(readRegular(relative)), pinned.rawSha256, `Current ${file} differs from actual ${stage} proof.`);
    }
  }
  const focused = /# tests (\d+)[\s\S]*# pass (\d+)[\s\S]*# fail (\d+)/.exec(latest.focused.stdout);
  assert.ok(focused && focused[1] === focused[2] && focused[3] === '0');
  const browser = JSON.parse(fs.readFileSync(path.join(latest.browser.absoluteDirectory, 'summary.json'), 'utf8'));
  assert.equal(browser.outcome, 'passed');
  assert.equal(browser.checks.length, 32);
  assert.ok(browser.checks.every((item) => item.passed === true));
  assert.ok(Object.values(browser.cleanup).every((value) => value === true));
  assert.equal(browser.actualSignedEdge.authenticodeStatus, 'Valid');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.equal(browser.helperRawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  const coverage = verifyCoverage(runs);
  const indexes = verifyAddenda(index);
  assert.deepEqual(inventory(root), before, 'Normal verification is read-only for existing source/evidence.');
  const result = {
    cardId: 'C037', outcome: 'verified-local-only', focusedTests: Number(focused[1]), focusedPassed: Number(focused[2]),
    focusedFailed: Number(focused[3]), publisherGuardGroups: 61, processTransportControls: 7,
    signedEdgeDomGroups: browser.checks.length, browserVersion: browser.browserVersion,
    syntaxJavaScriptModules: Number(/Syntax GREEN: (\d+)/.exec(latest.syntax.stdout)[1]),
    independentlyPinnedSourceFiles: dependencies.length, separatelyRetainedRawGitDifferences: dependencies.filter((entry) => !entry.rawEqualsGit).length,
    sealedEvidenceFiles: index.files.length, addendumIndexes: indexes.addenda, indexedEvidenceFiles: indexes.indexedEvidenceFiles,
    perFileCoverage: coverage.measured, coverageProof: { bdd: coverage.bdd, red: coverage.red, green: coverage.green },
    retainedRawRuns: runs.length,
    retainedNonzeroRuns: runs.filter((run) => run.exitCode !== 0).map(({ directory, stage, exitCode }) => ({ directory, stage, exitCode })),
    emptyUnqualifiedDirectories, manualBootstrapFailureRetained: true, sourceAndEvidenceReadOnly: true,
    currentPublisherSha256: hash(privateBytes), currentApprovalLedgerRevision: snapshot.ledgerRevision,
    currentTopApprovalMatched: true, normalVerificationAuthorizesPublication: false, publicationPerformed: false,
    cleanup: browser.cleanup, originalSProposed: 1, extraTestRepairCredits: 0,
    actualCurrentAttributedRequests: 0, parentOnlyAcceptance: true,
    remaining: ['H007 incomplete', 'actual requested routing policy unobserved', 'authenticated run/user/lease/cohort association unobserved',
      'native transport unqualified', 'full journey incomplete', 'production Node 24 incomplete'],
    latestProof: Object.fromEntries(stages.map((stage) => [stage, path.relative(repository, latest[stage].absoluteDirectory)]))
  };
  return result;
}
module.exports = Object.freeze({ verify });
if (require.main === module) {
  assert.equal(process.argv.length, 2);
  console.log(JSON.stringify(verify(), null, 2));
}
