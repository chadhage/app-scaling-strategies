'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');

test('portable entry has exact banner, source boundaries, explicit labels and guarded reset identifiers', () => {
  const html = read('index.html');
  assert.ok(html.includes('Training rehearsal - synthetic data - not a live Azure result'));
  for (const id of ['cache', 'recovery', 'durable', 'budget', 'prediction']) {
    assert.ok(html.includes(`for="${id}"`));
    assert.ok(html.includes(`id="${id}"`));
  }
  assert.match(html, /role="alert"/);
  assert.match(html, /aria-live="polite"/);
  assert.match(html, /<caption>/);
  assert.match(html, /not actual cache-outage or durable-profile recovery certification/);
  assert.doesNotMatch(html, /\b(?:id|name)="reset"/i);
  assert.match(read('app.js'), /attemptForm\.reset\(\)/);
  assert.match(read('app.js'), /checkForm\.reset\(\)/);
});

test('static CSP and source avoid inline execution, network APIs and HTML injection', () => {
  const html = read('index.html');
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "object-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-src 'none'", "worker-src 'none'",
  ]) assert.ok(csp.includes(directive));
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
  assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>|\bon\w+\s*=|\bstyle\s*=/i);
  for (const file of ['app.js', 'model.js']) {
    assert.doesNotMatch(read(file), /innerHTML|outerHTML|insertAdjacentHTML|\beval\s*\(|\bfetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|document\.cookie/);
  }
});

test('manifest remains one frozen synthetic card with the exact source objective', () => {
  const manifest = JSON.parse(read('manifest.json'));
  const source = JSON.parse(read('evidence\\source-contract.json'));
  assert.equal(manifest.id, 'A-S073');
  assert.equal(manifest.kano, 'S');
  assert.equal(manifest.kanoUnit, 'A-S073');
  assert.equal(manifest.packet, 'SC-S073');
  assert.equal(manifest.objective, 'Lose cache access; an empty user profile must not be a successful fallback.');
  assert.ok(source.cardRow.includes(manifest.objective));
  assert.equal(manifest.mode, 'synthetic');
  assert.equal(manifest.entry, 'index.html');
  assert.equal(manifest.resourceCount, 0);
  assert.deepEqual(manifest.inputs.budgetMs, [80, 110, 150]);
});
