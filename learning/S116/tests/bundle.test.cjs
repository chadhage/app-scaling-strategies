'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const json = (name) => JSON.parse(read(name));
const sha = (value) => crypto.createHash('sha256').update(value).digest('hex');

test('manifest preserves exact source identity, objective, fixed inputs and honest native remainder', () => {
  const manifest = json('manifest.json');
  const model = require('../model.js');
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sourceId, 'S116');
  assert.equal(manifest.cardId, 'A-S116');
  assert.equal(manifest.parentId, 'D-S116');
  assert.equal(manifest.packet, 'SC-S116');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S116');
  assert.equal(manifest.owner, 'worker-A-S116');
  assert.equal(manifest.objective, 'Serve both regions; identify the real writer/consistency model instead of assuming multi-writer support.');
  assert.equal(manifest.mode, 'synthetic');
  assert.deepEqual(manifest.syntheticInputs.scenarioIds, model.scenarioIds);
  assert.deepEqual(manifest.syntheticInputs.actionIds, model.actionIds);
  assert.equal(manifest.syntheticInputs.supportedWriter, model.contract.writer);
  assert.equal(manifest.syntheticInputs.maxObservations, model.contract.maxObservations);
  assert.equal(manifest.acceptance.acceptedAtUtc, null);
  assert.match(manifest.acceptance.nativeSibling, /B-S116.*D-S116.*P006\/D-S069/);
  for (const evidence of Object.values(manifest.evidence)) assert.ok(fs.statSync(path.join(root, evidence)).isFile(), evidence);
});

