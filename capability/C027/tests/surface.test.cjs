'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const html = read('index.html');
const page = read('page.js');
const browser = read(path.join('tests', 'browser.cjs'));
const server = read('server.cjs');

test('template has a deny-by-default CSP; only the owned listener can generate its exact SSE conducting page', () => {
  assert.match(html, /default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'/);
  assert.match(html, /base-uri 'none'; form-action 'none'; object-src 'none'/);
  assert.match(server, /replace\("connect-src 'none'", `connect-src \$\{endpoint\}`\)/);
  assert.match(server, /server\.listen\(0, '127\.0\.0\.1'/);
  assert.match(server, /'Access-Control-Allow-Origin': 'null'/);
  assert.match(server, /CREDENTIALS_FORBIDDEN/);
  assert.doesNotMatch(html, /<script[^>]*>[^<\s]/);
  assert.doesNotMatch(html, /\son\w+\s*=|<iframe|<form|<base|<img/i);
});

test('conductor has unique IDs, explicit labels, keyboard targets and separate status/error/receipt/acceptance', () => {
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  for (const id of ['profile', 'mode']) assert.match(html, new RegExp(`<label for="${id}">`));
  for (const id of ['connect', 'accept', 'disconnect', 'reset-conductor']) {
    assert.match(html, new RegExp(`<button id="${id}" type="button"`));
  }
  assert.match(html, /id="status" role="status" aria-live="polite"/);
  assert.match(html, /id="error" role="alert"/);
  assert.match(html, /id="observations" tabindex="0"/);
  assert.match(html, /id="received"/);
  assert.match(html, /id="accepted"/);
  assert.match(html, /No cloud, durable storage, exactly-once, native Azure or production Node 24 certification/);
  assert.match(html, /AS IS/);
});

test('actual native EventSource is never replaced, mocked, routed through the buffered helper or hidden by unsafe flags', () => {
  assert.match(page, /new EventSource\(url\.href, \{ withCredentials: false \}\)/);
  assert.match(page, /after: acceptedAfter/);
  assert.match(page, /event\.lastEventId/);
  assert.match(page, /current\.onerror = /);
  assert.match(page, /pagehide/);
  assert.match(browser, /openIsolatedLesson\(conductor\.relativePath\)/);
  assert.match(browser, /86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055/);
  for (const source of [page, browser]) {
    assert.doesNotMatch(source, /openIsolatedLoopback|\.route(?:WebSocket)?\s*\(/);
    assert.doesNotMatch(source, /(?:globalThis|window)\.EventSource\s*=|class\s+EventSource|dispatchEvent\s*\(/);
    assert.doesNotMatch(source, /--no-sandbox|--disable-web-security|bypassCSP:\s*true|ignoreHTTPSErrors:\s*true/);
  }
  assert.doesNotMatch(page, /\bfetch\s*\(/, 'The conductor must consume SSE through native EventSource, not a buffered HTTP substitute.');
});

test('red snapshots cannot be auto-discovered and exact owned bytes survive git line-ending settings', () => {
  const archive = fs.readdirSync(path.join(root, 'evidence', 'red'));
  assert.ok(archive.length >= 5);
  assert.equal(archive.every((file) => file.endsWith('.txt')), true);
  assert.match(read('.gitattributes'), /^\* -text$/m);
  assert.match(read('.gitignore'), /^\/runtime-\*\.html$/m);
  assert.match(browser, /CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /Normal verification must not write or rewrite retained proof/);
  assert.match(read(path.join('tests', 'capture.cjs')), /flag: 'wx'/);
});

test('scope remains a single S fixture and does not infer a native SSE transition or future driver readiness', () => {
  const bdd = read('C027.feature');
  assert.match(bdd, /Frozen S, one unit/);
  assert.match(bdd, /C020 is the accepted technical entry gate/);
  assert.match(server, /guardOperation\('local\.probe', ledger\.approvals\?\.C001\)/);
  assert.match(server, /state !== 'Done'/);
  assert.doesNotMatch(server, /require\(['"](?:express|ws|@azure\/)/);
  assert.match(read('README.md'), /B-S046/);
  assert.match(read('README.md'), /C028/);
});
