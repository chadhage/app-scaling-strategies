'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const model = require('./model.js');
const read = (name) => fs.readFileSync(path.join(__dirname, name));
const text = (name) => read(name).toString('utf8');
const json = (name) => JSON.parse(text(name));
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

test('manifest maps exactly one frozen original unit and source acceptance', () => {
  const manifest = json('manifest.json');
  assert.equal(manifest.cardId, 'A-S136');
  assert.deepEqual(manifest.parentIds, ['D-S136']);
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S136');
  assert.equal(manifest.packet, 'SC-S136');
  assert.equal(manifest.mode, 'local-synthetic-only');
  assert.equal(manifest.banner, model.BANNER);
  assert.equal(manifest.objective, 'Take only the sample client offline; synchronize pending changes without losing the harness console.');
  assert.equal(manifest.sourceBehavior, 'Reconcile queued operations against the new deployment without losing or duplicating changes.');
  assert.equal(manifest.backlogAcceptance, 'Queued authenticated operations synchronize with v2 without missing/duplicate changes; offline/recovery budgets and protocol assumptions are explicit.');
  assert.deepEqual(manifest.fixtures, model.FIXTURE_IDS);
  assert.deepEqual(manifest.timings, model.TIMING_IDS);
  assert.equal(manifest.bounds.retainedJournalEntries, model.MAX_HISTORY);
  assert.deepEqual(manifest.syntheticBudgetsMs, { offline: model.BUDGETS.offlineMs, recovery: model.BUDGETS.recoveryMs });
});

