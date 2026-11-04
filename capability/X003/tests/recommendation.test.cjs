'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../recommendation.js');
const catalog = require('../../C005/catalog-data.js');
const matrix = require('../../C003/matrix-data.js');
const search = require('../../C006/search.js');
const filters = require('../../C007/catalog-filters.js');
const contract = require('../../C005/catalog-contract.js');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const cases = [
  ['warm-handoff', 'S001', 'A', 'blue-green'],
  ['effective-capacity', 'S011', 'B', 'effective capacity'],
  ['preserve-session', 'S031', 'D', 'session state'],
  ['finish-admitted-work', 'S041', 'E', 'already admitted'],
  ['version-contracts', 'S051', 'F', 'already-open'],
  ['abort-unready', 'S091', 'J', 'before exposure'],
  ['verify-user-correctness', 'S147', 'O', 'correctness oracle'],
  ['retire-without-dependencies', 'S150', 'O', 'retired capacity']
];
const unavailable = entry => Object.assign(entry.learning, {
  status: 'unavailable', available: false, href: null, evidence: null
});

test('chosen warm-handoff goal recommends relevant S001, not an unrelated fixed lesson', () => {
  const result = engine.recommend('warm-handoff', catalog, matrix);
  assert.equal(result.suggestedId, 'S001');
  assert.equal(result.lessonHref, '../../learning/S001/index.html');
});

test('unavailable guided-workflow goal rejects instead of suggesting an available unrelated lesson', () => {
  assert.throws(() => engine.recommend('shared-preview', catalog, matrix), {
    code: 'ERR_NO_AVAILABLE_MATCH'
  });
});

test('identical chosen goal and immutable snapshot produce exactly identical recommendations', () => {
  const before = JSON.stringify(catalog);
  assert.deepEqual(engine.recommend('warm-handoff', catalog, matrix),
    engine.recommend('warm-handoff', catalog, matrix));
  assert.equal(JSON.stringify(catalog), before);
});

for (const [goal, id, category, query] of cases) {
  test(`exact source goal ${goal} deterministically selects relevant available ${id}`, () => {
    const entry = catalog.entries.find(item => item.id === id);
    const result = engine.recommend(goal);
    assert.equal(result.suggestedId, id);
    assert.equal(result.lessonHref, entry.learning.href);
    assert.match(result.lessonHref, /^\.\.\/\.\.\/learning\/S(?:00[1-9]|0[1-9]\d|1[0-4]\d|150)\/index\.html$/);
    assert.equal(result.categoryId, category);
    assert.equal(result.literalQuery, query);
    assert.equal(entry.learning.available, true);
    assert.equal(entry.learning.status, 'accepted-snapshot');
    assert.ok(search.searchCatalog(catalog, matrix, query).some(item => item.id === id));
    assert.deepEqual(result.candidateIds, [id]);
    assert.equal(result.sourceHref, contract.sourceHref(catalog, entry.sourceReferences[0]));
    assert.equal(result.objective, entry.objective);
    assert.equal(result.title, entry.title);
    assert.equal(result.mode, engine.BANNER);
    assert.ok(result.why.includes(query));
    assert.ok(result.why.includes(entry.category.title));
    assert.ok(result.why.includes(entry.sourceReferences[0].anchor));
    assert.ok(result.why.length < 2000);
    assert.ok(JSON.stringify(result).length < 6000);
    assert.deepEqual([result.nativeRunnable, result.nativeQualified, result.parentCompleted], [false, false, false]);
    for (let repeat = 0; repeat < 5; repeat++) assert.deepEqual(engine.recommend(goal), result);
  });
}

test('all ten goal mappings use actual README or workflow category references, not fabricated metadata', () => {
  assert.equal(engine.GOALS.length, 10);
  assert.equal(new Set(engine.GOALS.map(goal => goal.id)).size, 10);
  for (const goal of engine.GOALS) {
    const matches = search.searchCatalog(catalog, matrix, goal.query)
      .filter(entry => entry.category.id === goal.category);
    assert.ok(matches.length > 0);
    assert.ok(matches.every(entry => entry.sourceReferences.some(reference =>
      reference.document === goal.sourceDocument && reference.anchor === goal.sourceAnchor)));
  }
});

test('both unavailable workflows fail visibly rather than receiving native or fallback links', () => {
  assert.deepEqual(catalog.entries.slice(150).map(entry => [entry.id, entry.learning.available, entry.learning.href]),
    [['W001', false, null], ['W002', false, null]]);
  for (const goal of ['progressive-rings', 'shared-preview']) {
    assert.throws(() => engine.recommend(goal), { code: 'ERR_NO_AVAILABLE_MATCH' });
  }
});

