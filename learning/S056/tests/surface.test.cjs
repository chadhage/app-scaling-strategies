'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.json'));

test('standalone lesson declares precise source objective, bounds, synthetic label and evidence limits', () => {
  assert.deepEqual([manifest.cardId, manifest.sourceId, manifest.parentId, manifest.packet,
    manifest.kano, manifest.kanoUnit, manifest.entryGate],
  ['A-S056', 'S056', 'D-S056', 'SC-S056', 'S', 'A-S056', 'SOURCE']);
  assert.equal(manifest.objective, 'Mix producer/consumer schemas; choose compatibility checks before introducing a new producer.');
  assert.equal(manifest.sourceAcceptance,
    'Events remain interpretable and effects correct across overlap; incompatible producers are blocked before expansion.');
  assert.ok(html.includes(`>${manifest.requiredVisibleLabel}</p>`));
  assert.equal(manifest.executionMode, 'synthetic');
  assert.deepEqual(manifest.bounds, { matrixCellsPerAttempt: 4, maximumRetainedAttempts: 8,
    allowedConfigurations: 36, predictionsPerAttempt: 1, retries: 0 });
  for (const key of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[key].length >= 4);
  assert.equal(manifest.iac.status, 'N/A');
  assert.equal(manifest.testRuntime.productionNode24Certification, false);
  assert.equal(manifest.testRuntime.dependencyChanges, false);
  for (const text of ['B-S056', 'D-S056', 'no event broker', 'Node 24', 'IaC: N/A']) assert.ok(html.includes(text), text);
  assert.ok(read('USAGE.txt').includes('CAPTURE_BROWSER_EVIDENCE'));
});

test('local external assets and restrictive CSP exclude inline code, management calls and persistent state', () => {
  const policy = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "form-action 'none'", "base-uri 'none'", "object-src 'none'",
    "frame-src 'none'", "worker-src 'none'", "img-src 'none'"]) assert.ok(policy.includes(directive));
  assert.doesNotMatch(policy, /unsafe-|https?:|data:/);
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 2);
  assert.deepEqual(scripts.map((match) => match[1].match(/src="([^"]+)"/)[1]), ['model.js', 'app.js']);
  for (const script of scripts) {
    assert.match(script[1], /\bdefer\b/);
    assert.equal(script[2].trim(), '');
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<iframe|<base|<object|<embed|https?:\/\//i);
  for (const file of ['model.js', 'app.js']) {
    assert.doesNotMatch(read(file), /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval)\s*\(|sendBeacon|localStorage|sessionStorage|innerHTML|document\.write|Math\.random|Date\.now/);
  }
  assert.ok(read('styles.css').includes(':focus-visible'));
  for (const file of ['model.js', 'app.js', 'styles.css']) assert.ok(fs.statSync(path.join(root, file)).size < 26000);
});

test('accessible native controls have unique IDs, associated labels, live errors and an unshadowed reset', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['schema', 'oldReader', 'checks', 'observation', 'prediction']) {
    assert.ok(html.includes(`<label for="${id}">`));
    assert.ok(html.includes(`<select id="${id}" name="${id}"`));
  }
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(html, /id="reset-all" type="button"/);
  assert.match(html, /id="error" role="alert" aria-live="assertive"/);
  assert.match(html, /id="outcome"[^>]+role="status"/);
  assert.match(html, /class="skip" href="#exercise"/);
  assert.match(html, /id="exercise" tabindex="-1"/);
  assert.match(html, /<caption>Fixed four-cell/);
  assert.ok(read('app.js').includes('form.reset()'));
  assert.ok(read('app.js').includes("get('schema').focus()"));
});

test('owned runtime and verification JavaScript syntax is valid', () => {
  const files = ['model.js', 'app.js', ...fs.readdirSync(path.join(root, 'tests'))
    .filter((name) => /\.(?:cjs|js)$/.test(name)).map((name) => path.join('tests', name))];
  for (const file of files) {
    const result = spawnSync(process.execPath, ['--check', path.join(root, file)], { encoding: 'utf8', timeout: 10000 });
    assert.ifError(result.error);
    assert.equal(result.status, 0, `${file}: ${result.stderr}`);
  }
});
