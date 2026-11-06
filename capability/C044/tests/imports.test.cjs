'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { pins, sha256, checkImports, tagCommit, repository } = require('./pins.cjs');

const root = path.resolve(__dirname, '..');
const production = fs.readdirSync(root).filter((name) => /\.c?js$/.test(name)).sort();

test('every imported accepted producer file still has its pinned raw, CRLF-normalized and accepted Git bytes', () => {
  const checked = checkImports();
  assert.equal(checked.length, pins.dependencies.length);
  for (const result of checked) {
    assert.equal(result.rawMatches, true, `${result.path} working-tree bytes changed`);
    assert.equal(result.lfMatches, true, `${result.path} LF-normalized bytes changed`);
    assert.equal(result.gitMatches, true, `${result.path} no longer equals the accepted Git blob`);
  }
});

test('the accepted tag resolves to the recorded commit and the helper pin is the published isolated helper', () => {
  for (const [card, accepted] of Object.entries(pins.accepted)) {
    assert.match(accepted.tag, new RegExp(`^kanban/${card}/[0-9a-f]{12}$`));
    assert.equal(tagCommit(accepted.tag), accepted.commit);
    assert.ok(accepted.commit.startsWith(accepted.tag.split('/')[2]));
  }
  const helper = fs.readFileSync(path.join(repository, 'testing', 'browser', 'isolated.cjs'));
  assert.equal(sha256(helper), pins.browserHelperRawSha256);
  assert.deepEqual(Object.keys(pins.gatesNotImported), ['C019', 'C036']);
});

test('production code imports no other namespace file than the pinned ones', () => {
  const pinned = new Set(pins.dependencies.map((entry) => entry.path.replaceAll('\\', '/')));
  const found = new Set();
  for (const name of production) {
    const source = fs.readFileSync(path.join(root, name), 'utf8');
    for (const match of source.matchAll(/require\(\s*'\.\.\/(C\d{3}\/[^']+)'\s*\)/g)) found.add(`capability/${match[1]}`);
    for (const match of source.matchAll(/'\.\.',\s*'(C\d{3})',\s*'([^']+)'/g)) found.add(`capability/${match[1]}/${match[2]}`);
    assert.doesNotMatch(source, /require\(\s*['"]\.\.\/\.\.\/(?!\.)/, `${name} reaches outside the capability folder`);
  }
  assert.ok(found.size >= 3, 'the scan itself must find the imports');
  for (const file of found) assert.ok(pinned.has(file), `${file} is imported but not pinned`);
});

test('the pinned C015 consumers are exactly the ones this card calls', () => {
  const store = fs.readFileSync(path.join(root, 'store.cjs'), 'utf8');
  const context = fs.readFileSync(path.join(root, 'context.cjs'), 'utf8');
  assert.match(store, /require\('\.\.\/C015\/contract\.cjs'\)/);
  assert.match(context, /require\('\.\.\/C015\/store\.cjs'\)/);
  assert.match(context, /c015\.restore\(known\.namespace, known\.runId\)/, 'only the public read-only restore is used');
  assert.doesNotMatch(context, /persist/, 'C044 never writes C015 state');
});
