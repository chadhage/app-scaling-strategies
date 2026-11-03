'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('portable entry has exact training label, source acceptance, controls and no hosted prerequisite', () => {
  const html = read('index.html');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /Roll back after schema evolution; distinguish compatible reversal from required forward recovery\./);
  assert.match(html, /Compatible rollback preserves data; irreversible changes invoke explicit forward recovery,/);
  assert.match(html, /not a fake successful reversal/);
  for (const id of ['mode', 'observation', 'evolve', 'rollback', 'forward', 'reset-rehearsal']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /class="skip"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /Reload intentionally starts a new/);
  assert.doesNotMatch(html, /<input|<iframe|on(?:click|load|submit)=|style=|name="reset"|id="reset"/i);
});

test('CSP is restrictive and external scripts/styles are owned resources, not inline exceptions', () => {
  const html = read('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    "frame-src 'none'", "worker-src 'none'"]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['fixtures.js', 'model.js', 'app.js']);
  assert.match(html, /href="styles.css"/);
});

test('runtime uses safe text rendering, fixed local actions and unshadowable native reset', () => {
  const app = read('app.js');
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(form\)/);
  assert.match(app, /textContent/);
  assert.match(app, /error\.focus\(\)/);
  assert.doesNotMatch(app, /innerHTML|outerHTML|document\.write|eval\(|new Function|fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|setInterval|setTimeout/);
  for (const file of ['app.js', 'model.js', 'fixtures.js']) {
    assert.doesNotMatch(read(file), /https?:\/\/|navigator\.credentials|client_secret|access_token|password|Authorization:/i);
  }
});

test('fixtures expose exactly the schema incompatibility used by the source acceptance', () => {
  const fixtures = require('../fixtures.js');
  assert.equal(fixtures.baseline.length, 2);
  assert.equal(fixtures.compatible.length, 3);
  assert.equal(fixtures.irreversible.length, 3);
  assert.ok(fixtures.compatible.every((row) => Number.isSafeInteger(row.totalCents)));
  assert.ok(fixtures.irreversible.every((row) => !Object.hasOwn(row, 'totalCents')));
  assert.equal(fixtures.irreversible[2].currency, 'EUR');
  assert.equal(fixtures.irreversible[2].minorUnits, 700);
  assert.equal(fixtures.maxHistory, 12);
  assert.equal(fixtures.budgetMs, 10);
});

test('BDD names compatible preservation, rejected reversal, forward recovery and honest outcomes', () => {
  const feature = read('schema-recovery.feature');
  assert.match(feature, /Compatible reversal preserves new committed data/);
  assert.match(feature, /An irreversible old-contract break cannot fake a reversal/);
  assert.match(feature, /explicitly chooses forward recovery/);
  assert.match(feature, /missing-row/);
  assert.match(feature, /unknown/);
  assert.match(feature, /Reset cannot erase/);
  assert.match(feature, /thirteenth/);
});
