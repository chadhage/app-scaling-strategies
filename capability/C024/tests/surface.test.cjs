'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'page.js'), 'utf8');
const css = fs.readFileSync(path.join(root, 'styles.css'), 'utf8');

test('file page loads only external owned scripts and the unchanged C020 metadata import', () => {
  assert.deepEqual([...html.matchAll(/<script src="([^"]+)" defer><\/script>/g)].map((match) => match[1]),
    ['../C020/contract.js', 'upload.js', 'page.js']);
  assert.equal((html.match(/<script/g) || []).length, 3);
  assert.doesNotMatch(html, /\son[a-z]+=["']|javascript:|<style|style=/i);
  assert.doesNotMatch(html, /type=["']file["']|https?:\/\//i);
  assert.doesNotMatch(page, /\bfetch\s*\(|localStorage|sessionStorage|indexedDB|XMLHttpRequest|new WebSocket/);
});

test('CSP is restrictive without unsafe-inline, data, remote origins or connect permission', () => {
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  for (const value of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "object-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(csp.includes(value));
  }
  assert.doesNotMatch(csp, /unsafe-|https?:|data:/);
});

test('conducting fields have explicit labels, live status and disabled fail-closed controls', () => {
  for (const id of ['fixture-id', 'part-id', 'completion-order', 'expected-hash']) {
    assert.match(html, new RegExp(`<label for="${id}">`));
  }
  assert.match(html, /id="status" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /id="error" role="alert" hidden/);
  assert.match(html, /<fieldset id="conduct" disabled>/);
  assert.match(html, /<fieldset id="completion-controls" disabled>/);
  assert.match(html, /id="start" type="button" disabled/);
  assert.match(css, /:focus-visible\s*\{[^}]*outline:\s*4px/);
  assert.match(html, /Same memory only/);
  assert.match(html, /reload or reset loses it/);
});

test('only the exact published isolated helper is a qualified browser dependency', () => {
  const bytes = fs.readFileSync(path.join(repository, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(createHash('sha256').update(bytes).digest('hex'),
    '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
});
