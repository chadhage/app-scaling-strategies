'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { hash, checkImports, readRegular } = require('..\\pins.cjs');
const { readCurrent, inspect } = require('..\\authority.cjs');
const { scan, latestGreen } = require('./evidence.cjs');
const { inventory } = require('./support.cjs');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
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
  assert.deepEqual(inventory(root), before, 'Normal verification is read-only for existing source/evidence.');
  const result = {
    cardId: 'C037', outcome: 'verified-local-only', focusedTests: Number(focused[1]), focusedPassed: Number(focused[2]),
    focusedFailed: Number(focused[3]), publisherGuardGroups: 61, processTransportControls: 7,
    signedEdgeDomGroups: browser.checks.length, browserVersion: browser.browserVersion,
    syntaxJavaScriptModules: Number(/Syntax GREEN: (\d+)/.exec(latest.syntax.stdout)[1]),
    independentlyPinnedSourceFiles: dependencies.length, separatelyRetainedRawGitDifferences: dependencies.filter((entry) => !entry.rawEqualsGit).length,
    sealedEvidenceFiles: index.files.length, retainedRawRuns: runs.length,
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
