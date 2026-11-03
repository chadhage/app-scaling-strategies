'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const manifest = JSON.parse(read('manifest.json'));

test('manifest maps exact S054, one frozen unit, packet, owned entry and bounded data operations', () => {
  assert.deepEqual([manifest.cardId, manifest.sourceId, manifest.parentId, manifest.kano,
    manifest.kanoUnit, manifest.packet, manifest.owner, manifest.entryGate],
  ['A-S054', 'S054', 'D-S054', 'S', 'A-S054', 'SC-S054', 'worker-A-S054', 'SOURCE']);
  assert.equal(manifest.entryPoint, 'learning/S054/index.html');
  assert.equal(manifest.executionMode, 'synthetic');
  assert.equal(manifest.bounds.records, 4);
  assert.equal(manifest.bounds.attempts, 6);
  assert.equal(manifest.bounds.eventsPerAttempt, 12);
  assert.equal(manifest.iac.status, 'N/A');
  assert.ok(manifest.preconditions.length >= 5);
  assert.ok(manifest.actions.length >= 5);
  assert.ok(manifest.assertions.some((entry) => /no old consumers and no old work/.test(entry)));
  assert.match(manifest.limits.join(' '), /no real database|no native Azure/i);
  assert.match(manifest.limits.join(' '), /B-S054 and D-S054 remain separate and unfulfilled/);
});

test('standalone HTML is truthfully labeled with only local static resources and an early restrictive CSP', () => {
  const html = read('index.html');
  assert.match(html, /Training rehearsal - synthetic data - not a live Azure result/);
  assert.match(html, /No real database, SQL/);
  const cspAt = html.indexOf('http-equiv="Content-Security-Policy"');
  assert.ok(cspAt > 0 && cspAt < html.indexOf('<script'));
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "worker-src 'none'"]) {
    assert.ok(html.includes(directive), directive);
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|\son[a-z]+\s*=|<script(?![^>]*\bsrc=)[^>]*>/i);
  for (const resource of [...html.matchAll(/(?:src|href)="([^"]+)"/g)].map((match) => match[1])) {
    if (!resource.startsWith('#')) {
      assert.doesNotMatch(resource, /^(?:https?:|\/\/|data:|javascript:)/i);
      assert.ok(fs.existsSync(path.join(root, resource)), resource);
    }
  }
});

test('operator controls, live results, labels, history bounds and explicit non-shadowing reset are present', () => {
  const html = read('index.html');
  const js = read('lesson.js');
  for (const id of ['migration', 'observation', 'old-consumers', 'old-work']) {
    assert.match(html, new RegExp(`<label for="${id}">`));
  }
  for (const id of ['begin', 'expand', 'migrate', 'contract', 'upgrade', 'drain',
    'new-attempt', 'reset-rehearsal', 'input-error', 'history-limit', 'event-limit', 'history', 'trace']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /aria-atomic="true"/);
  assert.match(read('styles.css'), /:focus-visible\s*\{\s*outline: 3px solid/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.doesNotMatch(js, /\.reset\s*\(/);
  assert.match(js, /document\.createElement\('details'\)/);
  assert.match(js, /restoreDefaults/);
});

test('runtime stays deterministic, synthetic and free of network, identities, external packages and persistent storage', () => {
  const js = ['fixtures.js', 'model.js', 'lesson.js'].map(read).join('\n');
  assert.doesNotMatch(js, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB/);
  assert.doesNotMatch(js, /Math\.random|Date\.now|setInterval|setTimeout|https?:|az login|client_secret|access_token/);
  assert.doesNotMatch(js, /\.innerHTML\s*=|insertAdjacentHTML|document\.write/);
  assert.deepEqual(fs.readdirSync(root).filter((name) => /package.*\.json|azure\.yaml|Dockerfile|\.bicep$|\.tf$/.test(name)), []);
  const browser = read(path.join('tests', 'browser.test.cjs'));
  assert.match(browser, /openIsolatedLesson\('learning\\\\S054\\\\index\.html'\)/);
  assert.match(browser, /finally[\s\S]*await session\.close\(\)/);
  assert.match(browser, /CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.doesNotMatch(browser, /chromium\.launch|bypassCSP:\s*true|--no-sandbox|ignoreHTTPSErrors/);
});
