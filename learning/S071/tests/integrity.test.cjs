'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file).toString('utf8'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const canonical = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const git = (args, input) => {
  const run = spawnSync('git', args, { cwd: repo, input, encoding: null });
  assert.equal(run.error, undefined);
  assert.equal(run.status, 0, String(run.stderr));
  return run.stdout;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const contract = (text) => text.slice(text.indexOf('## Atomic card contract'),
  text.indexOf('## Concurrent pull and one-piece flow'));
const packet = (text) => text.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed'));
const files = (directory = root) => fs.readdirSync(directory, { withFileTypes: true })
  .flatMap((entry) => entry.isDirectory() ? files(path.join(directory, entry.name))
    : [path.relative(root, path.join(directory, entry.name))]).sort();

test('exact S071, D-S071, portable A/card contract and fixed packet bind one source-specific unit', () => {
  const source = json('evidence/source-contract.json');
  for (const [field, expected] of Object.entries({
    cardId: 'A-S071', parentId: 'D-S071', nativeSibling: 'B-S071',
    kano: 'S', kanoUnit: 'A-S071', packet: 'SC-S071', owner: 'worker-A-S071',
    ownedScope: 'learning\\S071\\**', entryGate: 'SOURCE',
  })) assert.equal(source[field], expected);
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.match(source.baselineCommit, /^[a-f0-9]{40}$/);
  assert.equal(source.sourceRow,
    '| S071 | **Shared-cache expansion:** Scale cache capacity while keeping application access and payload compatibility intact. |');
  assert.equal(source.backlogRow,
    '| D-S071 | P1 | Add cache-capacity changes under mixed-version read/write traffic. | Actual cache behavior, payload compatibility, and journey budgets remain valid; native resize limitations are disclosed. | none |');
  assert.equal(source.cardRow,
    '| A-S071 | D-S071 | S | Resize cache with mixed readers; detect payload incompatibility masked by extra capacity. | SOURCE |');
  assert.equal(source.nativeRow,
    '| B-S071 | D-S071 | S | Conduct one native cache-capacity change; verify real effects and mixed-version correctness. | CORE, DATA, HOST |');
  assert.match(source.atomicAndPortableContract, /genuine behavioral TDD red/);
  assert.match(source.atomicAndPortableContract, /### Portable A-card lesson contract/);
  assert.match(source.packetRule, /every other A\/B card belongs to SC-Snnn/);
  assert.match(source.distinction, /Not replacement S055/);
  assert.match(source.acceptanceBoundary, /B-S071 and D-S071 remain incomplete/);
});

test('raw CRLF source and canonical immutable Git blobs preserve exact acceptance without normalizing provenance', () => {
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
    assert.equal(blob.length, entry.gitBytes);
    assert.equal(sha(blob), entry.gitSha256);
    assert.equal(canonical(raw).equals(canonical(blob)), entry.wholeFileCanonicalEquality);
    assert.equal(entry.exactAcceptanceSlicesMatch, true);
    assert.equal(git(['rev-parse', `${source.baselineCommit}:${entry.path.replace(/\\/g, '/')}`]).toString().trim(), entry.gitBlob);
    working.push(raw.toString('utf8'));
    committed.push(blob.toString('utf8'));
  }
  for (const [index, id] of [[0, 'S071'], [1, 'D-S071'], [2, 'A-S071'], [2, 'B-S071']]) {
    assert.equal(row(working[index], id), row(committed[index], id));
  }
  assert.equal(row(working[0], 'S071'), source.sourceRow);
  assert.equal(row(working[1], 'D-S071'), source.backlogRow);
  assert.equal(contract(working[2]), source.atomicAndPortableContract);
  assert.deepEqual(canonical(Buffer.from(contract(working[2]))), canonical(Buffer.from(contract(committed[2]))));
  assert.equal(packet(working[2]), source.packetRule);
  assert.equal(packet(committed[2]), source.packetRule);
});

