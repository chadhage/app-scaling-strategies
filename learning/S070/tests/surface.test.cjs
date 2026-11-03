'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { read } = require('./provenance.cjs');
const text = (file) => read(file).toString('utf8');

test('portable manifest identifies the exact frozen card, source acceptance, bounded inputs and native limits', () => {
  const manifest = JSON.parse(text('manifest.json'));
  assert.equal(manifest.cardId, 'A-S070');
  assert.equal(manifest.sourceId, 'S070');
  assert.equal(manifest.parentId, 'D-S070');
  assert.equal(manifest.siblingId, 'B-S070');
  assert.equal(manifest.packet, 'SC-S070');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S070');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.entryPoint, 'learning/S070/index.html');
  assert.equal(manifest.sourceAcceptance, 'Promotion requires the declared committed-data boundary and valid ownership; incomplete restoration cannot appear successful.');
  assert.equal(manifest.bounds.configurations, 60);
  assert.equal(manifest.bounds.completedAttempts, 6);
  assert.equal(manifest.iac.status, 'N/A');
  for (const field of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[field].length >= 4, field);
  assert.match(manifest.limits.join(' '), /B-S070.*D-S070.*incomplete/);
  assert.match(manifest.limits.join(' '), /actual database restore/);
  assert.equal(manifest.testRuntime.dependencyChanges, false);
});

test('local entry has the exact visible banner, source contract, worked assertions and labeled keyboard controls', () => {
  const html = text('index.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /<p class="banner">Training rehearsal - synthetic data - not a live Azure result<\/p>/);
  for (const id of ['boundary', 'restoration', 'ownership', 'prediction']) {
    assert.match(html, new RegExp(`<label for="${id}">`));
    assert.match(html, new RegExp(`<select id="${id}"`));
  }
  for (const id of ['stage-replica', 'verify-replica', 'promote-replica', 'check-prediction', 'new-attempt', 'reset-rehearsal']) {
    assert.match(html, new RegExp(`<button id="${id}" type="(?:button|submit)"`));
  }
  assert.match(html, /href="#controls"/);
  assert.match(html, /role="alert" tabindex="-1" hidden/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /highest receipt of 6 is insufficient/);
  assert.match(html, /B-S070.*D-S070.*incomplete/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
});

test('CSP and executable assets are local, with no management, network, inline code or unsafe injection surface', () => {
  const html = text('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "form-action 'none'", "object-src 'none'", "base-uri 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|data:/);
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['fixtures.js', 'model.js', 'app.js']);
  assert.equal((html.match(/<script/g) || []).length, scripts.length);
  for (const file of scripts) assert.ok(read(file).length);
  assert.ok(read('styles.css').length);
  assert.doesNotMatch(html, /\bon\w+\s*=|\bstyle\s*=|<iframe|<base|https?:\/\//i);
  const code = scripts.map(text).join('\n');
  assert.doesNotMatch(code, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|document\.cookie|innerHTML|outerHTML|eval\s*\(|new Function/);
  assert.doesNotMatch(text('model.js') + text('fixtures.js'), /Date\.|Math\.random|setTimeout|setInterval/);
  assert.match(text('app.js'), /event\.preventDefault\(\)/);
});

test('styles and documentation declare focus, responsive containment, read-only verification and explicit evidence opt-in', () => {
  const css = text('styles.css');
  const docs = text('README.md');
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*3px/);
  assert.match(css, /\.table-wrap\s*\{[^}]*overflow-x:\s*auto/);
  assert.match(css, /@media \(max-width: 32rem\)/);
  assert.match(css, /\[hidden\]/);
  assert.match(docs, /ordinary verification is read-only/);
  assert.match(docs, /CAPTURE_BROWSER_EVIDENCE=1/);
  assert.match(docs, /1 pass, 15 actual assertion failures/);
  assert.match(docs, /parent alone accepts once/);
  assert.match(docs, /53c0c0d/);
});
