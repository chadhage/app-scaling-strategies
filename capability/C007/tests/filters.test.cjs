'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../../C005/catalog-data.js');
const catalogContract = require('../../C005/catalog-contract.js');
const matrix = require('../../C003/matrix-data.js');
const matrixContract = require('../../C003/matrix-contract.js');
const filters = require('../catalog-filters.js');
const ids = result => result.items.map(item => item.entry.id);
const originalIds = catalog.entries.map(entry => entry.id);
const generation = require('../../C005/evidence/op-catalog-snapshot-refresh-101-541256d56385/generation.json');

test('C007 loads as a reusable module before any assertion about behavior', () => {
  assert.equal(typeof filters.filterCatalog, 'function');
  assert.equal(catalogContract.validateCatalog(catalog, matrix).valid, true);
});

test('all, omitted and empty selections preserve all 152 original entries, IDs and order', () => {
  for (const selection of [undefined, {}, { host: '', risk: '', readiness: '' },
    { host: 'all', risk: 'all', readiness: 'all' }]) {
    const result = filters.filterCatalog(catalog, matrix, selection);
    assert.equal(result.valid, true);
    assert.equal(result.items.length, 152);
    assert.deepEqual(ids(result), originalIds);
    result.items.forEach((item, index) => {
      assert.equal(item.entry, catalog.entries[index]);
      assert.equal(item.entry.sourceReferences, catalog.entries[index].sourceReferences);
    });
    assert.equal(result.provenance.source, catalog.source);
    assert.equal(result.provenance.acceptanceSnapshot, catalog.acceptanceSnapshot);
    assert.equal(result.permissions, matrix.permissions);
  }
});

test('host filtering rejects explicit host-under-test conflicts, retaining unknown generic entries', () => {
  const result = filters.filterCatalog(catalog, matrix, { host: 'app-service' });
  assert.ok(ids(result).includes('S001'));
  assert.ok(ids(result).includes('S002'));
  assert.ok(!ids(result).includes('S047'));
  assert.ok(!ids(result).includes('W002'));
  assert.equal(result.items.find(item => item.entry.id === 'S001').hostAssessment.status, 'unknown');
  const excluded = result.incompatible.find(item => item.entry.id === 'W002');
  assert.equal(excluded.entry, catalog.entries[151]);
  assert.equal(excluded.hostAssessment.status, 'incompatible');
  assert.match(excluded.hostAssessment.reason, /CONTAINER.*P002 OR P003/);
  assert.match(result.incompatible.find(item => item.entry.id === 'S047').hostAssessment.reason, /P003.*AKS/);
});

test('CONTAINER alternatives are OR, IMAGEHOST stays unresolved and unknown host does not hide data', () => {
  for (const host of ['container-apps', 'aks']) {
    const result = filters.filterCatalog(catalog, matrix, { host });
    assert.ok(ids(result).includes('W002'));
    assert.equal(result.items.find(item => item.entry.id === 'W002').hostAssessment.status, 'unknown');
  }
  const appService = filters.filterCatalog(catalog, matrix, { host: 'app-service' });
  assert.match(appService.items.find(item => item.entry.id === 'S026').hostAssessment.reason, /IMAGEHOST.*container mode/i);
  assert.deepEqual(ids(filters.filterCatalog(catalog, matrix, { host: 'unselected' })), originalIds);
});

test('risk remains UNCLASSIFIED for every priority; assessed risks have honest empty results', () => {
  for (const risk of ['all', 'unclassified']) {
    assert.deepEqual(ids(filters.filterCatalog(catalog, matrix, { risk })), originalIds);
  }
  for (const risk of ['assessed', 'low', 'medium', 'high']) {
    const result = filters.filterCatalog(catalog, matrix, { risk });
    assert.equal(result.valid, true);
    assert.equal(result.items.length, 0);
    assert.equal(result.incompatible.length, 0);
    assert.equal(result.riskReason, catalog.common.riskReason);
  }
  assert.deepEqual([...new Set(catalog.entries.map(entry => entry.priority))].sort(), ['P0', 'P1', 'P2']);
  assert.ok(catalog.entries.every(entry => entry.risk === 'unclassified'));
});

