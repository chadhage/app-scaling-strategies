'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.join(__dirname, '..');
const hash = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const bytes = (file) => fs.readFileSync(path.join(root, file));
const json = (file) => JSON.parse(bytes(file).toString('utf8'));

function rawStreams(record) {
  const result = {};
  for (const stream of ['stdout', 'stderr']) {
    const raw = record.streams[stream];
    assert.equal(raw.encoding, 'base64');
    const decoded = Buffer.from(raw.data, 'base64');
    assert.equal(decoded.length, raw.bytes);
    assert.equal(hash(decoded), raw.sha256);
    result[stream] = decoded.toString('utf8');
  }
  assert.equal(record.error, null);
  assert.equal(record.signal, null);
  return result;
}

test('source pins cover every production asset and verification source without relying on mutable parent files', () => {
  const pins = json('evidence\\source-hashes.json');
  assert.equal(pins.cardId, 'A-S033');
  assert.deepEqual(Object.keys(pins.files).sort(), [
    '.gitattributes', 'README.md', 'affinity-removal.feature', 'affinity.js', 'app.js', 'index.html', 'manifest.json',
    'styles.css', 'tests\\affinity.test.cjs', 'tests\\browser.cjs', 'tests\\csp-probe.js', 'tests\\evidence.test.cjs',
    'tests\\replay-red.cjs', 'tests\\surface.test.cjs',
  ].sort());
  for (const [file, digest] of Object.entries(pins.files)) assert.equal(hash(bytes(file)), digest, file);
  assert.match(bytes('.gitattributes').toString('utf8'), /evidence\/\*\* -text/);
});