test('non-discovered original BDD, fixture, loadable stub and unchanged tests bind seven genuine RED assertions', () => {
  const red = json('evidence/red/run.json');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 9);
  assert.equal(red.passed, 2);
  assert.equal(red.failed, 7);
  assert.equal(red.assertionFailures, 7);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  assert.equal(red.signal, null);
  const stdout = bytes('evidence/red/stdout.raw');
  const stderr = bytes('evidence/red/stderr.raw');
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  const text = stdout.toString() + stderr.toString();
  assert.equal((text.match(/code: 'ERR_ASSERTION'/g) || []).length, 7);
  assert.match(text, /'UNKNOWN' !== 'FAIL'/);
  assert.doesNotMatch(text, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError:/);
  assert.equal(red.snapshots.length, 4);
  for (const entry of red.snapshots) {
    const data = bytes(entry.snapshot);
    assert.ok(entry.snapshot.endsWith('.snapshot'));
    assert.doesNotMatch(entry.snapshot, /\.(?:test\.cjs|js|cjs)$/);
    assert.equal(data.length, entry.bytes);
    assert.equal(sha(data), entry.sha256, entry.snapshot);
    if (entry.source !== 'model.js') assert.deepEqual(canonical(bytes(entry.source)), canonical(data));
  }
  const context = { module: { exports: {} } };
  vm.runInNewContext(bytes('evidence/red/model.js.snapshot').toString('utf8'), context);
  const stub = context.module.exports;
  const state = stub.probeMixedTraffic(stub.resizeCache(stub.createRehearsal(),
    { targetCapacity: 12, payloadMode: 'breaking', resizeMode: 'continuous', coverage: 'all', budgetMs: 100 }));
  assert.equal(state.result.gate, 'UNKNOWN');
  assert.throws(() => assert.equal(state.result.gate, 'FAIL'), { code: 'ERR_ASSERTION' });
});

test('IaC N/A is recorded after behavioral RED and before implementation green', () => {
  const source = json('evidence/source-contract.json');
  const red = json('evidence/red/run.json');
  const iac = json('evidence/iac-decision.json');
  const green = json('evidence/focused-green/run.json');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.afterRedCompletedAtUtc, red.completedAtUtc);
  assert.match(iac.stage, /before behavior implementation/);
  assert.match(iac.reason, /Resource-free local synthetic shared-cache expansion lesson/);
  assert.equal(iac.resourcesCreated, 0);
  assert.equal(iac.managementCalls, 0);
  assert.ok(Date.parse(source.capturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.completedAtUtc) < Date.parse(iac.decidedAtUtc));
  assert.ok(Date.parse(iac.decidedAtUtc) < Date.parse(green.startedAtUtc));
});

test('focused green and deliberate browser capture preserve raw output and canonical tested source identities', () => {
  for (const [mode, expected] of [['focused-green', 18], ['browser-green', 1]]) {
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
    for (const [file, hash] of Object.entries(run.sourceHashes)) assert.equal(sha(canonical(bytes(file))), hash, file);
    assert.equal(run.browserCaptureExplicitlyEnabled, mode === 'browser-green');
  }
});

