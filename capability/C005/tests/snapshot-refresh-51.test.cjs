'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const catalog = require('../evidence/op-catalog-snapshot-refresh-76-01675ac8d423/catalog-data.d3548de61f4b.js.txt');
const matrix = require('../../C003/matrix-data.js');
const contract = require('../catalog-contract.js');
const source = require('../catalog-source.cjs');
const previous = require('../evidence/op-catalog-snapshot-refresh-3565746a0882/generation.json');
const { searchCatalog } = require('../../C006/search.js');
const { filterCatalog } = require('../../C007/catalog-filters.js');
const { prepare } = require('../../C008/preparation.js');
const { compose } = require('../../local-harness/composition.js');

const FIXED_SOURCE = 'd3548de61f4b800c8b0c911c7091b5e4826b5547';
const repo = path.resolve(__dirname, '..', '..', '..');
const ledger = JSON.parse(execFileSync('git', ['--no-pager', 'show',
  `${FIXED_SOURCE}:.docs/wiki/flow-state.json`], { cwd: repo, encoding: 'utf8' }));
const acceptedUnits = ledger.cards.filter(source.acceptedLesson);
const expectedIds = acceptedUnits.filter(card => /^A-S\d{3}$/.test(card.id))
  .map(card => card.id.slice(2)).sort();

test('the archived fifty-one-unit historical source exposes all 36 accepted portable lessons through every consumer', async () => {
  assert.deepEqual(contract.validateCatalog(catalog, matrix), { valid: true, errors: [] });
  const accepted = catalog.entries.filter(entry => entry.learning.available);
  assert.equal(accepted.length, 36, 'the new snapshot must expose all thirty-six accepted portable lessons');
  assert.equal(acceptedUnits.length, 51);
  assert.equal(expectedIds.length, 36);
  assert.deepEqual(accepted.map(entry => entry.id), expectedIds);
  assert.equal(catalog.source.commit, FIXED_SOURCE);
  assert.equal(catalog.acceptanceSnapshot.commit, FIXED_SOURCE);
  assert.equal(catalog.acceptanceSnapshot.live, false);
  assert.deepEqual(searchCatalog(catalog, matrix, '').filter(entry => entry.learning.available), accepted);
  const filtered = filterCatalog(catalog, matrix, { readiness: 'portable-available' });
  assert.equal(filtered.valid, true);
  assert.deepEqual(filtered.items.map(item => item.entry), accepted);
  const unified = await compose(catalog, matrix, { filters: { readiness: 'portable-available' } });
  assert.equal(unified.valid, true);
  assert.deepEqual(unified.items.map(item => item.entry), accepted);
  for (const entry of accepted) {
    const view = await prepare(catalog, matrix, entry.id);
    assert.equal(view.state, 'ready', entry.id);
    assert.equal(view.learningMode, 'synthetic-learning', entry.id);
    assert.strictEqual(view.entry, entry);
    assert.equal(entry.learning.href, `../../learning/${entry.id}/index.html`);
  }
  assert.equal(catalog.entries.length, 152);
  assert.equal(catalog.entries.filter(entry => entry.native.runnable || entry.native.qualified
    || entry.parent.completed || entry.support.status !== 'unknown' || entry.risk !== 'unclassified').length, 0);
});

test('all sixteen newly accepted lessons gain real search, readiness, preparation and unified-practice coverage', async () => {
  const newlyAcceptedIds = expectedIds.filter(id => !previous.acceptedPortableIds.includes(id));
  assert.equal(newlyAcceptedIds.length, 16);
  for (const id of newlyAcceptedIds) {
    const entry = catalog.entries.find(candidate => candidate.id === id);
    assert.equal(entry.learning.available, true, id);
    assert.ok(searchCatalog(catalog, matrix, entry.title).includes(entry), id);
    const filtered = filterCatalog(catalog, matrix, { risk: 'unclassified', readiness: 'portable-available' });
    assert.ok(filtered.items.some(item => item.entry === entry), id);
    const view = await prepare(catalog, matrix, id);
    assert.equal(view.learningMode, 'synthetic-learning', id);
    const unified = await compose(catalog, matrix, {
      query: entry.title, filters: { readiness: 'portable-available' }, entryId: id
    });
    assert.equal(unified.valid, true, id);
    assert.strictEqual(unified.preparation.entry, entry, id);
    assert.equal(unified.preparation.entry.learning.href, `../../learning/${id}/index.html`);
  }
  for (const entry of catalog.entries.filter(candidate => !expectedIds.includes(candidate.id))) {
    assert.equal(entry.learning.available, false, entry.id);
    assert.equal(entry.learning.href, null, entry.id);
    assert.equal(entry.learning.evidence, null, entry.id);
  }
});