test('source provenance preserves exact S033/D-S033/card rows and the single SC-S033 packet', () => {
  const source = json('evidence\\source-contract.json');
  assert.equal(source.cardId, 'A-S033');
  assert.equal(source.parent, 'D-S033');
  assert.equal(source.packet, 'SC-S033');
  assert.equal(source.kano, 'S');
  assert.ok(source.sources.find((item) => item.path === 'README.md').exactRows.includes(
    '| S033 | **Worker-affinity removal:** Disable instance affinity only after eliminating or safely migrating instance-local state. |',
  ));
  assert.ok(source.sources.find((item) => item.path.includes('backlog')).exactRows.some((row) => row.includes('unsupported local-state removal fails explicitly')));
  assert.ok(source.sources.find((item) => item.path.includes('kanban')).exactRows.some((row) => row.includes('| A-S033 | D-S033 | S | Remove affinity before/after state externalization; identify the unsafe sequence. | SOURCE |')));
  assert.deepEqual(source.packetMembers.map((card) => card.id), ['A-S033', 'B-S033']);
  assert.equal(source.helper.sha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
});

test('original RED and explicit replay are genuine loaded-stub assertion failures with original bytes', () => {
  for (const file of ['evidence\\red.raw.json', 'evidence\\red-replay.raw.json']) {
    const record = json(file);
    assert.equal(record.exitCode, 1);
    const output = rawStreams(record);
    assert.match(output.stdout, /ERR_ASSERTION/);
    assert.match(output.stdout, /expected: 'success'/);
    assert.match(output.stdout, /actual: 'unknown'/);
    assert.doesNotMatch(output.stdout + output.stderr, /MODULE_NOT_FOUND|SyntaxError|ERR_MODULE_NOT_FOUND/);
    assert.match(output.stdout, /# tests 1/);
    assert.match(output.stdout, /# fail 1/);
    if (record.snapshots) {
      for (const snapshot of record.snapshots) {
        assert.equal(hash(bytes(snapshot.snapshotPath)), snapshot.sha256);
        assert.equal(bytes(snapshot.snapshotPath).length, snapshot.bytes);
      }
    }
    const readable = file.replace('.raw.json', '.txt');
    const normalized = (output.stdout + output.stderr).replace(/\r\n/g, '\n').split('\n').map((line) => line.trimEnd()).join('\n');
    assert.equal(bytes(readable).toString('utf8'), normalized);
  }
  const stub = require('../evidence/red/affinity.stub.js.txt');
  assert.equal(typeof stub.createLesson, 'function');
  assert.equal(stub.createLesson().step({ action: 'probe', observation: 'complete' }).verdict, 'unknown');
});

test('resource-free IaC N/A is recorded between assertion RED and focused implementation GREEN', () => {
  const red = json('evidence\\red.raw.json');
  const iac = json('evidence\\iac-na.json');
  const green = json('evidence\\core-green.raw.json');
  assert.equal(iac.status, 'N/A');
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.finishedAtUtc));
  assert.ok(Date.parse(green.startedAtUtc) >= Date.parse(iac.recordedAtUtc));
  for (const field of ['cloudCalls', 'iacGenerated', 'identity', 'deployment', 'spend', 'dependencyInstalls']) assert.equal(iac[field], false);
  assert.equal(green.exitCode, 0);
  const output = rawStreams(green);
  assert.match(output.stdout, /# fail 0/);
  assert.match(output.stdout, /# skipped 0/);
  assert.ok(Number(output.stdout.match(/# tests (\d+)/)[1]) >= 20);
});

test('syntax and pre-browser source-integrity checks exited successfully', () => {
  const syntax = json('evidence\\syntax.raw.json');
  assert.equal(syntax.exitCode, 0);
  assert.equal(syntax.runs.length, 8);
  for (const run of syntax.runs) {
    assert.equal(run.exitCode, 0);
    assert.equal(rawStreams(run).stderr, '');
    assert.ok(run.command.includes('--check'));
  }
  const integrity = json('evidence\\pre-browser-integrity.json');
  assert.equal(integrity.outcome, 'passed');
  assert.equal(integrity.ownedSourcesVerified, Object.keys(json('evidence\\source-hashes.json').files).length);
});

test('actual isolated browser evidence is tied to current source and awaited cleanup, not static checks', () => {
  const summary = json('evidence\\browser-summary.json');
  assert.equal(hash(bytes(summary.artifact)), summary.sha256);
  const browser = json(summary.artifact);
  assert.equal(browser.outcome, 'passed');
  assert.equal(browser.cleanup, 'closed-in-awaited-finally');
  assert.equal(browser.mode, 'actual-isolated-browser/local-synthetic-lesson');
  assert.equal(browser.captureRequested, true);
  assert.equal(browser.helper.api, 'openIsolatedLesson');
  assert.equal(browser.helper.lifecyclePrototype, false);
  assert.equal(browser.helperUnchanged, true);
  assert.equal(browser.playwright, '1.56.1');
  assert.match(browser.node, /^v22\./);
  assert.match(browser.browserVersion, /^156\./);
  assert.equal(browser.forcedClicks, false);
  assert.equal(browser.skippedAssertions, false);
  assert.equal(browser.productionNode24Certified, false);
  assert.equal(browser.nativeAzureCertified, false);
  assert.equal(browser.cases.length, 9);
  assert.ok(browser.cases.every((entry) => entry.outcome === 'passed' && entry.assertions > 0));
  assert.equal(browser.assertionsPassed, browser.cases.reduce((count, entry) => count + entry.assertions, 0) + 1);
  for (const key of ['Tab', 'Shift+Tab', 'ArrowDown', 'Home', 'End', 'Enter', 'Space']) assert.ok(browser.keyboardKeys.includes(key));
  for (const [file, digest] of Object.entries(browser.sourceHashes)) assert.equal(hash(bytes(file)), digest, file);
  assert.deepEqual(browser.normalOperation, { pageErrors: [], consoleErrors: [], externalRequests: [], cspViolations: [] });
  assert.deepEqual(browser.csp.attempts, {
    inlineExecuted: false, evaluationExecuted: false, evaluationBlocked: true, connectionRejected: true,
  });
  assert.equal(browser.csp.safetyRouteBlocks, 0);
  assert.match(browser.csp.executionContext, /external author script, not privileged/);
  assert.ok(browser.csp.violations.some((event) => event.directive === 'connect-src'));
  assert.ok(browser.csp.violations.some((event) => event.directive === 'form-action'));
  const tooling = json('evidence\\tooling.json');
  assert.equal(tooling.edgeSignatureStatus, 'Valid');
  assert.match(tooling.edgeSigner, /Microsoft Corporation/);
  assert.match(tooling.edgeVersion, /^156\./);
});
