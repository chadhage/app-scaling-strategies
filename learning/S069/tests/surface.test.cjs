'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const text = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('portable manifest declares exact S069 objective, acceptance, packet, bounds and native exclusions', () => {
  const manifest = JSON.parse(text('manifest.json'));
  assert.equal(manifest.cardId, 'A-S069');
  assert.equal(manifest.sourceId, 'S069');
  assert.equal(manifest.parentId, 'D-S069');
  assert.equal(manifest.siblingId, 'B-S069');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S069');
  assert.equal(manifest.packet, 'SC-S069');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.entryPoint, 'learning/S069/index.html');
  assert.equal(manifest.objective, 'Transfer writer epochs; stale writers must not regain authority.');
  assert.equal(manifest.sourceAcceptance, 'Only the authorized epoch writes; stale writers are rejected and acknowledged data is retained.');
  assert.equal(manifest.requiredVisibleLabel, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.equal(manifest.bounds.writeObservationsPerAttempt, 6);
  assert.equal(manifest.bounds.completedAttempts, 6);
  assert.equal(manifest.bounds.configurations, 6);
  assert.equal(manifest.iac.status, 'N/A');
  assert.equal(manifest.testRuntime.dependencyChanges, false);
  assert.ok(manifest.preconditions.length >= 5 && manifest.actions.length >= 5 && manifest.assertions.length >= 5);
  assert.ok(manifest.limits.some((value) => /No actual database epochs/.test(value)));
  assert.ok(manifest.limits.some((value) => /separate and unfulfilled/.test(value)));
});

test('owned HTML has visible training/source limits, native labels, guarded actions and no reset shadowing', () => {
  const html = text('index.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /role="note">Training rehearsal - synthetic data - not a live Azure result/);
  for (const id of ['authority', 'retention', 'prediction']) {
    assert.match(html, new RegExp(`<label for="${id}">`));
    assert.match(html, new RegExp(`<select id="${id}" aria-describedby=`));
  }
  for (const id of [
    'begin-handoff', 'transfer-epoch', 'probe-writers', 'replay-grant', 'verify-effects',
    'next-attempt', 'reset-rehearsal', 'check-prediction',
  ]) assert.match(html, new RegExp(`<button id="${id}" type="(?:button|submit)"`));
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/i);
  assert.match(html, /role="alert" tabindex="-1" hidden/);
  assert.match(html, /class="skip-link" href="#lesson-main"/);
  assert.match(html, /B-S069 native proof and D-S069\/source-parent completion remain unfulfilled/);
  assert.match(html, /microsoft-open-source-disclaimer/);
  assert.match(html, /No actual database epochs, lease, fencing protocol, concurrent writers/);
  assert.match(text('styles.css'), /:focus-visible/);
});

test('CSP and text-only rendering retain a local resource-free boundary without unsafe application APIs', () => {
  const html = text('index.html');
  const app = text('app.js');
  const model = text('model.js');
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(html.includes(directive), directive);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.doesNotMatch(html, /<script(?! src=)|\bon\w+\s*=|\bstyle\s*=|https?:|unsafe-inline|unsafe-eval/i);
  assert.doesNotMatch(app + model, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|\bFunction\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|Worker\s*\(|localStorage|sessionStorage|setTimeout|setInterval|Math\.random|Date\.now/);
  assert.match(app, /textContent/);
  assert.match(app, /getElementById/);
  assert.match(app, /handoff-controls'\)\.reset\(\)/);
  assert.match(app, /prediction-controls'\)\.reset\(\)/);
});

test('BDD, instructions and source mapping describe real measured safety rather than an animation or native claim', () => {
  const bdd = text('writer-epochs.feature');
  const readme = text('README.md');
  for (const term of ['confirmed', 'UNKNOWN', 'FAIL', 'acknowledged', 'replay', 'reset']) {
    assert.match(bdd.toLowerCase(), new RegExp(term.toLowerCase()));
  }
  assert.match(readme, /read-only to historical proof/);
  assert.match(readme, /CAPTURE_BROWSER_EVIDENCE='1'/);
  assert.match(readme, /13 tests: 1 pass, 12 assertion failures/);
  assert.match(readme, /source-parent completion/);
  assert.match(readme, /canonical Git-source integrity/);
  assert.match(readme, /One frozen S unit/);
});
