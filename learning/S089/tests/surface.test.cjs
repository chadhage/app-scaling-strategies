'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./provenance.cjs');
const { CONDITIONS, RECOVERY, BOUNDS } = require('..\\fixtures.js');
const html = read('index.html').toString();
const app = read('app.js').toString();
const model = read('model.js').toString();
const manifest = JSON.parse(read('manifest.json'));

test('portable surface prominently attributes the exact banner, source and synthetic limits', () => {
  assert.match(html, /<p class="banner" role="note">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  assert.match(html, /S089 — Control-plane outage/);
  assert.match(html, /B-S089 and D-S089 remain incomplete/);
  assert.match(html, /fixed <strong>synthetic trace data<\/strong>/);
  assert.match(html, /“AS IS”/);
  assert.match(html, /not a Microsoft SLA/);
});

test('manifest matches frozen card contract, actions, fixtures and declared operating bounds', () => {
  for (const [key, value] of Object.entries({
    id: 'A-S089', sourceId: 'S089', parentId: 'D-S089', nativeSiblingId: 'B-S089',
    workerId: 'worker-A-S089', kano: 'S', kanoUnit: 'A-S089', packet: 'SC-S089',
    entryGate: 'SOURCE', mode: 'synthetic', entry: 'index.html', iac: 'N/A',
  })) assert.equal(manifest[key], value, key);
  assert.equal(manifest.bounds.inputCombinations, Object.keys(CONDITIONS).length * Object.keys(RECOVERY).length);
  assert.equal(manifest.bounds.maxTraceEvents, BOUNDS.maxTraceEvents);
  assert.equal(manifest.bounds.maxRetainedAttempts, BOUNDS.maxHistory);
  assert.equal(manifest.bounds.journeysPerAttempt, BOUNDS.journeysPerAttempt);
  assert.equal(manifest.bounds.journeyBudgetSyntheticMs, BOUNDS.journeyBudgetMs);
  assert.ok(manifest.assertions.some((value) => value.toLowerCase().includes('independent')));
});

test('CSP permits local external assets but denies connections, inline code, objects and form actions', () => {
  for (const policy of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(html.includes(policy), policy);
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<script[^>]*>[^<\s]|<style\b|on(?:click|load|error)\s*=/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['fixtures.js', 'model.js', 'app.js']);
  assert.doesNotMatch(html, /https?:\/\/|<iframe\b|<embed\b|<object\b/);
});

test('implementation has no network/resource operations, timers, randomness or persistent storage', () => {
  assert.doesNotMatch(app + model, /\b(fetch|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|indexedDB|setTimeout|setInterval)\b/);
  assert.doesNotMatch(app + model, /Math\.random|Date\.now|https?:\/\/|\b(?:eval|exec)\s*\(/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML/);
  assert.match(app, /event\.preventDefault\(\)/);
});

test('keyboard controls use labels, native controls, guarded errors and unshadowed explicit reset', () => {
  for (const id of ['condition', 'recovery-evidence', 'prediction']) {
    assert.ok(html.includes(`<label for="${id}">`), id);
    assert.ok(html.includes(`<select id="${id}"`), id);
  }
  for (const id of ['lose-management', 'sample-journeys', 'report-fault', 'recover-control',
    'check-prediction', 'new-attempt']) assert.match(html, new RegExp(`<button id="${id}" type="button" disabled>`));
  assert.match(html, /id="error"[^>]*role="alert"[^>]*tabindex="-1" hidden/);
  assert.match(html, /id="status" role="status" aria-live="polite"/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  assert.doesNotMatch(app, /form\.reset/);
  assert.ok(html.indexOf('</form>') < html.indexOf('id="reset-lesson"'));
  assert.match(app, /byId\(focusId\)\.focus\(\)/);
});

test('BDD preserves scoped loss, independent reporting, unknowns, denominators and negative/reset behavior', () => {
  const bdd = read('outage.feature').toString();
  for (const clause of ['per-run', 'controller on every request', 'shared training harness',
    'unknown', 'failures', 'prediction', 'seventh attempt', 'reset', 'CSP']) {
    assert.ok(bdd.includes(clause), clause);
  }
  assert.match(read('styles.css').toString(), /:focus-visible/);
  assert.match(read('styles.css').toString(), /@media \(max-width: 40rem\)/);
  assert.match(read('README.md').toString(), /ordinary verification is \*\*read-only\*\*/);
});
