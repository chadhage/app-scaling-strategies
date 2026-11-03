'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(read(file).toString('utf8'));
const proof = (...parts) => path.join('evidence', ...parts);
const sha = (data) => crypto.createHash('sha256').update(data).digest('hex');
const normalized = (data) => Buffer.from(data.toString('utf8').replace(/\r\n/g, '\n'));
function rawReceipt(name) {
  const receipt = json(proof(`${name}.json`));
  const stdout = zlib.gunzipSync(read(proof(`${name}.stdout.raw.gz`)));
  const stderr = zlib.gunzipSync(read(proof(`${name}.stderr.raw.gz`)));
  assert.equal(sha(stdout), receipt.rawStdoutSha256);
  assert.equal(sha(stderr), receipt.rawStderrSha256);
  assert.equal(receipt.signal, null);
  assert.equal(receipt.spawnError, null);
  return { receipt, stdout, stderr };
}

test('exact source, parent, portable card and packet were read before behavior design', () => {
  const source = json(proof('source-contract.json'));
  assert.equal(source.cardId, 'A-S048');
  assert.equal(source.parentId, 'D-S048');
  assert.equal(source.kano, 'S');
  assert.equal(source.kanoUnit, 'A-S048');
  assert.equal(source.packet, 'SC-S048');
  assert.equal(source.owner, 'worker-A-S048');
  assert.equal(source.ownedScope, 'learning\\S048\\**');
  assert.equal(source.readBeforeBehaviorDesign, true);
  assert.match(source.baselineCommit, /^[a-f0-9]{40}$/);
  assert.equal(source.source.row, '| S048 | **Batch job retirement:** Finish or checkpoint work before retiring its host. |');
  assert.equal(source.backlog.row, '| D-S048 | P1 | Add checkpointed batch jobs and **Retire active worker**. | Durable checkpoints permit correct bounded continuation; jobs are neither lost nor falsely marked complete. | none |');
  assert.equal(source.card.row, '| A-S048 | D-S048 | S | Retire a checkpointed worker; distinguish resumable work from falsely completed jobs. | SOURCE |');
  assert.match(source.card.nativeSibling, /correct checkpointed continuation and effect totals/);
  assert.match(source.card.atomicContract, /### Portable A-card lesson contract/);
  assert.match(source.card.atomicContract, /genuine behavioral TDD red/);
  assert.match(source.card.packetRule, /every other A\/B card belongs to SC-Snnn/);
});

test('original BDD, loadable stub and tests remain byte-exact non-executable RED snapshots', () => {
  const red = json(proof('red', 'run.json'));
  assert.equal(red.snapshots.length, 3);
  for (const entry of red.snapshots) {
    assert.ok(entry.snapshot.endsWith('.snapshot'));
    assert.ok(!/\.(?:js|cjs|mjs)$/.test(entry.snapshot));
    assert.equal(sha(read(proof(entry.snapshot))), entry.sha256);
  }
  const stub = read(proof('red', 'model.js.snapshot')).toString('utf8');
  assert.match(stub, /function createLesson/);
  assert.match(stub, /UNIMPLEMENTED/);
  assert.doesNotMatch(stub, /function verify|function retire/);
  assert.match(read('.gitattributes').toString('utf8'), /\*\.snapshot binary/);
  assert.equal(sha(normalized(read(proof('red', 'model.test.cjs.snapshot')))), sha(normalized(read(path.join('tests', 'model.test.cjs')))));
});

test('raw RED proves 23 real assertion failures, not missing code, imports or tooling', () => {
  const red = json(proof('red', 'run.json'));
  const stdout = zlib.gunzipSync(read(proof('red', 'stdout.raw.gz')));
  const stderr = zlib.gunzipSync(read(proof('red', 'stderr.raw.gz')));
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
  const text = stdout.toString('utf8');
  assert.equal((text.match(/code: 'ERR_ASSERTION'/g) || []).length, 23);
  assert.doesNotMatch(text, /Cannot find module|MODULE_NOT_FOUND|ENOENT|TypeError: Cannot/);
  assert.equal(read(proof('red', 'red.tap')).toString('utf8').replace(/\r\n/g, '\n'),
    (text + stderr.toString('utf8')).replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n'));
});

test('actual browser capture binds current source, distinct outcomes, errors, keyboard, history, reset and CSP', () => {
  const browser = json(proof('browser.json'));
  assert.equal(browser.cardId, 'A-S048');
  assert.equal(browser.outcome, 'PASS');
  assert.equal(browser.captureExplicitlyEnabled, true);
  assert.deepEqual(browser.pageErrors, []);
  assert.deepEqual(browser.exerciseNetworkRequests, []);
  assert.ok(browser.consoleErrors.every((entry) => entry.stage === 'csp-probes'));
  for (const [file, hash] of Object.entries(browser.testedSourceHashes)) assert.equal(sha(normalized(read(file))), hash, file);
  const observation = (part) => {
    const entry = browser.observations.find((item) => item.name.includes(part));
    assert.ok(entry, part);
    return entry;
  };
  assert.match(observation('strict input').alert, /Invalid configuration/);
  assert.match(observation('resumable, not complete').job, /resumable-not-complete/);
  assert.equal(observation('resumable, not complete').verdict, 'Not verified.');
  assert.match(observation('correct bounded').verdict, /PASSED.*completed-correctly/);
  assert.match(observation('duplicate effects').verdict, /FAILED.*interrupted/);
  assert.match(observation('false completion').prediction, /Prediction verifier: PASS/);
  assert.match(observation('checkpoint stays unknown').verdict, /UNKNOWN.*unverified/);
  assert.match(observation('known budget breach').verdict, /FAILED.*interrupted/);
  assert.equal(observation('ninth attempt blocked').history.length, 8);
  assert.equal(observation('exact keyboard reset').activeElement, 'start-job');
  assert.deepEqual(observation('exact keyboard reset').history, [['No completed attempts.']]);
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

test('actual browser run preserves verbatim output and a byte-bound test snapshot', () => {
  const { receipt, stdout, stderr } = rawReceipt('browser-run-001');
  assert.equal(receipt.exitCode, 0);
  assert.equal(receipt.tests, 8);
  assert.equal(receipt.passed, 8);
  assert.equal(receipt.failed, 0);
  assert.equal(receipt.captureBrowserEvidence, true);
  const snapshot = read(proof(receipt.browserTestSnapshot));
  assert.equal(sha(snapshot), receipt.browserTestSha256);
  assert.equal(sha(normalized(snapshot)), sha(normalized(read(path.join('tests', 'browser.test.cjs')))));
  assert.equal(sha(read(proof('browser-run-001.observations.json'))), sha(read(proof('browser.json'))));
  assert.equal(read(proof('browser-run-001.tap')).toString('utf8').replace(/\r\n/g, '\n'),
    (stdout.toString('utf8') + stderr.toString('utf8')).replace(/[ \t]+$/gm, '').replace(/\r\n/g, '\n'));
});

test('model green and all six syntax checks preserve genuine process receipts', () => {
  const { receipt, stdout } = rawReceipt(path.join('green', 'model-001'));
  assert.equal(receipt.exitCode, 0);
  assert.match(stdout.toString('utf8'), /# tests 24\r?\n/);
  assert.match(stdout.toString('utf8'), /# pass 24\r?\n/);
  assert.match(stdout.toString('utf8'), /# fail 0\r?\n/);
  const syntax = json(proof('syntax.json'));
  assert.equal(syntax.results.length, 6);
  assert.equal(sha(zlib.gunzipSync(read(proof('syntax.stdout.raw.gz')))), syntax.rawStdoutSha256);
  assert.equal(sha(zlib.gunzipSync(read(proof('syntax.stderr.raw.gz')))), syntax.rawStderrSha256);
  for (const entry of syntax.results) {
    assert.equal(entry.exitCode, 0, entry.file);
    assert.equal(entry.signal, null);
    assert.equal(entry.spawnError, null);
    assert.equal(sha(normalized(read(entry.file))), entry.sourceSha256);
  }
});

test('qualification uses only existing Node22, offline PW1.56.1 and signed Edge156, never the abandoned prototype', () => {
  const tooling = json(proof('tooling.json')), browser = json(proof('browser.json'));
  const manifest = json('manifest.json');
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
  const testSource = read(path.join('tests', 'browser.test.cjs')).toString('utf8');
  assert.match(testSource, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(testSource, /if \(capture\) fs\.writeFileSync/);
  assert.match(testSource, /await session\.close\(\)/);
});

test('finite committed content inventory is valid without updating any proof', () => {
  const hashes = json(proof('content-hashes.json'));
  assert.equal(hashes.cardId, 'A-S048');
  assert.ok(hashes.files.length >= 20);
  assert.equal(new Set(hashes.files.map((entry) => entry.file)).size, hashes.files.length);
  assert.ok(!hashes.files.some((entry) => entry.file === proof('content-hashes.json')));
  for (const entry of hashes.files) {
    assert.ok(!path.isAbsolute(entry.file));
    assert.ok(!entry.file.split(/[\\/]/).includes('..'));
    assert.match(entry.sha256, /^[a-f0-9]{64}$/);
    const data = read(entry.file);
    assert.equal(sha(entry.mode === 'text-lf' ? normalized(data) : data), entry.sha256, entry.file);
  }
});