test('browser assets are standalone, labeled, local-only and deny unsafe capabilities', () => {
  const html = text('index.html');
  assert.ok(html.includes(model.BANNER));
  assert.ok(text('offline-sync.feature').includes(model.BANNER));
  assert.match(html, /<html lang="en">/);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "worker-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'",
  ]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<script(?![^>]*\bsrc=)|\son\w+\s*=|<form\b|id=["']reset["']|name=["']reset["']/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'lesson.js']);
  assert.deepEqual([...html.matchAll(/<(?:link|a)\b[^>]*(?:href)="([^"]+)"/g)].map((match) => match[1]), ['style.css', 'README.md']);
  for (const name of ['model.js', 'lesson.js']) {
    assert.doesNotMatch(text(name), /fetch\s*\(|XMLHttpRequest|WebSocket|navigator\.|localStorage|sessionStorage|indexedDB|serviceWorker|setOffline|child_process|require\s*\(|innerHTML|\.reset\s*\(/);
  }
  for (const fixture of model.FIXTURE_IDS) assert.ok(html.includes(`value="${fixture}"`));
  for (const timing of model.TIMING_IDS) assert.ok(html.includes(`value="${timing}"`));
});

test('narrow lesson attributes preserve raw-byte proof and asset hashes across Git publication', () => {
  const attributes = text('.gitattributes').split(/\r?\n/).filter(Boolean);
  assert.deepEqual(attributes, [
    '/.gitattributes -text', '/model.js -text', '/lesson.js -text',
    '/index.html -text', '/style.css -text', '/offline-sync.feature -text',
    '/manifest.json -text', '/model.test.cjs -text', '/browser.test.cjs -text',
    '/integrity.test.cjs -text', '/README.md -text', '/remainder.json -text',
    '/evidence/** -text', '/evidence/raw/** -diff',
    '* whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol',
  ]);
});

test('source working and canonical bytes have separate verified hashes and line-ending counts', () => {
  const source = json(path.join('evidence', 'source.json'));
  assert.equal(source.cardId, 'A-S136');
  assert.equal(source.packet, 'SC-S136');
  assert.equal(source.sources.length, 3);
  for (const input of source.sources) {
    for (const kind of ['working', 'canonical']) {
      const snapshot = input.snapshots[kind];
      const compressed = read(snapshot.file);
      const bytes = zlib.gunzipSync(compressed);
      const decoded = bytes.toString('utf8');
      assert.equal(sha256(compressed), snapshot.compressedSha256);
      assert.equal(sha256(bytes), snapshot.rawSha256);
      assert.equal(bytes.length, snapshot.byteLength);
      assert.equal((decoded.match(/\r\n/g) || []).length, snapshot.crlfCount);
      assert.equal((decoded.match(/(?<!\r)\n/g) || []).length, snapshot.bareLfCount);
      const selected = read(path.join('evidence', 'raw', 'source', `${input.label}.${kind}.selected.snapshot`));
      assert.equal(sha256(selected), snapshot.selectedSha256);
      if (input.label === 'README') assert.match(selected.toString(), /\| S136 \| \*\*Offline mobile synchronization:\*\* Reconcile queued operations against the new deployment without losing or duplicating changes\./);
      if (input.label === 'backlog') assert.match(selected.toString(), /Queued authenticated operations synchronize with v2 without missing\/duplicate changes; offline\/recovery budgets and protocol assumptions are explicit\./);
      if (input.label === 'kanban') {
        assert.match(selected.toString(), /\| A-S136 \| D-S136 \| S \| Take only the sample client offline/);
        assert.match(selected.toString(), /every other A\/B card belongs to SC-Snnn/);
        assert.match(selected.toString(), /An A card delivers a standalone, browser-openable lesson bundle/);
      }
    }
  }
});

test('preserved behavioral RED is a strict assertion failure from a loadable stub, not tooling', () => {
  const red = path.join('evidence', 'raw', 'red');
  const run = json(path.join(red, 'run.json'));
  const workflow = json(path.join('evidence', 'workflow.json'));
  const stdout = read(path.join(red, 'stdout.tap'));
  const stderr = read(path.join(red, 'stderr.txt'));
  assert.equal(run.exitCode, 1);
  assert.equal(sha256(stdout), run.stdoutSha256);
  assert.equal(sha256(stderr), run.stderrSha256);
  assert.match(stdout.toString(), /not ok 1 - only the fictional sample client goes offline/);
  assert.match(stdout.toString(), /ERR_ASSERTION[\s\S]*expected: false[\s\S]*actual: true/);
  assert.match(stdout.toString(), /true !== false/);
  assert.doesNotMatch(stdout.toString(), /MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(sha256(read(path.join(red, 'model.js.snapshot'))), workflow.stubSha256);
  assert.equal(sha256(read(path.join(red, 'offline-sync.feature.snapshot'))), workflow.bddSha256);
  assert.equal(workflow.iac.applicable, false);
  assert.ok(Date.parse(workflow.iac.recordedAfterRedAt) >= Date.parse(run.finishedAt));
  assert.ok(fs.readdirSync(path.join(__dirname, red)).every((name) => !/\.(?:test|spec)\.[cm]?js$/.test(name)));
});

test('committed actual-browser proof observes all gates with the exact published helper', () => {
  const browser = json(path.join('evidence', 'browser.json'));
  assert.equal(browser.cardId, 'A-S136');
  assert.equal(browser.allPassed, true);
  assert.equal(browser.captureRequestedExactly, true);
  assert.equal(browser.closedSessions, 2);
  assert.equal(browser.checks.length, 10);
  assert.ok(browser.checks.every((check) => check.status === 'passed'));
  assert.equal(browser.helperSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(browser.playwrightVersion, '1.56.1');
  assert.match(browser.browserVersion, /^156\./);
  assert.match(browser.nodeVersion, /^v22\./);
  for (const [name, digest] of Object.entries(browser.files)) assert.equal(sha256(read(name)), digest);
  assert.match(text('browser.test.cjs'), /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(text('browser.test.cjs'), /finally \{\s*if \(primary\) \{\s*await primary\.close\(\)/);
  assert.match(text('browser.test.cjs'), /finally \{\s*if \(failed\) \{\s*await failed\.close\(\)/);
  const helper = fs.readFileSync(path.resolve(__dirname, '..', '..', 'testing', 'browser', 'isolated.cjs'));
  assert.equal(sha256(helper), browser.helperSha256);
});

test('owned byte-integrity index validates assets, specs and retained proof without rewriting', () => {
  const index = json(path.join('evidence', 'integrity.json'));
  assert.equal(index.cardId, 'A-S136');
  assert.equal(index.algorithm, 'SHA-256');
  for (const file of index.files) {
    const resolved = path.resolve(__dirname, file.path);
    assert.ok(resolved.startsWith(`${__dirname}${path.sep}`), 'Integrity entries stay within this lesson');
    assert.equal(sha256(fs.readFileSync(resolved)), file.sha256, file.path);
    assert.equal(fs.statSync(resolved).size, file.byteLength, file.path);
  }
  for (const required of ['model.js', 'lesson.js', 'index.html', 'offline-sync.feature', 'manifest.json', 'README.md',
    path.join('evidence', 'browser.json'), path.join('evidence', 'raw', 'red', 'stdout.tap')]) {
    assert.ok(index.files.some((file) => file.path === required), required);
  }
});
