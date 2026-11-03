'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const manifest = JSON.parse(read('manifest.json'));

test('manifest preserves exact source, frozen S unit, owner, packet and portable objective', () => {
  for (const [key, value] of Object.entries({
    cardId: 'A-S045', sourceId: 'S045', parentId: 'D-S045', kano: 'S',
    kanoUnit: 'A-S045', packet: 'SC-S045', owner: 'worker-A-S045', executionMode: 'synthetic',
  })) assert.equal(manifest[key], value);
  assert.equal(manifest.entryPoint, 'learning/S045/index.html');
  for (const field of ['objective', 'preconditions', 'actions', 'input', 'assertions', 'limits']) {
    assert.ok(manifest[field].length > 0, field);
  }
  assert.match(manifest.objective, /acknowledged cursor/);
  assert.equal(manifest.bounds.attempts, 8);
  assert.equal(manifest.bounds.maximumReplayFrames, 7);
});

test('the exact synthetic banner is prominent and native/source-parent limits stay visible', () => {
  const label = 'Training rehearsal - synthetic data - not a live Azure result';
  assert.equal(manifest.requiredVisibleLabel, label);
  assert.ok(html.includes(`<p class="banner">${label}</p>`));
  assert.match(html, /B-S045 is separate/);
  assert.match(html, /D-S045 acceptance remain unverified/);
  assert.match(html, /v1 frame:/);
  assert.match(html, /v2 frame:/);
});

test('local asset allowlist has no inline script, inline style or event handlers', () => {
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['fixtures.js', 'model.js', 'app.js']);
  assert.deepEqual([...html.matchAll(/<link rel="stylesheet" href="([^"]+)">/g)].map((match) => match[1]),
    ['styles.css']);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|\sstyle\s*=|<style\b|javascript:|https?:|<iframe\b|<object\b/i);
  assert.equal((html.match(/<script\b/g) || []).length, 3);
  for (const file of ['fixtures.js', 'model.js', 'app.js', 'styles.css']) assert.ok(read(file).length > 0);
});

test('CSP is restrictive without unsafe-inline, unsafe-eval, forms or connections', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'",
    "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(csp.split(';').map((entry) => entry.trim()).includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-|https?:|data:|\*/);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
});

test('runtime has no network, credentials, persistent state, HTML sinks or wall-clock scheduling', () => {
  for (const file of ['fixtures.js', 'model.js', 'app.js']) {
    assert.doesNotMatch(read(file),
      /\bfetch\s*\(|XMLHttpRequest|new\s+WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|document\.cookie|\b(?:innerHTML|outerHTML|insertAdjacentHTML)\b|\beval\s*\(|new\s+Function|\bset(?:Timeout|Interval)\s*\(|\bDate\s*[.(]|Math\.random/,
      file);
    assert.doesNotMatch(read(file), /https?:|Bearer\s|BEGIN (?:RSA |EC )?PRIVATE KEY|client_secret/);
  }
  assert.match(app, /node\.textContent = text/);
  assert.match(app, /event\.preventDefault\(\)/);
});

test('all controls have labels, no native-reset shadow, normal buttons and visible keyboard focus', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /href="#lesson"/);
  for (const id of [
    'cursor', 'replay-protection', 'delivery', 'decoder', 'state-retention',
    'observation', 'gap-ms', 'budget-ms', 'prediction',
  ]) assert.ok(html.includes(`for="${id}"`), id);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.doesNotMatch(app, /form\.reset\s*\(/);
  assert.match(html, /id="reset-rehearsal" type="button"/);
  assert.match(html, /id="input-error" role="alert"/);
  assert.match(html, /id="phase" role="status"/);
  assert.match(read('styles.css'), /:focus-visible\s*\{/);
  assert.match(read('styles.css'), /\[hidden\]/);
});

test('IaC N/A was explicitly decided after RED, with no production or deployment approval', () => {
  const red = JSON.parse(read(path.join('evidence', 'red', 'run.json')));
  assert.equal(manifest.iac.status, 'N/A');
  assert.match(manifest.iac.decisionStage, /after.*RED.*before implementation/);
  assert.equal(manifest.iac.redCompletedAtUtc, red.finishedAtUtc);
  assert.equal(manifest.testRuntime.productionNode24Approval, false);
  assert.equal(manifest.testRuntime.dependencyChanges, false);
  assert.match(manifest.iac.reason, /Resource-free/);
});

test('browser automation pins only the published helper and requires deliberate proof capture', () => {
  const helper = path.resolve(root, '..', '..', 'testing', 'browser', 'isolated.cjs');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(helper)).digest('hex');
  assert.equal(hash, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.equal(manifest.testRuntime.browserHelperSha256, hash);
  const browserTest = read(path.join('tests', 'browser.test.cjs'));
  assert.match(browserTest, /openIsolatedLesson/);
  assert.match(browserTest, /finally\s*\{/);
  assert.match(browserTest, /await session\.close\(\)/);
  assert.match(browserTest, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.doesNotMatch(browserTest, /launch\s*\(|connectOverCDP|--no-sandbox|ignoreHTTPSErrors|bypassCSP\s*:\s*true/);
});