test('browser entry is standalone, explicit DATA ONLY, keyboard-native and CSP restricted', () => {
  const html = read('index.html');
  const app = read('app.js');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.ok(html.includes('DATA ONLY'));
  assert.match(html, /script-src 'self'/);
  assert.match(html, /connect-src 'none'/);
  assert.match(html, /form-action 'none'/);
  assert.match(html, /base-uri 'none'/);
  assert.ok(!html.includes("'unsafe-inline'") && !html.includes("'unsafe-eval'"));
  assert.ok(!/<script\b[^>]*>[^<\s]/i.test(html));
  assert.ok(!/\son\w+\s*=/i.test(html));
  assert.ok(!/(?:src|href)="(?:https?:|\/\/)/i.test(html));
  assert.match(html, /role="alert" tabindex="-1"/);
  assert.match(html, /<button type="button" id="restart-button"/);
  assert.ok(!/(?:id|name)="reset"/.test(html));
  assert.ok(!app.includes('innerHTML'));
  assert.ok(!/\b(?:fetch|XMLHttpRequest|WebSocket|localStorage|sessionStorage)\b/.test(app + read('model.js')));
  assert.ok(!html.includes('csp-probe.js'), 'Page-owned CSP probe is test-only');
  for (const file of ['.gitattributes', 'model.js', 'app.js', 'index.html', 'styles.css', 'manifest.json',
    'README.txt', 'active-active.feature', 'scripts/evidence.cjs', 'tests/model.test.cjs',
    'tests/bundle.test.cjs', 'tests/browser.test.cjs', 'tests/csp-probe.js']) {
    assert.ok(!read(file).includes('\r'), `${file}: owned implementation uses its declared LF checkout format`);
  }
  const bdd = read('active-active.feature');
  for (const scenario of require('../model.js').scenarioIds) assert.ok(bdd.includes(`"${scenario}"`) || bdd.includes(`| ${scenario}`));
});

test('raw source excerpts and canonical Git excerpts are separately pinned, never normalized', () => {
  const source = json('evidence/source-contract.json');
  assert.equal(source.readBeforeBehaviorDesign, true);
  assert.equal(source.cardId, 'A-S116');
  assert.equal(source.maximumCredit, 1);
  assert.deepEqual(source.pair.map((card) => card.id), ['A-S116', 'B-S116']);
  for (const record of source.records) {
    const working = fs.readFileSync(path.join(root, record.workingExcerpt));
    const canonical = fs.readFileSync(path.join(root, record.canonicalExcerpt));
    assert.equal(sha(working), record.workingExcerptSha256);
    assert.equal(sha(canonical), record.canonicalExcerptSha256);
    assert.equal(working.toString().replace(/\r?\n$/, ''), record.row);
    assert.equal(canonical.toString().replace(/\r?\n$/, ''), record.row);
    assert.equal(record.workingLineEnding, 'CRLF');
    assert.equal(record.canonicalLineEnding, 'LF');
    const result = spawnSync('git', ['cat-file', 'blob', record.canonicalGitBlob], { cwd: repo, encoding: null, windowsHide: true });
    assert.equal(result.status, 0);
    assert.equal(sha(result.stdout), record.canonicalFileSha256);
    assert.ok(result.stdout.toString().split(/\n/).includes(record.row));
  }
  assert.equal(read('.gitattributes'), [
    '* text eol=lf',
    'evidence/raw/** -text whitespace=cr-at-eol',
    'evidence/red/** -text whitespace=cr-at-eol',
    'evidence/runs/** -text whitespace=cr-at-eol',
    'evidence/raw/tooling-signature-attempt-1.stderr.txt -diff',
    'evidence/red/runner.tap -diff',
    'evidence/runs/*.tap -diff',
    '',
  ].join('\n'));
});

test('chronological RED is a genuine preserved assertion, followed by IaC N/A and browser stub proof', () => {
  const red = json('evidence/red.json');
  const iac = json('evidence/iac-decision.json');
  const stub = json('evidence/red/browser-load.json');
  const raw = read(red.stdout);
  assert.equal(red.actualExitCode, 1);
  assert.equal(red.stubLoadable, true);
  assert.equal(red.notImportOrToolingFailure, true);
  assert.match(raw, /ERR_ASSERTION/);
  assert.match(raw, /actual: 'unknown'/);
  assert.match(raw, /expected: 'positive'/);
  for (const snapshot of red.snapshots) {
    assert.equal(sha(fs.readFileSync(path.join(root, snapshot.path))), snapshot.sha256);
    assert.ok(snapshot.path.endsWith('.snapshot'));
    assert.ok(!snapshot.path.includes('/tests/'));
  }
  assert.equal(stub.actualDOM, true);
  assert.equal(stub.stubLoadable, true);
  assert.equal(stub.implementedBehavior, false);
  assert.equal(stub.awaitedFinallyClose, true);
  assert.equal(iac.decision, 'N/A');
  assert.equal(iac.nativeParentValidated, false);
  assert.equal(iac.cloudOperations, 0);
  assert.ok(Date.parse(red.recordedAtUtc) < Date.parse(stub.recordedAtUtc));
  assert.ok(Date.parse(stub.recordedAtUtc) < Date.parse(iac.recordedAtUtc));
});

test('content index pins implementation, specification, tests and immutable proof bytes', () => {
  const index = json('evidence/content-index.json');
  assert.equal(index.cardId, 'A-S116');
  assert.ok(index.files.length >= 20);
  for (const entry of index.files) {
    assert.ok(!path.isAbsolute(entry.path) && !entry.path.split('/').includes('..'));
    const content = fs.readFileSync(path.join(root, entry.path));
    assert.equal(content.length, entry.bytes, entry.path);
    assert.equal(sha(content), entry.sha256, entry.path);
  }
  for (const name of ['model.js', 'app.js', 'index.html', 'active-active.feature', 'README.txt', 'manifest.json',
    'tests/model.test.cjs', 'tests/browser.test.cjs', 'tests/csp-probe.js', 'scripts/evidence.cjs',
    'evidence/source-contract.json', 'evidence/red.json', 'evidence/iac-decision.json']) {
    assert.ok(index.files.some((entry) => entry.path === name), name);
  }
  assert.equal(new Set(index.files.map((entry) => entry.path)).size, index.files.length);
});
