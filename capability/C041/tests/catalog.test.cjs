'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { test } = require('node:test');
const catalog = require('../accepted-catalog.js');
const { validateCatalog, verifyAsset } = require('../serve.cjs');
const clone = () => structuredClone(catalog);

test('runtime read-only catalog exactly matches the captured acceptance snapshot', () => {
  const snapshot = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'evidence', 'accepted-ledger-snapshot.json'), 'utf8'));
  assert.deepEqual(catalog, snapshot);
  assert.equal(validateCatalog(catalog), true);
});

for (const state of ['To Do', 'In Progress', 'Planned', undefined]) {
  test(`file existence cannot authorize a lesson in state ${state}`, () => {
    const candidate = clone();
    candidate.lessons[0].acceptance.state = state;
    assert.throws(() => validateCatalog(candidate), /Unaccepted lesson/);
  });
}

test('unaccepted, unreviewed, or non-remote-verified entries fail closed', () => {
  for (const key of ['accepted', 'focusedTestsPassed', 'browserObserved', 'remoteVerified']) {
    const candidate = clone();
    candidate.lessons[0].acceptance.review[key] = false;
    assert.throws(() => validateCatalog(candidate), /Unaccepted lesson/);
  }
});

test('native, duplicate, redirected, unpinned, and traversal entries fail closed', () => {
  const mutations = [
    value => { value.lessons[0].id = 'B-S001'; },
    value => { value.lessons.push(value.lessons[0]); },
    value => { value.lessons[0].entry = 'https://example.invalid/'; },
    value => { value.lessons[0].assets[0].path = '.git\\config'; },
    value => { value.lessons[0].assets[0].file = '../index.html'; },
    value => { value.lessons[0].assets[0].sha256 = ''; },
    value => { value.lessons[0].acceptance.tag = 'unreviewed-tag'; },
    value => { value.gate.liveAzureExecutionApproved = true; }
  ];
  for (const mutate of mutations) {
    const candidate = clone();
    mutate(candidate);
    assert.throws(() => validateCatalog(candidate));
  }
});

test('every selected original asset matches its recorded hash without editing the lesson', () => {
  const root = path.resolve(__dirname, '..', '..', '..');
  for (const lesson of catalog.lessons) {
    for (const asset of lesson.assets) {
      const bytes = fs.readFileSync(path.join(root, ...asset.path.split('\\')));
      assert.equal(verifyAsset(asset, bytes), bytes);
      assert.throws(() => verifyAsset(asset, Buffer.concat([bytes, Buffer.from('\nchanged')])), /integrity mismatch/);
    }
  }
});

test('snapshot is recursively immutable', () => {
  assert.throws(() => { catalog.gate.state = 'To Do'; }, TypeError);
  assert.throws(() => { catalog.lessons[0].assets[0].path = '.git\\config'; }, TypeError);
});
