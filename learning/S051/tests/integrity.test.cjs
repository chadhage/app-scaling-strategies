'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file).toString('utf8'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const normalized = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const proof = (...parts) => path.join('evidence', ...parts);
const raw = (file) => zlib.gunzipSync(bytes(file));

test('exact source/backlog/card/portable contract and default packet rule preceded the bounded design', () => {
  const source = json(proof('source-contract.json'));
  assert.equal(source.cardId, 'A-S051');
  assert.equal(source.parentId, 'D-S051');
  assert.equal(source.kano, 'S');
  assert.equal(source.kanoUnit, 'A-S051');
  assert.equal(source.packet, 'SC-S051');
  assert.equal(source.owner, 'worker-A-S051');
  assert.equal(source.ownedScope, 'learning\\S051\\**');
  assert.match(source.baselineCommit, /^[a-f0-9]{40}$/);
  assert.equal(source.source.row,
    '| S051 | **Old frontend to new API:** Preserve contracts used by already-open browser pages. |');
  assert.equal(source.backlog.row,
    '| D-S051 | P0 | Add **Old frontend to new API** with compatible and breaking response fixtures. | Old client journeys still function under the compatible contract; breaking changes fail the gate visibly. | none |');
  assert.equal(source.card.row,
    '| A-S051 | D-S051 | S | Send old-frontend requests to new APIs; identify a breaking response shape. | SOURCE |');
  assert.match(source.card.nativeSibling, /CORE, DATA, HOST/);
  assert.match(source.card.atomicContract, /### Portable A-card lesson contract/);
  assert.match(source.card.atomicContract, /genuine behavioral TDD red/);
  assert.match(source.card.packetRule, /every other A\/B card belongs to SC-Snnn/);
  assert.match(source.refinement, /No additional unit, parent or native work is admitted/);
});

test('BDD, loadable stub, fixtures and original tests retain their original non-auto-discovered snapshot bytes', () => {
  const red = json(proof('red', 'run.json'));
  assert.equal(red.snapshots.length, 4);
  for (const entry of red.snapshots) {
    assert.ok(entry.snapshot.endsWith('.snapshot'));
    assert.doesNotMatch(entry.snapshot, /\.(?:cjs|js|mjs)$/);
    const snapshot = bytes(proof('red', entry.snapshot));
    assert.equal(sha(snapshot), entry.sha256, entry.snapshot);
    if (entry.source !== 'model.js') {
      assert.equal(sha(normalized(bytes(entry.source))), sha(normalized(snapshot)), entry.source);
    }
  }
  const stub = bytes(proof('red', 'model.js.snapshot')).toString('utf8');
  assert.match(stub, /function createLesson/);
  assert.match(stub, /UNIMPLEMENTED/);
  assert.doesNotMatch(stub, /function configuration|function plainData/);
  assert.match(bytes('.gitattributes').toString('utf8'), /\*\.snapshot binary/);
  const manifest = json('manifest.json');
  assert.equal(manifest.iac.redCompletedAtUtc, red.completedAtUtc);
  assert.equal(manifest.iac.status, 'N/A');
  assert.match(manifest.iac.decisionStage, /before behavior implementation/);
});

test('genuine behavioral RED is assertion failure, not missing code/tools, with verbatim raw stream provenance', () => {
  const red = json(proof('red', 'run.json'));
  const stdout = raw(proof('red', 'stdout.raw.gz'));
  const stderr = raw(proof('red', 'stderr.raw.gz'));
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 21);
  assert.equal(red.passed, 1);
  assert.equal(red.failed, 20);
  assert.equal(red.assertionFailures, 20);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  assert.equal(red.signal, null);
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  assert.equal((stdout.toString('utf8').match(/code: 'ERR_ASSERTION'/g) || []).length, 20);
  assert.doesNotMatch(stdout.toString('utf8'), /Cannot find module|MODULE_NOT_FOUND|ENOENT|TypeError: Cannot/);
  const readable = (stdout.toString('utf8') + stderr.toString('utf8')).replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n');
  assert.equal(normalized(bytes(proof('red', 'red.tap'))).toString('utf8'), readable);
});

