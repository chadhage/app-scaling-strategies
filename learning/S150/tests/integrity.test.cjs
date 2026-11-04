'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const vm = require('node:vm');
const zlib = require('node:zlib');
const {
  repo, read, SOURCE_COMMIT, HELPER_SHA256, SOURCES, sha, canonical, git,
  liveSources, acceptance, inventoryCards, ownedFiles, ownedHashes, testedSourceHashes, blobHash, gitAttributePath,
} = require('.\\provenance.cjs');

test('exact S150, D-S150/D-S090/D-S007, frozen A/B inventory and common source acceptance match the immutable pin', () => {
  const before = ownedHashes();
  const contract = JSON.parse(read('evidence\\source-contract.json'));
  assert.equal(contract.sourceCommit, SOURCE_COMMIT);
  assert.equal(contract.captureExplicitlyEnabled, true);
  assert.equal(contract.mutex, 'Local\\AppScalingStrategies_KanbanState_v1');
  assert.equal(contract.readHandlesClosedBeforeRelease, true);
  assert.equal(contract.extraKanoCredit, 0);
  assert.equal(git(['cat-file', '-t', SOURCE_COMMIT]).toString().trim(), 'commit');
  assert.equal(contract.acceptance.scenario,
    '| S150 | **Post-retirement verification:** Confirm no remaining routing, sessions, jobs, artifacts, or ownership leases depend on retired capacity. |');
  assert.equal(contract.acceptance.parent,
    '| D-S150 | P0 | Add **Verify retirement** with routing, session/work, artifact, ownership, and retained-capacity inventories. | No required dependency remains on v1; failed checks block retirement; cleanup outcome and remaining resources are exportable. | D-S090 |');
  assert.equal(contract.acceptance.portableCard,
    '| A-S150 | D-S150 | S | Retire v1 with outstanding dependencies; identify the check that must prevent deletion. | SOURCE |');
  const originals = {};
  const gitSources = {};
  assert.equal(contract.entries.length, 3);
  for (let i = 0; i < SOURCES.length; i++) {
    const spec = SOURCES[i];
    const entry = contract.entries[i];
    const rawGzip = read(path.join('evidence', entry.rawSnapshot));
    const gitGzip = read(path.join('evidence', entry.gitSnapshot));
    assert.equal(sha(rawGzip), entry.rawSnapshotSha256);
    assert.equal(sha(gitGzip), entry.gitSnapshotSha256);
    const rawBytes = zlib.gunzipSync(rawGzip);
    const gitBytes = zlib.gunzipSync(gitGzip);
    assert.equal(sha(rawBytes), entry.rawSha256);
    assert.equal(sha(gitBytes), entry.gitSourceSha256);
    assert.equal(rawBytes.length, entry.rawLength);
    assert.equal(gitBytes.length, entry.gitLength);
    assert.equal((rawBytes.toString().match(/\r\n/g) || []).length, entry.rawCRLFCount);
    assert.equal((gitBytes.toString().match(/\r\n/g) || []).length, entry.gitCRLFCount);
    assert.deepEqual(gitBytes, git(['show', `${SOURCE_COMMIT}:${spec.gitPath}`]));
    originals[spec.key] = rawBytes;
    gitSources[spec.key] = gitBytes;
  }
  assert.ok(contract.entries.find((entry) => entry.repositoryPath === 'README.md').rawCRLFCount > 0,
    'Original Windows CRLF is retained, not reconstructed from canonical Git text.');
  assert.deepEqual(acceptance(originals), contract.acceptance);
  assert.deepEqual(acceptance(gitSources), contract.acceptance);
  const live = liveSources();
  assert.deepEqual(acceptance(Object.fromEntries(SOURCES.map((spec) => [spec.key, live[spec.file]]))),
    contract.acceptance, 'Exact acceptance, not concurrent board counts or catalog availability, is compared.');
  assert.deepEqual(inventoryCards(live), contract.inventoryCards);
  const portable = contract.inventoryCards.find((card) => card.id === 'A-S150');
  assert.deepEqual([portable.kano, portable.kanoUnit, portable.priority, portable.packet, portable.technicalEntryGate],
    ['S', 'A-S150', 'P0', 'SC-S150', 'SOURCE']);
  assert.deepEqual(portable.parents, ['D-S150']);
  assert.deepEqual(ownedHashes(), before, 'Source verification is read-only.');
});