test('only pinned offline Node22, PW1.56.1 and signed Edge156 qualify the bounded actual browser observations', () => {
  const tooling = json('evidence/tooling.json');
  const browser = json('evidence/browser-acceptance.json');
  const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.edgeVersion, '156.0.4314.50');
  assert.equal(tooling.edgeSignatureStatus, 'Valid');
  assert.match(tooling.edgeSigner, /Microsoft Corporation/);
  assert.equal(tooling.helperSha256, helperHash);
  assert.equal(tooling.packagesInstalled, 0);
  assert.equal(tooling.downloads, 0);
  assert.equal(sha(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))), helperHash);
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.equal(browser.runtime, tooling.node);
  assert.equal(browser.playwrightVersion, tooling.playwright);
  assert.equal(browser.browserVersion, tooling.edgeVersion);
  assert.equal(browser.helper.sha256, helperHash);
  assert.equal(browser.helper.publication, '53c0c0d');
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.deepEqual(browser.consoleErrors.filter((entry) => entry.stage === 'exercise'), []);
  assert.deepEqual(browser.probeResponses, []);
  assert.equal(browser.cleanup.awaitedFinallyClose, true);
  assert.equal(browser.keyboard.resetFocus, 'resize-cache');
  assert.equal(browser.keyboard.visibleFocusOutlinePx, 3);
  for (const [file, hash] of Object.entries(browser.sourceHashes)) assert.equal(sha(canonical(bytes(file))), hash, file);
  for (const name of [
    'invalid-budget-rejected-without-state-change', 'tampered-option-rejected',
    'out-of-order-interpretation-rejected', 'pending-resize-reset-clears-errors-and-view',
    'extra-capacity-does-not-mask-incompatible-payload', 'repeated-resize-guard-retains-result',
    'compatible-overlap-pass-is-synthetic-only', 'resize-access-gap-remains-counted-after-recovery',
    'original-budget-failures-survive-capacity-improvement', 'missing-old-cohort-is-unknown-not-pass',
    'unverified-capability-and-six-attempt-history-bound', 'full-reset-clears-history-prediction-errors-and-results',
    'unsupported-operation-is-fail-without-fabricated-capacity', 'empty-observations-are-unknown',
    'known-payload-failure-outranks-unknown-capability', 'original-budget-boundary-is-inclusive',
  ]) assert.ok(browser.observations.some((entry) => entry.name === name), name);
  for (const directive of ['script-src', 'script-src-elem', 'connect-src', 'style-src-elem', 'base-uri', 'form-action']) {
    assert.ok(browser.cspViolations.some((entry) => entry.directive === directive && entry.disposition === 'enforce'), directive);
  }
  assert.ok(Object.values(browser.cspChecks).every((value) => value === true || value === false));
  assert.equal(browser.cspChecks.bypassCSP, false);
  for (const [field, value] of Object.entries(browser.cspChecks)) if (field !== 'bypassCSP') assert.equal(value, true);
  assert.match(browser.workerBoundary, /before a worker-src CSP event.*not independently qualified/);
  const source = bytes('tests/browser.test.cjs').toString('utf8');
  assert.match(source, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(source, /finally \{[\s\S]*await session\.close\(\)/);
  assert.doesNotMatch(source, /chromium\.launch|browser\.newContext|bypassCSP:\s*true|--no-sandbox/);
});

test('all owned JavaScript has successful syntax evidence bound to canonical source', () => {
  const syntax = json('evidence/syntax.json');
  assert.equal(syntax.outcome, 'PASS');
  assert.equal(syntax.runtime, 'v22.23.4');
  assert.deepEqual(syntax.checks.map((entry) => entry.file).sort(), files().filter((file) => /\.(?:js|cjs)$/.test(file)));
  for (const entry of syntax.checks) {
    assert.equal(entry.exitCode, 0, entry.file);
    assert.equal(entry.signal, null);
    assert.equal(entry.spawnError, null);
    assert.equal(entry.sourceCanonicalSha256, sha(canonical(bytes(entry.file))), entry.file);
    assert.equal(entry.rawStdoutSha256, sha(Buffer.from(entry.stdoutBase64, 'base64')));
    assert.equal(entry.rawStderrSha256, sha(Buffer.from(entry.stderrBase64, 'base64')));
  }
});

