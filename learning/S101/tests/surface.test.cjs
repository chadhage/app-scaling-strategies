'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8').replace(/\r\n/g, '\n');
const manifest = JSON.parse(read('manifest.json'));

test('standalone manifest declares the exact single portable unit and native limits', () => {
  assert.equal(manifest.cardId, 'A-S101');
  assert.equal(manifest.sourceId, 'S101');
  assert.deepEqual(manifest.parentIds, ['D-S101']);
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S101');
  assert.equal(manifest.packet, 'SC-S101');
  assert.equal(manifest.mode, 'local-synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.nativeSiblingComplete, false);
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.productionNode24Certified, false);
  assert.equal(manifest.browserLifecycleQualified, false);
  assert.equal(manifest.limits.maxRuns, 8);
  assert.equal(manifest.limits.maxActions, 40);
});

test('exact synthetic banner and complete journey contract are visible', () => {
  const html = read('index.html');
  assert.ok(html.includes(`>${manifest.banner}</p>`));
  for (const clause of ['profile.v1', 'release-blue-17', 'release-green-42',
    'getProfile', '100 ms', 'B-S101', 'D-S101', 'Microsoft Open Source Disclaimer']) {
    assert.ok(html.includes(clause), clause);
  }
  assert.ok(read('stable-endpoint.feature').includes('Missing completion evidence stays unknown'));
  assert.ok(read('README.md').includes('not a real gateway'));
});

test('external local assets and restrictive CSP avoid a live execution path', () => {
  const html = read('index.html');
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
  assert.equal((html.match(/<script\b/g) || []).length, 2);
  assert.doesNotMatch(html, /<script[^>]*>[^<\s]|on(?:click|submit|load|error)\s*=|\sstyle\s*=/i);
  assert.doesNotMatch(read('app.js') + read('model.js'), /\bfetch\s*\(|XMLHttpRequest|WebSocket|innerHTML|eval\s*\(/);
  for (const asset of ['styles.css', 'model.js', 'app.js']) assert.ok(fs.existsSync(path.join(root, asset)));
  assert.equal(fs.existsSync(path.join(root, 'package.json')), false);
});

test('keyboard, focused error, reset and retained-history affordances are declared', () => {
  const html = read('index.html');
  for (const id of ['condition', 'expected-outcome']) {
    assert.ok(html.includes(`<label for="${id}">`));
  }
  assert.ok(html.includes('role="alert" tabindex="-1" hidden'));
  assert.ok(html.includes('role="status" aria-live="polite"'));
  assert.ok(html.includes('Reset controls; retain history'));
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.ok(read('app.js').includes('HTMLFormElement.prototype.reset.call(form)'));
  assert.ok(read('styles.css').includes(':focus-visible'));
});

test('verification and raw-byte rules separate deliberate capture from normal checks', () => {
  assert.equal(read('.gitattributes'), 'evidence/raw/** -text -diff\nevidence/red/** -text -diff\n');
  const browser = read(path.join('tests', 'browser.test.cjs'));
  assert.ok(browser.includes("process.env.CAPTURE_BROWSER_EVIDENCE === '1'"));
  assert.ok(browser.includes('openIsolatedLesson'));
  assert.ok(browser.includes('await session.close()'));
  assert.ok(read('README.md').includes('read-only'));
});