test('literal search AND portable readiness AND mapped category excludes unrelated matches', () => {
  assert.deepEqual(search.searchCatalog(catalog, matrix, 'blue-green').map(entry => entry.id), ['S001', 'S124', 'S128']);
  assert.deepEqual(search.searchCatalog(catalog, matrix, 'session state').map(entry => entry.id), ['S031', 'S118']);
  assert.deepEqual(search.searchCatalog(catalog, matrix, 'before exposure').map(entry => entry.id), ['S025', 'S091']);
  for (const [goal, id] of [cases[0], cases[2], cases[5]]) {
    const fixture = structuredClone(catalog);
    unavailable(fixture.entries.find(entry => entry.id === id));
    assert.equal(contract.validateCatalog(fixture, matrix).valid, true);
    assert.throws(() => engine.recommend(goal, fixture, matrix), { code: 'ERR_SNAPSHOT' });
  }
});

test('a fabricated zero-availability snapshot is rejected without filesystem inference or another source', () => {
  const fixture = structuredClone(catalog);
  fixture.entries.slice(0, 150).forEach(unavailable);
  const before = JSON.stringify(fixture);
  assert.equal(contract.validateCatalog(fixture, matrix).valid, true);
  assert.throws(() => engine.inspectCatalog(fixture, matrix), { code: 'ERR_SNAPSHOT' });
  for (const [goal] of cases) {
    assert.throws(() => engine.recommend(goal, fixture, matrix), { code: 'ERR_SNAPSHOT' });
  }
  assert.equal(JSON.stringify(fixture), before);
});

test('blank, nonprimitive, unsafe and unknown goal inputs are distinct explicit errors', () => {
  const groups = {
    ERR_GOAL_BLANK: ['', ' ', '\t\r\n'],
    ERR_GOAL_TYPE: [undefined, null, 0, 1, true, {}, [], new String('warm-handoff'), Symbol('goal'), () => 'warm-handoff'],
    ERR_GOAL_UNSAFE: ['<img onerror=1>', '../S001', 'https://example.invalid', 'javascript:alert(1)',
      'warm-handoff ', ' warm-handoff', 'warm-handoff\0', 'a'.repeat(49), 'warm|retire', 'Warm-handoff', 'éxercise'],
    ERR_GOAL_UNKNOWN: ['unregistered-goal', 's001', 'unknown']
  };
  for (const [code, values] of Object.entries(groups)) {
    for (const value of values) assert.throws(() => engine.recommend(value), { code });
  }
});

test('public shared literal helper remains literal, case-insensitive and trimmed, not regex or ID search', () => {
  assert.deepEqual(search.searchCatalog(catalog, matrix, '  BLUE-GREEN  ').map(entry => entry.id), ['S001', 'S124', 'S128']);
  for (const query of ['blue-green|ready', '.*', '[', 'S001']) {
    assert.deepEqual(search.searchCatalog(catalog, matrix, query), []);
  }
  const narrowed = filters.filterCatalog(catalog, matrix, { host: 'all', risk: 'high', readiness: 'portable-available' });
  assert.equal(narrowed.valid, true);
  assert.deepEqual(narrowed.items, []);
  assert.equal(filters.filterCatalog(catalog, matrix, { readiness: 'portable-available' }).items.length, 150);
  assert.equal(filters.filterCatalog(catalog, matrix, { readiness: 'native-runnable' }).items.length, 0);
});

test('the browser factory calls the real unchanged C006 and C007 helpers with exact bounded arguments', () => {
  const calls = [];
  const context = {
    C005Catalog: catalog, C003Matrix: matrix, C005Contract: contract,
    C006Search: { searchCatalog(c, m, query) {
      calls.push(['search', query]);
      return search.searchCatalog(c, m, query);
    } },
    C007Filters: { filterCatalog(c, m, selection) {
      const sameRealmSelection = JSON.parse(JSON.stringify(selection));
      calls.push(['filter', sameRealmSelection]);
      return filters.filterCatalog(c, m, sameRealmSelection);
    } }
  };
  vm.runInNewContext(readFileSync(path.join(__dirname, '..', 'recommendation.js'), 'utf8'), context);
  assert.equal(context.X003Recommendation.recommend('warm-handoff').suggestedId, 'S001');
  assert.deepEqual(calls, [['search', ''], ['search', 'blue-green'],
    ['filter', { host: 'all', risk: 'all', readiness: 'portable-available' }]]);
});

test('missing accepted providers fail closed in a loadable browser factory', () => {
  for (const missing of ['C006Search', 'C007Filters', 'C005Contract']) {
    const context = { C005Catalog: catalog, C003Matrix: matrix, C005Contract: contract,
      C006Search: search, C007Filters: filters };
    delete context[missing];
    vm.runInNewContext(readFileSync(path.join(__dirname, '..', 'recommendation.js'), 'utf8'), context);
    assert.throws(() => context.X003Recommendation.recommend('warm-handoff'), { code: 'ERR_PROVIDERS' });
  }
});

