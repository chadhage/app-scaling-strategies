'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const types = require('..\\errors.js');
const manifest = require('..\\manifest.json');
const { root } = require('./provenance.cjs');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('frozen C019 original S/P0/H004 gate, parent limits and read-only contract are explicit', () => {
  assert.equal(manifest.cardId, 'C019');
  assert.equal(manifest.kanoUnit, 'C019');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.priority, 'P0');
  assert.equal(manifest.packet, 'H004');
  assert.deepEqual(manifest.parents, ['H004', 'H008']);
  assert.equal(manifest.technicalEntryGate, 'C015');
  assert.equal(manifest.acceptedC015Commit, '78341b3370d7764b7f9c3eacc1796892dbc4f40f');
  assert.equal(manifest.parentAcceptanceRequired, true);
  assert.equal(manifest.maximumOriginalUnitCredits, 1);
  assert.equal(manifest.extraCredits, 0);
  assert.equal(manifest.iac, 'N/A');
  assert.equal(manifest.httpServer, false);
  for (const field of ['browserFilesystemInspection', 'browserRecovery', 'browserWriteAuthorization',
    'recoveryConfirmed', 'cloudExecution', 'realUserData', 'credentials', 'provisioning', 'deployment',
    'spend', 'productionNode24Validated']) assert.equal(manifest[field], false);
});
test('browser controls, exact banner, errors, unknowns and history are keyboard-oriented semantic HTML', () => {
  const html = read('index.html');
  assert.match(html, /id="banner"[^>]*>Training rehearsal - synthetic data - not a live Azure result</);
  for (const id of ['case-id', 'action-id']) assert.match(html, new RegExp(`label for="${id}"`));
  assert.match(html, /role="alert" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /Reset presentation only/);
  assert.match(html, /Earlier acknowledgment — historical, NOT this failed request or current state/);
  assert.match(html, /UNKNOWN — not inferred from an earlier acknowledgment/);
  assert.match(html, /<ol id="history"><\/ol>/);
  assert.match(html, /Historical teaching observations, not live filesystem recovery/);
  assert.match(read('styles.css'), /:focus-visible/);
});
test('CSP denies connections, inline code, worker, frame, base, object and form navigation', () => {
  const html = read('index.html');
  for (const policy of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "worker-src 'none'", "frame-src 'none'", "object-src 'none'",
    "base-uri 'none'", "form-action 'none'"]) assert.ok(html.includes(policy));
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval|on(?:click|change|submit)=/i);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
});
test('browser modules have no network, browser storage, dynamic HTML or filesystem capability', () => {
  const source = ['app.js', 'recovery.js', 'errors.js'].map(read).join('\n');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|Worker|localStorage|sessionStorage|indexedDB)\s*[\.(]/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\s*\(|new Function/);
  assert.doesNotMatch(source, /node:fs|node:child_process|node:http|createServer|\.listen\s*\(/);
  assert.match(read('app.js'), /crypto\.subtle\.digest\('SHA-256'/);
  assert.match(read('app.js'), /console\.resetView\(\)/);
  assert.doesNotMatch(read('app.js'), /C015.*persist|require\(/);
});
test('actual Node adapter imports public restore only; only explicit test setup code imports persist', () => {
  const source = read('inspect.cjs');
  assert.match(source, /const \{ restore \} = require\('\.\.\\\\C015\\\\store\.cjs'\)/);
  assert.doesNotMatch(source, /\bpersist\b|node:fs|node:child_process|unlink|mkdir|rename|createServer/);
  assert.match(source, /instanceof FixtureError/);
  assert.match(source, /recoveryConfirmed: false/);
  assert.match(read('tests\\fixture-worker.cjs'), /const \{ persist, restore \}/);
});
test('typed declarations close codes, actions, pending state, read-only receipts and notifications', () => {
  const declaration = read('recovery.d.ts');
  for (const code of types.knownCodes) assert.ok(declaration.includes(`'${code}'`));
  for (const action of Object.keys(types.actions)) assert.ok(declaration.includes(`'${action}'`));
  for (const code of Object.keys(types.notices)) assert.ok(declaration.includes(`'${code}'`));
  assert.match(declaration, /from '\.\.\\\\C015\\\\store\.cjs'/);
  assert.match(declaration, /readonly recoveryConfirmed: false/);
  assert.match(declaration, /readonly writesAuthorized: false/);
  assert.doesNotMatch(declaration, /readonly code: string/);
});
test('normal verifier strips all capture authority; capture requires exact opt-in and exclusive files', () => {
  const verifier = read('tests\\verify.cjs');
  assert.match(verifier, /delete env\.CAPTURE_BROWSER_EVIDENCE/);
  assert.match(verifier, /delete env\.C019_CAPTURE_DIRECTORY/);
  assert.match(verifier, /assert\.deepEqual\(inventory\(\), before/);
  assert.match(verifier, /assert\.deepEqual\(dependencies\(\), dependencyBefore/);
  const capture = read('tests\\capture.cjs');
  assert.match(capture, /process\.env\.CAPTURE_BROWSER_EVIDENCE, '1'/);
  assert.match(capture, /flag: 'wx'/);
  assert.match(capture, /randomUUID\(\)/);
  assert.doesNotMatch(capture, /writeFileSync\([^;]+flag: 'w'/);
});
