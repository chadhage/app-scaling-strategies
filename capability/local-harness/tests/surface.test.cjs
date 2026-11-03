'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const generation = require('../../C005/evidence/op-catalog-snapshot-refresh-76-01675ac8d423/generation.json');

test('the plain local surface loads only unchanged accepted providers and the small composition', () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts, [
    '../C001/approved-contract.js', '../C001/contract-guard.js',
    '../C003/matrix-contract.js', '../C003/matrix-data.js',
    '../C005/catalog-contract.js', '../C005/catalog-data.js',
    '../C006/search.js', '../C007/catalog-filters.js', '../C008/preparation.js',
    'composition.js', 'catalog-page.js'
  ]);
  for (const file of scripts) assert.ok(fs.statSync(path.resolve(root, file)).isFile());
  for (const forbidden of ['package.json', 'catalog-data.js', 'catalog-source.cjs']) {
    assert.equal(fs.existsSync(path.join(root, forbidden)), false);
  }
  assert.equal((html.match(/<script/g) || []).length, scripts.length);
  assert.doesNotMatch(html, /\bon(?:click|load|submit|change)=|type="module"|<iframe|<object/i);
  assert.doesNotMatch(read('catalog.css'), /@import|url\(/i);
});

test('search and the three existing filters have native keyboard controls and explicit status / error / empty states', () => {
  const html = read('index.html');
  for (const id of ['catalog-query', 'host-filter', 'risk-filter', 'readiness-filter']) {
    assert.ok(html.includes(`<label for="${id}">`));
  }
  for (const value of [
    'class="skip-link" href="#catalog-query"', 'id="catalog-form" role="search"',
    'id="catalog-status" role="status" aria-live="polite" aria-atomic="true"',
    'id="catalog-error" role="alert"', 'id="catalog-empty" hidden',
    'id="preparation-heading" tabindex="-1"', 'id="back-results" type="button"',
    'id="reset-catalog" type="reset"', '<noscript>'
  ]) assert.ok(html.includes(value), value);
  assert.equal((html.match(/<select /g) || []).length, 3);
  assert.match(html, /No priority, format or prerequisite-filter feature/);
  assert.match(read('catalog.css'), /:focus-visible/);
  assert.match(read('catalog.css'), /overflow-wrap: anywhere/);
  assert.match(read('catalog.css'), /white-space: pre-wrap/);
  assert.match(read('catalog.css'), /forced-colors/);
  assert.match(read('catalog-page.js'), /event\.preventDefault\(\)/);
});

test('CSP and literal text rendering forbid inline code, network clients, storage and executable HTML sinks', () => {
  const html = read('index.html');
  const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)[1];
  for (const directive of [
    "default-src 'none'", "script-src 'self'", "style-src 'self'", "connect-src 'none'",
    "img-src 'none'", "font-src 'none'", "object-src 'none'", "frame-src 'none'",
    "worker-src 'none'", "base-uri 'none'", "form-action 'none'"
  ]) assert.ok(csp.includes(directive));
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|https:|data:|\*/);
  const source = read('composition.js') + read('catalog-page.js');
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|DOMParser|\beval\(|new Function/);
  assert.doesNotMatch(source, /\bfetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|indexedDB|readFile|execFile|catalog-source/);
  assert.match(source, /textContent/);
});

test('composition delegates accepted behavior and contains no catalog extraction, host policy or copied lesson destination', () => {
  const source = read('composition.js');
  assert.match(source, /searchApi\.searchCatalog\(catalog, matrix, query\)/);
  assert.match(source, /filterApi\.filterCatalog\(catalog, matrix, request\.filters\)/);
  assert.match(source, /preparationApi\.prepare\(catalog, matrix, entryId\)/);
  assert.match(source, /matches\.has\(item\.entry\)/);
  assert.doesNotMatch(source + read('catalog-page.js'), /P001:|CONTAINER:|ADAPTER_HOSTS|learning\/S\d{3}\/index|S001.*S002.*S003/);
  assert.match(read('catalog-page.js'), /entry\.learning\.href/);
  assert.match(read('catalog-page.js'), /contract\.sourceHref\(catalog, reference\)/);
  assert.match(read('catalog-page.js'), /mounts\.get\(doc\)\?\.dispose\(\)/);
  assert.match(read('catalog-page.js'), /disposed \|\| token !== revision/);
  assert.match(read('index.html'), /does not complete H002 or H001/);
  assert.match(read('index.html'), /Production Node\.js 24 remains unvalidated/);
});

