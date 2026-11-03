'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('portable entry declares exact banner, source, operator controls and honest limits', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  for (const id of ['command-form', 'epoch', 'field', 'guard', 'observation', 'outcome', 'history', 'reset-lesson']) {
    assert.ok(html.includes(`id="${id}"`), id);
  }
  assert.ok(html.includes('B-S082') && html.includes('D-S082'));
  assert.ok(html.includes('No controller, coordinator'));
  assert.match(html, /<html lang="en">/);
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
});

test('CSP is restrictive and application assets are local, without inline script or reset shadowing', () => {
  const html = read('index.html');
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(html.includes(directive), directive);
  const cspPosition = html.indexOf('Content-Security-Policy');
  assert.ok(cspPosition < html.indexOf('<script'));
  assert.equal((html.match(/<script src="(?:model|app)\.js" defer><\/script>/g) || []).length, 2);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?! src=)|\b(?:id|name)="reset"|https?:\/\//i);
  assert.match(read('app.js'), /form\.reset\(\)/);
});

test('lesson behavior uses safe text rendering and no storage, timers, remote calls or dynamic code', () => {
  const source = read('app.js') + read('model.js');
  assert.doesNotMatch(source, /\b(?:fetch|XMLHttpRequest|WebSocket|Worker|localStorage|sessionStorage|indexedDB|setTimeout|setInterval|eval|Function)\s*[.(]/);
  assert.doesNotMatch(source, /innerHTML|outerHTML|document\.write|document\.cookie|https?:\/\//);
  assert.match(source, /textContent/);
  assert.match(source, /preventDefault/);
});

test('manifest preserves one frozen source-derived S unit and resource-free IaC decision', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.cardId, 'A-S082');
  assert.equal(manifest.parentId, 'D-S082');
  assert.equal(manifest.nativeSibling, 'B-S082');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S082');
  assert.equal(manifest.packet, 'SC-S082');
  assert.equal(manifest.entryPoint, 'learning/S082/index.html');
  assert.equal(manifest.sourceAcceptance, 'Reject an old deployment epoch attempting to change current routing or readiness.');
  assert.equal(manifest.parentAcceptance, 'Stale updates cannot change current routing or readiness; rejected commands are surfaced with evidence.');
  assert.equal(JSON.parse(read('evidence\\iac-decision.json')).status, 'N/A');
});