test('malformed, sparse, false-native and unsafe practice data cannot become recommendations', () => {
  const changes = [
    value => { value.entries = []; },
    value => { delete value.entries[0]; },
    value => { value.entries[0].native.runnable = true; },
    value => { value.entries[0].native.qualified = true; },
    value => { value.entries[0].parent.completed = true; },
    value => { value.entries[0].risk = 'low'; },
    value => { value.entries[0].learning.href = 'javascript:alert(1)'; },
    value => { value.entries[0].learning.available = 'true'; },
    value => { value.entries[150].learning.available = true; },
    value => { value.schemaVersion = '2.0.0'; }
  ];
  for (const change of changes) {
    const fixture = structuredClone(catalog);
    change(fixture);
    assert.throws(() => engine.recommend('warm-handoff', fixture, matrix), { code: 'ERR_CATALOG_DATA' });
  }
  for (const invalid of [null, {}, [], 'catalog']) {
    assert.throws(() => engine.recommend('warm-handoff', invalid, matrix), { code: 'ERR_CATALOG_DATA' });
    assert.throws(() => engine.recommend('warm-handoff', catalog, invalid), { code: 'ERR_CATALOG_DATA' });
  }
});

test('a structurally valid but different source pin is not silently adopted', () => {
  for (const change of [
    value => { value.source.commit = value.acceptanceSnapshot.commit = '0'.repeat(40); },
    value => { value.source.readme.sha256 = '0'.repeat(64); },
    value => { value.source.backlog.sha256 = '0'.repeat(64); },
    value => { value.acceptanceSnapshot.ledgerSha256 = '0'.repeat(64); }
  ]) {
    const fixture = structuredClone(catalog);
    change(fixture);
    assert.equal(contract.validateCatalog(fixture, matrix).valid, true);
    assert.throws(() => engine.recommend('warm-handoff', fixture, matrix), { code: 'ERR_SNAPSHOT' });
  }
});

test('schema-valid content changes cannot be attributed to unchanged immutable source pins', () => {
  const fixture = structuredClone(catalog);
  fixture.entries[0].objective += ' Invented changed source objective.';
  assert.equal(contract.validateCatalog(fixture, matrix).valid, true);
  assert.throws(() => engine.recommend('warm-handoff', fixture, matrix), { code: 'ERR_SNAPSHOT' });
});

test('schema-valid changed matrix documentation cannot inherit the unchanged provider provenance', () => {
  const fixture = structuredClone(matrix);
  fixture.sources[0].title += ' Invented source title.';
  assert.equal(contract.validateCatalog(catalog, fixture).valid, true);
  assert.throws(() => engine.recommend('warm-handoff', catalog, fixture), { code: 'ERR_SNAPSHOT' });
});

test('source anchor mismatch cannot be inferred from a matching title', () => {
  const fixture = structuredClone(catalog);
  fixture.entries[0].sourceReferences[0].anchor = 'b-actual-capacity-scaling-strategies';
  assert.equal(contract.validateCatalog(fixture, matrix).valid, true);
  assert.throws(() => engine.recommend('warm-handoff', fixture, matrix), { code: 'ERR_SNAPSHOT' });
});

test('results and declarations are recursively immutable without freezing caller-owned input', () => {
  const fixture = structuredClone(catalog);
  const matrixFixture = structuredClone(matrix);
  const before = [JSON.stringify(fixture), JSON.stringify(matrixFixture)];
  function frozen(value) {
    if (value && typeof value === 'object') {
      assert.equal(Object.isFrozen(value), true);
      Object.values(value).forEach(frozen);
    }
  }
  frozen(engine.GOALS);
  frozen(engine.SNAPSHOT);
  frozen(engine.PORTABLE_SELECTION);
  const result = engine.recommend('warm-handoff', fixture, matrixFixture);
  frozen(result);
  assert.throws(() => { result.suggestedId = 'S150'; }, TypeError);
  assert.throws(() => { result.candidateIds.push('S150'); }, TypeError);
  assert.throws(() => engine.recommend('unknown', fixture, matrixFixture), { code: 'ERR_GOAL_UNKNOWN' });
  assert.deepEqual([JSON.stringify(fixture), JSON.stringify(matrixFixture)], before);
  assert.equal(Object.isFrozen(fixture), false);
  assert.equal(Object.isFrozen(fixture.entries[0].learning.evidence), false);
});

test('fixed source has exactly 152 entries, 150 available A lessons, two unavailable workflows and zero native/parent credit', () => {
  const summary = engine.inspectCatalog();
  assert.equal(summary.sourceCommit, engine.SNAPSHOT.commit);
  assert.equal(summary.catalogDataSha256, engine.SNAPSHOT.catalogDataSha256);
  assert.deepEqual([summary.entries, summary.scenarios, summary.availablePractices, summary.unavailableWorkflows,
    summary.nativeRunnable, summary.nativeQualified, summary.completedParents], [152, 150, 150, 2, 0, 0, 0]);
  assert.equal(summary.acceptanceSnapshot.live, false);
});
