'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const lesson = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(lesson, file), 'utf8');

test('portable manifest identifies the exact card, packet, fixture, limits and banner', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.id, 'A-S059');
  assert.equal(manifest.sourceId, 'S059');
  assert.equal(manifest.parentId, 'D-S059');
  assert.equal(manifest.packet, 'SC-S059');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S059');
  assert.equal(manifest.objective, 'Interpret flags/configuration with old/new code; detect divergent meanings of one shared setting.');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.syntheticFixture.maxRetainedActions, 16);
  assert.equal(manifest.syntheticFixture.successAtAttempt, 3);
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.ok(manifest.preconditions.length && manifest.actions.length && manifest.assertions.length && manifest.limits.length);
});

test('HTML uses local assets, restrictive CSP, labeled native controls and truthful evidence limits', () => {
  const html = read('index.html');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /<html lang="en">/);
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const rule of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(csp.includes(rule), rule);
  }
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?![^>]*src=)|<iframe|https?:\/\//i);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)"/g)].map((match) => match[1]), ['model.js', 'lesson.js']);
  for (const id of ['schema', 'budget', 'reader']) assert.ok(html.includes(`for="${id}"`));
  assert.match(html, /id="input-error" role="alert"/);
  assert.match(html, /id="announcement" role="status" aria-live="polite"/);
  assert.match(html, /id="start-over" type="button"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /not native Azure evidence, real distributed-configuration proof, Node.js 24 production validation/);
});

test('page code has no network, storage, dynamic-code or HTML-injection API and reset cannot be shadowed', () => {
  const code = read('lesson.js') + read('model.js');
  assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval|Function)\s*\(|innerHTML|outerHTML|document\.write|localStorage|sessionStorage|sendBeacon/);
  assert.match(code, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(read('lesson.css'), /:focus-visible/);
});

test('BDD and docs preserve source acceptance and the resource-free implementation sequence', () => {
  const bdd = read('configuration-overlap.feature');
  for (const text of ['divergent meanings', 'both synthetic journeys succeed', 'Missing new-reader evidence',
    'An edit invalidates', 'History is bounded', 'Keyboard, error, reset']) assert.ok(bdd.includes(text));
  const iac = JSON.parse(read('evidence\\iac-stage.json'));
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.after, 'BDD and loadable-stub assertion RED');
  assert.equal(iac.before, 'behavior implementation');
  const docs = read('README.md');
  assert.match(docs, /Both versions interpret approved shared configuration consistently; incompatible publication is gated\./);
  assert.match(docs, /CAPTURE_BROWSER_EVIDENCE=1/);
  assert.match(docs, /Normal verification is read-only/);
});
