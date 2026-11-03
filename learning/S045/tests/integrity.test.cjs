'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const proofRoot = path.join(root, 'evidence');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file).toString('utf8'));
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const normalized = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
const proof = (...parts) => path.join('evidence', ...parts);

test('preserved source rows and default packet rule bind the exact mission, not a title guess', () => {
  const source = json(proof('source-contract.json'));
  assert.equal(source.cardId, 'A-S045');
  assert.equal(source.kanoUnit, 'A-S045');
  assert.equal(source.packet, 'SC-S045');
  assert.equal(source.owner, 'worker-A-S045');
  assert.equal(source.ownedScope, 'learning\\S045\\**');
  assert.match(source.baselineCommit, /^[a-f0-9]{40}$/);
  assert.equal(source.source.row,
    '| S045 | **WebSocket migration:** Preserve state and message sequencing; reconnection is seamless only if it meets agreed UX criteria. |');
  assert.equal(source.backlog.row,
    '| D-S045 | P1 | Add versioned WebSocket fixtures with sequence numbers, reconnect, and resume cursors. | Acknowledged state/messages survive; missed/duplicate events and UX-budget breaches count as interruptions. | none |');
  assert.equal(source.card.row,
    '| A-S045 | D-S045 | S | Reconnect a sequenced WebSocket; detect missing/duplicate acknowledged messages. | SOURCE |');
  assert.match(source.card.nativeSibling, /CORE, DATA, CONTAINER, C026/);
  assert.match(source.card.atomicContract, /### Portable A-card lesson contract/);
  assert.match(source.card.atomicContract, /genuine behavioral TDD red/);
  assert.match(source.card.packetRule, /every other A\/B card belongs to SC-Snnn/);
});

test('RED snapshots retain exact original bytes and cannot auto-discover as executable tests', () => {
  const red = json(proof('red', 'run.json'));
  assert.equal(red.snapshots.length, 4);
  for (const entry of red.snapshots) {
    assert.ok(entry.snapshot.endsWith('.snapshot'));
    assert.ok(!/\.(?:js|cjs|mjs)$/.test(entry.snapshot));
    assert.equal(sha(bytes(proof(entry.snapshot))), entry.sha256, entry.snapshot);
  }
  const stub = bytes(proof('red', 'model.js.snapshot')).toString('utf8');
  assert.match(stub, /function createLesson/);
  assert.match(stub, /UNIMPLEMENTED/);
  assert.doesNotMatch(stub, /function evaluate/);
  assert.match(bytes('.gitattributes').toString('utf8'), /\*\.snapshot binary/);
});

test('raw RED provenance proves assertion failures rather than absent implementation or tools', () => {
  const red = json(proof('red', 'run.json'));
  const stdout = zlib.gunzipSync(bytes(proof('red', 'stdout.raw.gz')));
  const stderr = zlib.gunzipSync(bytes(proof('red', 'stderr.raw.gz')));
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 24);
  assert.equal(red.passed, 1);
  assert.equal(red.failed, 23);
  assert.equal(red.assertionFailures, 23);
  assert.equal(red.missingCodeOrTools, false);
  assert.equal(red.spawnError, null);
  assert.equal(red.signal, null);
  assert.equal(sha(stdout), red.rawStdoutSha256);
  assert.equal(sha(stderr), red.rawStderrSha256);
  assert.equal((stdout.toString('utf8').match(/code: 'ERR_ASSERTION'/g) || []).length, 23);
  assert.doesNotMatch(stdout.toString('utf8'), /Cannot find module|MODULE_NOT_FOUND|ENOENT|TypeError: Cannot/);
  const readable = (stdout.toString('utf8').replace(/[ \t]+$/gm, '')
    + stderr.toString('utf8').replace(/[ \t]+$/gm, '')).replace(/\r\n/g, '\n');
  assert.equal(bytes(proof('red', 'red.tap')).toString('utf8').replace(/\r\n/g, '\n'), readable);
});

test('successful browser capture binds current runtime bytes and actual DOM, keyboard and negative results', () => {
  const browser = json(proof('browser.json'));
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.cardId, 'A-S045');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.equal(browser.observations.length, 11);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.ok(browser.consoleErrors.every((entry) => entry.stage === 'csp-probes'));
  for (const [file, hash] of Object.entries(browser.testedSourceHashes)) {
    assert.equal(sha(normalized(bytes(file))), hash, file);
  }
  const named = (part) => browser.observations.find((entry) => entry.name.includes(part));
  assert.match(named('safe ordered').impact, /UNINTERRUPTED/);
  assert.match(named('safe ordered').prediction, /Prediction verifier: PASS/);
  assert.match(named('blind acknowledged').impact, /INTERRUPTED/);
  assert.match(named('blind acknowledged').prediction, /Prediction verifier: PASS/);
  assert.match(named('missing cursor').impact, /UNKNOWN/);
  assert.match(named('known budget failure').impact, /INTERRUPTED/);
  assert.equal(named('version mismatch').history.length, 8);
  assert.equal(named('exact keyboard reset').activeElement, 'start-session');
  assert.deepEqual(named('exact keyboard reset').history, [['No completed attempts.']]);
  assert.match(named('exact keyboard reset').impact, /^Not evaluated/);
  assert.equal(browser.smallViewport.noPageHorizontalOverflow, true);
  assert.equal(browser.csp.inlineExecuted, false);
  assert.equal(browser.csp.fetchRejected, true);
  assert.ok(browser.csp.violations.some((entry) => entry.effectiveDirective === 'connect-src'));
  assert.ok(browser.csp.violations.some((entry) => entry.effectiveDirective.startsWith('script-src')));
  assert.ok(browser.csp.violations.every((entry) => entry.disposition === 'enforce'));
  assert.equal(browser.cleanup.sessionCloseAwaited, true);
  assert.equal(browser.cleanup.serversStarted, 0);
  assert.equal(browser.cleanup.foregroundLeaseUsed, false);
});

