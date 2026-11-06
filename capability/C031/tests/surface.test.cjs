'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const evaluator = require('..\\evaluator.js');

const root = path.resolve(__dirname, '..');
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
const html = read('index.html');
const production = ['cli.cjs', 'evaluator.js', 'page.js', 'saved.js', 'source.cjs'];

test('the page carries the exact training banner and the strict content security policy', () => {
  assert.equal(/<p id="banner" class="banner">([^<]*)<\/p>/.exec(html)[1], evaluator.banner);
  assert.equal(/http-equiv="Content-Security-Policy" content="([^"]*)"/.exec(html)[1],
    "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-src 'none'; worker-src 'none'");
});

test('there is no inline script, handler, style attribute, remote URL or javascript link', () => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(scripts.map((match) => /src="([^"]+)"/.exec(match[1])[1]), [
    '../C034/evidence/raw/trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116/bundle.js', 'saved.js', 'evaluator.js', 'page.js']);
  assert.ok(scripts.every((match) => match[2] === '' && /\sdefer(\s|$)/.test(match[1])));
  assert.ok(!/\son[a-z]+=/i.test(html) && !/\sstyle=/i.test(html) && !/javascript:/i.test(html));
  for (const name of ['index.html', 'style.css', ...production]) assert.ok(!/https?:\/\//i.test(read(name)), name);
  assert.equal([...html.matchAll(/<link\b[^>]*>/g)].map((match) => match[0]).join(), '<link rel="stylesheet" href="style.css">');
});

test('ids are unique, the picker is labelled, buttons are plain buttons and status and error are live regions', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /<label for="source-id">/);
  assert.deepEqual([...html.matchAll(/<button\b([^>]*)>/g)].map((match) => [/id="([^"]+)"/.exec(match[1])[1], /type="([^"]+)"/.exec(match[1])[1]]),
    [['evaluate', 'button'], ['compare', 'button'], ['reset', 'button']]);
  assert.match(html, /<p id="status" role="status" aria-live="polite" data-state="UNASSESSED">/);
  assert.match(html, /<p id="error" role="alert">/);
  assert.match(html, /<caption>[^<]+<\/caption>/);
  assert.equal([...html.matchAll(/<th scope="col">/g)].length, 8);
  assert.match(read('style.css'), /:focus-visible \{ outline: 3px solid/);
  assert.match(html, /<html lang="en">/);
});

test('the page states its limits: fictional, local, no live Azure result, no production runtime validated', () => {
  assert.match(html, /UI verification of local data, not a live migration, not user journey success and not an SLA/);
  assert.match(html, /production Node 24, Express, Entra and any real service are neither validated nor registered/);
  assert.match(html, /counts only clients with an acknowledged old-to-new version change/i);
  assert.ok(!/five nines|guarantee|certified/i.test(html.replace(/not an SLA/g, '')));
});

test('production code is pure and offline: no wall clock, randomness, network, dynamic code or browser storage', () => {
  for (const name of ['evaluator.js', 'saved.js', 'page.js']) {
    const text = read(name);
    for (const pattern of [/Date\.now|new Date\b|Math\.random|performance\.now/, /\beval\(|new Function|innerHTML|document\.write/,
      /\bfetch\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|\bimport\(/, /process\.env|require\('node:/]) assert.ok(!pattern.test(text), `${name} ${pattern}`);
  }
  for (const name of ['source.cjs', 'cli.cjs']) {
    const text = read(name);
    assert.ok(!/require\('node:(?:https?|net|dns|tls|dgram|http2)'\)/.test(text), name);
    assert.ok(!/Date\.now|new Date\b|Math\.random/.test(text), name);
  }
  assert.deepEqual([...read('source.cjs').matchAll(/execFileSync\('([^']+)', \[([^\]]*)\]/g)].map((match) => [match[1], match[2]]),
    [['git', "'--no-pager', 'cat-file', '--batch'"]]);
  assert.ok(!/publish|\.git[\\/]|rev-parse|git status|git add/.test(read('source.cjs') + read('cli.cjs')));
});

test('the evaluator module has no dependency: no require, no import, no file or process access', () => {
  const text = read('evaluator.js');
  assert.deepEqual([...text.matchAll(/require\(/g)].length, 0);
  assert.ok(!/\bfs\b|child_process|process\./.test(text));
  assert.equal(typeof evaluator.evaluateFleet, 'function');
});

test('the namespace holds exactly the committed file set and the enumerated production scripts', () => {
  const files = fs.readdirSync(root, { withFileTypes: true });
  assert.deepEqual(files.filter((entry) => entry.isFile()).map((entry) => entry.name).sort(), [
    '.gitattributes', 'C031.feature', 'README.md', 'cli.cjs', 'evaluator.js', 'imports.json', 'index.html', 'page.js', 'saved.js', 'source.cjs', 'style.css']);
  assert.deepEqual(files.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort(), ['evidence', 'tests']);
  assert.deepEqual(files.filter((entry) => entry.isFile() && /\.(?:js|cjs)$/.test(entry.name)).map((entry) => entry.name).sort(), production);
  for (const entry of fs.readdirSync(root, { recursive: true })) assert.match(entry, /^[A-Za-z0-9._@+=,\\-]+$/, 'publisher-safe path characters only');
});

test('the README gives the exact commands for RED, GREEN, coverage and the real browser check', () => {
  const readme = read('README.md');
  for (const command of ['node --test capability\\C031\\evidence\\red\\evaluator.red.test.cjs',
    'node --test --test-concurrency=1 capability\\C031\\tests\\evaluator.test.cjs',
    'node capability\\C031\\tests\\coverage.cjs', 'node capability\\C031\\tests\\browser.cjs',
    'node capability\\C031\\cli.cjs evaluate negative-unchanged-flood']) assert.ok(readme.includes(command), command);
  assert.ok(readme.includes('Training rehearsal - synthetic data - not a live Azure result'));
  assert.ok(readme.includes('3 of 8') && readme.includes('3 of 7') && readme.includes('1 of 2'));
});
