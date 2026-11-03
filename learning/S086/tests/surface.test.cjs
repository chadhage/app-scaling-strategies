'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const manifest = JSON.parse(read('manifest.json'));

test('manifest names the exact source, frozen unit, packet and synthetic limits', () => {
  assert.equal(manifest.id, 'A-S086');
  assert.equal(manifest.sourceId, 'S086');
  assert.equal(manifest.parentId, 'D-S086');
  assert.equal(manifest.nativeSiblingId, 'B-S086');
  assert.equal(manifest.packet, 'SC-S086');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S086');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.iac, 'N/A');
  assert.equal(manifest.objective, 'Expire readiness before promotion; force revalidation instead of trusting an old green snapshot.');
  assert.equal(manifest.bounds.inputCombinations, 12);
  for (const field of ['preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[field].length);
  assert.match(manifest.acceptance, /Parent-owned.*pending/);
});

test('standalone page prominently shows the exact banner and no native proof', () => {
  assert.ok(html.includes(`<p class="banner">${manifest.banner}</p>`));
  assert.match(html, /B-S086 and D-S086 remain incomplete/);
  assert.match(html, /No actual readiness, health, time, promotion/);
  assert.match(html, /Microsoft Open Source Disclaimer/);
  assert.match(html, /no live user journeys/i);
});

test('local-only CSP and asset references require no server or external package', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'",
    "worker-src 'none'", "child-src 'none'",
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.equal((html.match(/<script\b/g) || []).length, 3);
  for (const script of html.matchAll(/<script src="([^"]+)" defer><\/script>/g)) {
    assert.ok(fs.statSync(path.join(root, script[1])).isFile());
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<style\b|style\s*=/i);
  for (const file of ['app.js', 'model.js', 'fixtures.js']) {
    assert.doesNotMatch(read(file), /fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|setTimeout|setInterval|Math\.random|Date\b|innerHTML|outerHTML|document\.write/);
  }
});

test('controls expose labels, native buttons, focusable errors and no reset shadowing', () => {
  for (const id of ['health', 'delay-ticks', 'prediction']) assert.ok(html.includes(`for="${id}"`));
  assert.match(html, /class="skip" href="#lesson"/);
  assert.match(html, /id="error" role="alert" tabindex="-1" hidden/);
  assert.match(html, /aria-live="polite"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(controls\)/);
  assert.match(app, /HTMLFormElement\.prototype\.reset\.call\(predictionForm\)/);
  assert.doesNotMatch(app, /(?:controls|predictionForm)\.reset\(/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(read('styles.css'), /overflow-x: auto/);
});

test('BDD, retained results, source traceability and explicit resource limits are documented', () => {
  assert.match(read('readiness.feature'), /Revalidation is not a permanent approval/);
  assert.match(read('readiness.feature'), /Missing revalidation cannot silently reuse the old snapshot/);
  assert.match(read('README.md'), /17 genuine ERR_ASSERTION failures/);
  assert.match(read('README.md'), /canonical Git \*\*LF\*\*/);
  assert.match(read('README.md'), /CAPTURE_BROWSER_EVIDENCE=1/);
  assert.match(html, /Retained history — no eviction/);
  assert.match(html, /All decisions/);
  assert.match(html, /Verifier/);
  assert.match(html, /Cleanup/);
});

test('zero-argument model actions reject unexpected payloads without mutation', () => {
  const lesson = require('..\\model.js').createLesson();
  for (const action of ['advance', 'revalidate', 'promote', 'newAttempt', 'reset']) {
    const before = lesson.snapshot();
    assert.throws(() => lesson[action]({ unexpected: true }), { name: 'RangeError' });
    assert.deepEqual(lesson.snapshot(), before);
  }
  const input = { health: 'healthy', delayTicks: 2, [Symbol('extra')]: true };
  assert.throws(() => lesson.start(input), { name: 'RangeError' });
});