test('both failed and corrected browser runs retain verbatim output and honest qualification', () => {
  for (const [number, expectedExit] of [['001', 1], ['002', 0]]) {
    const meta = json(proof(`browser-run-${number}.json`));
    const stdout = zlib.gunzipSync(bytes(proof(`browser-run-${number}.stdout.raw.gz`)));
    const stderr = zlib.gunzipSync(bytes(proof(`browser-run-${number}.stderr.raw.gz`)));
    assert.equal(meta.exitCode, expectedExit);
    assert.equal(meta.spawnError, null);
    assert.equal(meta.signal, null);
    assert.equal(sha(stdout), meta.rawStdoutSha256);
    assert.equal(sha(stderr), meta.rawStderrSha256);
  }
  assert.equal(json(proof('browser-run-001.observations.json')).outcome, 'FAIL');
  const corrected = json(proof('browser-run-002.json'));
  const source = bytes(proof(corrected.testSnapshot));
  assert.equal(sha(source), corrected.testSourceSha256);
  assert.equal(sha(normalized(source)), sha(normalized(bytes(path.join('tests', 'browser.test.cjs')))));
  assert.match(corrected.priorRun, /no runtime behavior change/);
});

test('only the existing explicitly qualified Node22, offline PW1.56.1 and signed Edge156 tooling is claimed', () => {
  const tooling = json(proof('tooling.json'));
  const browser = json(proof('browser.json'));
  const manifest = json('manifest.json');
  assert.equal(tooling.node, 'v22.23.4');
  assert.equal(tooling.signatureStatus, 'Valid');
  assert.match(tooling.signer, /CN=Microsoft Corporation/);
  assert.match(tooling.version, /^156\./);
  assert.equal(browser.browserVersion, tooling.version);
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.equal(browser.helper.sha256, manifest.testRuntime.browserHelperSha256);
  assert.equal(tooling.helperSha256, browser.helper.sha256);
  assert.equal(browser.helper.publication, '53c0c0d');
  assert.equal(manifest.testRuntime.productionNode24Approval, false);
  assert.match(tooling.limitations, /no Node24, native Azure, source-parent or lifecycle-runner certification/);
});

test('declared content inventory is complete and integrity verification is read-only', () => {
  const inventory = json(proof('content-hashes.json'));
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.algorithm, 'sha256');
  assert.deepEqual(inventory.exclusions, [
    'evidence\\content-hashes.json', 'evidence\\green\\**', 'evidence\\syntax.json',
  ]);
  const excluded = (file) => file === proof('content-hashes.json')
    || file.startsWith(proof('green') + path.sep) || file === proof('syntax.json');
  function walk(directory) {
    return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
      const file = path.join(directory, entry.name);
      return entry.isDirectory() ? walk(file) : [path.relative(root, file)];
    });
  }
  assert.deepEqual(Object.keys(inventory.files).sort(), walk(root).filter((file) => !excluded(file)).sort());
  for (const [file, hash] of Object.entries(inventory.files)) {
    assert.equal(path.isAbsolute(file), false);
    assert.ok(!file.split(path.sep).includes('..'));
    const data = bytes(file);
    const canonical = /\.(?:gz|snapshot)$/.test(file) ? data : normalized(data);
    assert.equal(sha(canonical), hash, file);
  }
  for (const file of ['model.js', 'app.js', 'index.html', 'websocket.feature', 'manifest.json', 'README.md']) {
    assert.ok(Object.hasOwn(inventory.files, file), file);
  }
});

test('lesson evidence keeps engineering, synthetic impact, publication and parent acceptance separate', () => {
  const evidence = json('evidence.json');
  assert.equal(evidence.cardId, 'A-S045');
  assert.equal(evidence.parentId, 'D-S045');
  assert.equal(evidence.kanoUnit, 'A-S045');
  assert.equal(evidence.packet, 'SC-S045');
  assert.equal(evidence.mode, 'synthetic');
  assert.equal(evidence.acceptedAtUtc, null);
  assert.equal(evidence.reviewer.workerSelfAccepted, false);
  assert.equal(evidence.configuration.productionRuntimeApproval, false);
  assert.equal(evidence.configuration.networkOrManagementCalls, false);
  assert.equal(evidence.configuration.credentials, false);
  assert.equal(evidence.userImpactResult.actualWebSocketContinuity, 'unknown');
  assert.equal(evidence.userImpactResult.actualAzureHandoff, 'unknown');
  assert.equal(evidence.userImpactResult.nativeSourceParentAccepted, false);
  assert.equal(evidence.cleanupResult.cloudResourcesCreated, 0);
  assert.equal(evidence.cleanupResult.ownedBrowserCloseAwaited, true);
  assert.equal(evidence.iac.status, 'N/A');
  for (const file of [
    proof('source-contract.json'), proof('red', 'run.json'), proof('browser.json'), proof('tooling.json'),
  ]) assert.ok(fs.existsSync(path.join(root, file)), file);
});