test('twelve unchanged interfaces and the archived thirteenth retain accepted baselines; current data binds to the new generation', () => {
  const baseline = JSON.parse(read('evidence\\provider-integrity.json'));
  assert.equal(baseline.files.length, 13);
  const checkedCommits = new Set();
  for (const file of baseline.files) {
    const bytes = fs.readFileSync(path.join(repo,
      file.path === generation.data.path ? generation.original.path : file.path));
    assert.equal(sha256(bytes), file.sha256, file.path);
    const accepted = execFileSync('git', ['--no-pager', 'show',
      `${file.publication.commit}:${file.path.replaceAll('\\', '/')}`], { cwd: repo, maxBuffer: 2 * 1024 * 1024 });
    assert.equal(sha256(bytes.toString('utf8').replaceAll('\r\n', '\n')),
      sha256(accepted.toString('utf8').replaceAll('\r\n', '\n')), file.path);
    if (!checkedCommits.has(file.publication.commit)) {
      execFileSync('git', ['merge-base', '--is-ancestor', file.publication.commit, 'HEAD'], { cwd: repo });
      checkedCommits.add(file.publication.commit);
    }
  }
  assert.equal(generation.sourceCommit, '01675ac8d4230c51dad027b67a1971d8d3490d74');
  assert.equal(sha256(fs.readFileSync(path.join(repo, generation.data.path))), generation.data.sha256);
  assert.equal(require('../../C005/catalog-data.js').source.commit, generation.sourceCommit);
  assert.equal(require('../../C005/catalog-source.cjs').PINNED_COMMIT, generation.sourceCommit);
  assert.deepEqual(require('../../C005/catalog-data.js'), require('../../C005/catalog-source.cjs').buildCatalog());
});

test('BDD, a loadable stub, genuine assertion RED and IaC N/A remain preserved outside test discovery', () => {
  const red = JSON.parse(read('evidence\\red.json'));
  assert.equal(red.exitCode, 1);
  assert.match(red.stdout, /ERR_ASSERTION/);
  assert.match(red.stdout, /AssertionError/);
  assert.match(red.stdout, /S001/);
  assert.doesNotMatch(red.stdout, /MODULE_NOT_FOUND|SyntaxError/);
  const stub = read('evidence\\red-composition.stub.js.txt');
  assert.doesNotThrow(() => new vm.Script(stub));
  assert.equal(sha256(stub), red.stubSha256);
  assert.equal(sha256(read('evidence\\red-integration.cjs.txt')), red.assertionsSha256);
  const originalBdd = read('evidence\\red-bdd.feature.txt');
  assert.equal(sha256(originalBdd), red.bddSha256);
  const normalize = value => value.replaceAll('\r\n', '\n').replace(/\n+$/, '\n');
  assert.equal(normalize(read('catalog-compose.feature')), normalize(originalBdd));
  assert.ok(read('.gitattributes').includes('evidence/red-*.txt -text -diff'));
  const iac = JSON.parse(read('evidence\\iac-na.json'));
  assert.equal(iac.applicability, 'not-applicable');
  assert.equal(iac.recordedBefore, 'implementation');
  for (const key of ['iacGenerated', 'scaffoldGenerated', 'identityRegistered', 'cloudQueries', 'deployed', 'spendAuthorized']) {
    assert.equal(iac[key], false);
  }
  assert.ok(Date.parse(iac.recordedAtUtc) >= Date.parse(red.completedAtUtc));
  for (const name of fs.readdirSync(path.join(root, 'evidence')).filter(name => /^red-/.test(name))) assert.match(name, /\.txt$/);
});

test('real browser verification gates exact published helper provenance before import, awaits every child and captures only explicitly', () => {
  const source = read('tests\\browser.test.cjs');
  const gate = source.indexOf('assert.equal(sha256(readFileSync(helperPath)), PUBLISHED_HELPER_SHA256');
  const imported = source.indexOf('const { openIsolatedLesson } = require(helperPath)');
  assert.ok(gate >= 0 && imported > gate);
  assert.ok(source.includes('86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055'));
  assert.ok(source.includes('53c0c0d82cc1db6780a87ac2b1085734af6d5c60'));
  assert.match(source, /openIsolatedLesson\('capability\\\\local-harness\\\\index\.html'\)/);
  assert.match(source, /await child\.close\(\)/);
  assert.match(source, /finally \{\s*await session\.close\(\)/);
  assert.match(source, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.doesNotMatch(source, /chromium\.launch|browserType\.launch|ignoreHTTPSErrors|bypassCSP:\s*true|chromiumSandbox:\s*false|--no-sandbox|disable-web-security/);
  assert.doesNotMatch(source, /fs\.(?:rm|unlink|rmdir|truncate)\(/);
  assert.match(source, /Ordinary browser tests preserve committed observations byte-for-byte/);
});
