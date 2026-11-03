'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.json'));

test('portable manifest identifies exact S067 acceptance, fixed topology and one frozen S packet', () => {
  for (const [field, expected] of Object.entries({
    cardId: 'A-S067', sourceId: 'S067', parentId: 'D-S067', nativeSibling: 'B-S067',
    kano: 'S', kanoUnit: 'A-S067', packet: 'SC-S067', owner: 'worker-A-S067',
    entryGate: 'SOURCE', executionMode: 'synthetic', entryPoint: 'learning/S067/index.html',
  })) assert.equal(manifest[field], expected);
  assert.equal(manifest.objective, 'Introduce reader lag; choose a route meeting the declared freshness requirement.');
  assert.equal(manifest.sourceAcceptance,
    'Route consistency-sensitive reads appropriately rather than silently returning unacceptable stale data.');
  assert.equal(manifest.parentAcceptance,
    'Actual lag and selected reader are shown; stale results outside the contract cannot pass as uninterrupted correctness.');
  assert.equal(manifest.bounds.configurations, 32);
  assert.equal(manifest.bounds.readers, 1);
  assert.equal(manifest.bounds.primaries, 1);
  assert.equal(manifest.bounds.retainedAttempts, 6);
  assert.equal(manifest.bounds.readsPerAttempt, 1);
  for (const field of ['preconditions', 'actions', 'assertions', 'limits']) {
    assert.ok(Array.isArray(manifest[field]) && manifest[field].length > 2);
  }
  assert.match(manifest.limits.join(' '), /B-S067.*D-S067.*incomplete/);
  assert.match(manifest.limits.join(' '), /No actual database reader lag/);
  assert.match(manifest.limits.join(' '), /abandoned browser lifecycle prototype is unqualified/);
});

test('standalone source has exact banner, labels, unique IDs, keyboard controls and no reset shadowing', () => {
  const label = 'Training rehearsal - synthetic data - not a live Azure result';
  assert.equal(manifest.requiredVisibleLabel, label);
  assert.ok(html.includes(`<p class="banner">${label}</p>`));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const field of ['lag', 'freshness', 'routing', 'coverage', 'prediction']) {
    assert.match(html, new RegExp(`<label for="${field}">`));
    assert.match(html, new RegExp(`<select id="${field}"`));
  }
  assert.match(html, /id="input-error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /id="phase" role="status"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /href="#exercise"/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/);
  assert.match(html, /id="reset-rehearsal" type="button"/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(read('styles.css'), /\[hidden\]/);
});

test('CSP is restrictive, all executable assets are local, and runtime has no networking or HTML sinks', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "form-action 'none'", "frame-src 'none'", "object-src 'none'", "base-uri 'none'",
    "worker-src 'none'", "img-src 'none'",
  ]) assert.ok(csp.split(';').map((part) => part.trim()).includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|data:/);
  const scripts = [...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]);
  assert.deepEqual(scripts, ['fixture.js', 'model.js', 'app.js']);
  assert.equal((html.match(/<script\b/g) || []).length, scripts.length);
  assert.doesNotMatch(html, /\bon\w+\s*=|\bstyle\s*=|(?:src|href)="(?:https?:|\/\/|data:)/i);
  for (const file of scripts) {
    const code = read(file);
    assert.doesNotMatch(code,
      /\b(?:fetch|WebSocket|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|eval|setTimeout|setInterval)\b|\.innerHTML\b|document\.cookie|Math\.random|new Date/);
  }
  assert.match(read('app.js'), /textContent/);
  assert.match(read('app.js'), /inputs\.reset\(\)/);
  assert.match(read('app.js'), /predictions\.reset\(\)/);
  for (const reference of [...html.matchAll(/(?:href|src)="([^"#]+)"/g)].map((match) => match[1])) {
    assert.equal(fs.existsSync(path.join(root, reference)), true, reference);
  }
});

test('BDD and worked guide keep unknown, stale failure and prediction checks separate from native proof', () => {
  const bdd = read('replica-lag.feature');
  const guide = read('README.md');
  assert.ok((bdd.match(/^  Scenario:/gm) || []).length >= 9);
  assert.match(bdd, /freshness budget of zero ticks/);
  assert.match(bdd, /UNKNOWN, never PASS/);
  assert.match(bdd, /correctly predicted failure|A correct failure prediction/);
  assert.match(guide, /32 configurations/);
  assert.match(guide, /CAPTURE_BROWSER_EVIDENCE/);
  assert.match(guide, /read-only/);
  assert.match(guide, /B-S067 and D-S067 remain incomplete/);
  assert.match(guide, /not.*S061 replica expansion/);
});
