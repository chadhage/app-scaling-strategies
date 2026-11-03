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
const git = (args, cwd = repo) => {
  const run = spawnSync('git', args, { cwd, encoding: null });
  assert.equal(run.status, 0, String(run.stderr));
  return run.stdout;
};
const row = (text, id) => text.split(/\r?\n/).find((line) => line.startsWith(`| ${id} |`));
const atomic = (text) => text.slice(text.indexOf('## Atomic card contract'),
  text.indexOf('## Concurrent pull and one-piece flow'));
const packet = (text) => text.split(/\r?\n/).find((line) => line.startsWith('Packet membership is fixed'));

test('exact source acceptance, A/B rows, atomic portable contract and default SC-S061 packet preserve one frozen unit', () => {
  const source = json(evidence('source-contract.json'));
  assert.equal(source.cardId, 'A-S061');
  assert.equal(source.parentId, 'D-S061');
  assert.equal(source.nativeSibling, 'B-S061');
  assert.equal(source.kano, 'S');
  assert.equal(source.kanoUnit, 'A-S061');
  assert.equal(source.packet, 'SC-S061');
  assert.equal(source.owner, 'worker-A-S061');
  assert.equal(source.ownedScope, 'learning\\S061\\**');
  assert.equal(source.entryGate, 'SOURCE');
  assert.equal(source.sourceReadBeforeBehaviorDesign, true);
  assert.match(source.baselineCommit, /^[a-f0-9]{40}$/);
  assert.equal(source.source.row,
    '| S061 | **Read-replica expansion:** Offload eligible reads while preserving required read-your-writes and freshness guarantees. |');
  assert.equal(source.backlog.row,
    '| D-S061 | P1 | Add **Expand read replicas** and read-your-writes/freshness controls. | Eligible reads use actual replicas; consistency-sensitive reads meet the contract; write scalability is not inferred from extra read replicas. | none |');
  assert.equal(source.card.row,
    '| A-S061 | D-S061 | S | Add a reader; preserve read-your-writes rather than assuming every replica is current. | SOURCE |');
  assert.equal(source.card.nativeSibling,
    '| B-S061 | D-S061 | S | Conduct one native reader expansion; verify actual read routing and freshness contract. | CORE, DATA, HOST, REPLICA |');
  assert.match(source.card.atomicAndPortableContract, /genuine behavioral TDD red/);
  assert.match(source.card.atomicAndPortableContract, /### Portable A-card lesson contract/);
  assert.match(source.card.packetRule, /every other A\/B card belongs to SC-Snnn/);
  assert.match(source.refinement, /No additional unit, parent or native work is admitted/);
  assert.match(source.sourceAcceptanceBoundary, /remains incomplete/);
});

test('raw CRLF source and canonical committed blobs retain exact bytes with acceptance-slice qualification', () => {
  const source = json(evidence('source-contract.json'));
  assert.equal(source.sourceFiles.length, 3);
  for (const entry of source.sourceFiles) {
    const snapshot = bytes(evidence(entry.snapshot));
    const committedSnapshot = bytes(evidence(entry.gitSnapshot));
    assert.equal(snapshot.length, entry.rawBytes);
    assert.equal(sha(snapshot), entry.rawSha256, entry.snapshot);
    assert.equal(entry.rawHasCRLF, true);
    assert.ok(snapshot.includes(Buffer.from('\r\n')));
    assert.equal(sha(lf(snapshot)), entry.rawLfSha256);
    const committed = git(['cat-file', 'blob', entry.gitBlob]);
    assert.deepEqual(committedSnapshot, committed);
    assert.equal(committed.length, entry.canonicalGitBytes);
    assert.equal(sha(committed), entry.canonicalGitSha256);
    assert.equal(lf(snapshot).equals(lf(committed)), entry.wholeFileCanonicalEquality);
    assert.equal(entry.exactAcceptanceSlicesMatch, true);
    const objectPath = `${source.baselineCommit}:${entry.path.replace(/\\/g, '/')}`;
    assert.equal(git(['rev-parse', objectPath]).toString().trim(), entry.gitBlob);
  }
  const [readme, backlog, kanban] = source.sourceFiles.map((entry) => bytes(evidence(entry.snapshot)).toString());
  const [gitReadme, gitBacklog, gitKanban] = source.sourceFiles.map((entry) => bytes(evidence(entry.gitSnapshot)).toString());
  assert.equal(row(readme, 'S061'), source.source.row);
  assert.equal(row(gitReadme, 'S061'), source.source.row);
  assert.equal(row(backlog, 'D-S061'), source.backlog.row);
  assert.equal(row(gitBacklog, 'D-S061'), source.backlog.row);
  for (const id of ['A-S061', 'B-S061']) assert.equal(row(kanban, id), row(gitKanban, id));
  assert.deepEqual(lf(Buffer.from(atomic(kanban))), lf(Buffer.from(atomic(gitKanban))));
  assert.equal(packet(kanban), packet(gitKanban));
  assert.equal(atomic(kanban), source.card.atomicAndPortableContract);
  assert.equal(packet(kanban), source.card.packetRule);
});

test('non-auto-discovered BDD, fixture, original loadable stub and tests bind the genuine RED snapshots', () => {
  const red = json(evidence('red', 'run.json'));
  assert.equal(red.snapshots.length, 4);
  for (const entry of red.snapshots) {
    assert.ok(entry.snapshot.endsWith('.snapshot'));
    assert.doesNotMatch(entry.snapshot, /\.(?:test\.cjs|js|mjs)$/);
    const snapshot = bytes(evidence('red', entry.snapshot));
    assert.equal(snapshot.length, entry.bytes);
    assert.equal(sha(snapshot), entry.sha256);
    if (entry.source !== 'model.js') assert.deepEqual(lf(bytes(entry.source)), lf(snapshot));
  }
  const stub = bytes(evidence('red', 'model.js.snapshot')).toString();
  assert.match(stub, /write: snapshot, addReader: snapshot, read: snapshot/);
  assert.doesNotMatch(stub, /STALE_READ|function configuration|function read\(/);
  assert.match(bytes('.gitattributes').toString(), /\*\.snapshot binary/);
  assert.match(bytes('.gitattributes').toString(), /\*\.gz binary/);
});

test('behavioral RED is 17 genuine assertion failures, not missing code, tooling or syntax', () => {
  const red = json(evidence('red', 'run.json'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 18);
  assert.equal(red.passed, 1);
  assert.equal(red.failed, 17);
  assert.equal(red.assertionFailures, 17);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  assert.equal(red.signal, null);
  const stdout = raw(evidence('red', 'run.stdout.raw.gz'));
  const stderr = raw(evidence('red', 'run.stderr.raw.gz'));
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  const text = stdout.toString() + stderr.toString();
  assert.equal((text.match(/code: 'ERR_ASSERTION'/g) || []).length, 17);
  assert.doesNotMatch(text, /MODULE_NOT_FOUND|Cannot find module|ENOENT|SyntaxError|ReferenceError|TypeError: Cannot/);
  assert.equal(lf(bytes(evidence('red', 'red.tap'))).toString(),
    text.replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n'));
});

test('IaC N/A follows genuine RED and precedes implementation verification', () => {
  const decision = json(evidence('iac-decision.json'));
  const red = json(evidence('red', 'run.json'));
  const green = json(evidence('verification', 'initial-green.json'));
  const source = json(evidence('source-contract.json'));
  assert.equal(decision.status, 'N/A');
  assert.equal(decision.afterRedCompletedAtUtc, red.completedAtUtc);
  assert.match(decision.stage, /before behavior implementation/);
  assert.match(decision.reason, /Resource-free offline synthetic read-replica lesson/);
  assert.ok(Date.parse(source.sourceCapturedAtUtc) <= Date.parse(red.startedAtUtc));
  assert.ok(Date.parse(red.completedAtUtc) < Date.parse(decision.decidedAtUtc));
  assert.ok(Date.parse(decision.decidedAtUtc) < Date.parse(green.startedAtUtc));
  assert.equal(json('manifest.json').iac.status, 'N/A');
});

test('deliberate current-source DOM proof preserves observed routing, failures, unknowns, keyboard, history and reset', () => {
  const browser = json(evidence('browser.json'));
  assert.equal(browser.cardId, 'A-S061');
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.ok(browser.observations.length >= 18);
  for (const [file, hash] of Object.entries(browser.testedSourceHashes)) assert.equal(sha(lf(bytes(file))), hash, file);
  const named = (part) => {
    const observation = browser.observations.find((entry) => entry.name.includes(part));
    assert.ok(observation, part);
    return observation;
  };
  assert.match(named('state guard').alert, /requires expanded/);
  assert.match(named('input guard').alert, /^Added reader:/);
  const failure = named('unchecked added');
  assert.equal(failure.gate, 'Read contract gate: FAIL');
  assert.equal(failure.impact, 'Synthetic read impact: INTERRUPTED');
  assert.equal(failure.reads[3][3], 'reader-2 / v10');
  assert.equal(failure.reads[3][4], 'FAIL / STALE_READ');
  assert.match(failure.prediction, /^Prediction verifier: PASS/);
  assert.match(named('session-primary preserves').metrics, /eligible offloaded 2/);
  const strict = named('strict browse');
  assert.equal(strict.gate, 'Read contract gate: FAIL');
  assert.match(strict.prediction, /^Prediction verifier: FAIL/);
  const fallback = named('verified watermark fallback');
  assert.equal(fallback.gate, 'Read contract gate: PASS');
  assert.match(fallback.versions, /reader-2 v10/);
  assert.match(fallback.metrics, /replica reads 2 · primary reads 2 · eligible offloaded 1/);
  assert.match(named('unknown added-reader').metrics, /correct 2 · failed 0 · unknown 2/);
  assert.equal(named('unknown watermark uses').gate, 'Read contract gate: PASS');
  const full = named('six-attempt');
  assert.equal(full.history.length, 6);
  assert.match(full.alert, /History full/);
  assert.match(full.history[0][2], /FAIL \/ INTERRUPTED/);
  assert.match(named('known stale read dominates').metrics, /correct 2 · failed 1 · unknown 1/);
  assert.match(named('absent observations').metrics, /observed 0 · correct 0 · failed 0 · unknown 4/);
  assert.ok(named('absent observations').reads.every((entry) => entry[4] === 'UNKNOWN / NO_OBSERVATION'));
  for (const part of ['reset from full', 'reset abandons written', 'reset abandons expanded']) {
    const reset = named(part);
    assert.equal(reset.phase, 'Phase: idle');
    assert.equal(reset.history.length, 0);
    assert.equal(reset.reads.length, 0);
    assert.equal(reset.activeElement, 'write');
    assert.equal(reset.alert, '');
    assert.equal(reset.gate, 'Read contract gate: not evaluated');
  }
  assert.equal(browser.keyboardFocusOutline.style, 'solid');
  assert.equal(browser.smallViewport.width, 320);
  assert.equal(browser.smallViewport.noPageHorizontalOverflow, true);
});

test('published isolated helper, existing signed offline tooling, enforced CSP and awaited cleanup remain qualified narrowly', () => {
  const browser = json(evidence('browser.json'));
  const tooling = json(evidence('tooling.json'));
  const helperHash = '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055';
  assert.equal(sha(fs.readFileSync(path.join(repo, 'testing', 'browser', 'isolated.cjs'))), helperHash);
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
    'productionNode24Certified', 'unattendedLifecycleCertified', 'nativeDatabaseProof']) assert.equal(tooling[field], false);
  assert.equal(browser.cleanup.sessionCloseAwaited, true);
  assert.equal(browser.cleanup.serversStarted, 0);
  assert.equal(browser.cleanup.foregroundLeaseUsed, false);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.deepEqual(browser.probeResponses, []);
  assert.ok(browser.consoleErrors.every((entry) => entry.stage === 'csp-probes'));
  assert.equal(browser.csp.inlineExecuted, false);
  assert.equal(browser.csp.fetchRejected, true);
  assert.ok(browser.csp.violations.some((entry) => entry.effectiveDirective === 'connect-src'));
  assert.ok(browser.csp.violations.some((entry) => entry.effectiveDirective.startsWith('script-src')));
  assert.ok(browser.csp.violations.every((entry) => entry.disposition === 'enforce'));
  const browserTest = bytes('tests\\browser.test.cjs').toString();
  assert.match(browserTest, /if \(session\) await session\.close\(\)/);
  assert.match(browserTest, /const capture = process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browserTest, /if \(capture\) \{/);
  assert.doesNotMatch(browserTest, /openIsolatedLoopback|chromium\.launch|bypassCSP:\s*true|--no-sandbox/);
});

test('finite canonical content inventory, actual Git clean filters, syntax and initial green raw streams bind the bundle', () => {
  const inventory = json(evidence('content-index.json'));
  assert.equal(inventory.cardId, 'A-S061');
  assert.equal(inventory.mode, 'canonical Git text LF; raw binary snapshots and gzip');
  assert.ok(inventory.files.length >= 28);
  assert.equal(new Set(inventory.files.map((entry) => entry.path)).size, inventory.files.length);
  for (const entry of inventory.files) {
    assert.equal(path.isAbsolute(entry.path), false);
    assert.equal(entry.path.split(/[\\/]/).includes('..'), false);
    const data = bytes(entry.path);
    const canonical = entry.mode === 'binary' ? data : lf(data);
    assert.equal(sha(canonical), entry.sha256, entry.path);
    assert.equal(canonical.length, entry.bytes, entry.path);
    const absolute = path.join(root, entry.path);
    const filtered = git(['hash-object', '--', path.basename(absolute)], path.dirname(absolute)).toString().trim();
    assert.equal(filtered, entry.gitBlobSha1, `${entry.path}: actual clean filter`);
  }
  assert.deepEqual(inventory.exclusions, ['evidence\\content-index.json', 'evidence\\verification\\**']);
  const syntax = json(evidence('verification', 'syntax.json'));
  assert.equal(syntax.exitCode, 0);
  assert.equal(syntax.checks.length, 8);
  for (const check of syntax.checks) {
    assert.equal(check.exitCode, 0);
    assert.equal(sha(lf(bytes(check.file))), check.sourceSha256);
  }
  const green = json(evidence('verification', 'initial-green.json'));
  assert.equal(green.exitCode, 0);
  assert.equal(green.tests, 24);
  assert.equal(green.passed, 24);
  assert.equal(green.failed, 0);
  assert.equal(green.deliberateBrowserCapture, true);
  assert.equal(green.spawnError, null);
  const stdout = raw(evidence('verification', 'initial-green.stdout.raw.gz'));
  const stderr = raw(evidence('verification', 'initial-green.stderr.raw.gz'));
  assert.equal(sha(stdout), green.rawStdoutSha256);
  assert.equal(sha(stderr), green.rawStderrSha256);
  assert.match(stdout.toString(), /# pass 24/);
  assert.equal(sha(lf(bytes('tests\\model.test.cjs'))),
    sha(lf(bytes(evidence('red', 'model.test.cjs.snapshot')))));
  const overview = json('evidence.json');
  assert.equal(overview.verifier, 'PASS');
  assert.equal(overview.acceptance.status, 'pending parent empirical acceptance');
  assert.equal(overview.native.sourceParentComplete, false);
});
