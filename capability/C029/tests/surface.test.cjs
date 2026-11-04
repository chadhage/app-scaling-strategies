'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'page.js'), 'utf8');

test('static training/source/model/native boundary banners and keyboard controls are explicit', () => {
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /not a live client, network or disk read/);
  assert.match(html, /atomic application\/deduplication pair is an ASSUMPTION/);
  assert.match(html, /UNKNOWN/);
  for (const id of ['source-id', 'inspect', 'compare', 'load-copy', 'reset', 'candidate', 'inspect-copy',
    'status', 'error', 'originals', 'events', 'source-banner', 'model-banner', 'inspection-history']) {
    assert.equal((html.match(new RegExp(`id="${id}"`, 'g')) || []).length, 1);
  }
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(fs.readFileSync(path.join(root, 'style.css'), 'utf8'), /:focus-visible/);
});

test('browser page cannot use live client/network/disk/storage APIs or unsafe HTML injection', () => {
  assert.doesNotMatch(page, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|innerHTML|eval\s*\(/);
  assert.match(html, /connect-src 'none'/);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<script(?![^>]*\bsrc=)[^>]*>/);
  assert.match(page, /history\.length >= 16/);
  assert.match(page, /Input changed: previous result invalidated/);
  assert.match(page, /source-id'\)\.focus\(\)/);
});

test('CLI rejects arbitrary targets, flags, budgets and attacker authority before preflight', () => {
  for (const args of [
    [], ['evaluate', '..\\C033\\index.html'], ['evaluate', 'closed-history', 'eligible=true'],
    ['evaluate', 'https://example.invalid'], ['compare', 'healthy'], ['evaluate', '1000']
  ]) {
    const run = spawnSync(process.execPath, [path.join(root, 'cli.cjs'), ...args], {
      cwd: repository, encoding: 'utf8', timeout: 10000, maxBuffer: 131072, windowsHide: true
    });
    assert.equal(run.status, 3);
    assert.equal(JSON.parse(run.stderr).code, 'CLOSED_CLI_ARGUMENTS');
    assert.equal(run.stdout, '');
  }
});

test('CLI actual saved evaluation returns explicit FAIL with full original denominator and read-only source preflight', () => {
  const run = spawnSync(process.execPath, [path.join(root, 'cli.cjs'), 'evaluate', 'closed-history'], {
    cwd: repository, encoding: 'utf8', timeout: 60000, maxBuffer: 1048576, windowsHide: true
  });
  assert.equal(run.status, 1, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.decision, 'FAIL');
  assert.equal(report.counts.originals, 7);
  assert.equal(report.separateReadOnlyNodePreflight.exactPinnedSourceFiles, 22);
  assert.equal(report.sourceConsistentHistorical, true);
  assert.equal(report.userJourneySuccess, false);
  assert.equal(report.trainingBanner, 'Training rehearsal - synthetic data - not a live Azure result');
});

test('publication stdout parser preserves raw LF/CRLF separately and accepts only exact actual receipt shape', () => {
  const { parsePublishedOutput } = require('..\\publication-result.cjs');
  const commit = '1'.repeat(40);
  const result = {
    cardId: 'C029', workerId: 'worker-C029', outcome: 'published', commit,
    tag: `kanban/C029/${commit.slice(0, 12)}`, publication: { remoteVerified: true },
    proof: { ownedOnlyCommit: true, remotePeeledTag: commit }
  };
  const body = JSON.stringify(result, null, 2);
  assert.deepEqual(parsePublishedOutput(`actual git progress\n${body}\n`), result);
  assert.deepEqual(parsePublishedOutput(`actual git progress\r\n${body.replaceAll('\n', '\r\n')}\r\n`), result);
  assert.throws(() => parsePublishedOutput(JSON.stringify({ ...result, commit: 'unqualified' })));
  assert.throws(() => parsePublishedOutput(JSON.stringify({ ...result, workerId: 'other' })));
  assert.throws(() => parsePublishedOutput(body, { hash: 'trusted' }));
});
