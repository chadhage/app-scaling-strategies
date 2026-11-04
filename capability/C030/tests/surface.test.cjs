'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const detector = require('..\\detector.js');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'page.js'), 'utf8');
test('exact synthetic banner, original identity and honest source distinctions are present', () => {
  assert.equal(html.split(detector.banner).length, 2);
  for (const value of ['C030 / D / P0 / H006', 'parents H006/H012 remain incomplete', 'PURE event-log', 'NO effect receipts',
    'NOT C023 source/native receipts', 'unknown acknowledgment stays unknown', 'Checkpoint position is a separate observation']) assert.ok(html.includes(value));
  assert.match(html, /Native and production Node 24 proof are incomplete/);
});
test('all and only closed sources are available in the keyboard-native selector', () => {
  const options = [...html.matchAll(/<option value="([^"]*)"/g)].map((match) => match[1]);
  assert.deepEqual(options, ['', ...detector.sourceIds]);
  for (const id of ['source-id', 'candidate', 'output']) assert.match(html, new RegExp(`<label for="${id}">`));
  for (const id of ['inspect', 'compare', 'load-copy', 'reset', 'inspect-copy', 'copy-result', 'copy-history']) assert.match(html, new RegExp(`<button id="${id}" type="button"(?: disabled)?>`));
});
test('strict CSP forbids connections, inline execution, forms and remote capabilities', () => {
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "form-action 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'"]) assert.ok(html.includes(directive));
  assert.doesNotMatch(html, /\bon[a-z]+\s*=|<script(?![^>]*\bsrc=)[^>]*>|style\s*=/i);
  assert.doesNotMatch(page, /\bfetch\s*\(|XMLHttpRequest|new WebSocket|EventSource|localStorage|sessionStorage|indexedDB|clipboard|innerHTML|eval\s*\(/);
});
test('reset does not delete history, input edits clear stale success, copy selects actual JSON', () => {
  assert.match(page, /history\.length >= 16/);
  assert.match(page, /refused, not dropped/);
  assert.doesNotMatch(page, /history\.(?:splice|shift|pop)|history\.length\s*=(?!=)/);
  assert.match(page, /candidate'\)\.addEventListener\('input', \(\) => clear/);
  assert.match(page, /byId\('output'\)\.select\(\)/);
  assert.match(page, /code: evaluated\.code \|\| null, report/);
  assert.match(page, /schema: 'C030-display-history\/1'/);
  assert.match(page, /byId\('source-id'\)\.focus\(\)/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(fs.readFileSync(path.join(root, 'style.css'), 'utf8'), /:focus-visible/);
});
test('UI uses unchanged contracts and safe text rendering, not reconstructed historical effects', () => {
  for (const script of ['../C023/ledger.js', '../C029/evaluator.js', '../C034/trace.js']) assert.ok(html.includes(script));
  assert.match(page, /textContent = String\(value\)/);
  assert.match(page, /original\.sourceBudget\.verdict/);
  assert.match(page, /No associated effect plan or required application receipts/);
});
