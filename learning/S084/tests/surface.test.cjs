'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./provenance.cjs');
const fixtures = require('../fixtures.js');

test('portable manifest declares exact source objective, fixed bounds, limits and no native completion', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.cardId, 'A-S084');
  assert.equal(manifest.sourceId, 'S084');
  assert.equal(manifest.parentId, 'D-S084');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S084');
  assert.equal(manifest.packet, 'SC-S084');
  assert.equal(manifest.objective, 'Retry commands; recognize duplicate resources or unintended second swaps.');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.nativeSiblingComplete, false);
  assert.equal(manifest.sourceParentComplete, false);
  assert.deepEqual(manifest.bounds, { logicalOperations: 3, deliveriesPerAttempt: 6, maxRetainedAttempts: 4 });
  for (const field of ['preconditions', 'actions', 'expectedAssertions', 'limitations']) assert.ok(manifest[field].length);
  assert.equal(manifest.entry, 'index.html');
});

test('file surface has the exact banner, restrictive CSP, local assets and semantic keyboard/error controls', () => {
  const html = read('index.html').toString();
  assert.match(html, /<p class="banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const rule of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(policy.split('; ').includes(rule), rule);
  }
  assert.doesNotMatch(policy, /unsafe-inline|unsafe-eval|\*/);
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['fixtures.js', 'model.js', 'app.js']);
  assert.doesNotMatch(html, /\son\w+=|<script(?! src=)|style=|https?:|<iframe|name="reset"|id="reset"/i);
  for (const expected of ['role="alert" tabindex="-1" hidden', 'aria-live="polite"', 'class="skip"',
    'id="reset-all" type="button"', 'id="settings-form"', 'id="prediction-form"',
    'aria-label="Synthetic command audit" tabindex="0"', 'aria-label="Retained attempt history" tabindex="0"']) {
    assert.ok(html.includes(expected), expected);
  }
  assert.equal((html.match(/<caption>/g) || []).length, 2);
  assert.match(html, /Microsoft Open Source Disclaimer/);
});

test('runtime code has no operation, arbitrary execution, persistence, network or nondeterministic interface', () => {
  const code = ['fixtures.js', 'model.js', 'app.js'].map((file) => read(file).toString()).join('\n');
  assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|Worker|eval|Function)\s*\(|\b(?:exec|spawn|execFile)\s*\(/);
  assert.doesNotMatch(code, /node:|https?:|localStorage|sessionStorage|indexedDB|document\.cookie|\.innerHTML|insertAdjacentHTML|Math\.random|new Date|setInterval|setTimeout/);
  assert.deepEqual([...code.matchAll(/require\(([^)]+)\)/g)].map((entry) => entry[1]), ["'./fixtures.js'"]);
  const app = read('app.js').toString();
  assert.match(app, /byId\('settings-form'\)\.reset\(\)/);
  assert.match(app, /byId\('prediction-form'\)\.reset\(\)/);
  assert.match(app, /textContent/);
  assert.match(read('styles.css').toString(), /:focus-visible/);
  assert.match(read('styles.css').toString(), /overflow-x: auto/);
});

test('all fixed trace data is deeply frozen and every logical command is auditable under the same retry key', () => {
  function frozen(value) {
    if (value && typeof value === 'object') {
      assert.ok(Object.isFrozen(value));
      Object.values(value).forEach(frozen);
    }
  }
  frozen(fixtures);
  assert.equal(fixtures.first.audit.length, 3);
  assert.equal(fixtures.logicalOperations, 3);
  assert.equal(fixtures.deliveries, 6);
  for (const policy of Object.values(fixtures.cases)) for (const fixture of Object.values(policy)) {
    assert.equal(fixture.audit.length, 6);
    assert.equal(new Set(fixture.audit.map((entry) => entry.deliveryId)).size, 6);
    for (let i = 0; i < 3; i++) {
      assert.equal(fixture.audit[i].operationKey, fixture.audit[i + 3].operationKey);
      assert.equal(fixture.audit[i].payload, fixture.audit[i + 3].payload);
      assert.equal(fixture.audit[i].actor, 'synthetic-worker-084');
    }
  }
  assert.throws(() => fixtures.cases.blind.complete.resources.push('injected'), TypeError);
});
