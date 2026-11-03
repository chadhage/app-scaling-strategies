'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const catalog = require('../catalog-data.js');
const source = require('../catalog-source.cjs');
const root = path.resolve(__dirname, '..', '..', '..');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');

test('local entry point has explicit scope, accessible status/error/empty states and no execution controls', () => {
  const html = read('index.html');
  assert.match(html, /<html lang="en">/);
  assert.match(html, /name="viewport"/);
  assert.match(html, /class="skip-link" href="#catalog"/);
  assert.match(html, /id="catalog-count" role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /id="catalog-error" role="alert"/);
  assert.match(html, /id="catalog-empty"/);
  assert.match(html, /<noscript>/);
  assert.match(html, /committed historical|Committed availability snapshot/);
  assert.doesNotMatch(html, /<(?:form|input|button|iframe|object|embed)\b|on(?:click|load)=/i);
  assert.doesNotMatch(read('catalog-page.js'), /innerHTML|outerHTML|insertAdjacentHTML|eval\(|new Function|fetch\(|XMLHttpRequest|WebSocket|localStorage|flow-state\.json['"]/);
});

test('the CSP denies network and active content while keeping scripts and styles local', () => {
  const html = read('index.html');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "img-src 'none'", "object-src 'none'", "frame-src 'none'",
    "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https:|data:|\*/);
  assert.doesNotMatch(html, /<script\b[^>]*>(?!\s*<\/script>)\s*\S/);
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts, ['../C003/matrix-contract.js', '../C003/matrix-data.js',
    'catalog-contract.js', 'catalog-data.js', 'catalog-page.js']);
  for (const file of scripts) assert.ok(fs.statSync(path.resolve(__dirname, '..', file)).isFile());
});

test('C003 data and validation authority are consumed unchanged from its accepted implementation commit', () => {
  for (const file of ['matrix-data.js', 'matrix-contract.js', 'matrix-contract.d.ts']) {
    const pinned = execFileSync('git', ['--no-pager', 'show', `${source.PINNED_COMMIT}:capability/C003/${file}`],
      { cwd: root, encoding: 'utf8' });
    const current = fs.readFileSync(path.join(root, 'capability', 'C003', file), 'utf8');
    assert.equal(current.replace(/\r\n/g, '\n'), pinned.replace(/\r\n/g, '\n'));
  }
  assert.match(read('catalog-contract.js'), /matrixContract\.validateMatrix\(matrix\)/);
});

test('the data generator reads pinned git blobs, never the evolving ledger or discovery globs', () => {
  const implementation = read('catalog-source.cjs');
  assert.match(implementation, /git\(\['show', `\$\{PINNED_COMMIT\}:/);
  assert.doesNotMatch(implementation, /readFileSync\([^)]*(?:ledger|flow-state)/i);
  assert.doesNotMatch(implementation, /\breaddir(?:Sync)?\s*\(|\bglob\s*\(|git\(\[\s*['"](?:add|commit|push|checkout|reset)['"]/);
  assert.equal(catalog.acceptanceSnapshot.live, false);
});

test('readonly declarations cover the versioned data shape and deny all local native claims', () => {
  const declaration = read('catalog-contract.d.ts');
  assert.match(declaration, /readonly schemaVersion: '1\.0\.0'/);
  for (const field of Object.keys(catalog)) assert.match(declaration, new RegExp(`readonly ${field}:`), field);
  for (const field of Object.keys(catalog.entries[0])) assert.match(declaration, new RegExp(`readonly ${field}:`), field);
  assert.match(declaration, /readonly runnable: false/);
  assert.match(declaration, /readonly qualified: false/);
  assert.match(declaration, /readonly completed: false/);
  assert.match(declaration, /readonly live: false/);
  assert.match(declaration, /readonly evidence: readonly never\[\]/);
  assert.match(declaration, /import type .* from '\.\.\/C003\/matrix-contract'/);
});

test('intentional RED snapshots are plain text outside auto-discovered test filenames', () => {
  const names = fs.readdirSync(path.join(__dirname, '..', 'evidence'));
  assert.ok(names.includes('red-catalog-data.stub.js.txt'));
  assert.ok(names.includes('red-catalog-contract.stub.js.txt'));
  for (const name of names.filter(name => name.startsWith('red-'))) assert.match(name, /\.txt$/);
  assert.match(read('evidence\\red.txt'), /0 !== 152/);
  assert.equal(JSON.parse(read('evidence\\iac-na.json')).executedCloudActions, false);
});
