(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../C006/search.js'), require('../C007/catalog-filters.js'),
      require('../C005/catalog-contract.js'), require('../C005/catalog-data.js'), require('../C003/matrix-data.js'));
  } else Object.defineProperty(root, 'X003Recommendation', {
    value: factory(root.C006Search, root.C007Filters, root.C005Contract, root.C005Catalog, root.C003Matrix)
  });
}(globalThis, function (search, filters, contract, sharedCatalog, sharedMatrix) {
  'use strict';

  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const SNAPSHOT = Object.freeze({
    commit: 'c8b3139f07aa60a64833a5380503b2bd794c0e0e',
    catalogDataSha256: '193cc3dd536b2202f5b941366c151d11d4e01ad2d3bbb2d179ce94cf16ff76f6',
    readmeSha256: '852a82420f3b17a41c6aa56ae32fc1ba37829181654bcd6fa32fd00e88310519',
    backlogSha256: '9a414030b4ef63b5d90a0f6d89e1cbc30b0300bf194ad87b9e7e3d2912b59a65',
    ledgerSha256: '5906c4c3f3c1dfad34eec3a2737adbe42eac5c5a1a8463f23c8c0036d1e97a18'
  });
  const PORTABLE_SELECTION = Object.freeze({ host: 'all', risk: 'all', readiness: 'portable-available' });
  function goal(id, label, category, query, sourceAnchor, explanation, sourceDocument = 'readme') {
    return Object.freeze({
      id, label, category, query, sourceAnchor, explanation, sourceDocument
    });
  }
  const GOALS = Object.freeze([
    goal('warm-handoff', 'Warm a candidate before a blue-green handoff', 'A', 'blue-green',
      'a-deployment-and-traffic-migration-strategies', 'Preserve complete journeys during a readiness-gated traffic handoff.'),
    goal('effective-capacity', 'Verify added effective capacity before routing traffic', 'B', 'effective capacity',
      'b-actual-capacity-scaling-strategies', 'Distinguish adding compute from merely changing traffic destinations.'),
    goal('preserve-session', 'Preserve session state across instances', 'D', 'session state',
      'd-sessions-authentication-and-user-state', 'Keep user state when successive requests reach different deployments.'),
    goal('finish-admitted-work', 'Finish work admitted before a cutover', 'E', 'already admitted',
      'e-in-flight-requests-and-long-lived-work', 'Account for existing work rather than only new admissions.'),
    goal('version-contracts', 'Keep already-open pages compatible with a new API', 'F', 'already-open',
      'f-n-tier-and-version-compatibility', 'Preserve contracts across frontend and API version overlap.'),
    goal('abort-unready', 'Abort an unready candidate before exposure', 'J', 'before exposure',
      'j-failure-containment-and-rollback', 'Contain candidate failure without treating a safe abort as migration success.'),
    goal('verify-user-correctness', 'Check user correctness, not just HTTP health', 'O', 'correctness oracle',
      'o-demonstration-and-acceptance-testing', 'Use complete client-visible outcomes instead of healthy endpoint status.'),
    goal('retire-without-dependencies', 'Check remaining dependencies before retirement', 'O', 'retired capacity',
      'o-demonstration-and-acceptance-testing', 'Verify no routing, work, state, artifacts or leases still need old capacity.'),
    goal('progressive-rings', 'Explore integrated deployment rings (unavailable)', 'W', 'Progressive deployment rings',
      'integrated-guided-demonstrations', 'Integrated workflows have no accepted portable practice in this snapshot.', 'backlog'),
    goal('shared-preview', 'Explore the integrated GA/preview workflow (unavailable)', 'W', 'Shared-orchestrator getProfile',
      'integrated-guided-demonstrations', 'An integrated GA/preview workflow is not replaced by an unrelated lesson.', 'backlog')
  ]);

  function invalid(code, message) {
    const error = new TypeError(message);
    error.code = code;
    return error;
  }
  function chosenGoal(input) {
    if (typeof input !== 'string') throw invalid('ERR_GOAL_TYPE', 'Choose one listed goal using a primitive string ID.');
    if (!input.trim()) throw invalid('ERR_GOAL_BLANK', 'Choose a goal before requesting a recommendation.');
    if (input.length > 48 || !/^[a-z][a-z0-9-]{1,47}$/.test(input)) {
      throw invalid('ERR_GOAL_UNSAFE', 'Goal IDs must be exact bounded listed IDs, not markup, URLs, paths or expressions.');
    }
    const selected = GOALS.find(item => item.id === input);
    if (!selected) throw invalid('ERR_GOAL_UNKNOWN', 'Unknown goal; choose an explicitly listed source goal.');
    return selected;
  }
  function sameSnapshot(value, expected) {
    if (value === expected) return true;
    if (value === null || expected === null || typeof value !== 'object' || typeof expected !== 'object') return false;
    const keys = Object.keys(expected);
    return Object.keys(value).length === keys.length
      && keys.every(key => Object.hasOwn(value, key) && sameSnapshot(value[key], expected[key]));
  }
  function inspectCatalog(catalog = sharedCatalog, matrix = sharedMatrix) {
    if (typeof search?.searchCatalog !== 'function' || typeof filters?.filterCatalog !== 'function'
        || typeof contract?.sourceHref !== 'function') {
      throw invalid('ERR_PROVIDERS', 'Unchanged C005, C006 and C007 providers must load; no substitute is inferred.');
    }
    let entries;
    try { entries = search.searchCatalog(catalog, matrix, ''); }
    catch (caught) {
      throw invalid('ERR_CATALOG_DATA', `Catalog or matrix rejected by accepted providers: ${caught.message}`);
    }
    if (catalog.source.commit !== SNAPSHOT.commit || catalog.acceptanceSnapshot.commit !== SNAPSHOT.commit
        || catalog.source.readme.sha256 !== SNAPSHOT.readmeSha256
        || catalog.source.backlog.sha256 !== SNAPSHOT.backlogSha256
        || catalog.acceptanceSnapshot.ledgerSha256 !== SNAPSHOT.ledgerSha256) {
      throw invalid('ERR_SNAPSHOT', 'Only the declared fixed historical C005 snapshot is used; no live ledger or later source is inferred.');
    }
    if (!sameSnapshot(catalog, sharedCatalog) || !sameSnapshot(matrix, sharedMatrix)) {
      throw invalid('ERR_SNAPSHOT', 'Original metadata pins cannot bless changed catalog or matrix content; unchanged accepted provider values are required.');
    }
    return Object.freeze({
      sourceCommit: catalog.source.commit, catalogDataSha256: SNAPSHOT.catalogDataSha256,
      acceptanceSnapshot: Object.freeze({ ...catalog.acceptanceSnapshot }),
      entries: entries.length,
      scenarios: entries.filter(entry => entry.kind === 'scenario').length,
      availablePractices: entries.filter(entry => entry.learning.available).length,
      unavailableWorkflows: entries.filter(entry => entry.kind === 'workflow' && !entry.learning.available).length,
      nativeRunnable: entries.filter(entry => entry.native.runnable).length,
      nativeQualified: entries.filter(entry => entry.native.qualified).length,
      completedParents: entries.filter(entry => entry.parent.completed).length
    });
  }
  function recommend(input, catalog = sharedCatalog, matrix = sharedMatrix) {
    const selected = chosenGoal(input);
    const snapshot = inspectCatalog(catalog, matrix);
    const found = search.searchCatalog(catalog, matrix, selected.query);
    const eligible = filters.filterCatalog(catalog, matrix, PORTABLE_SELECTION);
    if (!eligible.valid) throw invalid('ERR_CATALOG_DATA', `C007 eligibility rejected: ${eligible.errors.join('; ')}`);
    const availableIds = new Set(eligible.items.map(item => item.entry.id));
    const candidates = found.filter(entry => availableIds.has(entry.id) && entry.kind === 'scenario'
      && entry.category.id === selected.category
      && entry.sourceReferences.some(reference => reference.document === selected.sourceDocument
        && reference.anchor === selected.sourceAnchor));
    if (!candidates.length) {
      throw invalid('ERR_NO_AVAILABLE_MATCH',
        `No accepted available practice matches "${selected.label}" in its mapped source category. No fallback lesson is suggested.`);
    }
    const entry = candidates[0];
    const reference = entry.sourceReferences.find(item => item.document === selected.sourceDocument
      && item.anchor === selected.sourceAnchor);
    return Object.freeze({
      schemaVersion: '1.0.0', cardId: 'X003', mode: BANNER,
      goalId: selected.id, goalLabel: selected.label, suggestedId: entry.id,
      title: entry.title, objective: entry.objective, lessonHref: entry.learning.href,
      literalQuery: selected.query, categoryId: entry.category.id, categoryTitle: entry.category.title,
      candidateIds: Object.freeze(candidates.map(item => item.id)),
      why: `${selected.explanation} C006 finds literal title/objective text "${selected.query}" AND `
        + `C007 requires accepted portable availability AND mapped category ${entry.category.id} (${entry.category.title}) `
        + `at ${reference.path}#${reference.anchor}. First of ${candidates.length} eligible source entries; `
        + 'fixed original source order, no ranking, history or profiling.',
      sourceHref: contract.sourceHref(catalog, reference),
      sourceReference: Object.freeze({ ...reference }),
      sourceCommit: snapshot.sourceCommit, catalogDataSha256: snapshot.catalogDataSha256,
      acceptanceSnapshot: snapshot.acceptanceSnapshot,
      learningEvidence: Object.freeze({ ...entry.learning.evidence }),
      nativeRunnable: entry.native.runnable, nativeQualified: entry.native.qualified,
      parentCompleted: entry.parent.completed
    });
  }
  return Object.freeze({ BANNER, SNAPSHOT, GOALS, PORTABLE_SELECTION, inspectCatalog, recommend });
}));