test('deliberately captured real DOM evidence binds current sources, keyboard/errors, measured impacts, history and reset', () => {
  const browser = json(proof('browser.json'));
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.cardId, 'A-S051');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.equal(browser.observations.length, 11);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.ok(browser.consoleErrors.every((entry) => entry.stage === 'csp-probes'));
  for (const [file, hash] of Object.entries(browser.testedSourceHashes)) {
    assert.equal(sha(normalized(bytes(file))), hash, file);
  }
  const named = (part) => {
    const observation = browser.observations.find((entry) => entry.name.includes(part));
    assert.ok(observation, part);
    return observation;
  };
  assert.match(named('state guard').alert, /requires opened/);
  assert.match(named('input guard').alert, /^Observation:/);
  const compatible = named('compatible additive');
  assert.equal(compatible.gate, 'Compatibility gate: PASS');
  assert.equal(compatible.impact, 'Synthetic user impact: UNINTERRUPTED');
  assert.equal(compatible.preview, 'Synthetic learner — 4 unread');
  assert.ok(compatible.journeys.every((row) => row[1] === '200' && row[2] === 'PASS'));
  const breaking = named('breaking renamed');
  assert.equal(breaking.gate, 'Compatibility gate: FAIL');
  assert.equal(breaking.impact, 'Synthetic user impact: INTERRUPTED');
  assert.match(breaking.prediction, /^Prediction verifier: PASS/);
  assert.ok(breaking.journeys.every((row) => row[1] === '200' && row[2] === 'FAIL' && /displayName/.test(row[4])));
  assert.equal(named('partial compatible').gate, 'Compatibility gate: UNKNOWN');
  assert.equal(named('known breaking result').gate, 'Compatibility gate: FAIL');
  assert.match(named('known breaking result').prediction, /^Prediction verifier: FAIL/);
  assert.equal(named('absent observations').gate, 'Compatibility gate: UNKNOWN');
  assert.equal(named('history cap').history.length, 8);
  assert.match(named('history cap').alert, /History full/);
  for (const entry of browser.observations.filter((row) => row.name.startsWith('exact keyboard reset'))) {
    assert.equal(entry.activeElement, 'open-old-page');
    assert.deepEqual(entry.history, [['No completed attempts.']]);
    assert.match(entry.gate, /^Not evaluated/);
    assert.equal(entry.prediction, 'Prediction not checked.');
    assert.equal(entry.alert, '');
  }
  assert.equal(browser.keyboardFocusStyle.width, '3px');
  assert.equal(browser.smallViewport.width, 320);
  assert.equal(browser.smallViewport.noPageHorizontalOverflow, true);
  assert.equal(browser.cleanup.sessionCloseAwaited, true);
  assert.equal(browser.cleanup.serversStarted, 0);
  assert.equal(browser.cleanup.foregroundLeaseUsed, false);
});

test('enforced CSP and exact published offline tooling do not imply native or lifecycle certification', () => {
  const browser = json(proof('browser.json'));
  const tooling = json(proof('tooling.json'));
  const manifest = json('manifest.json');
  assert.equal(browser.csp.inlineExecuted, false);
  assert.equal(browser.csp.fetchRejected, true);
  assert.ok(browser.csp.violations.some((entry) => entry.effectiveDirective === 'connect-src'));
  assert.ok(browser.csp.violations.some((entry) => entry.effectiveDirective.startsWith('script-src')));
  assert.ok(browser.csp.violations.every((entry) => entry.disposition === 'enforce'));
  assert.deepEqual(browser.probeResponses, []);
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.playwright, '1.56.1');
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /CN=Microsoft Corporation/);
  assert.match(tooling.version, /^156\./);
  assert.equal(browser.browserVersion, tooling.version);
  assert.equal(browser.playwrightVersion, tooling.playwright);
  assert.equal(browser.helper.sha256, tooling.helperSha256);
  assert.equal(browser.helper.sha256, manifest.testRuntime.browserHelperSha256);
  assert.equal(browser.helper.publication, '53c0c0d');
  assert.equal(manifest.testRuntime.productionNode24Approval, false);
  assert.match(tooling.limitations, /no Node24, native Azure, source-parent or lifecycle-runner certification/);
  const helper = path.resolve(root, '..', '..', 'testing', 'browser', 'isolated.cjs');
  assert.equal(sha(fs.readFileSync(helper)), browser.helper.sha256);
  const browserTest = bytes(path.join('tests', 'browser.test.cjs')).toString('utf8');
  assert.match(browserTest, /await openIsolatedLesson\('learning\\\\S051\\\\index\.html'\)/);
  assert.match(browserTest, /if \(session\) await session\.close\(\)/);
  assert.match(browserTest, /if \(capture\) fs\.writeFileSync/);
});

