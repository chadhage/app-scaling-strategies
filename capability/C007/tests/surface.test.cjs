'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const read = name => readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const page = read('filters-page.js');
const primitive = read('catalog-filters.js');
const api = require('../catalog-filters.js');

test('classic local scripts load unchanged C003/C005 providers before the C007 consumer', () => {
  const scripts = [...html.matchAll(/<script defer src="([^"]+)"><\/script>/g)].map(match => match[1]);
  assert.deepEqual(scripts, [
    '../C003/matrix-contract.js', '../C003/matrix-data.js',
    '../C005/catalog-contract.js', '../C005/catalog-data.js', 'catalog-filters.js', 'filters-page.js'
  ]);
  assert.equal((html.match(/<script/g) || []).length, scripts.length);
  assert.equal(typeof require('../filters-page.js').render, 'function');
  assert.doesNotMatch(html, /https?:\/\/|on(?:click|load|change)=|type="module"/i);
  assert.doesNotMatch(read('filters.css'), /@import|url\(/i);
});

test('native keyboard controls have labels, explanations, live/error states and safe reset naming', () => {
  for (const [id, help] of [
    ['host-filter', 'host-help'], ['risk-filter', 'risk-help'], ['readiness-filter', 'readiness-help']
  ]) {
    assert.ok(html.includes(`<label for="${id}">`));
    assert.match(html, new RegExp(`<select id="${id}"[^>]+aria-describedby="${help}"`));
    assert.ok(html.includes(`id="${help}"`));
  }
  assert.match(html, /type="reset" id="reset-filters"/);
  assert.doesNotMatch(html, /(?:name|id)="reset"/);
  assert.match(html, /href="#catalog"/);
  assert.match(html, /id="catalog" tabindex="-1"/);
  assert.match(html, /role="status" aria-live="polite" aria-atomic="true"/);
  assert.match(html, /id="catalog-error" role="alert"/);
  assert.match(read('filters.css'), /:focus-visible/);
  assert.match(read('filters.css'), /forced-colors/);
  assert.match(page, /addEventListener\('reset'/);
});

test('CSP and text-only rendering prohibit inline scripts, connections and executable source markup', () => {
  for (const directive of ["default-src 'none'", "script-src 'self'", "style-src 'self'",
    "connect-src 'none'", "img-src 'none'", "object-src 'none'", "frame-src 'none'",
    "worker-src 'none'", "base-uri 'none'", "form-action 'none'"]) {
    assert.ok(html.includes(directive));
  }
  assert.doesNotMatch(html, /unsafe-inline|unsafe-eval/i);
  assert.doesNotMatch(page, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
  assert.doesNotMatch(page + primitive, /\bfetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage/);
  assert.match(page, /textContent/);
  assert.match(page, /createTextNode/);
});

test('pure consumer delegates validation/filtering and stores invalid mounts before subsequent events', () => {
  assert.match(primitive, /catalogContract\.validateCatalog\(catalog, matrix\)/);
  assert.match(primitive, /matrixContract\.filterRows\(/);
  assert.doesNotMatch(primitive + page, /node:fs|readFileSync|execFileSync|git show|catalog-source/);
  const updateIndex = page.indexOf('state.catalog = catalog;');
  assert.ok(updateIndex >= 0);
  assert.ok(updateIndex < page.indexOf('filterApi.filterCatalog(catalog, matrix'));
  assert.match(page, /render\(state\.catalog, state\.matrix, doc\)/);
});

test('risk/readiness declaration and DOM options agree with the reusable filter vocabulary', () => {
  const declaration = read('catalog-filters.d.ts');
  for (const [id, values] of [['risk-filter', api.RISKS], ['readiness-filter', api.READINESS]]) {
    const body = html.match(new RegExp(`<select id="${id}"[^>]*>([\\s\\S]*?)<\\/select>`))[1];
    assert.deepEqual([...body.matchAll(/value="([^"]+)"/g)].map(match => match[1]), values);
    for (const value of values) assert.ok(declaration.includes(`'${value}'`));
  }
  assert.match(html, /UNCLASSIFIED/);
  assert.match(html, /Priority is not risk/);
});

test('RED evidence is a real assertion with a loadable stub, never an auto-discovered failing test', () => {
  const red = read(path.join('evidence', 'red.txt'));
  assert.match(red, /0 !== 152/);
  assert.match(red, /AssertionError/);
  assert.doesNotMatch(red, /MODULE_NOT_FOUND|Cannot find module|SyntaxError/);
  const names = readdirSync(path.join(root, 'evidence'));
  assert.ok(names.includes('red-catalog-filters.stub.js.txt'));
  assert.ok(names.filter(name => /stub/.test(name)).every(name => name.endsWith('.txt')));
  const stub = read(path.join('evidence', 'red-catalog-filters.stub.js.txt'));
  assert.match(stub, /items: \[\]/);
  assert.equal(JSON.parse(read(path.join('evidence', 'iac-na.json'))).applicability, 'not-applicable');
});

test('browser evidence requires explicit successful capture and no historical proof deletion', () => {
  const browser = read(path.join('tests', 'browser.test.cjs'));
  assert.match(browser, /process\.env\.CAPTURE_BROWSER_EVIDENCE === '1'/);
  assert.match(browser, /await session\.close\(\)/);
  assert.match(browser, /finally/);
  assert.doesNotMatch(browser, /fs\.(?:rm|unlink|rmdir)\(/);
  assert.match(browser, /openIsolatedLesson\('capability\\\\C007\\\\index\.html'\)/);
  assert.doesNotMatch(browser, /selectOption|force:\s*true|bypassCSP:\s*true|--no-sandbox|disable-web-security/);
});
