'use strict';

const assert = require('node:assert/strict');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { evaluate, format, parse } = require('./coverage.cjs');
const { NOT_NODE_MEASURABLE, enumerate } = require('./production-files.cjs');
const { withServer, request } = require('./support.cjs');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const canonicalSha = (file) => createHash('sha256').update(fs.readFileSync(file).toString('latin1').replace(/\r\n/g, '\n'), 'latin1').digest('hex');
const imports = JSON.parse(read('imports.json'));

test('imported C001 producer files match their pinned accepted-commit bytes', () => {
  assert.match(imports.acceptedC001.commit, /^[0-9a-f]{40}$/);
  assert.equal(imports.acceptedC001.tag, `kanban/C001/${imports.acceptedC001.commit.slice(0, 12)}`);
  for (const [file, expected] of Object.entries(imports.c001CanonicalSha256)) {
    assert.equal(canonicalSha(path.join(root, '..', 'C001', file)), expected, file);
  }
  assert.match(imports.browserHelperRawSha256, /^[0-9a-f]{64}$/);
});

test('the enumerated production set is exactly the files that run, and nothing in it reaches into tests or evidence', () => {
  assert.deepEqual(enumerate(), ['client.js', 'contract.js', 'fixture.cjs', 'page.js', 'server.cjs']);
  assert.deepEqual([...NOT_NODE_MEASURABLE], ['index.html', 'style.css']);
  for (const file of enumerate()) {
    const source = read(file);
    assert.doesNotMatch(source, /require\(['"][^'"]*(tests|evidence)[^'"]*['"]\)/, file);
    assert.doesNotMatch(source, /server\.stub|initial\.snapshot/, file);
  }
  assert.equal(read('.gitattributes').trim(), '* -text');
});

test('the page has no inline script, handler or style, loads only local files and a forbidding CSP is served for it', async () => {
  const html = read('index.html');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)];
  assert.deepEqual(scripts.map((script) => /\bsrc="([^"]+)"/.exec(script[1])[1]), ['contract.js', 'client.js', 'page.js'], 'script order matters');
  assert.ok(scripts.every((script) => script[2] === '' && /\bdefer\b/.test(script[1])));
  assert.doesNotMatch(html, /\son[a-z]+=|\sstyle=|<form\b|<iframe\b|<img\b|javascript:|https?:\/\//i);
  assert.deepEqual([...html.matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)].map((match) => match[1]), ['data:,', 'style.css']);
  await withServer({}, async (fixture) => {
    for (const reference of ['/', '/contract.js', '/client.js', '/page.js', '/style.css']) assert.equal((await request(fixture, { path: reference })).status, 200, reference);
    for (const reference of ['/index.html', '/README.md', '/imports.json', '/C032.feature']) assert.equal((await request(fixture, { path: reference })).status, 404, reference);
  });
});

test('the page declares synthetic, loopback-only scope and never claims identity or native qualification', () => {
  const html = read('index.html');
  assert.match(html, /Synthetic business data · Loopback HTTP only/);
  assert.match(html, /No real identity verification/);
  assert.match(html, /fictional opaque strings, not Entra tokens/);
  assert.match(html, /No IaC, registration, Azure management, or spending/);
  assert.doesNotMatch(html, /localStorage|sessionStorage|indexedDB/);
});

test('the coverage gate treats unloaded, below-floor and unenumerated files as failures', () => {
  const measured = parse([
    '# a.js         | 100.00 | 100.00 | 100.00 |', '# b.cjs        |  84.99 | 100.00 | 100.00 |', '# c.js         | 100.00 |  80.00 | 100.00 |',
    '# d.js         | 100.00 | 100.00 |  84.00 |', '# extra.js     | 100.00 | 100.00 | 100.00 |', '# all files    | 100.00 | 100.00 | 100.00 |', 'noise'
  ].join('\n'));
  assert.deepEqual([...measured.keys()], ['a.js', 'b.cjs', 'c.js', 'd.js', 'extra.js']);
  const result = evaluate(['a.js', 'b.cjs', 'c.js', 'd.js', 'missing.js'], measured);
  assert.equal(result.passed, false);
  assert.deepEqual(result.files.map((item) => item.failures.length), [0, 1, 1, 1, 4]);
  assert.deepEqual(result.files.at(-1).failures[0], 'UNLOADED_COUNTS_AS_ZERO');
  assert.deepEqual(result.unenumerated, ['extra.js']);
  assert.match(format(result), /UNENUMERATED measured file: extra\.js/);
  assert.equal(evaluate(['a.js'], parse('# a.js | 85.00 | 85.00 | 85.00 |')).passed, true);
  assert.equal(evaluate([], new Map()).passed, false);
});

test('the server and the fixture contain no code that could read or set a cookie', () => {
  for (const file of ['server.cjs', 'fixture.cjs']) {
    const code = read(file).replace(/^\s*\/\/.*$/gm, '').replace("cookies are never read or set", '');
    assert.doesNotMatch(code, /cookie/i, file);
  }
});

// The GREEN and coverage archives cannot be checked here: they record this very suite's run, so tests\verify-evidence.cjs
// checks those two after the capture. Everything older than that run is checked below.
test('evidence.json indexes the archived evidence and every recorded hash of the stable files matches the bytes on disk', () => {
  const index = JSON.parse(read('evidence.json'));
  for (const [relative, expected] of Object.entries(index.sha256).filter(([relative]) => !/^evidence\/(green|coverage)\//.test(relative))) {
    assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root, relative))).digest('hex'), expected, relative);
  }
  const stage = (name) => index.workflow.find((item) => item.stage === name);
  assert.deepEqual(index.workflow.map((item) => item.stage), ['bdd', 'loadable-stub', 'behavioral-red', 'iac', 'implementation', 'green', 'coverage', 'browser']);
  assert.deepEqual(stage('coverage').files.map((item) => item.file), enumerate());
  assert.ok(stage('coverage').files.every((item) => item.lines >= 85 && item.branches >= 85 && item.functions >= 85));
  const browser = JSON.parse(read(stage('browser').path));
  assert.equal(browser.outcome, 'passed');
  assert.deepEqual([browser.cleanup.serverClosed, browser.cleanup.browserClosed], [true, true]);
  assert.equal(browser.edge.status, 'Valid');
  assert.match(browser.edge.signer, /Microsoft Corporation/);
  assert.equal(browser.checks.length, stage('browser').checks);
  assert.equal(browser.serverWire.filter((item) => item.cookieHeader === 'present').length, 8);
});
