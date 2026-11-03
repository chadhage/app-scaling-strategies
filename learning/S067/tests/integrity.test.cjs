'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file).toString('utf8'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonical = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const git = (args, input) => {
  const run = spawnSync('git', args, { cwd: repo, input, encoding: null });
  assert.equal(run.status, 0, String(run.stderr));
  return run.stdout;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const atomic = (text) => text.slice(text.indexOf('## Atomic card contract'),
  text.indexOf('## Concurrent pull and one-piece flow'));
const packet = (text) => text.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed'));
const files = (directory = root) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name))
    : [path.relative(root, path.join(directory, entry.name))]).sort();

test('exact source S067/README, D-S067/backlog, portable contract and SC-S067 packet preserve one frozen unit', () => {
  const source = json('evidence/source-contract.json');
  for (const [field, expected] of Object.entries({
    cardId: 'A-S067', parentId: 'D-S067', nativeSibling: 'B-S067', kano: 'S',
    kanoUnit: 'A-S067', packet: 'SC-S067', owner: 'worker-A-S067',
    ownedScope: 'learning\\S067\\**', entryGate: 'SOURCE',
  })) assert.equal(source[field], expected);
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.match(source.baselineCommit, /^[a-f0-9]{40}$/);
  assert.equal(source.sourceRow,
    '| S067 | **Replica lag during migration:** Route consistency-sensitive reads appropriately rather than silently returning unacceptable stale data. |');
  assert.equal(source.backlogRow,
    '| D-S067 | P1 | Add controlled replica lag and consistency-sensitive read routing. | Actual lag and selected reader are shown; stale results outside the contract cannot pass as uninterrupted correctness. | D-S061 |');
  assert.equal(source.cardRow,
    '| A-S067 | D-S067 | S | Introduce reader lag; choose a route meeting the declared freshness requirement. | SOURCE |');
  assert.equal(source.nativeRow,
    '| B-S067 | D-S067 | S | Conduct one native lag observation/routing experiment; verify real reader choice and freshness. | CORE, DATA, HOST, REPLICA |');
  assert.match(source.atomicAndPortableContract, /genuine behavioral TDD red/);
  assert.match(source.atomicAndPortableContract, /### Portable A-card lesson contract/);
  assert.match(source.packetRule, /every other A\/B card belongs to SC-Snnn/);
  assert.match(source.distinction, /not S061 reader expansion/);
  assert.match(source.acceptanceBoundary, /B-S067 and D-S067 remain incomplete/);
});

test('raw CRLF source bytes and canonical immutable Git blobs qualify the exact acceptance slices', () => {
  const source = json('evidence/source-contract.json');
  assert.equal(source.files.length, 3);
  const working = [];
  const committed = [];
  for (const entry of source.files) {
    const raw = bytes(entry.snapshot);
    const blob = bytes(entry.gitSnapshot);
    assert.equal(raw.length, entry.rawBytes);
    assert.equal(sha(raw), entry.rawSha256, entry.snapshot);
    assert.equal(raw.includes(Buffer.from('\r\n')), entry.rawHasCRLF);
    assert.equal(entry.rawHasCRLF, true);
    assert.equal(sha(canonical(raw)), entry.rawCanonicalSha256);
    assert.deepEqual(blob, git(['cat-file', 'blob', entry.gitBlob]));
    assert.equal(blob.length, entry.canonicalGitBytes);
    assert.equal(sha(blob), entry.canonicalGitSha256);
    assert.equal(canonical(raw).equals(canonical(blob)), entry.wholeFileCanonicalEquality);
    assert.equal(entry.exactAcceptanceSlicesMatch, true);
    assert.equal(git(['rev-parse', `${source.baselineCommit}:${entry.path.replace(/\\/g, '/')}`]).toString().trim(), entry.gitBlob);
    working.push(raw.toString('utf8'));
    committed.push(blob.toString('utf8'));
  }
  for (const [index, id] of [[0, 'S067'], [1, 'D-S067'], [2, 'A-S067'], [2, 'B-S067']]) {
    assert.equal(row(working[index], id), row(committed[index], id));
  }
  assert.equal(row(working[0], 'S067'), source.sourceRow);
  assert.equal(row(working[1], 'D-S067'), source.backlogRow);
  assert.equal(atomic(working[2]), source.atomicAndPortableContract);
  assert.deepEqual(canonical(Buffer.from(atomic(working[2]))), canonical(Buffer.from(atomic(committed[2]))));
  assert.equal(packet(working[2]), source.packetRule);
  assert.equal(packet(working[2]), packet(committed[2]));
});

test('non-discovered BDD, fixture, original loadable stub and unchanged tests bind eight real RED assertion failures', () => {
  const red = json('evidence/red/run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 9);
  assert.equal(red.passed, 1);
  assert.equal(red.failed, 8);
  assert.equal(red.assertionFailures, 8);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  assert.equal(red.signal, null);
  const stdout = bytes('evidence/red/stdout.raw');
  const stderr = bytes('evidence/red/stderr.raw');
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  const text = stdout.toString() + stderr.toString();
  assert.equal((text.match(/code: 'ERR_ASSERTION'/g) || []).length, 8);
  assert.match(text, /'UNKNOWN' !== 'FAIL'/);
  assert.doesNotMatch(text, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError:/);
  assert.equal(red.snapshots.length, 4);
  for (const snapshot of red.snapshots) {
    const data = bytes(snapshot.snapshot);
    assert.ok(snapshot.snapshot.endsWith('.snapshot'));
    assert.doesNotMatch(snapshot.snapshot, /\.(?:test\.cjs|js|cjs)$/);
    assert.equal(data.length, snapshot.bytes);
    assert.equal(sha(data), snapshot.sha256);
    if (snapshot.source !== 'model.js') {
      assert.deepEqual(canonical(bytes(snapshot.source)), canonical(data));
    }
  }
  const stub = bytes('evidence/red/model.js.snapshot').toString('utf8');
  assert.match(stub, /gate: 'UNKNOWN'/);
  assert.doesNotMatch(stub, /STALE_READ|function configuration|class GuardError/);
});

test('IaC N/A follows behavioral RED and precedes green implementation checks', () => {
  const source = json('evidence/source-contract.json');
  const red = json('evidence/red/run.json');
  const iac = json('evidence/iac-decision.json');
  const green = json('evidence/initial-green/run.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.afterRedCompletedAtUtc, red.completedAtUtc);
  assert.match(iac.stage, /before behavior implementation/);
  assert.match(iac.reason, /Resource-free local synthetic replica-lag lesson/);
  assert.equal(iac.resourcesCreated, 0);
  assert.ok(Date.parse(source.sourceCapturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.completedAtUtc) < Date.parse(iac.decidedAtUtc));
  assert.ok(Date.parse(iac.decidedAtUtc) < Date.parse(green.startedAtUtc));
});

test('retained green and deliberate browser capture preserve raw output and tested source identities', () => {
  for (const [mode, expected] of [['initial-green', 22], ['browser-green', 1]]) {
    const run = json(`evidence/${mode}/run.json`);
    const stdout = bytes(`evidence/${mode}/stdout.raw`);
    const stderr = bytes(`evidence/${mode}/stderr.raw`);
    assert.equal(run.exitCode, 0);
    assert.equal(run.tests, expected);
    assert.equal(run.passed, expected);
    assert.equal(run.failed, 0);
    assert.equal(run.assertionFailures, 0);
    assert.equal(run.spawnError, null);
    assert.equal(run.signal, null);
    assert.equal(run.missingCodeOrTools, false);
    assert.equal(sha(stdout), run.rawStdoutSha256);
    assert.equal(sha(stderr), run.rawStderrSha256);
    assert.equal(run.browserCaptureExplicitlyEnabled, mode === 'browser-green');
    for (const [file, hash] of Object.entries(run.sourceHashes)) {
      assert.equal(sha(canonical(bytes(file))), hash, file);
    }
  }
});

test('actual signed Edge browser evidence covers DOM, failure, unknown, prediction, guards, history, reset and enforced CSP', () => {
  const browser = json('evidence/browser-acceptance.json');
  const tooling = json('evidence/tooling.json');
  const hash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.equal(browser.mode, 'synthetic');
  assert.equal(browser.runtime, 'v22.23.4');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.helper.sha256, hash);
  assert.equal(browser.helper.publication, '53c0c0d');
  assert.equal(tooling.helperSha256, hash);
  assert.equal(sha(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))), hash);
  assert.equal(tooling.browserSignatureStatus, 'Valid');
  assert.match(tooling.browserSigner, /Microsoft Corporation/);
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.node, 'v22.23.4');
  assert.match(tooling.browserFileVersion, /^156\./);
  for (const field of ['downloads', 'packagesInstalled', 'unsafeFlags', 'foregroundLease',
    'productionNode24Certified', 'nativeDatabaseLagOrFreshnessProof', 'unattendedLifecycleCertified']) {
    assert.equal(tooling[field], false);
  }
  for (const [file, hashValue] of Object.entries(browser.sourceHashes)) {
    assert.equal(sha(canonical(bytes(file))), hashValue, file);
  }
  for (const name of [
    'initial-keyboard-and-focus', 'guard-read-before-lag', 'guard-invalid-fixture-no-html-sink',
    'guard-frozen-config', 'stale-failure-and-invalid-prediction',
    'correct-failure-prediction-still-interrupted',
    'gated-primary-pass-no-reader-catchup-wrong-prediction', 'inclusive-two-tick-boundary',
    'same-reader-strict-budget-failure', 'unknown-reader-lag-no-certification',
    'six-history-limit-and-unknown-reader-primary-fallback', 'reset-clears-six-attempts-and-error',
    'missing-returned-read-even-selected-primary-unknown', 'known-current-reader-selected-with-gate',
    'final-keyboard-reset',
  ]) assert.ok(browser.observations.some((entry) => entry.name === name), name);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.deepEqual(browser.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
  assert.deepEqual(browser.probeResponses, []);
  assert.equal(browser.cleanup.awaitedFinallyClose, true);
  assert.equal(browser.cspProbes.inlineExecuted, false);
  assert.equal(browser.cspProbes.dynamicEvaluation, 'blocked');
  assert.equal(browser.cspProbes.connection, 'blocked');
  for (const directive of ['script-src', 'script-src-elem', 'style-src-elem', 'connect-src', 'frame-src', 'form-action', 'base-uri']) {
    assert.ok(browser.cspViolations.some((entry) => entry.effectiveDirective === directive
      && entry.disposition === 'enforce'), directive);
  }
  const testSource = bytes('tests/browser.test.cjs').toString('utf8');
  assert.match(testSource, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(testSource, /finally \{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(testSource, /chromium\.launch|browser\.newContext|bypassCSP:\s*true|--no-sandbox|lifecycle/);
});

test('every owned JavaScript file has passing syntax evidence bound to canonical source', () => {
  const syntax = json('evidence/syntax.json');
  assert.equal(syntax.outcome, 'PASS');
  assert.equal(syntax.runtime, 'v22.23.4');
  const expected = files().filter((file) => /\.(?:js|cjs)$/.test(file));
  assert.deepEqual(syntax.checks.map((entry) => entry.file).sort(), expected);
  for (const entry of syntax.checks) {
    assert.equal(entry.exitCode, 0, entry.file);
    assert.equal(entry.signal, null);
    assert.equal(entry.spawnError, null);
    assert.equal(entry.sourceCanonicalSha256, sha(canonical(bytes(entry.file))), entry.file);
    assert.equal(entry.rawStdoutSha256, sha(Buffer.from(entry.stdoutBase64, 'base64')));
    assert.equal(entry.rawStderrSha256, sha(Buffer.from(entry.stderrBase64, 'base64')));
  }
});

test('sealed owned files retain raw evidence and qualify canonical clean-filter Git source identities', () => {
  const index = json('evidence/content-index.json');
  assert.equal(index.cardId, 'A-S067');
  assert.equal(index.algorithm, 'SHA256');
  assert.equal(index.excludedSelf, 'evidence\\content-index.json');
  const expected = files().filter((file) => file !== index.excludedSelf);
  assert.deepEqual(index.files.map((entry) => entry.file).sort(), expected);
  for (const entry of index.files) {
    const data = entry.hashMode === 'raw' ? bytes(entry.file) : canonical(bytes(entry.file));
    assert.equal(data.length, entry.bytes, entry.file);
    assert.equal(sha(data), entry.sha256, entry.file);
    assert.equal(entry.hashMode === 'raw', /\.(?:raw|snapshot)$/.test(entry.file), entry.file);
    const gitPath = `learning/S067/${entry.file.replace(/\\/g, '/')}`;
    if (entry.hashMode === 'raw') {
      const attr = git(['check-attr', '-z', 'text', '--', gitPath]).toString().split('\0');
      assert.equal(attr[2], 'unset', entry.file);
    }
    const cleanedBlob = git(['hash-object', '--stdin', `--path=${gitPath}`], bytes(entry.file)).toString().trim();
    assert.equal(cleanedBlob, entry.expectedGitBlobSha1, entry.file);
  }
});

test('actual owned HEAD blobs match the sealed source after publication; pre-publication is explicitly unqualified', (context) => {
  const tracked = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', 'learning/S067']).toString().trim();
  if (!tracked) {
    context.diagnostic('A-S067 not published yet: clean-filter qualification passed; actual HEAD blob check must rerun after publication.');
    return;
  }
  const index = json('evidence/content-index.json');
  const expected = [...index.files.map((entry) => `learning/S067/${entry.file.replace(/\\/g, '/')}`),
    'learning/S067/evidence/content-index.json'].sort();
  assert.deepEqual(tracked.split(/\r?\n/).sort(), expected);
  for (const entry of index.files) {
    const gitPath = `learning/S067/${entry.file.replace(/\\/g, '/')}`;
    const blob = git(['rev-parse', `HEAD:${gitPath}`]).toString().trim();
    assert.equal(blob, entry.expectedGitBlobSha1, entry.file);
    assert.equal(sha(git(['cat-file', 'blob', blob])), entry.sha256, entry.file);
  }
  assert.deepEqual(git(['show', 'HEAD:learning/S067/evidence/content-index.json']),
    canonical(bytes('evidence/content-index.json')));
});

test('evidence and refinement do not award native proof, parent completion or extra units', () => {
  const evidence = json('evidence.json');
  const refinement = json('evidence/refinement.json');
  assert.equal(evidence.verifier, 'PASS');
  assert.equal(evidence.mode, 'synthetic');
  assert.equal(evidence.acceptance.status, 'pending parent empirical acceptance');
  assert.equal(evidence.acceptance.acceptedAtUtc, null);
  assert.equal(evidence.publication.parentAcceptOnly, true);
  for (const field of ['sourceParentComplete', 'nativeSiblingComplete',
    'actualDatabaseLagOrFreshnessProved', 'productionNode24Certified', 'unattendedLifecycleCertified']) {
    assert.equal(evidence.native[field], false);
  }
  for (const key of ['source', 'bdd', 'red', 'iac', 'initialGreen', 'browserGreen',
    'browser', 'tooling', 'syntax', 'integrity', 'refinement']) {
    assert.equal(fs.existsSync(path.join(root, evidence[key])), true, key);
  }
  assert.equal(refinement.units, 1);
  assert.equal(refinement.extraCardsCreated, 0);
  assert.equal(refinement.sharedToDoEdits, false);
  assert.equal(refinement.parentAcceptanceRequired, true);
  assert.equal(refinement.remaining.find((entry) => entry.id === 'B-S067').readiness, false);
  assert.equal(refinement.remaining.find((entry) => entry.id === 'D-S067').complete, false);
});
