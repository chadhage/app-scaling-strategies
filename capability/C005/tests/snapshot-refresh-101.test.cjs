'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const catalog = require('../catalog-data.js');
const matrix = require('../../C003/matrix-data.js');
const contract = require('../catalog-contract.js');
const source = require('../catalog-source.cjs');
const previous = require('../evidence/op-catalog-snapshot-refresh-76-01675ac8d423/generation.json');
const { searchCatalog } = require('../../C006/search.js');
const { filterCatalog } = require('../../C007/catalog-filters.js');
const { prepare } = require('../../C008/preparation.js');
const { compose } = require('../../local-harness/composition.js');

const FIXED_SOURCE = '541256d563853396745381b9aa5fffd8ee29148e';
const repo = path.resolve(__dirname, '..', '..', '..');
const ledger = JSON.parse(execFileSync('git', ['--no-pager', 'show',
  `${FIXED_SOURCE}:.docs/wiki/flow-state.json`], { cwd: repo, encoding: 'utf8' }));
const acceptedUnits = ledger.cards.filter(source.acceptedLesson);
const expectedIds = acceptedUnits.filter(card => /^A-S\d{3}$/.test(card.id))
  .map(card => card.id.slice(2)).sort();

test('the catalog is bound to the immutable 101-unit source, never mutable HEAD', () => {
  assert.equal(acceptedUnits.length, 101);
  assert.deepEqual(expectedIds, Array.from({ length: 86 }, (_, index) =>
    `S${String(index + 1).padStart(3, '0')}`));
  assert.equal(catalog.source.commit, FIXED_SOURCE);
  assert.equal(catalog.acceptanceSnapshot.commit, FIXED_SOURCE);
  assert.equal(catalog.acceptanceSnapshot.live, false);
  assert.equal(source.PINNED_COMMIT, FIXED_SOURCE);
});

test('all 86 accepted portable destinations survive every existing consumer without native or parent promotion', async () => {
  assert.deepEqual(contract.validateCatalog(catalog, matrix), { valid: true, errors: [] });
  const accepted = catalog.entries.filter(entry => entry.learning.available);
  assert.equal(accepted.length, 86, 'the new snapshot must expose all 86 accepted portable lessons');
  assert.deepEqual(accepted.map(entry => entry.id), expectedIds);
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
  assert.deepEqual(ledger.completedParents, []);
});

test('all 25 newly accepted lessons, starting at S062, gain real search, AND-filter, preparation and unified-practice coverage', async () => {
  const newlyAcceptedIds = expectedIds.filter(id => !previous.acceptedPortableIds.includes(id));
  assert.deepEqual(newlyAcceptedIds, Array.from({ length: 25 }, (_, index) =>
    `S${String(index + 62).padStart(3, '0')}`));
  for (const id of newlyAcceptedIds) {
    const entry = catalog.entries.find(candidate => candidate.id === id);
    assert.equal(entry.learning.available, true, `${id} must be accepted in the fixed new snapshot`);
    assert.ok(searchCatalog(catalog, matrix, entry.title).includes(entry), id);
    const filtered = filterCatalog(catalog, matrix, { risk: 'unclassified', readiness: 'portable-available' });
    assert.equal(filtered.valid, true, id);
    assert.ok(filtered.items.some(item => item.entry === entry), id);
    const view = await prepare(catalog, matrix, id);
    assert.equal(view.learningMode, 'synthetic-learning', id);
    const unified = await compose(catalog, matrix, {
      query: entry.title, filters: { risk: 'unclassified', readiness: 'portable-available' }, entryId: id
    });
    assert.equal(unified.valid, true, id);
    assert.strictEqual(unified.preparation.entry, entry, id);
    assert.equal(unified.preparation.entry.learning.href, `../../learning/${id}/index.html`);
  }
});

test('unaccepted A-S087 and later, workflows, native work and source-parent completions stay unavailable', async () => {
  for (const entry of catalog.entries.filter(candidate => !expectedIds.includes(candidate.id))) {
    assert.equal(entry.learning.available, false, entry.id);
    assert.equal(entry.learning.href, null, entry.id);
    assert.equal(entry.learning.evidence, null, entry.id);
    const view = await prepare(catalog, matrix, entry.id);
    assert.equal(view.learningMode, entry.kind === 'workflow' ? 'unsupported-learning' : 'unavailable-learning', entry.id);
    assert.equal(entry.native.runnable, false, entry.id);
    assert.equal(entry.native.qualified, false, entry.id);
    assert.equal(entry.parent.completed, false, entry.id);
  }
  assert.equal(source.acceptedLesson(ledger.cards.find(card => card.id === 'A-S087')), false);
  assert.equal(ledger.completedParents.includes('H001'), false);
  assert.equal(ledger.completedParents.includes('H002'), false);
});
