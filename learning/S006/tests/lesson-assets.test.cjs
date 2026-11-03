'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const lesson = path.join(__dirname, '..');
function read(name) {
  const file = path.join(lesson, name);
  assert.ok(fs.existsSync(file), `required local asset ${name} exists`);
  return fs.readFileSync(file, 'utf8');
}

test('lesson is standalone with an exact prominent rehearsal banner and visible lineage', () => {
  const html = read('index.html');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  for (const id of ['A-S006', 'D-S006', 'S006', 'LP-PROFILE', 'B-S006', 'C001']) {
    assert.ok(html.includes(id), `${id} is visible`);
  }
  assert.match(html, /<h1[\s>]/);
  assert.match(html, /<noscript>/);
  assert.match(html, /https:\/\/learn\.microsoft\.com\/azure\/app-service\/overview-authentication-authorization/);
  assert.match(html, /not endorsed by Microsoft/);
});

test('CSP denies network connections, forms, base changes, plugins, and inline execution', () => {
  const html = read('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
  assert.ok(csp, 'explicit CSP meta tag');
  for (const directive of [
    "default-src 'none'", "connect-src 'none'", "script-src 'self'",
    "style-src 'self'", "base-uri 'none'", "form-action 'none'", "object-src 'none'"
  ]) assert.ok(csp[1].includes(directive), directive);
  assert.doesNotMatch(csp[1], /unsafe-inline|unsafe-eval|https?:|\*/);
  assert.doesNotMatch(html, /\s(?:onclick|onload|onchange|style)=/i);
});

test('scripts and style are local and ordered without inline script bodies', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.equal(scripts.length, 3);
  assert.deepEqual(scripts.map((match) => match[1].match(/src="([^"]+)"/)[1]), [
    'model.js', 'verifier.js', 'app.js'
  ]);
  assert.ok(scripts.every((match) => match[1].includes('defer') && !match[2].trim()));
  assert.match(html, /rel="stylesheet" href="style\.css"/);
  assert.ok(read('style.css').includes(':focus-visible'));
});

test('local JavaScript has no network, authentication SDK, storage, or dynamic code APIs', () => {
  const forbidden = /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|serviceWorker|localStorage|sessionStorage|document\.cookie|\beval\s*\(|new Function/;
  for (const file of ['model.js', 'verifier.js', 'app.js']) {
    const source = read(file);
    assert.doesNotMatch(source, forbidden, file);
    assert.doesNotMatch(source, /https?:\/\//, file);
    assert.doesNotThrow(() => new vm.Script(source, { filename: file }));
  }
});

test('UMD browser globals execute offline without CommonJS or any DOM dependency', () => {
  const context = vm.createContext({});
  vm.runInContext(read('model.js'), context, { filename: 'model.js' });
  vm.runInContext(read('verifier.js'), context, { filename: 'verifier.js' });
  const result = vm.runInContext(`(() => {
    const allowed = PreviewModel.runProbe({
      identity: 'approved', route: 'join-preview', policy: 'enforced', callback: 'bound'
    });
    const unknown = PreviewModel.runProbe({
      identity: 'missing', route: 'indirect-gateway', policy: 'enforced', callback: 'bound'
    });
    const exposed = PreviewModel.runProbe({
      identity: 'visitor', route: 'direct-api', policy: 'obscurity-only', callback: 'bound'
    });
    return JSON.stringify({
      allowed: allowed.version,
      valid: PreviewVerifier.verifyProbe(allowed).passed,
      unknown: unknown.decision,
      unknownValid: PreviewVerifier.verifyProbe(unknown).passed,
      exposedValid: PreviewVerifier.verifyProbe(exposed).passed,
      exposure: PreviewVerifier.describeImpact(exposed).unauthorizedExposure
    });
  })()`, context);
  assert.deepEqual(JSON.parse(result), {
    allowed: 'v2', valid: true, unknown: 'unknown',
    unknownValid: true, exposedValid: false, exposure: true
  });
});

test('core controls have explicit labels, live status, and separate result regions', () => {
  const html = read('index.html');
  for (const id of ['identity', 'route', 'policy', 'callback']) {
    assert.ok(html.includes(`for="${id}"`), `label for ${id}`);
    assert.match(html, new RegExp(`<select[^>]+id="${id}"`));
  }
  assert.match(html, /id="live-status"[^>]+aria-live="polite"/);
  for (const id of [
    'verifier-result', 'user-impact', 'ga-impact', 'cleanup-result',
    'trace-body', 'assertion-body', 'history', 'comparison-body'
  ]) assert.ok(html.includes(`id="${id}"`), `separate ${id} region`);
  assert.match(html, /<caption/);
  assert.match(html, /type="submit" id="run-probe"/);
  assert.match(html, /type="button" id="reset"/);
});

test('lesson-local manifest preserves scope, packet, and the ungranted IaC gates', () => {
  const manifest = JSON.parse(read('lesson.json'));
  assert.equal(manifest.cardId, 'A-S006');
  assert.equal(manifest.kanoUnit, 'A-S006');
  assert.equal(manifest.parentId, 'D-S006');
  assert.equal(manifest.sourceId, 'S006');
  assert.equal(manifest.packet, 'LP-PROFILE');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entry, 'learning/S006/index.html');
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.sourceParentComplete, false);
  assert.equal(manifest.iac.status, 'N/A');
  assert.ok(manifest.iac.reason.includes('C001'));
});
