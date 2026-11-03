'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('portable entry has the exact visible synthetic disclaimer and restrictive CSP', () => {
  const html = read('index.html');
  assert.ok(html.includes('<p class="banner">Training rehearsal - synthetic data - not a live Azure result</p>'));
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'"
  ]) assert.ok(csp.includes(directive), directive);
  assert.doesNotMatch(html, /\son[a-z]+=["']|<script[^>]*>[^<\s]/i);
  assert.doesNotMatch(html, /(?:src|href)=["'](?:https?:)?\/\//i);
  for (const asset of ['style.css', 'model.js', 'app.js']) assert.ok(fs.existsSync(path.join(root, asset)));
});

test('form controls are labeled and cannot shadow native reset or submit methods', () => {
  const html = read('index.html');
  const controls = [...html.matchAll(/<(?:input|select|button)\b[^>]*>/g)].map((match) => match[0]);
  for (const control of controls) {
    assert.doesNotMatch(control, /(?:id|name)=["'](?:reset|submit|action|method|elements)["']/i);
  }
  for (const id of ['production-version', 'profile-id', 'scenario', 'request-count']) {
    assert.ok(html.includes(`<label for="${id}">`), id);
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.match(html, /id="run-shadow" type="submit"/);
  assert.match(html, /id="reset-lesson" type="button"/);
  assert.match(read('app.js'), /form\.reset\(\)/);
  assert.match(read('style.css'), /:focus-visible/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
});

test('browser code uses local text rendering with no network, persistent storage or dynamic execution', () => {
  const code = read('model.js') + '\n' + read('app.js');
  assert.doesNotMatch(code, /\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|eval)\b/);
  assert.doesNotMatch(code, /innerHTML|outerHTML|document\.write|new Function|setInterval|setTimeout/);
  assert.doesNotMatch(code, /https?:\/\/|management\.azure|process\.env/);
  assert.match(read('app.js'), /textContent/);
});

test('metadata and BDD preserve scope, bounded fixtures, explicit IaC N/A and cleanup limits', () => {
  const lesson = JSON.parse(read('lesson.json'));
  const iac = JSON.parse(read(path.join('evidence', 'iac.json')));
  assert.equal(lesson.cardId, 'A-S009');
  assert.equal(lesson.kanoUnit, 'A-S009');
  assert.equal(lesson.parentId, 'D-S009');
  assert.equal(lesson.nativeProof, false);
  assert.equal(lesson.sourceParentComplete, false);
  assert.equal(lesson.mode, 'synthetic-only');
  assert.equal(iac.status, 'N/A');
  assert.equal(iac.resourcesCreated, 0);
  assert.equal(iac.managementCalls, 0);
  assert.equal(lesson.bounds.totalRequestsBeforeReset, 30);
  for (const file of [lesson.entry, lesson.bdd, ...lesson.tests]) {
    assert.ok(fs.existsSync(path.join(root, file)), file);
  }
  const feature = read(lesson.bdd);
  for (const expected of ['SAFE', 'DISCREPANT', 'UNSAFE', 'UNKNOWN', 'INVALID', 'Reset']) {
    assert.ok(feature.includes(expected), expected);
  }
  assert.match(read('index.html'), /IaC: <strong>N\/A<\/strong>/);
  assert.match(read('index.html'), /No native B-S009 result or completed D-S009 parent/);
});