test('genuine loaded-stub RED assertions and exact raw failures survive independently of final implementation', () => {
  const red = JSON.parse(read('evidence\\red.json'));
  const stdout = read('evidence\\red.stdout.raw');
  const stderr = read('evidence\\red.stderr.raw');
  const stub = read('evidence\\red-model.js.snapshot');
  const originalTest = read('evidence\\red-model-test.cjs.snapshot');
  assert.equal(red.exitCode, 1);
  assert.equal(red.stage, 'genuine-behavioral-RED');
  assert.equal(sha(stdout), red.stdoutSha256);
  assert.equal(sha(stderr), red.stderrSha256);
  assert.equal(sha(stub), red.sourceRawSha256['model.js']);
  assert.equal(sha(originalTest), red.sourceRawSha256['tests\\model.test.cjs']);
  assert.match(stdout.toString(), /ERR_ASSERTION/);
  assert.match(stdout.toString(), /NOT_IMPLEMENTED/);
  assert.match(stdout.toString(), /REJECTED/);
  assert.doesNotMatch(stdout.toString(), /MODULE_NOT_FOUND|SyntaxError/);
  const archivedModule = { exports: {} };
  vm.runInNewContext(stub.toString(), { module: archivedModule }, { filename: 'archived-loadable-stub' });
  assert.equal(typeof archivedModule.exports.createLesson, 'function');
  const callbacks = [];
  vm.runInNewContext(originalTest.toString(), {
    require(name) {
      if (name === 'node:test') return (name, callback) => callbacks.push({ name, callback });
      if (name === 'node:assert/strict') return assert;
      if (name === '..\\model.js') return archivedModule.exports;
      throw new Error(`Undeclared original RED import: ${name}`);
    },
  }, { filename: 'archived-original-assertion' });
  assert.equal(callbacks.length, 1);
  assert.throws(callbacks[0].callback, { code: 'ERR_ASSERTION', expected: 'REJECTED', actual: 'NOT_IMPLEMENTED' });
  const iac = JSON.parse(read('evidence\\iac.json'));
  assert.equal(iac.applicable, false);
  assert.equal(iac.precedingEvidence, 'red.json');
  assert.equal(iac.infrastructureGenerated, false);
  assert.equal(iac.nativeExecutionAuthorized, false);
});

test('narrow attributes preserve raw proofs and independently qualify canonical Git source without writing objects', () => {
  const before = ownedHashes();
  const index = JSON.parse(read('evidence\\content-index.json'));
  assert.equal(index.cardId, 'A-S150');
  assert.equal(index.captureExplicitlyEnabled, true);
  assert.equal(index.rawProofRefinement.initialIndexSnapshot, 'initial-content-index.snapshot');
  assert.equal(sha(read('evidence\\initial-content-index.snapshot')), index.rawProofRefinement.initialIndexSha256);
  const indexed = new Set();
  for (const entry of index.entries) {
    assert.equal(indexed.has(entry.file), false);
    indexed.add(entry.file);
    const bytes = read(entry.file);
    const clean = entry.byteExact ? bytes : canonical(bytes);
    if (entry.byteExact) assert.equal(sha(bytes), entry.rawSha256, `Original raw proof bytes: ${entry.file}`);
    assert.equal(sha(clean), entry.canonicalSha256, `Independent canonical bytes: ${entry.file}`);
    const repositoryPath = gitAttributePath(entry.file);
    assert.equal(entry.gitAttributePath, repositoryPath);
    const attributes = git(['check-attr', 'text', 'eol', 'diff', 'merge', '--', repositoryPath]).toString();
    assert.match(attributes, entry.byteExact ? /: text: unset/ : /: text: set/, entry.file);
    if (!entry.byteExact) assert.match(attributes, /: eol: lf/, entry.file);
    else {
      assert.match(attributes, /: diff: unset/, entry.file);
      assert.match(attributes, /: merge: unset/, entry.file);
    }
    assert.equal(git(['hash-object', `--path=${repositoryPath}`, '--stdin'], bytes).toString().trim(),
      entry.gitBlobId, entry.file);
    assert.equal(blobHash(clean), entry.gitBlobId);
  }
  for (const file of ownedFiles()) {
    if (file === path.join('evidence', 'content-index.json') || indexed.has(file)) continue;
    assert.match(file, /^evidence\\(?:browser-[a-f0-9-]{36}\.raw\.json|focused-[a-f0-9-]{36}\.(?:raw\.json|stdout\.raw|stderr\.raw))$/,
      `No unindexed source or arbitrary artifact: ${file}`);
  }
  assert.deepEqual(ownedHashes(), before);
});

