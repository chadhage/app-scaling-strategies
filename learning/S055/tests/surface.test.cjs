'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const text = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('portable manifest declares the exact source objective, acceptance, packet, bounds and limits', () => {
  const manifest = JSON.parse(text('manifest.json'));
  assert.equal(manifest.cardId, 'A-S055');
  assert.equal(manifest.sourceId, 'S055');
  assert.equal(manifest.parentId, 'D-S055');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S055');
  assert.equal(manifest.packet, 'SC-S055');
  assert.equal(manifest.owner, 'worker-A-S055');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.objective, 'Read mixed cache payloads; identify when translation or versioned namespaces are required.');
  assert.equal(manifest.sourceAcceptance, 'Compatible translation/versioning preserves correctness; incompatible cached objects fail explicitly.');
  assert.equal(manifest.bounds.completedAttempts, 6);
  assert.equal(manifest.bounds.readsPerAttempt, 4);
  assert.equal(manifest.bounds.arbitraryPayloadsKeysOrEndpoints, false);
  assert.equal(manifest.iac.status, 'N/A');
  for (const field of ['preconditions', 'actions', 'assertions', 'limits']) {
    assert.ok(Array.isArray(manifest[field]) && manifest[field].length >= 4, field);
  }
});

test('standalone document has exact banner, external local assets, CSP and no inline execution or remote assets', () => {
  const html = text('index.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.deepEqual([...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map((match) => match[1]),
    ['fixtures.js', 'model.js', 'app.js']);
  assert.match(html, /<link rel="stylesheet" href="styles\.css">/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "form-action 'none'", "base-uri 'none'",
    "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
  assert.doesNotMatch(html, /\s(?:on\w+|style)\s*=|unsafe-inline|unsafe-eval|src="https?:|href="https?:/i);
});

test('native controls, labels, alerts, skip target, results and explicit reset remain keyboard accessible', () => {
  const html = text('index.html');
  for (const id of ['layout', 'translation', 'payload', 'observation', 'prediction']) {
    assert.ok(html.includes(`label for="${id}"`), id);
    assert.ok(html.includes(`select id="${id}"`), id);
  }
  assert.match(html, /href="#exercise"/);
  assert.match(html, /id="exercise"/);
  assert.match(html, /id="input-error" role="alert" hidden/);
  assert.match(html, /id="phase" role="status" aria-live="polite"/);
  assert.match(html, /<caption>Four started reads; unknown payloads are not inferred<\/caption>/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  const css = text('styles.css');
  assert.match(css, /:focus-visible\s*\{\s*outline: 3px/);
  assert.match(css, /\.table-scroll\s*\{[^}]*overflow-x: auto/);
  assert.match(css, /\[hidden\]\s*\{\s*display: none !important/);
});

test('application uses text-only rendering and the model has no network, persistence or platform calls', () => {
  const app = text('app.js');
  assert.match(app, /cell\.textContent = String\(value\)/);
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /lesson\.newAttempt\(\)/);
  for (const file of ['app.js', 'model.js', 'fixtures.js']) {
    assert.doesNotMatch(text(file),
      /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*\(|innerHTML|outerHTML|insertAdjacentHTML|localStorage|sessionStorage|document\.cookie|serviceWorker|setInterval|Math\.random/);
  }
});

test('BDD and learner documentation preserve source acceptance and synthetic/native evidence boundaries', () => {
  const feature = text('cache-payload.feature');
  for (const phrase of ['Shared keys expose incompatible cached objects',
    'lossless translator', 'Versioned namespaces', 'Missing observations', 'Keyboard, reset']) {
    assert.ok(feature.includes(phrase), phrase);
  }
  const readme = text('README.md');
  for (const phrase of ['D-S055', 'B-S055', 'SC-S055', 'synthetic',
    'CAPTURE_BROWSER_EVIDENCE', 'read-only', 'CRLF', 'Node.js 22.23.4',
    '1.56.1', '156', 'not production Node.js 24', 'not a live cache']) {
    assert.ok(readme.includes(phrase), phrase);
  }
});
