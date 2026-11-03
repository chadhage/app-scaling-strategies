'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const catalog = require('../../C005/catalog-data.js');
const matrix = require('../../C003/matrix-data.js');
const { searchCatalog } = require('../search.js');
const generation = require('../../C005/evidence/op-catalog-snapshot-refresh-101-541256d56385/generation.json');
const ids = results => results.map(entry => entry.id);
const copy = () => structuredClone(catalog);
const dataError = error => error instanceof TypeError && error.code === 'ERR_CATALOG_DATA'
  && error.message.startsWith('Catalog rejected by C005:');

test('exact shared title returns the one original S001 entry', () => {
  const results = searchCatalog(catalog, matrix, 'Warm blue-green handoff');
  assert.equal(results.length, 1, 'the exact shared title must have one result');
  assert.equal(results[0], catalog.entries[0]);
});

test('complete objective is searchable without requiring its title', () => {
  const results = searchCatalog(catalog, matrix, catalog.entries[0].objective);
  assert.deepEqual(ids(results), ['S001']);
  assert.equal(results[0], catalog.entries[0]);
});

test('partial matching trims only query ends, ignores case and preserves source order', () => {
  assert.deepEqual(ids(searchCatalog(catalog, matrix, '  BLUE-GREEN \t\n')), ['S001', 'S124', 'S128']);
  assert.deepEqual(ids(searchCatalog(catalog, matrix, 'migrate traffic only after')), ['S001']);
  assert.deepEqual(searchCatalog(catalog, matrix, 'blue-green'), searchCatalog(catalog, matrix, 'BLUE-GREEN'));
  assert.equal(searchCatalog(catalog, matrix, 'blue  green').length, 0);
});

test('both guided workflows participate in title and objective search', () => {
  for (const entry of catalog.entries.slice(150)) {
    assert.deepEqual(searchCatalog(catalog, matrix, entry.title), [entry]);
    assert.deepEqual(searchCatalog(catalog, matrix, entry.objective), [entry]);
  }
  assert.deepEqual(ids(searchCatalog(catalog, matrix, 'getProfile')), ['W002']);
});

test('empty and whitespace-only queries return all original entries in stable ID order', () => {
  for (const query of ['', ' ', '\t\n\r', '\u00a0']) {
    const results = searchCatalog(catalog, matrix, query);
    assert.deepEqual(results, catalog.entries);
    assert.notEqual(results, catalog.entries);
    assert.equal(results.length, 152);
    assert.equal(new Set(ids(results)).size, 152);
    assert.equal(Object.isFrozen(results), true);
    results.forEach((entry, index) => assert.equal(entry, catalog.entries[index]));
  }
});

test('no match is a successful frozen empty result, not an error or inferred support claim', () => {
  const results = searchCatalog(catalog, matrix, 'c006-absent-title-objective-79583');
  assert.deepEqual(results, []);
  assert.equal(Object.isFrozen(results), true);
});

test('matching is literal substring text, never a regular expression or markup parser', () => {
  const fixture = copy();
  fixture.entries[0].title = 'Literal <c006.*[a+b]?> & "quotes"';
  for (const query of ['<c006.*[a+b]?>', '.*[a+b]?', '& "QUOTES"']) {
    assert.deepEqual(ids(searchCatalog(fixture, matrix, query)), ['S001']);
  }
  assert.equal(searchCatalog(catalog, matrix, '.*').length, 0);
  assert.equal(searchCatalog(catalog, matrix, '<script>c006</script>').length, 0);
});

test('IDs and unrelated metadata are not covert additional search fields', () => {
  const fixture = copy();
  fixture.entries[0].implementation = 'c006-metadata-only-sentinel';
  fixture.entries[0].category.title = 'c006-category-only-sentinel';
  fixture.entries[0].support.reason = 'c006-support-only-sentinel';
  for (const query of ['S001', 'P0', 'unclassified', 'c006-metadata-only-sentinel',
    'c006-category-only-sentinel', 'c006-support-only-sentinel']) {
    assert.deepEqual(searchCatalog(fixture, matrix, query), [], query);
  }
});

test('every canonical title/objective can find its own entry without mutation or duplicate results', () => {
  const before = JSON.stringify(catalog);
  for (const entry of catalog.entries) {
    for (const query of [entry.title, entry.objective]) {
      const results = searchCatalog(catalog, matrix, query);
      assert.ok(results.includes(entry), entry.id);
      const positions = results.map(result => catalog.entries.indexOf(result));
      assert.deepEqual(positions, [...positions].sort((a, b) => a - b));
      assert.equal(new Set(ids(results)).size, results.length);
    }
  }
  assert.equal(JSON.stringify(catalog), before);
});

