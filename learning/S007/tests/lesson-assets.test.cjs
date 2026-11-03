'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const app = read('app.js');
const css = read('style.css');
const modelSource = read('model.js');
const manifest = JSON.parse(read('lesson.json'));

test('manifest preserves A-S007 identity, class, parent and synthetic boundaries', () => {
  assert.equal(manifest.cardId, 'A-S007');
  assert.equal(manifest.workerId, 'worker-A-S007');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S007');
  assert.equal(manifest.sourceId, 'S007');
  assert.equal(manifest.parentId, 'D-S007');
  assert.equal(manifest.packet, 'SC-S007');
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.nativeProof, false);
  assert.equal(manifest.sourceParentComplete, false);
});

test('exact training label is prominent and the exercise documents its assertions and limits', () => {
  const label = 'Training rehearsal - synthetic data - not a live Azure result';
  assert.equal(manifest.label, label);
  assert.ok(html.includes(`<p class="banner">${label}</p>`));
  assert.ok(html.indexOf(label) < html.indexOf('<h1>'));
  assert.ok(manifest.preconditions.length >= 4);
  assert.ok(manifest.actions.length >= 8);
  assert.ok(manifest.expectedAssertions.length >= 8);
  assert.match(html, /not HTTP traffic or Azure logs/);
  assert.match(html, /No live Azure\/native proof/);
});

test('CSP allows only local scripts/styles and blocks connection, framing, and form actions', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp);
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "base-uri 'none'", "form-action 'none'", "object-src 'none'", "frame-src 'none'", "worker-src 'none'"
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https?:|data:/);
});

test('assets use only relative inert paths, external scripts and no inline handlers', () => {
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    assert.doesNotMatch(match[1], /^[a-z]+:|^\/\/|^\//i);
    if (!match[1].startsWith('#') && match[1] !== 'evidence.json') {
      assert.equal(fs.existsSync(path.join(root, match[1])), true, match[1]);
    }
  }
  assert.doesNotMatch(html, /\son[a-z]+\s*=|javascript:|<base\b|<iframe\b|<style\b/i);
  for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)) {
    assert.match(match[1], /src="(?:model|app)\.js"/);
    assert.match(match[1], /\bdefer\b/);
    assert.equal(match[2].trim(), '');
  }
});

test('runtime contains no networking, credentials, persistent storage, or HTML injection sinks', () => {
  const runtime = `${app}\n${modelSource}`;
  assert.doesNotMatch(runtime, /\bfetch\s*\(|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|document\.cookie/);
  assert.doesNotMatch(runtime, /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|new Function/);
  assert.doesNotMatch(runtime, /clientSecret|accessToken|connectionString|management\.azure\.com/i);
  assert.match(app, /textContent/);
  assert.match(app, /replaceChildren/);
});

test('all controls have unique labels and no native reset/submit method is shadowed', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const match of html.matchAll(/<(?:input|select)\b[^>]*\bid="([^"]+)"/g)) {
    assert.ok(html.includes(`<label for="${match[1]}">`), match[1]);
  }
  assert.doesNotMatch(html, /\b(?:id|name)="(?:reset|submit)"/);
  assert.match(html, /type="submit" id="apply-action"/);
  assert.match(html, /type="button" id="reset-rehearsal"/);
  assert.match(app, /event\.preventDefault\(\)/);
  assert.match(app, /form\.reset\(\)/);
  assert.match(app, /state = model\.start\(\)/);
});

test('each model action is selectable and keyboard/announcements are supported', () => {
  const model = require('../model.js');
  for (const action of model.actions) assert.ok(html.includes(`<option value="${action}">`), action);
  assert.match(html, /class="skip-link" href="#exercise"/);
  assert.match(html, /form id="exercise" tabindex="-1"/);
  assert.match(html, /id="action-status" role="status" aria-live="polite"/);
  assert.match(css, /:focus-visible/);
  assert.match(css, /overflow-x: auto/);
  assert.match(css, /@media/);
});

test('drain, rollback retention, work and observed requests have distinct visible outputs', () => {
  for (const id of [
    'drain-state', 'retention-state', 'retirement-state', 'retirement-blockers',
    'work-state', 'session-rows', 'request-rows', 'request-counts', 'safety-verdict', 'user-impact'
  ]) assert.ok(html.includes(`id="${id}"`), id);
  assert.match(html, /No request is invented/);
  assert.match(html, /UNSAFE: force blue retirement/);
});

test('IaC N/A was explicitly recorded between red and implementation', () => {
  const iac = JSON.parse(read('evidence/iac.json'));
  assert.equal(manifest.iac.status, 'N/A');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.resourcesCreated, 0);
  assert.equal(iac.nativeProof, false);
  assert.match(iac.stage, /After genuine behavioral red; before implementation/);
  assert.match(iac.reason, /No Azure resource/);
});

test('preserved red is a loadable behavior stub with real assertion failures', () => {
  const crypto = require('node:crypto');
  const red = JSON.parse(read('evidence/red-run.json'));
  const stub = require('../evidence/red-stub.js');
  assert.equal(typeof stub.apply, 'function');
  assert.equal(red.exitCode, 1);
  assert.equal(red.tests, 45);
  assert.equal(red.failed, 41);
  assert.equal(red.passed, 4);
  assert.equal(crypto.createHash('sha256').update(read('evidence/red-stub.js')).digest('hex').toUpperCase(), red.sha256.stub);
  assert.match(read('evidence/red.txt'), /AssertionError \[ERR_ASSERTION\]/);
  assert.doesNotMatch(read('evidence/red.txt'), /MODULE_NOT_FOUND|SyntaxError|command not found/);
});