test('published helper is exact; raw captures retain failures and never turn negative user outcomes into migration success', () => {
  assert.equal(sha(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))), HELPER_SHA256);
  const sourceHashes = testedSourceHashes();
  let currentBrowserPasses = 0;
  for (const file of ownedFiles().filter((name) => /browser-[a-f0-9-]{36}\.raw\.json$/.test(name))) {
    const capture = JSON.parse(read(file));
    assert.equal(capture.cardId, 'A-S150');
    assert.equal(capture.workerId, 'worker-A-S150');
    assert.equal(capture.captureExplicitlyEnabled, true);
    assert.equal(capture.helperSha256, HELPER_SHA256);
    assert.equal(capture.deletionPerformed, false);
    assert.equal(capture.nativeMigrationObserved, false);
    assert.equal(capture.productionNode24Validated, false);
    assert.equal(capture.lifecyclePrototypeQualified, false);
    assert.ok(['PASS', 'FAIL'].includes(capture.result));
    if (capture.result === 'PASS' && JSON.stringify(capture.testedSourceHashes) === JSON.stringify(sourceHashes)) {
      currentBrowserPasses++;
      assert.equal(capture.runtime, 'v22.23.4');
      assert.equal(capture.playwrightVersion, '1.56.1');
      assert.equal(capture.browserVersion, '156.0.4314.50');
      assert.equal(capture.edgeProvenance.status, 'Valid');
      assert.equal(capture.cleanup.awaitedFinallyClose, true);
      assert.equal(capture.groups.filter((group) => group.startsWith('matrix-')).length, 14);
      assert.ok(capture.cspViolations.length >= 8);
      assert.deepEqual(capture.exerciseNetworkRequests, []);
      assert.deepEqual(capture.pageErrors, []);
      const interrupted = capture.observations.find((observation) =>
        observation.name === 'same-original-journey-earlier-interruption-and-rejected-attempts-retained');
      assert.equal(interrupted.totals.interruptedJourneys, 1);
      assert.equal(interrupted.current.decision, 'HELD_UNVERIFIED');
    } else if (capture.result === 'FAIL') assert.ok(capture.failure || capture.cleanup.failure);
  }
  assert.ok(currentBrowserPasses >= 1, 'A current-source, deliberately captured actual-browser PASS is required; failures alone are not proof.');
  for (const file of ownedFiles().filter((name) => /focused-[a-f0-9-]{36}\.raw\.json$/.test(name))) {
    const capture = JSON.parse(read(file));
    assert.equal(capture.captureExplicitlyEnabled, true);
    assert.equal(capture.extraKanoCredit, 0);
    assert.match(capture.stdoutFile, /^focused-[a-f0-9-]{36}\.stdout\.raw$/);
    assert.match(capture.stderrFile, /^focused-[a-f0-9-]{36}\.stderr\.raw$/);
    assert.equal(sha(read(path.join('evidence', capture.stdoutFile))), capture.stdoutSha256);
    assert.equal(sha(read(path.join('evidence', capture.stderrFile))), capture.stderrSha256);
    assert.ok(capture.exitCode === 0 || capture.exitCode === 1 || capture.failure);
  }
});