test('sealed owned content preserves raw bytes and qualifies canonical Git clean-filter identities', () => {
  const index = json('evidence/content-index.json');
  assert.equal(index.cardId, 'A-S071');
  assert.equal(index.algorithm, 'SHA256');
  assert.equal(index.excludedSelf, 'evidence\\content-index.json');
  assert.deepEqual(index.files.map((entry) => entry.file).sort(), files().filter((file) => file !== index.excludedSelf));
  for (const entry of index.files) {
    const data = entry.hashMode === 'raw' ? bytes(entry.file) : canonical(bytes(entry.file));
    assert.equal(data.length, entry.bytes, entry.file);
    assert.equal(sha(data), entry.sha256, entry.file);
    assert.equal(entry.hashMode === 'raw', /\.(?:raw|snapshot)$/.test(entry.file), entry.file);
    const gitPath = `learning/S071/${entry.file.replace(/\\/g, '/')}`;
    if (entry.hashMode === 'raw') {
      assert.equal(git(['check-attr', '-z', 'text', '--', gitPath]).toString().split('\0')[2], 'unset', entry.file);
    }
    assert.equal(git(['hash-object', '--stdin', `--path=${gitPath}`], bytes(entry.file)).toString().trim(),
      entry.expectedGitBlobSha1, entry.file);
  }
});

test('actual owned HEAD blobs match sealed content after publication; pre-publication is explicitly unqualified', (context) => {
  const tracked = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', 'learning/S071']).toString().trim();
  if (!tracked) {
    context.diagnostic('A-S071 not yet published: only clean-filter integrity is qualified; rerun actual HEAD checks after publication.');
    return;
  }
  const index = json('evidence/content-index.json');
  const expected = [...index.files.map((entry) => `learning/S071/${entry.file.replace(/\\/g, '/')}`),
    'learning/S071/evidence/content-index.json'].sort();
  assert.deepEqual(tracked.split(/\r?\n/).sort(), expected);
  for (const entry of index.files) {
    const gitPath = `learning/S071/${entry.file.replace(/\\/g, '/')}`;
    const blob = git(['rev-parse', `HEAD:${gitPath}`]).toString().trim();
    assert.equal(blob, entry.expectedGitBlobSha1, entry.file);
    assert.equal(sha(git(['cat-file', 'blob', blob])), entry.sha256, entry.file);
  }
  assert.deepEqual(git(['show', 'HEAD:learning/S071/evidence/content-index.json']), canonical(bytes('evidence/content-index.json')));
});

test('manifest, evidence and refinement leave native/parent acceptance and extra-credit claims unfulfilled', () => {
  const manifest = json('manifest.json');
  const evidence = json('evidence.json');
  const refinement = json('evidence/refinement.json');
  assert.equal(manifest.cardId, 'A-S071');
  assert.equal(manifest.objective, 'Resize cache with mixed readers; detect payload incompatibility masked by extra capacity.');
  assert.equal(manifest.bounds.configurations, 528);
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(evidence.verifier, 'PASS');
  assert.equal(evidence.mode, 'synthetic');
  assert.equal(evidence.acceptance.status, 'pending parent empirical acceptance');
  assert.equal(evidence.acceptance.acceptedAtUtc, null);
  assert.equal(evidence.acceptance.reviewer, null);
  assert.equal(evidence.publication.parentAcceptOnly, true);
  for (const value of Object.entries(evidence.native).filter(([field]) => field !== 'remainingGates').map(([, value]) => value)) {
    assert.equal(value, false);
  }
  for (const key of ['source', 'bdd', 'red', 'iac', 'focusedGreen', 'browserGreen', 'browser', 'tooling', 'syntax', 'integrity', 'refinement']) {
    assert.equal(fs.existsSync(path.join(root, evidence[key])), true, key);
  }
  assert.equal(refinement.units, 1);
  assert.equal(refinement.extraCardsCreated, 0);
  assert.equal(refinement.sharedToDoEdits, false);
  assert.equal(refinement.parentAcceptanceRequired, true);
  assert.equal(refinement.remaining.find((entry) => entry.id === 'B-S071').readiness, false);
  assert.equal(refinement.remaining.find((entry) => entry.id === 'D-S071').complete, false);
});
