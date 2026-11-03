'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file).toString('utf8'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const lf = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const evidence = (...parts) => path.join('evidence', ...parts);
const raw = (file) => zlib.gunzipSync(bytes(file));
const git = (args, input) => {
  const result = spawnSync('git', args, { cwd: repo, input, encoding: null });
  assert.equal(result.status, 0, String(result.stderr));
  return result.stdout;
};

test('exact source, D-S055, portable A contract and default SC-S055 packet retain their original scope', () => {
  const source = json(evidence('source-contract.json'));
  assert.equal(source.cardId, 'A-S055');
  assert.equal(source.parentId, 'D-S055');
  assert.equal(source.kano, 'S');
  assert.equal(source.kanoUnit, 'A-S055');
  assert.equal(source.packet, 'SC-S055');
  assert.equal(source.owner, 'worker-A-S055');
  assert.equal(source.ownedScope, 'learning\\S055\\**');
  assert.equal(source.entryGate, 'SOURCE');
  assert.match(source.baselineCommit, /^[a-f0-9]{40}$/);
  assert.equal(source.source.row,
    '| S055 | **Cache payload evolution:** Version or translate cached objects so mixed application versions can coexist. |');
  assert.equal(source.backlog.row,
    '| D-S055 | P1 | Add cache payload/version namespaces and mixed-version readers. | Compatible translation/versioning preserves correctness; incompatible cached objects fail explicitly. | none |');
  assert.equal(source.card.row,
    '| A-S055 | D-S055 | S | Read mixed cache payloads; identify when translation or versioned namespaces are required. | SOURCE |');
  assert.equal(source.card.nativeSibling,
    '| B-S055 | D-S055 | S | Conduct one cached-payload transition; verify cross-version correctness and explicit incompatible reads. | CORE, DATA, HOST |');
  assert.match(source.card.atomicAndPortableContract, /genuine behavioral TDD red/);
  assert.match(source.card.atomicAndPortableContract, /### Portable A-card lesson contract/);
  assert.match(source.card.packetRule, /every other A\/B card belongs to SC-Snnn/);
  assert.match(source.refinement, /No additional unit, parent or native work is admitted/);
});

test('raw CRLF source snapshots are byte-preserved and explicitly qualified against canonical committed Git blobs', () => {
  const source = json(evidence('source-contract.json'));
  assert.equal(source.sourceFiles.length, 3);
  for (const entry of source.sourceFiles) {
    const snapshot = bytes(evidence(entry.snapshot));
    assert.equal(snapshot.length, entry.rawBytes);
    assert.equal(sha(snapshot), entry.rawSha256, entry.snapshot);
    assert.equal(entry.rawHasCRLF, true);
    assert.ok(snapshot.includes(Buffer.from('\r\n')));
    const tree = git(['ls-tree', source.baselineCommit, '--', entry.path]).toString();
    assert.ok(tree.includes(`blob ${entry.gitBlob}\t`), entry.path);
    const committed = git(['cat-file', 'blob', entry.gitBlob]);
    assert.equal(committed.length, entry.canonicalGitBytes);
    assert.equal(sha(committed), entry.canonicalGitSha256);
    assert.equal(sha(lf(snapshot)), entry.canonicalLfSha256);
    assert.deepEqual(lf(snapshot), lf(committed));
  }
  const readme = bytes(evidence(source.sourceFiles[0].snapshot)).toString('utf8');
  const backlog = bytes(evidence(source.sourceFiles[1].snapshot)).toString('utf8');
  const contract = bytes(evidence(source.sourceFiles[2].snapshot)).toString('utf8');
  assert.ok(readme.split(/\r?\n/).includes(source.source.row));
  assert.ok(backlog.split(/\r?\n/).includes(source.backlog.row));
  assert.ok(contract.split(/\r?\n/).includes(source.card.row));
  assert.ok(contract.includes(source.card.atomicAndPortableContract));
});

test('non-auto-discovered BDD, fixture, original stub and test snapshots preserve genuine pre-implementation bytes', () => {
  const red = json(evidence('red', 'run.json'));
  assert.equal(red.snapshots.length, 4);
  for (const entry of red.snapshots) {
    assert.ok(entry.snapshot.endsWith('.snapshot'));
    assert.doesNotMatch(entry.snapshot, /\.(?:cjs|js|mjs)$/);
    const snapshot = bytes(evidence('red', entry.snapshot));
    assert.equal(snapshot.length, entry.bytes);
    assert.equal(sha(snapshot), entry.sha256);
    if (entry.source !== 'model.js') assert.deepEqual(lf(bytes(entry.source)), lf(snapshot));
  }
  const stub = bytes(evidence('red', 'model.js.snapshot')).toString('utf8');
  assert.match(stub, /prepare: snapshot, read: snapshot/);
  assert.doesNotMatch(stub, /function decode|function evaluate|SCHEMA_MISMATCH/);
  assert.match(bytes('.gitattributes').toString('utf8'), /\*\.snapshot binary/);
});

test('behavioral RED is twenty real assertions rather than missing code, tools or syntax', () => {
  const red = json(evidence('red', 'run.json'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 21);
  assert.equal(red.passed, 1);
  assert.equal(red.failed, 20);
  assert.equal(red.assertionFailures, 20);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  assert.equal(red.signal, null);
  const stdout = raw(evidence('red', 'stdout.raw.gz'));
  const stderr = raw(evidence('red', 'stderr.raw.gz'));
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  const text = stdout.toString() + stderr.toString();
  assert.equal((text.match(/code: 'ERR_ASSERTION'/g) || []).length, 20);
  assert.doesNotMatch(text, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError: Cannot/);
  assert.equal(lf(bytes(evidence('red', 'red.tap'))).toString(),
    text.replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n'));
});

test('resource-free IaC N/A was recorded after genuine RED and before implementation verification', () => {
  const decision = json(evidence('iac-decision.json'));
  const red = json(evidence('red', 'run.json'));
  const green = json(evidence('verification', 'initial-green-001.json'));
  const source = json(evidence('source-contract.json'));
  assert.equal(decision.status, 'N/A');
  assert.equal(decision.afterRedCompletedAtUtc, red.completedAtUtc);
  assert.match(decision.stage, /before behavior implementation/);
  assert.match(decision.reason, /Resource-free offline synthetic cache lesson/);
  assert.ok(Date.parse(source.sourceReadAndQualifiedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.completedAtUtc) < Date.parse(decision.decidedAtUtc));
  assert.ok(Date.parse(decision.decidedAtUtc) < Date.parse(green.startedAtUtc));
  assert.equal(json('manifest.json').iac.status, 'N/A');
});

test('deliberately captured real DOM evidence binds current sources, measured failures/unknowns, history, keyboard and reset', () => {
  const browser = json(evidence('browser.json'));
  assert.equal(browser.cardId, 'A-S055');
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.equal(browser.observations.length, 14);
  for (const [file, hash] of Object.entries(browser.testedSourceHashes)) {
    assert.equal(sha(lf(bytes(file))), hash, file);
  }
  const named = (part) => {
    const observation = browser.observations.find((entry) => entry.name.includes(part));
    assert.ok(observation, part);
    return observation;
  };
  assert.match(named('state guard').alert, /requires prepared/);
  assert.match(named('input guard').alert, /^Payload:/);
  const failure = named('shared unsafe');
  assert.equal(failure.gate, 'Compatibility gate: FAIL');
  assert.equal(failure.impact, 'Synthetic read impact: INTERRUPTED');
  assert.match(failure.prediction, /^Prediction verifier: PASS/);
  assert.equal(failure.reads.filter((row) => row[4] === 'FAILURE').length, 2);
  assert.equal(named('lossless translation').gate, 'Compatibility gate: PASS');
  assert.match(named('lossless translation').metrics, /translated 2/);
  assert.equal(named('versioned namespaces').gate, 'Compatibility gate: PASS');
  assert.match(named('versioned namespaces').metrics, /translated 0/);
  assert.equal(named('malformed own-version').gate, 'Compatibility gate: FAIL');
  assert.ok(named('malformed own-version').reads.some((row) => /INVALID_PAYLOAD/.test(row[6])));
  assert.equal(named('wrong business value').gate, 'Compatibility gate: FAIL');
  assert.match(named('wrong business value').prediction, /^Prediction verifier: FAIL/);
  assert.equal(named('partial compatible').gate, 'Compatibility gate: UNKNOWN');
  assert.equal(named('known failure').gate, 'Compatibility gate: FAIL');
  assert.equal(named('absent observations').gate, 'Compatibility gate: UNKNOWN');
  assert.equal(named('history cap').history.length, 6);
  assert.match(named('history cap').alert, /History full/);
  for (const entry of browser.observations.filter((item) => item.name.startsWith('exact keyboard reset'))) {
    assert.equal(entry.activeElement, 'prepare');
    assert.deepEqual(entry.history, [['No completed attempts.']]);
    assert.equal(entry.gate, 'Compatibility gate: not evaluated');
    assert.equal(entry.prediction, 'Prediction not checked.');
    assert.equal(entry.alert, '');
    assert.deepEqual(entry.reads, []);
  }
  assert.equal(browser.keyboardFocusStyle.width, '3px');
  assert.equal(browser.smallViewport.width, 320);
  assert.equal(browser.smallViewport.noPageHorizontalOverflow, true);
  assert.equal(browser.cleanup.sessionCloseAwaited, true);
  assert.equal(browser.cleanup.serversStarted, 0);
  assert.equal(browser.cleanup.foregroundLeaseUsed, false);
});

test('actual CSP enforcement and exact published offline tooling stay distinct from native/cache/lifecycle certification', () => {
  const browser = json(evidence('browser.json'));
  const tooling = json(evidence('tooling.json'));
  const helper = path.join(repo, 'testing', 'browser', 'isolated.cjs');
  const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  assert.equal(sha(fs.readFileSync(helper)), helperHash);
  assert.equal(browser.helper.sha256, helperHash);
  assert.equal(browser.helper.publication, '53c0c0d');
  assert.equal(browser.runtime, 'v22.23.4');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.browserSignatureStatus, 'Valid');
  assert.match(tooling.browserSigner, /Microsoft Corporation/);
  assert.equal(tooling.helperSha256, helperHash);
  for (const field of ['downloads', 'packagesInstalled', 'unsafeFlags', 'foregroundLease',
    'productionNode24Certified', 'unattendedLifecycleCertified']) assert.equal(tooling[field], false);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.deepEqual(browser.probeResponses, []);
  assert.ok(browser.consoleErrors.every((entry) => entry.stage === 'csp-probes'));
  assert.equal(browser.csp.inlineExecuted, false);
  assert.equal(browser.csp.fetchRejected, true);
  assert.ok(browser.csp.violations.some((entry) => entry.effectiveDirective === 'connect-src'));
  assert.ok(browser.csp.violations.some((entry) => entry.effectiveDirective.startsWith('script-src')));
  assert.ok(browser.csp.violations.every((entry) => entry.disposition === 'enforce'));
  const testSource = bytes(path.join('tests', 'browser.test.cjs')).toString('utf8');
  assert.match(testSource, /if \(session\) await session\.close\(\)/);
  assert.match(testSource, /if \(capture\)/);
  assert.doesNotMatch(testSource, /openIsolatedLoopback|chromium\.launch|browser_navigate|bypassCSP:\s*true/);
});

test('finite canonical content inventory, Git filters, syntax and initial green raw streams are qualified without rewriting proof', () => {
  const inventory = json(evidence('content-index.json'));
  assert.equal(inventory.cardId, 'A-S055');
  assert.equal(inventory.mode, 'canonical Git text LF; raw binary snapshots and gzip');
  assert.ok(inventory.files.length >= 25);
  assert.equal(new Set(inventory.files.map((entry) => entry.path)).size, inventory.files.length);
  for (const entry of inventory.files) {
    assert.equal(path.isAbsolute(entry.path), false);
    assert.equal(entry.path.split(/[\\/]/).includes('..'), false);
    const rawBytes = bytes(entry.path);
    const canonical = entry.mode === 'binary' ? rawBytes : lf(rawBytes);
    assert.equal(sha(canonical), entry.sha256, entry.path);
    assert.equal(canonical.length, entry.bytes, entry.path);
    const relative = path.join('learning', 'S055', entry.path);
    const filtered = git(['-C', path.dirname(relative), 'hash-object', '--', path.basename(relative)]).toString().trim();
    assert.equal(filtered, entry.gitBlobSha1, `${entry.path}: actual clean filter`);
  }
  assert.ok(inventory.exclusions.includes('evidence\\content-index.json'));
  const syntax = json(evidence('verification', 'syntax-002.json'));
  assert.equal(syntax.exitCode, 0);
  assert.equal(syntax.checks.length, 7);
  for (const check of syntax.checks) {
    assert.equal(check.exitCode, 0);
    assert.equal(sha(lf(bytes(check.file))), check.sourceSha256);
  }
  const green = json(evidence('verification', 'initial-green-001.json'));
  assert.equal(green.exitCode, 0);
  assert.equal(green.tests, 27);
  assert.equal(green.passed, 27);
  assert.equal(green.failed, 0);
  assert.equal(green.deliberateBrowserCapture, true);
  assert.equal(green.spawnError, null);
  const stdout = raw(evidence('verification', 'initial-green-001.stdout.raw.gz'));
  const stderr = raw(evidence('verification', 'initial-green-001.stderr.raw.gz'));
  assert.equal(sha(stdout), green.rawStdoutSha256);
  assert.equal(sha(stderr), green.rawStderrSha256);
  const failure = json(evidence('integrity-filter-failure', 'run.json'));
  assert.equal(failure.exitCode, 1);
  assert.match(failure.stage, /not behavioral RED/);
  assert.equal(sha(raw(evidence('integrity-filter-failure', 'stdout.raw.gz'))), failure.rawStdoutSha256);
  assert.equal(sha(raw(evidence('integrity-filter-failure', 'stderr.raw.gz'))), failure.rawStderrSha256);
  for (const entry of failure.snapshots) {
    assert.equal(sha(bytes(evidence('integrity-filter-failure', entry.snapshot))), entry.sha256);
  }
  const qualification = json(evidence('integrity-filter-failure', 'path-qualification.json'));
  const rawExpected = failure.probes.find((probe) => probe.name === 'no-filters raw bytes').stdout;
  assert.equal(qualification.probes.find((probe) => probe.name === 'clean blob at actual directory and leaf').stdout, rawExpected);
});
