'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..');
const read = file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8');
const sharedPublication = '219a2c0c20e095a1b8d5a8e66f19d8a3299b4329';
const generation = require('../../C005/evidence/op-catalog-snapshot-refresh-135-a03ef59da5d5/generation.json');

test('the standalone surface has labeled keyboard controls and separate live, error and empty states', () => {
  const html = read('index.html');
  for (const pattern of [
    /<html lang="en">/, /name="viewport"/, /class="skip-link" href="#search-query"/,
    /<form id="search-form" role="search" aria-label="Catalog title and objective search">/,
    /<label for="search-query">/, /id="search-query"[^>]*type="search"/,
    /aria-describedby="search-help" aria-errormessage="search-error"/,
    /<button type="submit">Search<\/button>/, /<button type="reset">Reset<\/button>/,
    /id="search-count" role="status" aria-live="polite" aria-atomic="true"/,
    /id="search-error" role="alert"/, /id="search-empty" hidden/, /<noscript>/
  ]) assert.match(html, pattern);
  assert.match(read('search.css'), /:focus-visible/);
  assert.match(read('search.css'), /overflow-wrap: anywhere/);
  assert.match(html, /historical, not native execution/);
  assert.match(html, /production Node\.js 24 remains unvalidated/);
  assert.doesNotMatch(html, /<(?:iframe|object|embed|select)\b|\bon(?:click|load|submit)=/i);
});

test('CSP and dependency order keep file browsing local and fail closed', () => {
  const html = read('index.html');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "img-src 'none'", "font-src 'none'", "object-src 'none'",
    "frame-src 'none'", "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https:|data:|\*/);
  assert.doesNotMatch(html, /<script\b[^>]*>(?!\s*<\/script>)\s*\S/);
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts, ['../C003/matrix-contract.js', '../C003/matrix-data.js',
    '../C005/catalog-contract.js', '../C005/catalog-data.js', 'search.js', 'search-page.js']);
  for (const file of scripts) assert.ok(fs.statSync(path.resolve(__dirname, '..', file)).isFile());
});

test('original accepted bytes remain intact; only catalog data binds to the reproducible fixed generation', () => {
  const files = ['capability/C005/catalog-data.js', 'capability/C005/catalog-contract.js',
    'capability/C005/catalog-contract.d.ts', 'capability/C003/matrix-data.js',
    'capability/C003/matrix-contract.js', 'capability/C003/matrix-contract.d.ts'];
  for (const file of files) {
    const pinned = execFileSync('git', ['--no-pager', 'show', `${sharedPublication}:${file}`],
      { cwd: root, encoding: 'utf8' });
    const current = fs.readFileSync(file === 'capability/C005/catalog-data.js'
      ? path.join(root, generation.original.path) : path.join(root, ...file.split('/')), 'utf8');
    assert.equal(current.replace(/\r\n/g, '\n'), pinned.replace(/\r\n/g, '\n'), file);
  }
  execFileSync('git', ['merge-base', '--is-ancestor', sharedPublication, 'HEAD'], { cwd: root });
  const generated = fs.readFileSync(path.join(root, generation.data.path));
  assert.equal(generation.sourceCommit, 'a03ef59da5d58d74c109d2484d7730fa14500358');
  assert.equal(createHash('sha256').update(generated).digest('hex'), generation.data.sha256);
  assert.equal(require('../../C005/catalog-data.js').source.commit, generation.sourceCommit);
  assert.equal(require('../../C005/catalog-source.cjs').PINNED_COMMIT, generation.sourceCommit);
  assert.deepEqual(require('../../C005/catalog-data.js'), require('../../C005/catalog-source.cjs').buildCatalog());
  assert.match(read('search.js'), /factory\(require\('\.\.\/C005\/catalog-contract\.js'\)\)/);
  assert.match(read('search.js'), /contract\.validateCatalog\(catalog, matrix\)/);
  assert.match(read('search-page.js'), /contract\.sourceHref\(catalog, reference\)/);
});

test('the small primitive is reusable and imports types instead of defining a duplicate catalog', () => {
  const search = read('search.js');
  const declaration = read('search.d.ts');
  const page = read('search-page.js');
  assert.match(search, /Object\.freeze\(\{ SEARCH_VERSION: '1\.0\.0', searchCatalog \}\)/);
  assert.match(search, /Object\.defineProperty\(root, 'C006Search'/);
  assert.match(search, /catalog\.entries\.filter/);
  assert.match(declaration, /import type \{ CatalogEntry, SourceCatalog \} from '\.\.\/C005\/catalog-contract'/);
  assert.match(declaration, /readonly CatalogEntry\[\]/);
  assert.doesNotMatch(declaration, /interface (?:SourceCatalog|CatalogEntry)|runnable: true|qualified: true/);
  for (const source of [search, page]) {
    assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|DOMParser|eval\(|new Function/);
    assert.doesNotMatch(source, /fetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/);
    assert.doesNotMatch(source, /readFile|execFile|README\.md|catalog-source|JSON\.parse|JSON\.stringify/);
    assert.doesNotMatch(source, /learning\/S\d{3}|D-S\d{3}.*D-S\d{3}/);
  }
  assert.match(page, /mounts\.get\(document\)\?\.dispose\(\)/);
  assert.match(page, /event\.preventDefault\(\)/);
  assert.match(page, /input\.focus\(\)/);
});

test('saved RED is genuine assertion evidence, loadable-stub source is plain text, and IaC is N/A', () => {
  const proof = JSON.parse(read('evidence\\red.json'));
  const hash = file => createHash('sha256').update(read(file)).digest('hex');
  assert.equal(proof.exitCode, 1);
  assert.match(proof.stdout, /ERR_ASSERTION/);
  assert.match(proof.stdout, /0 !== 1/);
  assert.doesNotMatch(proof.stdout, /MODULE_NOT_FOUND|SyntaxError/);
  assert.equal(hash('evidence\\red-search.stub.js.txt'), proof.preservedStubSha256);
  assert.equal(proof.stubSha256, proof.preservedStubSha256);
  assert.equal(hash('evidence\\red-search.test.cjs.txt'), proof.preservedTestSha256);
  assert.equal(proof.testSha256, proof.preservedTestSha256);
  const names = fs.readdirSync(path.join(__dirname, '..', 'evidence'));
  for (const name of names.filter(name => name.startsWith('red-'))) assert.match(name, /\.txt$/);
  const iac = JSON.parse(read('evidence\\iac-na.json'));
  assert.equal(iac.generatedIaC, false);
  assert.equal(iac.executedCloudActions, false);
});

test('actual browser verification only captures deliberately and never deletes historical observations', () => {
  const source = read('tests\\browser.test.cjs');
  assert.match(source, /openIsolatedLesson\('capability\\\\C006\\\\index\.html'\)/);
  assert.match(source, /finally \{\s*await session\.close\(\)/);
  assert.match(source, /if \(process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'\) \{/);
  assert.doesNotMatch(source, /\b(?:rm|unlink|rmdir)(?:Sync)?\s*\(/);
  assert.doesNotMatch(source, /chromium\.launch|browserType\.launch|ignoreHTTPSErrors|no-sandbox|disable-web-security/);
});
