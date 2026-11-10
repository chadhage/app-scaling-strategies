'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadPage } = require('.\\dom-stub.cjs');
const { assertShown, assertUnloaded } = require('.\\invariants.cjs');
const saved = require('..\\saved.js');

test('G2 a no-detail refusal renders the exact code without a null annotation and clears stale success', () => {
  const valid = saved.runs.find((run) => run.id === 'c044-complete');
  const bad = { ...valid, id: 'u049-refused', format: 'unsupported' };
  const page = loadPage({ saved: { schema: 'X001-saved/1', runs: [valid, bad] }, hash: '#run=c044-complete&pos=3' });
  assertShown(page, valid.id, 2);
  page.$('saved-run').value = bad.id;
  page.click('load');
  assert.equal(page.text('error'), 'REFUSED FORMAT_UNSUPPORTED: this saved run is not shown as a timeline.');
  assert.doesNotMatch(page.text('error'), /\(null\)/);
  assertUnloaded(page, 'no-detail refusal');
  assert.equal(page.text('verified'), 'Nothing is verified yet.');
  assert.equal(page.location.hash, '#run=u049-refused&pos=1');
});

test('G2 same-run fragment scrubbing preserves entry-node identities and never rebuilds the entry list', () => {
  const page = loadPage({ hash: '#run=c044-restart-gap&pos=1' });
  const original = [...page.$('entries').children];
  const created = [];
  const create = page.document.createElement;
  page.document.createElement = (tag) => {
    const element = create(tag);
    if (tag === 'li') created.push(element);
    return element;
  };
  const entryCreates = () => created.filter((element) => /^entry-\d+$/.test(element.id)).length;
  for (const position of [2, 17, 44, 1, 20]) {
    page.changeHash(`#run=c044-restart-gap&pos=${position}`);
    assertShown(page, 'c044-restart-gap', position - 1);
    assert.equal(page.$('entries').children.length, original.length);
    original.forEach((item, index) => assert.equal(page.$('entries').children[index], item, `entry ${index + 1} keeps its identity`));
    assert.equal(entryCreates(), 0, 'no entry-list rebuild');
  }
  page.changeHash('#run=c044-complete&pos=4');
  assertShown(page, 'c044-complete', 3);
  assert.notEqual(page.$('entries').children[0], original[0], 'another run gets its own entry list');
  assert.equal(entryCreates(), 24, 'only the other run creates entry rows; limit-panel li elements are not entry rows');
  assert.deepEqual(page.calls, []);
});
