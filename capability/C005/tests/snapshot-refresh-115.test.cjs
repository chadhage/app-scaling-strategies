'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');
const catalog = require('../catalog-data.js');
const matrix = require('../../C003/matrix-data.js');
const contract = require('../catalog-contract.js');
const source = require('../catalog-source.cjs');
const previous = require('../evidence/op-catalog-snapshot-refresh-101-541256d56385/generation.json');
const { searchCatalog } = require('../../C006/search.js');
const { filterCatalog } = require('../../C007/catalog-filters.js');
const { prepare } = require('../../C008/preparation.js');
const { compose } = require('../../local-harness/composition.js');

const FIXED_SOURCE = 'e8a3064f8554906216a9e0c3cf1344a3a6acf019';
const repo = path.resolve(__dirname, '..', '..', '..');
const ledger = JSON.parse(execFileSync('git', ['--no-pager', 'show',
  `${FIXED_SOURCE}:.docs/wiki/flow-state.json`], { cwd: repo, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 }));
const acceptedUnits = ledger.cards.filter(source.acceptedLesson);
const expectedIds = acceptedUnits.filter(card => /^A-S\d{3}$/.test(card.id))
  .map(card => card.id.slice(2)).sort();
const exactIds = [...Array.from({ length: 99 }, (_, index) =>
  `S${String(index + 1).padStart(3, '0')}`), 'S103'];
const newlyAcceptedIds = expectedIds.filter(id => !previous.acceptedPortableIds.includes(id));
const exactNewIds = [...Array.from({ length: 13 }, (_, index) =>
  `S${String(index + 87).padStart(3, '0')}`), 'S103'];

test('the catalog and generator bind to the full immutable 115-unit source, never live HEAD', () => {
  assert.equal(acceptedUnits.length, 115);
  assert.deepEqual(ledger.kanoDone, { S: 113, L: 0, D: 2 });
  assert.deepEqual(expectedIds, exactIds);
  assert.deepEqual(newlyAcceptedIds, exactNewIds);
  assert.equal(catalog.source.commit, FIXED_SOURCE);
  assert.equal(catalog.acceptanceSnapshot.commit, FIXED_SOURCE);
  assert.equal(catalog.acceptanceSnapshot.live, false);
  assert.equal(source.PINNED_COMMIT, FIXED_SOURCE);
});

test('all 100 noncontiguous accepted practices survive every existing consumer unchanged', async () => {
  assert.deepEqual(contract.validateCatalog(catalog, matrix), { valid: true, errors: [] });
  const accepted = catalog.entries.filter(entry => entry.learning.available);
  assert.equal(accepted.length, 100, 'the fixed new snapshot must expose all 100 accepted practices');
  assert.deepEqual(accepted.map(entry => entry.id), exactIds);
  assert.deepEqual(searchCatalog(catalog, matrix, '').filter(entry => entry.learning.available), accepted);
  const filtered = filterCatalog(catalog, matrix, { risk: 'unclassified', readiness: 'portable-available' });
  assert.equal(filtered.valid, true);
  assert.deepEqual(filtered.items.map(item => item.entry), accepted);
  const unified = await compose(catalog, matrix, {
    filters: { risk: 'unclassified', readiness: 'portable-available' }
  });
  assert.equal(unified.valid, true);
  assert.deepEqual(unified.items.map(item => item.entry), accepted);
  for (const entry of accepted) {
    assert.ok(searchCatalog(catalog, matrix, entry.objective).includes(entry), entry.id);
    const view = await prepare(catalog, matrix, entry.id);
    assert.equal(view.state, 'ready', entry.id);
    assert.equal(view.learningMode, 'synthetic-learning', entry.id);
    assert.strictEqual(view.entry, entry);
    assert.equal(entry.learning.href, `../../learning/${entry.id}/index.html`);
  }
});

for (const id of exactNewIds) {
  test(`${id} newly accepted in the fixed source has literal search, AND-filter, preparation and unified practice`, async () => {
    assert.ok(newlyAcceptedIds.includes(id), id);
    const entry = catalog.entries.find(candidate => candidate.id === id);
    assert.equal(entry.learning.available, true, `${id} must be available in the fixed 100-practice snapshot`);
    assert.equal(entry.learning.cardId, `A-${id}`);
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
    assert.equal(entry.native.runnable, false, id);
    assert.equal(entry.native.qualified, false, id);
    assert.equal(entry.parent.completed, false, id);
  });
}

test('negative gates: S100-S102, S104+, workflows, native work and source-parent completions stay unavailable', async () => {
  assert.equal(catalog.entries.length, 152);
  for (const entry of catalog.entries) {
    assert.equal(entry.native.runnable, false, entry.id);
    assert.equal(entry.native.qualified, false, entry.id);
    assert.equal(entry.parent.completed, false, entry.id);
    assert.equal(entry.support.status, 'unknown', entry.id);
    assert.equal(entry.risk, 'unclassified', entry.id);
    if (exactIds.includes(entry.id)) continue;
    assert.equal(entry.learning.available, false, entry.id);
    assert.equal(entry.learning.href, null, entry.id);
    assert.equal(entry.learning.evidence, null, entry.id);
    const view = await prepare(catalog, matrix, entry.id);
    assert.equal(view.learningMode, entry.kind === 'workflow' ? 'unsupported-learning' : 'unavailable-learning', entry.id);
  }
  for (const id of ['S100', 'S101', 'S102', 'S104']) {
    assert.equal(source.acceptedLesson(ledger.cards.find(card => card.id === `A-${id}`)), false, id);
  }
  assert.deepEqual(ledger.completedParents, []);
  assert.equal(ledger.completedParents.includes('H001'), false);
  assert.equal(ledger.completedParents.includes('H002'), false);
});
