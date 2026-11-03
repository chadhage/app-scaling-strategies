'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const owned = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(owned, file), 'utf8');
const html = read('index.html');
const manifest = JSON.parse(read('manifest.json'));

test('portable manifest identifies the exact source/card/parent, frozen unit, packet and honest mode', () => {
  for (const [key, value] of Object.entries({
    sourceId: 'S047', cardId: 'A-S047', parentId: 'D-S047', kano: 'S',
    kanoUnit: 'A-S047', packet: 'SC-S047', owner: 'worker-A-S047', executionMode: 'synthetic',
    entryPoint: 'learning/S047/index.html',
  })) assert.equal(manifest[key], value);
  assert.ok(html.includes(manifest.requiredVisibleLabel));
  assert.equal(manifest.requiredVisibleLabel, 'Training rehearsal - synthetic data - not a live Azure result');
  for (const key of ['objective', 'preconditions', 'actions', 'assertions', 'limits']) assert.ok(manifest[key].length > 0);
  assert.match(manifest.objective, /native-shaped.*browser-proxy/);
  assert.match(html, /Neither observation is a real protocol exchange/);
});

test('all inputs have labels, finite bounds and defaults; action/reset IDs do not shadow form.reset', () => {
  for (const id of ['acknowledged', 'continuation', 'native-evidence', 'proxy-evidence', 'resume-delay', 'budget']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /id="acknowledged"[^>]+min="1" max="6" step="1" value="3"/);
  assert.match(html, /id="resume-delay"[^>]+min="0" max="1000" step="1" value="40"/);
  assert.match(html, /id="budget"[^>]+min="1" max="1000" step="1" value="200"/);
  assert.doesNotMatch(html, /(?:id|name)="reset"/);
  assert.match(read('app.js'), /HTMLFormElement\.prototype\.reset\.call\(form\)/);
});

test('CSP precedes local resources and forbids network, unsafe scripts, forms and active content', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|data:/);
  assert.ok(html.indexOf('Content-Security-Policy') < html.indexOf('<script'));
  assert.deepEqual([...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].map((match) => [match[1].trim(), match[2].trim()]), [
    ['src="stream.js" defer', ''], ['src="app.js" defer', ''],
  ]);
  assert.doesNotMatch(html, /\son[a-z]+=["']|style=["']|javascript:/i);
});

test('runtime rendering is text-only with no management/network client or ambient simulation clock', () => {
  const runtime = read('stream.js') + read('app.js');
  assert.doesNotMatch(runtime, /innerHTML|outerHTML|insertAdjacentHTML|document\.write/);
  assert.doesNotMatch(runtime, /\bfetch\s*\(|XMLHttpRequest|new WebSocket|sendBeacon|https?:\/\//);
  assert.doesNotMatch(runtime, /Date\.now|new Date|Math\.random|setInterval|setTimeout/);
  assert.match(read('app.js'), /error\.focus\(\)/);
  assert.match(read('styles.css'), /:focus-visible/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
});

test('native remainder and resource-free IaC treatment are explicit without source-parent credit', () => {
  const iac = JSON.parse(read(path.join('evidence', 'iac-na.json')));
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.afterBehavioralRed, true);
  assert.equal(iac.beforeImplementation, true);
  assert.equal(iac.resourcesCreated, 0);
  assert.ok(manifest.limits.some((limit) => /B-S047.*CORE, DATA, AKS, C028, C074/.test(limit)));
  assert.ok(manifest.limits.some((limit) => /D-S047.*P003.*no source parent is complete/.test(limit)));
  assert.match(read('README.md'), /AS IS/);
  assert.equal(manifest.testRuntime.productionRuntimeApproval, false);
  assert.equal(manifest.testRuntime.dependencyChanges, false);
});

test('browser runner pins the published helper and uses isolated, awaited finally cleanup', () => {
  const browser = read(path.join('tests', 'browser.cjs'));
  assert.ok(browser.includes('86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055'));
  assert.match(browser, /openIsolatedLesson/);
  assert.match(browser, /finally\s*\{[\s\S]*await session\.close\(\)/);
  assert.match(browser, /CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /probe\.src = new URL\('tests\/csp-probe\.js'/);
  assert.match(read(path.join('tests', 'csp-probe.js')), /new Function/);
  assert.doesNotMatch(browser, /--no-sandbox|ignoreHTTPSErrors|bypassCSP|connectOverCDP|localhost|127\.0\.0\.1/);
  assert.match(read('verify.cjs'), /delete env\.CAPTURE_BROWSER_EVIDENCE/);
});
