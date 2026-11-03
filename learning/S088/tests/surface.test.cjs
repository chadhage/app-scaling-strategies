'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const lesson = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(lesson, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));
const html = read('index.html');
const app = read('app.js');

test('the portable manifest declares exact source objective, fixed envelope and single S unit', () => {
  assert.equal(manifest.cardId, 'A-S088');
  assert.equal(manifest.parentId, 'D-S088');
  assert.equal(manifest.sourceId, 'S088');
  assert.equal(manifest.packet, 'SC-S088');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S088');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.objective, 'Deny an operation; identify an invalid success-shaped error response.');
  assert.equal(manifest.banner, 'Training rehearsal - synthetic data - not a live Azure result');
  assert.ok(html.includes(`>${manifest.banner}</p>`));
  assert.equal(manifest.syntheticInputs.maxAttempts, 6);
  assert.deepEqual(manifest.syntheticInputs.decisions, ['denied', 'allowed', 'unknown']);
  for (const key of ['preconditions', 'actions', 'expectedAssertions', 'limits']) assert.ok(manifest[key].length >= 3);
  assert.equal(manifest.acceptance.acceptedAtUtc, null);
});

test('only same-bundle external scripts and styles are loaded and exist', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)];
  assert.equal(scripts.length, 2);
  const sources = scripts.map((match) => {
    assert.equal(match[2].trim(), '');
    assert.match(match[1], /\bdefer\b/);
    return /src="([^"]+)"/.exec(match[1])[1];
  });
  assert.deepEqual(sources, ['model.js', 'app.js']);
  const assets = [...sources, ...[...html.matchAll(/<link[^>]+href="([^"]+)"/g)].map((match) => match[1])];
  for (const asset of assets) {
    assert.match(asset, /^[a-z0-9.-]+$/);
    assert.ok(fs.statSync(path.join(lesson, asset)).isFile());
  }
  assert.doesNotMatch(html, /\bon[a-z]+\s*=|<style\b|<iframe\b|<object\b|\bstyle\s*=/i);
});

test('CSP explicitly blocks connections, inline execution and form navigation', () => {
  const policy = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  const directives = Object.fromEntries(policy.split(';').map((part) => part.trim().split(/\s+/)).map(([key, ...values]) => [key, values.join(' ')]));
  for (const name of ['default-src', 'connect-src', 'img-src', 'font-src', 'object-src', 'base-uri', 'form-action', 'frame-src', 'worker-src']) {
    assert.equal(directives[name], "'none'");
  }
  assert.equal(directives['script-src'], "'self'");
  assert.equal(directives['style-src'], "'self'");
  assert.doesNotMatch(policy, /unsafe-|https?:|data:/);
});

test('operator controls, live results and retained history have keyboard/accessibility hooks', () => {
  for (const id of ['decision', 'response']) {
    assert.ok(html.includes(`<label for="${id}">`));
    assert.ok(html.includes(`<select id="${id}"`));
  }
  assert.match(html, /<button id="run-lesson" type="submit">/);
  assert.match(html, /<button id="reset-lesson" type="button">/);
  assert.match(html, /role="alert" hidden/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<caption>/);
  assert.match(html, /scope="col"/);
  assert.match(html, /class="skip" href="#controls"/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(app, /decision\.focus\(\)/);
});

test('reset does not shadow form.reset and rendering has no network or dynamic-code path', () => {
  assert.doesNotMatch(html, /(?:id|name)="(?:reset|submit)"/);
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /textContent/);
  assert.doesNotMatch(app + read('model.js'), /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|eval|Function)\s*\(|innerHTML|localStorage|sessionStorage|document\.cookie|https?:\/\//);
});

test('BDD and instructions specify the exact denied-error lesson rather than a nearby scenario', () => {
  const feature = read('permission-failure.feature');
  for (const text of ['PermissionDenied', 'safe abort', 'success-shaped', 'unknown', 'six', 'reset']) {
    assert.ok((feature + read('README.md')).toLowerCase().includes(text.toLowerCase()));
  }
  assert.ok(manifest.expectedAssertions.some((text) => text.includes('PermissionDenied')));
  assert.ok(manifest.expectedAssertions.some((text) => text.includes('unknown')));
  assert.ok(manifest.limits.some((text) => text.includes('native')));
});
