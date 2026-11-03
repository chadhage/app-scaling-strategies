'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lesson = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(lesson, file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const modelSource = read('model.js');
const manifest = JSON.parse(read('manifest.json'));
const model = require(path.join(lesson, 'model.js'));

test('manifest declares the exact single S095 source/card/packet and bounded synthetic contract', () => {
  assert.equal(manifest.sourceId, 'S095');
  assert.equal(manifest.id, 'A-S095');
  assert.equal(manifest.parentId, 'D-S095');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S095');
  assert.equal(manifest.packet, 'SC-S095');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.iac, 'N/A');
  assert.equal(manifest.technicalEntryGate, 'SOURCE');
  assert.equal(manifest.nativeAcceptanceCompleted, false);
  assert.equal(manifest.managementCalls, false);
  assert.equal(manifest.credentials, false);
  assert.equal(manifest.objective, 'Partition a required candidate dependency; identify safe versus unsafe admission decisions.');
  assert.equal(manifest.preconditions.partitionArrivals, 4);
  assert.equal(manifest.preconditions.separateRecoveryValidationProbes, 2);
  assert.equal(manifest.preconditions.originalJourneyBudgetMs, 250);
  assert.equal(manifest.preconditions.attemptLimit, 6);
  assert.deepEqual(manifest.fixtures, model.FIXTURES.map((item) => item.value));
  assert.deepEqual(manifest.admissionInstructions, model.ACTIONS.map((item) => item.value));
  for (const asset of manifest.assets) assert.ok(fs.statSync(path.join(lesson, asset)).isFile());
});

test('standalone local surface has exact banner, explicit source acceptance, labels and unshadowed native reset', () => {
  assert.ok(html.includes('<p class="banner" id="training-banner">Training rehearsal - synthetic data - not a live Azure result</p>'));
  assert.ok(html.includes('Remove it from new admission and retain a usable compatible destination.'));
  assert.match(html, /<html lang="en">/);
  for (const id of ['fixture', 'admission-action', 'prediction']) assert.ok(html.includes(`label for="${id}"`));
  assert.match(html, /id="input-error"[^>]*role="alert"[^>]*tabindex="-1"[^>]*hidden/);
  assert.match(html, /id="run-status"[^>]*role="status"[^>]*aria-live="polite"/);
  assert.ok(html.includes('id="reset-rehearsal" type="button"'));
  assert.doesNotMatch(html, /(?:id|name)="reset"/i);
  assert.ok(app.includes('form.reset();'));
  assert.ok(app.includes('fixture.focus();'));
  assert.doesNotMatch(app, /\.innerHTML|insertAdjacentHTML|document\.write/);
  assert.ok(html.includes('Microsoft Open Source Disclaimer'));
  assert.ok(html.includes('not a Microsoft service-level agreement or guarantee.'));
  for (const item of [...model.FIXTURES, ...model.ACTIONS]) assert.ok(html.includes(`value="${item.value}"`));
});

test('CSP and assets prohibit connections, inline execution and operational APIs', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "frame-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /\son\w+=|style=|<iframe|<object|<base/i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]), ['model.js', 'app.js']);
  assert.doesNotMatch(`${app}\n${modelSource}`, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|localStorage|sessionStorage|serviceWorker|indexedDB|Math\.random|\bDate\s*\(|setTimeout|setInterval|\beval\s*\(|new Function/);
  assert.match(modelSource, /No packets, resources or real connections are modified/);
  assert.ok(read('.gitattributes').includes('evidence/raw/** -text -diff'));
});