test('results preserve the original readonly historical, native, support, risk and parent metadata', () => {
  const results = searchCatalog(catalog, matrix, '');
  assert.equal(catalog.acceptanceSnapshot.live, false);
  assert.equal(results.filter(entry => entry.learning.available).length, generation.acceptedPortableLessons);
  assert.deepEqual(results.filter(entry => entry.learning.available).map(entry => entry.id), generation.acceptedPortableIds);
  for (const [index, result] of results.entries()) {
    assert.equal(result, catalog.entries[index]);
    assert.equal(result.native.runnable, false);
    assert.equal(result.native.qualified, false);
    assert.equal(result.parent.completed, false);
    assert.equal(result.parent.status, 'planned');
    assert.equal(result.support.status, 'unknown');
    assert.equal(result.risk, 'unclassified');
    assert.equal(Object.isFrozen(result), true);
  }
  for (const id of ['S087', 'S088', 'W001', 'W002']) {
    const entry = results.find(item => item.id === id);
    assert.equal(entry.learning.available, false);
    assert.equal(entry.learning.href, null);
  }
  assert.throws(() => results.push(catalog.entries[0]), TypeError);
  assert.throws(() => { results[0].native.runnable = true; }, TypeError);
});

test('all non-primitive-string queries fail explicitly without coercion', async t => {
  const values = [undefined, null, false, 0, 1n, [], {}, new String('blue-green'),
    /blue-green/, Symbol('query'), () => 'blue-green'];
  for (const [index, query] of values.entries()) {
    await t.test(`non-string query ${index + 1}`, () => {
      assert.throws(() => searchCatalog(catalog, matrix, query), error =>
        error instanceof TypeError && error.code === 'ERR_SEARCH_QUERY'
        && /primitive string/.test(error.message));
    });
  }
  let coerced = false;
  assert.throws(() => searchCatalog(catalog, matrix, { toString() { coerced = true; return ''; } }),
    { code: 'ERR_SEARCH_QUERY' });
  assert.equal(coerced, false);
});

test('missing or non-object catalog and matrix data are errors even with an empty query', async t => {
  for (const [index, value] of [undefined, null, false, '', [], {}].entries()) {
    await t.test(`invalid catalog ${index + 1}`, () => {
      assert.throws(() => searchCatalog(value, matrix, ''), dataError);
    });
    await t.test(`invalid matrix ${index + 1}`, () => {
      assert.throws(() => searchCatalog(catalog, value, ''), dataError);
    });
  }
});

test('shared schema and availability violations never masquerade as zero results', async t => {
  const cases = [
    ['wrong version', value => { value.schemaVersion = '2.0.0'; }],
    ['missing entries', value => { delete value.entries; }],
    ['empty entries', value => { value.entries = []; }],
    ['missing entry', value => { value.entries.pop(); }],
    ['duplicate ID', value => { value.entries[1].id = 'S001'; }],
    ['wrong order', value => { value.entries.reverse(); }],
    ['non-string title', value => { value.entries[0].title = 23; }],
    ['non-string objective', value => { value.entries[0].objective = null; }],
    ['blank title', value => { value.entries[0].title = '  '; }],
    ['inferred risk', value => { value.entries[0].risk = 'low'; }],
    ['runnable promotion', value => { value.entries[0].native.runnable = true; }],
    ['qualification promotion', value => { value.entries[0].native.qualified = true; }],
    ['invented native proof', value => { value.entries[0].native.evidence = ['proof']; }],
    ['parent completion', value => { value.entries[0].parent.completed = true; }],
    ['unavailable lesson promotion', value => { value.entries[86].learning.available = true; }],
    ['unsafe learning link', value => { value.entries[0].learning.href = 'javascript:void(0)'; }],
    ['live snapshot claim', value => { value.acceptanceSnapshot.live = true; }],
    ['invalid provenance', value => { value.source.readme.sha256 = 'not-a-hash'; }],
    ['unexpected field', value => { value.permission = true; }],
    ['missing source row', value => { value.entries[0].sourceReferences = []; }],
    ['sparse entries', value => { delete value.entries[0]; }],
    ['sparse references', value => { delete value.entries[0].sourceReferences[0]; }],
    ['extra array property', value => { value.entries.extra = 'not an entry'; }]
  ];
  for (const [name, mutate] of cases) {
    await t.test(name, () => {
      const fixture = copy();
      mutate(fixture);
      assert.throws(() => searchCatalog(fixture, matrix, ''), dataError);
      assert.throws(() => searchCatalog(fixture, matrix, 'c006-definitely-absent'), dataError);
    });
  }
  const incompatible = structuredClone(matrix);
  incompatible.schemaVersion = '99.0.0';
  assert.throws(() => searchCatalog(catalog, incompatible, ''), dataError);
});

test('a later invalid mutation is revalidated rather than using a successful cached search', () => {
  const fixture = copy();
  assert.equal(searchCatalog(fixture, matrix, '').length, 152);
  fixture.entries[0].objective = {};
  assert.throws(() => searchCatalog(fixture, matrix, 'blue-green'), dataError);
});

test('validation exceptions are classified as data errors without retaining partial results', () => {
  const fixture = copy();
  Object.defineProperty(fixture, 'entries', { get() { throw new Error('inaccessible entries'); } });
  assert.throws(() => searchCatalog(fixture, matrix, ''), error =>
    dataError(error) && /inaccessible entries/.test(error.message));
});