test('readiness separates 86 historical portable lessons, 66 unavailable, and zero native/parent claims', () => {
  const accepted = filters.filterCatalog(catalog, matrix, { readiness: 'portable-available' });
  assert.deepEqual(ids(accepted), catalog.entries.filter(entry => entry.learning.available).map(entry => entry.id));
  assert.deepEqual(ids(accepted), generation.acceptedPortableIds);
  assert.equal(accepted.items.length, generation.acceptedPortableLessons);
  assert.equal(filters.filterCatalog(catalog, matrix, { readiness: 'portable-unavailable' }).items.length,
    catalog.entries.length - generation.acceptedPortableLessons);
  assert.equal(filters.filterCatalog(catalog, matrix, { readiness: 'native-unavailable' }).items.length, 152);
  for (const readiness of ['native-runnable', 'native-qualified', 'parent-complete']) {
    const result = filters.filterCatalog(catalog, matrix, { readiness });
    assert.equal(result.valid, true);
    assert.deepEqual(ids(result), []);
  }
  assert.ok(!ids(accepted).includes('S087'));
  assert.ok(!ids(accepted).includes('S088'));
});

test('all filters intersect, independent of object order, with exclusions after risk and readiness', () => {
  const selection = { host: 'aks', risk: 'unclassified', readiness: 'portable-available' };
  const result = filters.filterCatalog(catalog, matrix, selection);
  const reversed = filters.filterCatalog(catalog, matrix, {
    readiness: selection.readiness, risk: selection.risk, host: selection.host
  });
  assert.deepEqual(ids(result), ids(reversed));
  const excludedIds = ['S002', 'S012', 'S014', 'S017', 'S024', 'S032', 'S033', 'S058'];
  assert.equal(result.items.length, generation.acceptedPortableLessons - excludedIds.length);
  assert.deepEqual(result.incompatible.map(item => item.entry.id), excludedIds);
  assert.ok(result.items.every(item => item.entry.learning.available && item.entry.risk === 'unclassified'));
  const noMatch = filters.filterCatalog(catalog, matrix, { ...selection, risk: 'low' });
  assert.equal(noMatch.items.length, 0);
  assert.equal(noMatch.incompatible.length, 0);
});

test('C003 filtered rows, reasons and permissions are reused, never promoted or copied into approvals', () => {
  for (const host of matrixContract.HOSTS) {
    const result = filters.filterCatalog(catalog, matrix, { host });
    const expected = matrixContract.filterRows(matrix, { host });
    assert.deepEqual(result.matrixRows, expected);
    result.matrixRows.forEach((row, index) => assert.equal(row, expected[index]));
    assert.equal(result.permissions, matrix.permissions);
  }
  assert.ok(matrix.rows.some(row => row.status === 'unsupported'));
  assert.ok(Object.values(matrix.permissions).every(value => value === false || value === 0));
});

test('invalid data, empty catalog and unsupported filter values fail closed with no stale claims', () => {
  const badVersion = structuredClone(catalog);
  badVersion.schemaVersion = '2.0.0';
  const empty = structuredClone(catalog);
  empty.entries = [];
  const promoted = structuredClone(catalog);
  promoted.entries[0].native.runnable = true;
  for (const [data, hostMatrix, selection] of [
    [undefined, matrix, {}], [null, matrix, {}], [{}, matrix, {}],
    [badVersion, matrix, {}], [empty, matrix, {}], [promoted, matrix, {}],
    [catalog, undefined, {}], [catalog, {}, {}], [catalog, matrix, null],
    [catalog, matrix, []], [catalog, matrix, { host: 'made-up' }],
    [catalog, matrix, { risk: 'P0' }], [catalog, matrix, { readiness: 'ready' }],
    [catalog, matrix, { query: 'not-C006' }], [catalog, matrix, { host: false }]
  ]) {
    const result = filters.filterCatalog(data, hostMatrix, selection);
    assert.equal(result.valid, false);
    assert.ok(result.errors.length > 0);
    assert.deepEqual(result.items, []);
    assert.deepEqual(result.incompatible, []);
    assert.deepEqual(result.matrixRows, []);
    assert.equal(result.provenance, null);
    assert.equal(result.permissions, null);
    assert.equal(result.riskReason, null);
  }
});

test('repeated filtering has no mutation, memoized stale data or order side effects', () => {
  const data = structuredClone(catalog);
  const hostMatrix = structuredClone(matrix);
  const before = JSON.stringify({ data, hostMatrix });
  filters.filterCatalog(data, hostMatrix, { host: 'functions', risk: 'unclassified' });
  filters.filterCatalog(data, hostMatrix, { readiness: 'portable-available' });
  assert.equal(JSON.stringify({ data, hostMatrix }), before);
  assert.deepEqual(ids(filters.filterCatalog(data, hostMatrix)), originalIds);
  data.entries[0].risk = 'low';
  assert.equal(filters.filterCatalog(data, hostMatrix).valid, false);
});
