'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { root, read } = require('./provenance.cjs');
const html = read('index.html').toString();
const manifest = JSON.parse(read('manifest.json'));

test('manifest declares the exact single S074 objective, acceptance, synthetic contract and limits', () => {
  assert.equal(manifest.cardId, 'A-S074');
  assert.equal(manifest.parentId, 'D-S074');
  assert.equal(manifest.siblingId, 'B-S074');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S074');
  assert.equal(manifest.packet, 'SC-S074');
  assert.equal(manifest.entryGate, 'SOURCE');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.objective, 'Apply session eviction pressure; distinguish acceptable cache misses from lost required state.');
  assert.equal(manifest.sourceAcceptance, 'Eviction effects are visible; required state survives through the approved durable contract or fails explicitly.');
  assert.equal(manifest.bounds.configurations, 32);
  assert.equal(manifest.bounds.completedAttempts, 6);
  assert.equal(manifest.iac.status, 'N/A');
  assert.equal(manifest.testRuntime.dependencyChanges, false);
  for (const field of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[field].length >= 5, field);
});

test('standalone page has owned external assets, exact banner and a restrictive enforced meta CSP', () => {
  assert.equal((html.match(/Training rehearsal - synthetic data - not a live Azure result/g) || []).length, 1);
  assert.match(html, /http-equiv="Content-Security-Policy"/);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "worker-src 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|<style|on(?:click|load|submit)=|https?:\/\//i);
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['fixtures.js', 'model.js', 'app.js']);
  assert.equal((html.match(/<script/g) || []).length, scripts.length);
  for (const file of [...scripts, 'styles.css']) assert.equal(fs.existsSync(path.join(root, file)), true);
  assert.match(html, /<noscript>/);
});

test('controls expose labels, semantic announcements, native reset and history contracts', () => {
  for (const id of ['pressure', 'durable', 'response', 'prediction']) {
    assert.ok(html.includes(`<label for="${id}">`), id);
    assert.ok(html.includes(`<select id="${id}"`), id);
  }
  assert.match(html, /class="skip" href="#exercise"/);
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /id="reset-rehearsal" type="button"/);
  assert.match(html, /id="retained-proof"/);
  assert.match(read('styles.css').toString(), /:focus-visible/);
  assert.match(read('styles.css').toString(), /overflow-x: auto/);
  const app = read('app.js').toString();
  assert.doesNotMatch(app, /innerHTML|outerHTML|insertAdjacentHTML|fetch\(|XMLHttpRequest|localStorage|sessionStorage|document\.cookie|eval\(/);
  assert.match(app, /settings-form'\)\.reset\(\)/);
  assert.match(app, /prediction-form'\)\.reset\(\)/);
});

test('classic browser modules run without frameworks and agree with Node outcomes', () => {
  const context = vm.createContext({});
  new vm.Script(read('fixtures.js').toString()).runInContext(context);
  new vm.Script(read('model.js').toString()).runInContext(context);
  const browser = new vm.Script("S074Model.runCase({pressure:'capacity',durable:'current',response:'recover'})").runInContext(context);
  const node = require('../model.js').runCase(require('../fixtures.js').defaultInput);
  assert.deepEqual(JSON.parse(JSON.stringify(browser)), node);
});

test('BDD and docs distinguish optional misses, explicit failures, unknowns and non-native proof', () => {
  const feature = read('eviction.feature').toString();
  const docs = read('README.md').toString();
  for (const required of ['Capacity pressure', 'Optional expiry', 'TTL equality', 'Empty success',
    'Unavailable evidence', 'Guard ordered actions', 'Accessible local reset']) assert.ok(feature.includes(required), required);
  assert.match(docs, /1 pass, 16 genuine assertion failures/);
  assert.match(docs, /CAPTURE_BROWSER_EVIDENCE=1/);
  assert.match(docs, /B-S074 and D-S074 remain incomplete/);
  assert.match(docs, /parent alone accepts once/);
  assert.match(docs, /No actual session eviction\/cache\/durability/);
});
