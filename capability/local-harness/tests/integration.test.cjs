'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../../C005/catalog-data.js');
const matrix = require('../../C003/matrix-data.js');
const { compose } = require('../composition.js');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const searchApi = require('../../C006/search.js');
const filterApi = require('../../C007/catalog-filters.js');
const preparationApi = require('../../C008/preparation.js');
const generation = require('../../C005/evidence/op-catalog-snapshot-refresh-76-01675ac8d423/generation.json');
const ids = items => items.map(item => item.entry.id);

function assertClosed(result) {
  assert.equal(result.valid, false);
  assert.equal(result.items.length, 0);
  assert.equal(result.incompatible.length, 0);
  assert.equal(result.matrixRows.length, 0);
  for (const key of ['preparation', 'provenance', 'permissions', 'riskReason']) assert.equal(result[key], null, key);
  assert.ok(result.errors.length > 0);
}

test('one actual query AND host/risk/readiness selection opens the exact shared preparation', async () => {
  const result = await compose(catalog, matrix, {
    query: '  BLUE-GREEN  ',
    filters: { host: 'aks', risk: 'unclassified', readiness: 'portable-available' },
    entryId: 'S001'
  });
  assert.equal(result.valid, true);
  assert.deepEqual(result.items.map(item => item.entry.id), ['S001']);
  assert.equal(result.items[0].entry, catalog.entries[0]);
  assert.equal(result.items[0].hostAssessment.status, 'unknown');
  assert.equal(result.preparation.state, 'ready');
  assert.equal(result.preparation.entry, catalog.entries[0]);
  assert.equal(result.preparation.catalog, catalog);
  assert.equal(result.preparation.matrix, matrix);
  assert.equal(result.preparation.entry.learning.href, '../../learning/S001/index.html');
});

test('empty / whitespace queries retain all 152 original references and the historical acceptance boundary', async () => {
  for (const query of ['', ' \t\n ']) {
    const result = await compose(catalog, matrix, { query });
    assert.equal(result.valid, true);
    assert.deepEqual(result.items.map(item => item.entry), catalog.entries);
    assert.equal(result.incompatible.length, 0);
    assert.equal(result.preparation.state, 'empty');
    assert.equal(result.preparation.entry, null);
    assert.equal(result.provenance.source, catalog.source);
    assert.equal(result.provenance.acceptanceSnapshot, catalog.acceptanceSnapshot);
    assert.equal(result.permissions, matrix.permissions);
    assert.deepEqual(result.items.filter(item => item.entry.learning.available).map(item => item.entry.id),
      generation.acceptedPortableIds);
    assert.equal(result.provenance.acceptanceSnapshot.live, false);
    for (const item of result.items) {
      assert.equal(item.entry.native.runnable, false);
      assert.equal(item.entry.native.qualified, false);
      assert.equal(item.entry.parent.completed, false);
      assert.equal(item.entry.risk, 'unclassified');
      assert.equal(item.entry.support.status, 'unknown');
    }
  }
});

test('every canonical title composes with the original preparation, without replacing IDs or order', async () => {
  for (const entry of catalog.entries) {
    const result = await compose(catalog, matrix, { query: entry.title, entryId: entry.id });
    assert.equal(result.valid, true, entry.id);
    assert.equal(result.preparation.entry, entry);
    assert.ok(result.items.some(item => item.entry === entry), entry.id);
    assert.equal(result.preparation.catalog.common, catalog.common);
    assert.equal(result.preparation.entry.prerequisites, entry.prerequisites);
    assert.equal(result.preparation.entry.sourceReferences, entry.sourceReferences);
    const positions = result.items.map(item => catalog.entries.indexOf(item.entry));
    assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
  }
});

