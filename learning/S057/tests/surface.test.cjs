'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('manifest preserves the exact source acceptance, packet and synthetic operating envelope', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.cardId, 'A-S057');
  assert.equal(manifest.parentId, 'D-S057');
  assert.equal(manifest.packet, 'SC-S057');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S057');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.objective, 'Load old HTML after deployment; detect asset retirement that breaks an existing page.');
  assert.equal(manifest.sourceAcceptance, 'Existing pages resolve required assets correctly; early asset removal produces a visible failing result.');
  assert.equal(manifest.bounds.requiredAssetsPerAttempt, 4);
  assert.equal(manifest.bounds.maximumRetainedAttempts, 6);
  assert.equal(manifest.iac.status, 'N/A');
  assert.equal(manifest.testRuntime.productionNode24Certification, false);
  assert.ok(manifest.preconditions.length >= 4 && manifest.actions.length >= 4 && manifest.assertions.length >= 6);
  for (const file of ['index.html', 'static-assets.feature', 'model.js', 'evidence\\iac.json']) assert.ok(fs.existsSync(path.join(root, file)));
});

test('standalone page has explicit labeling, native controls, no reset shadow and restrictive CSP', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.ok(html.includes('No real HTML cache, CDN, HTTP request, native deployment or asset deletion occurs.'));
  assert.ok(html.includes('B-S057 native evidence and D-S057 source-parent acceptance remain incomplete.'));
  for (const directive of ["default-src 'none'", "script-src 'self'", "script-src-attr 'none'",
    "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'"]) assert.ok(html.includes(directive));
  assert.ok(!/unsafe-inline|unsafe-eval|<script(?![^>]*\bsrc=)|\son\w+=|\sstyle=/i.test(html));
  assert.ok(!/\b(?:id|name)="reset"/.test(html));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['observation', 'retireTarget', 'prediction']) assert.ok(html.includes(`for="${id}"`));
  assert.ok(html.includes('role="alert"') && html.includes('class="skip"') && html.includes('<caption>'));
});

test('runtime contains no network, storage, dynamic execution or unsafe markup sink', () => {
  const runtime = `${read('model.js')}\n${read('app.js')}`;
  assert.ok(!/\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|document\.cookie|\beval\s*\(|new Function|innerHTML|outerHTML|insertAdjacentHTML/.test(runtime));
  assert.ok(read('app.js').includes('form.reset()'));
  assert.ok(read('styles.css').includes(':focus-visible'));
  const feature = read('static-assets.feature');
  assert.ok(feature.includes('Early retirement visibly breaks the old page'));
  assert.ok(feature.includes('Withheld observation is not a successful load'));
});
