'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const api = require('../long-work.js');

const lesson = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(lesson, file), 'utf8');

test('portable manifest declares exact source, frozen unit, synthetic fixture and limits', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.cardId, 'A-S042');
  assert.equal(manifest.parentId, 'D-S042');
  assert.equal(manifest.packet, 'SC-S042');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S042');
  assert.equal(manifest.sourceId, 'S042');
  assert.equal(manifest.entryPoint, 'learning/S042/index.html');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.deepEqual(manifest.syntheticInput, api.DEFAULT_INPUT);
  for (const field of ['preconditions', 'actions', 'assertions', 'limits']) {
    assert.ok(Array.isArray(manifest[field]) && manifest[field].length > 0);
  }
  assert.equal(manifest.iac.status, 'N/A');
  assert.equal(manifest.testRuntime.dependencyChanges, false);
});

test('standalone HTML has labeled local assets, exact banner and no reset shadowing', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<form id="lessonControls" novalidate>/);
  assert.doesNotMatch(html, /\b(?:id|name)=["']reset["']/i);
  assert.doesNotMatch(html, /\bon[a-z]+\s*=|<script(?![^>]*\bsrc=)[^>]*>[\s\S]*?\S[\s\S]*?<\/script>/i);
  for (const file of ['styles.css', 'long-work.js', 'app.js']) {
    assert.ok(html.includes(`"${file}"`));
    assert.ok(fs.existsSync(path.join(lesson, file)));
  }
  for (const id of ['mode', 'condition', 'budgetMs', 'drainMs', 'hostLimitMs', 'prediction']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /id="errorNotice" role="alert"/);
  assert.match(html, /id="userResult" role="status" aria-live="polite"/);
});

test('CSP is restrictive and application code has no network, storage or real clock', () => {
  const html = read('index.html');
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "form-action 'none'", "base-uri 'none'", "img-src 'none'", "object-src 'none'",
    "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(html.includes(directive), directive);
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|https?:\/\//);
  const source = `${read('long-work.js')}\n${read('app.js')}`;
  assert.doesNotMatch(source, /\b(?:fetch|WebSocket|XMLHttpRequest|Worker|localStorage|sessionStorage|setTimeout|setInterval|Date)\b/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\.reset\(/);
  assert.match(read('app.js'), /textContent/);
  assert.match(read('styles.css'), /:focus-visible/);
});

test('proof capture is explicit and RED snapshots are outside automatic discovery', () => {
  const capture = read('capture.cjs');
  const browser = read(path.join('tests', 'browser.test.cjs'));
  const verify = read('verify.cjs');
  assert.match(capture, /CAPTURE_BROWSER_EVIDENCE !== '1'/);
  assert.match(capture, /Evidence already exists/);
  assert.match(browser, /openIsolatedLesson/);
  assert.match(browser, /finally[\s\S]*await session\.close\(\)/);
  assert.match(browser, /CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(verify, /CAPTURE_BROWSER_EVIDENCE: ''/);
  const names = fs.readdirSync(path.join(lesson, 'evidence', 'red'));
  assert.equal(names.length, 3);
  assert.ok(names.every((name) => name.endsWith('.snapshot') && !name.includes('.test.')));
});