test('query and AND predicates intersect both original C007 lists without reclassification', async () => {
  const selections = [
    { host: 'aks', risk: 'all', readiness: 'all' },
    { host: 'app-service', risk: 'unclassified', readiness: 'portable-available' },
    { host: 'container-apps', risk: 'unclassified', readiness: 'portable-unavailable' },
    { host: 'functions', risk: 'all', readiness: 'native-unavailable' },
    { host: 'unselected', risk: 'unclassified', readiness: 'all' },
    { host: 'aks', risk: 'assessed', readiness: 'all' },
    { host: 'app-service', risk: 'all', readiness: 'native-qualified' },
    { host: 'all', risk: 'all', readiness: 'parent-complete' }
  ];
  for (const query of ['', 'blue', 'getProfile']) {
    for (const filters of selections) {
      const searched = searchApi.searchCatalog(catalog, matrix, query);
      const filtered = filterApi.filterCatalog(catalog, matrix, filters);
      const result = await compose(catalog, matrix, { query, filters });
      assert.equal(result.valid, true);
      for (const key of ['items', 'incompatible']) {
        assert.deepEqual(result[key], filtered[key].filter(item => searched.includes(item.entry)));
        for (const item of result[key]) assert.equal(item.entry, catalog.entries.find(entry => entry.id === item.entry.id));
      }
      assert.deepEqual(result.matrixRows, filtered.matrixRows);
      for (const row of result.matrixRows) assert.equal(row, matrix.rows.find(candidate => candidate.id === row.id));
    }
  }
});

test('an explicit host conflict still permits exact source preparation and accepted portable learning', async () => {
  const result = await compose(catalog, matrix, {
    query: catalog.entries[1].title,
    filters: { host: 'aks', risk: 'unclassified', readiness: 'portable-available' },
    entryId: 'S002'
  });
  assert.equal(result.valid, true);
  assert.deepEqual(ids(result.items), []);
  assert.deepEqual(ids(result.incompatible), ['S002']);
  assert.equal(result.incompatible[0].hostAssessment.status, 'incompatible');
  assert.match(result.incompatible[0].hostAssessment.reason, /P001/);
  assert.equal(result.preparation.entry, catalog.entries[1]);
  assert.equal(result.preparation.learningMode, 'synthetic-learning');
});

test('workflows and later lessons retain unsupported / unavailable modes, CONTAINER alternatives and BASE distinctions', async () => {
  const workflow = catalog.entries[151];
  const result = await compose(catalog, matrix, {
    query: 'getProfile', filters: { host: 'app-service' }, entryId: 'W002'
  });
  assert.equal(result.valid, true);
  assert.deepEqual(ids(result.incompatible), ['W002']);
  assert.equal(result.preparation.entry, workflow);
  assert.equal(result.preparation.learningMode, 'unsupported-learning');
  assert.equal(result.preparation.entry.prerequisites.inheritsBase, false);
  assert.match(result.preparation.entry.prerequisites.additional, /^CONTAINER,/);
  assert.match(result.preparation.catalog.common.dependencyRules.text, /P002 OR P003/);
  const later = await compose(catalog, matrix, { entryId: 'S062' });
  assert.equal(later.preparation.learningMode, 'unavailable-learning');
  assert.equal(later.preparation.entry.learning.href, null);
});

test('no match and classified/native/parent readiness empties are successes, not provider failures', async () => {
  for (const request of [
    { query: 'op-catalog-definitely-absent' }, { query: '<script>literal.*</script>' },
    { query: 'blue  green' }, { filters: { risk: 'low' } },
    { filters: { risk: 'assessed' } }, { filters: { readiness: 'native-runnable' } },
    { filters: { readiness: 'native-qualified' } }, { filters: { readiness: 'parent-complete' } }
  ]) {
    const result = await compose(catalog, matrix, request);
    assert.equal(result.valid, true);
    assert.equal(result.items.length, 0);
    assert.equal(result.incompatible.length, 0);
    assert.equal(result.preparation.state, 'empty');
  }
});