test('all deliberate browser capture runs retain raw output and the final passing assertion source', () => {
  const runs = fs.readdirSync(path.join(root, 'evidence')).filter((name) => /^browser-run-\d{3}\.json$/.test(name)).sort();
  assert.ok(runs.length > 0);
  for (const name of runs) {
    const record = json(proof(name));
    const prefix = name.slice(0, -5);
    assert.equal(record.spawnError, null);
    assert.equal(record.signal, null);
    assert.equal(sha(raw(proof(`${prefix}.stdout.raw.gz`))), record.rawStdoutSha256);
    assert.equal(sha(raw(proof(`${prefix}.stderr.raw.gz`))), record.rawStderrSha256);
    assert.equal(sha(bytes(proof(record.testSnapshot))), record.testSourceSha256);
    assert.equal(sha(bytes(proof(record.observations))), record.observationSha256);
  }
  const final = json(proof(runs.at(-1)));
  assert.equal(final.exitCode, 0);
  assert.equal(final.tests, 1);
  assert.equal(final.passed, 1);
  assert.equal(final.failed, 0);
  assert.equal(final.captureEnvironment, 'CAPTURE_BROWSER_EVIDENCE=1');
  assert.equal(sha(normalized(bytes(proof(final.testSnapshot)))),
    sha(normalized(bytes(path.join('tests', 'browser.test.cjs')))));
});

test('seven final syntax checks bind current scripts; the separately retained initial syntax error is not TDD RED', () => {
  const syntax = json(proof('syntax.json'));
  assert.equal(syntax.results.length, 7);
  for (const result of syntax.results) {
    assert.equal(result.exitCode, 0, result.file);
    assert.equal(result.signal, null);
    assert.equal(result.spawnError, null);
    assert.equal(sha(normalized(bytes(result.file))), result.sourceSha256);
    assert.equal(result.rawStdoutSha256, sha(Buffer.alloc(0)));
    assert.equal(result.rawStderrSha256, sha(Buffer.alloc(0)));
  }
  assert.equal(sha(raw(proof('syntax.stdout.raw.gz'))), syntax.rawStdoutSha256);
  assert.equal(sha(raw(proof('syntax.stderr.raw.gz'))), syntax.rawStderrSha256);
  const initial = json(proof('initial-syntax', 'run.json'));
  assert.equal(initial.exitCode, 1);
  assert.match(initial.classification, /not behavioral TDD RED/);
  assert.equal(sha(bytes(proof('initial-syntax', 'app.js.snapshot'))), initial.sourceSha256);
  assert.equal(sha(raw(proof('initial-syntax', 'stdout.raw.gz'))), initial.rawStdoutSha256);
  const stderr = raw(proof('initial-syntax', 'stderr.raw.gz'));
  assert.equal(sha(stderr), initial.rawStderrSha256);
  assert.match(stderr.toString('utf8'), /SyntaxError: Unexpected token/);
});

test('finite content inventory covers the owned bundle without silently updating evidence or self-hashing logs', () => {
  const inventory = json(proof('content-hashes.json'));
  assert.equal(inventory.algorithm, 'SHA-256');
  assert.deepEqual(inventory.exclusions, [
    'evidence\\content-hashes.json', 'evidence\\green\\**', 'evidence\\read-only.json',
  ]);
  const excluded = (file) => file === proof('content-hashes.json')
    || file.startsWith(proof('green') + path.sep) || file === proof('read-only.json');
  const walk = (directory = root) => fs.readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? walk(path.join(directory, entry.name))
      : [path.relative(root, path.join(directory, entry.name))]);
  const actual = walk().filter((file) => !excluded(file)).sort();
  assert.deepEqual(inventory.entries.map((entry) => entry.path).sort(), actual);
  for (const entry of inventory.entries) {
    const data = bytes(entry.path);
    const binary = /\.(?:snapshot|gz)$/.test(entry.path);
    assert.equal(entry.mode, binary ? 'bytes' : 'LF-normalized UTF-8');
    assert.equal(sha(binary ? data : normalized(data)), entry.sha256, entry.path);
  }
  const summary = json('evidence.json');
  assert.equal(summary.cardId, 'A-S051');
  assert.equal(summary.review.acceptedAtUtc, null);
  assert.equal(summary.sourceParentCompleted, false);
  assert.equal(summary.productionNode24Validated, false);
  assert.equal(summary.kanoUnits, 1);
});
