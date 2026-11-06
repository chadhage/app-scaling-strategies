'use strict';

// F9 of the review of the first publication, as tests that are exercised on BOTH sets of bytes: the first publication (git blobs of commit 368332e2a881, where each
// check reports the defect) and the working tree (where it reports nothing).
//  1. The browser summary pins every file the browser harness loads: tests\browser.cjs listed eight sources and left out tests\invariants.cjs, through which every
//     comparison of the real DOM runs.
//  2. The README says what the page does with a refused fragment: the address is restored while a position is displayed, and a fragment refused on a fresh load stays
//     in the address (the behaviour itself is tested in tests\page.test.cjs F9). The first README said the address always names the displayed position.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { firstBlobs } = require('.\\evidence-check.cjs');

const root = path.resolve(__dirname, '..');
const OWN = 'capability\\X001\\';
const win = path.win32;
const requiresOf = (text) => [...text.matchAll(/require\('(\.\.?\\\\[^']+)'\)/g)].map((match) => match[1].replaceAll('\\\\', '\\'));

// The X001 files a script loads through relative requires, transitively; `read` answers the text of a namespace-relative file or null. Files of other namespaces
// (a path that leaves this one) are pinned by imports.json, not by the summary.
function closure(entry, read) {
  const seen = new Set();
  const visit = (file) => {
    const text = seen.has(file) || file.startsWith('..') ? null : read(file);
    if (text === null) return;
    seen.add(file);
    for (const request of requiresOf(text)) visit(win.normalize(win.join(win.dirname(file), request)));
  };
  visit(entry);
  return [...seen].sort();
}

const pinnedSources = (text) => {
  const match = /const sources = \[([^\]]*)\]/.exec(text);
  return match ? [...match[1].matchAll(/'((?:[^'\\]|\\.)*)'/g)].map((item) => item[1].replaceAll('\\\\', '\\')) : [];
};
const unpinned = (read) => closure('tests\\browser.cjs', read).filter((file) => !pinnedSources(read('tests\\browser.cjs')).includes(file));

const CANDIDATES = ['tests\\browser.cjs', 'tests\\browser-dom.cjs', 'tests\\invariants.cjs', 'tests\\oracle.cjs', 'saved.js', 'timeline.js', 'describe.js'];
const readFirst = (() => {
  const blobs = firstBlobs(CANDIDATES.map((name) => OWN + name));
  return (name) => (blobs.has(OWN + name) ? blobs.get(OWN + name).toString('utf8') : null);
})();
const readFinal = (name) => (fs.existsSync(path.join(root, name)) ? fs.readFileSync(path.join(root, name), 'utf8') : null);

test('the browser summary pins every file the harness loads: the first publication left out tests\\invariants.cjs, the final harness leaves out nothing', () => {
  assert.deepEqual(unpinned(readFirst), ['tests\\invariants.cjs']);
  assert.deepEqual(unpinned(readFinal), []);
  assert.deepEqual(closure('tests\\browser.cjs', readFinal).filter((file) => file.startsWith('tests\\')), ['tests\\browser-dom.cjs', 'tests\\browser.cjs', 'tests\\invariants.cjs', 'tests\\oracle.cjs']);
});

test('the closure and the pin reader are exact: a require of an unpinned helper is found, a pinned one is not, and a non-require string is ignored', () => {
  const files = {
    'tests\\browser.cjs': "const a = require('.\\\\one.cjs'); const sources = ['one.cjs', 'tests\\\\browser.cjs'];\n",
    'tests\\one.cjs': "const b = require('.\\\\two.cjs'); const s = '.\\\\three.cjs';\n",
    'tests\\two.cjs': "module.exports = require('..\\\\data.js');\n",
    'data.js': "module.exports = 1;\n",
  };
  const read = (name) => (name in files ? files[name] : null);
  assert.deepEqual(closure('tests\\browser.cjs', read), ['data.js', 'tests\\browser.cjs', 'tests\\one.cjs', 'tests\\two.cjs']);
  assert.deepEqual(pinnedSources(files['tests\\browser.cjs']), ['one.cjs', 'tests\\browser.cjs']);
  assert.deepEqual(unpinned(read), ['data.js', 'tests\\one.cjs', 'tests\\two.cjs']);
  assert.deepEqual(unpinned((name) => (name === 'tests\\browser.cjs' ? "const sources = ['tests\\\\browser.cjs'];\n" : null)), []);
});

const addressProblems = (readme) => {
  const text = readme.replace(/\s+/g, ' ');
  const problems = [];
  if (/address always names the displayed position|is replaced in the address by the displayed/.test(text)) problems.push('the README says the address always names the displayed position');
  if (!/with nothing displayed[^.]*the fragment stays in the address/.test(text)) problems.push('the README does not say that a fragment refused on a fresh load stays in the address');
  return problems;
};

test('the README states what happens to a refused fragment as the page does it: the first README claimed the address always names the displayed position', () => {
  const first = firstBlobs([`${OWN}README.md`]).get(`${OWN}README.md`).toString('utf8');
  assert.equal(addressProblems(first).length, 2, 'both defects are reported on the first README');
  assert.deepEqual(addressProblems(fs.readFileSync(path.join(root, 'README.md'), 'utf8')), []);
});