test('a filtered-out, invalid or mismatched selection never leaves partial results or preparation', async () => {
  for (const request of [
    { query: 'op-catalog-definitely-absent', entryId: 'S001' },
    { filters: { readiness: 'portable-unavailable' }, entryId: 'S001' },
    { entryId: 'S151' }, { entryId: null }, { entryId: 1 }, { entryId: 's001' }
  ]) assertClosed(await compose(catalog, matrix, request));
});

test('malformed catalogs, matrices and attempted authority promotions delegate rejection and clear everything', async () => {
  const cases = [
    [undefined, matrix], [null, matrix], [catalog, undefined],
    [Object.assign(structuredClone(catalog), { schemaVersion: '2.0.0' }), matrix]
  ];
  for (const mutate of [
    value => { delete value.entries[3]; },
    value => { value.entries[0].risk = 'low'; },
    value => { value.entries[0].native.runnable = true; },
    value => { value.entries[0].parent.completed = true; },
    value => { value.entries[0].learning.href = 'javascript:alert(1)'; }
  ]) {
    const invalid = structuredClone(catalog);
    mutate(invalid);
    cases.push([invalid, matrix]);
  }
  const promoted = structuredClone(matrix);
  promoted.permissions.expenditureApproved = true;
  cases.push([catalog, promoted]);
  for (const [data, authority] of cases) assertClosed(await compose(data, authority));
});

test('bad queries, filters and invented integration fields fail without coercion or new filtering features', async () => {
  for (const request of [
    null, [], { query: null }, { query: new String('blue') },
    { filters: null }, { filters: { host: 'made-up-host' } },
    { filters: { risk: 'safe' } }, { filters: { format: 'code' } },
    { priority: 'P0' }, { prerequisites: 'BASE' }
  ]) assertClosed(await compose(catalog, matrix, request));
});

function browserComposition(replacements = {}) {
  const sandbox = { C006Search: searchApi, C007Filters: filterApi, C008Preparation: preparationApi, ...replacements };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', 'composition.js'), 'utf8'), sandbox);
  return sandbox.CatalogComposition;
}

test('absent or incompatible browser providers fail closed without replacement policy', async () => {
  for (const replacements of [
    { C006Search: undefined }, { C007Filters: undefined }, { C008Preparation: undefined },
    { C006Search: { ...searchApi, SEARCH_VERSION: '2.0.0' } },
    { C007Filters: { filterCatalog: 1 } }, { C008Preparation: { prepare: 1 } },
    { C008Preparation: { prepare: async () => ({ state: 'not-implemented' }) } },
    { C008Preparation: { prepare: async () => { throw new Error('provider failed'); } } },
    { C008Preparation: { prepare: async () => ({ state: 'ready', catalog, matrix, entry: catalog.entries[1] }) } }
  ]) assertClosed(await browserComposition(replacements).compose(catalog, matrix));
});

test('C001 approval or integrity-guard absence is rejected through the unchanged C008 preparation', async () => {
  const sandbox = { C005Contract: require('../../C005/catalog-contract.js') };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '..', '..', 'C008', 'preparation.js'), 'utf8'), sandbox);
  assertClosed(await browserComposition({ C008Preparation: sandbox.C008Preparation }).compose(catalog, matrix));
});

test('composition leaves all providers unchanged and retains readonly original references', async () => {
  const approved = require('../../C001/approved-contract.js');
  const before = [catalog, matrix, approved].map(value => JSON.stringify(value));
  const result = await compose(catalog, matrix, { entryId: 'S001' });
  for (const value of [result, result.items, result.incompatible, result.matrixRows]) assert.ok(Object.isFrozen(value));
  assert.equal(result.preparation.approved, approved);
  assert.equal(result.preparation.approvalValidation.nativeReady, false);
  assert.equal(result.preparation.approvalValidation.productionRuntimeValidated, false);
  assert.ok(Object.values(result.permissions).every(value => value === false || value === 0));
  assert.deepEqual([catalog, matrix, approved].map(value => JSON.stringify(value)), before);
});
