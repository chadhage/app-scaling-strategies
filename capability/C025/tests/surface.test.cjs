'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const page = fs.readFileSync(path.join(root, 'page.js'), 'utf8');
const browser = fs.readFileSync(path.join(__dirname, 'browser.cjs'), 'utf8');

test('surface uses self-hosted scripts, labelled native controls and live status/errors', () => {
  assert.match(html, /<html lang="en">/);
  assert.match(html, /href="#conductor"/);
  for (const id of ['profile', 'version', 'range']) assert.match(html, new RegExp(`<label for="${id}">`));
  assert.match(html, /id="status" role="status" aria-live="polite"/);
  assert.match(html, /id="error" role="alert"/);
  assert.doesNotMatch(html, /\son[a-z]+\s*=|<script(?![^>]*\bsrc=)|https?:\/\//i);
  assert.doesNotMatch(page, /innerHTML|outerHTML|document\.write|localStorage|sessionStorage/);
});

test('UI uses real binary HTTP Range, pinned If-Range, no credential/redirect or automatic retry bypass', () => {
  assert.match(page, /new Uint8Array\(await response\.arrayBuffer\(\)\)/);
  assert.match(page, /'If-Range': session\.snapshot\(\)\.manifest\.etag/);
  assert.match(page, /redirect: 'error', credentials: 'omit'/);
  assert.match(page, /for \(let count = 0; count < 8/);
  assert.match(html, /Earlier failures remain visible even after recovery/);
  assert.match(html, /Reset discards all in-memory bytes/);
});

test('browser runner uses only exact published shared helper, deliberate capture and nested awaited cleanup', () => {
  assert.match(browser, /openIsolatedLoopback\(path\.join\('capability', 'C025', 'index\.html'\), server\)/);
  assert.match(browser, /CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /await session\.close\(\)/);
  assert.match(browser, /server\.close\(\(error\)/);
  assert.doesNotMatch(browser, /chromium\.launch|browserType\.launch|\.route\(|bypassCSP:\s*true|--no-sandbox|ignoreHTTPSErrors/);
});
