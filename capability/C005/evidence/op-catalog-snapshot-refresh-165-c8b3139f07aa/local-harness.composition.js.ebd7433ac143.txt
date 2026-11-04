(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(
      require('../C006/search.js'), require('../C007/catalog-filters.js'),
      require('../C008/preparation.js')
    );
  } else Object.defineProperty(root, 'CatalogComposition', {
    value: factory(root.C006Search, root.C007Filters, root.C008Preparation)
  });
}(globalThis, function (searchApi, filterApi, preparationApi) {
  'use strict';
  const empty = Object.freeze([]);
  function failure(errors) {
    return Object.freeze({
      valid: false, errors: Object.freeze(errors), items: empty, incompatible: empty,
      preparation: null, provenance: null, matrixRows: empty, permissions: null, riskReason: null
    });
  }
  async function compose(catalog, matrix, request = {}) {
    try {
      if (!searchApi || searchApi.SEARCH_VERSION !== '1.0.0' || typeof searchApi.searchCatalog !== 'function'
          || !filterApi || typeof filterApi.filterCatalog !== 'function'
          || !preparationApi || typeof preparationApi.prepare !== 'function') {
        return failure(['Accepted C006/C007/C008 providers are missing or incompatible.']);
      }
      if (!request || typeof request !== 'object' || Array.isArray(request)
          || Object.keys(request).some(key => !['query', 'filters', 'entryId'].includes(key))) {
        return failure(['Choose only a query, the existing host/risk/readiness filters and an entry ID.']);
      }
      const query = request.query === undefined ? '' : request.query;
      const matches = new Set(searchApi.searchCatalog(catalog, matrix, query));
      const filtered = filterApi.filterCatalog(catalog, matrix, request.filters);
      if (!filtered.valid) return failure(filtered.errors);
      // C005 validates the complete catalog; never pass a fabricated search subset to C007.
      const items = Object.freeze(filtered.items.filter(item => matches.has(item.entry)));
      const incompatible = Object.freeze(filtered.incompatible.filter(item => matches.has(item.entry)));
      const entryId = request.entryId === undefined ? '' : request.entryId;
      const preparation = await preparationApi.prepare(catalog, matrix, entryId);
      if (preparation.state === 'error') return failure(preparation.errors);
      if (!['empty', 'ready'].includes(preparation.state)
          || preparation.catalog !== catalog || preparation.matrix !== matrix
          || preparation.approvalValidation?.valid !== true
          || (entryId === '' ? preparation.state !== 'empty' || preparation.entry !== null
            : preparation.state !== 'ready' || preparation.entry?.id !== entryId)) {
        return failure(['The accepted preparation provider returned an incompatible view.']);
      }
      if (preparation.state === 'ready'
          && ![...items, ...incompatible].some(item => item.entry === preparation.entry)) {
        return failure(['That entry is not in the current query and filter results. Return to the results to choose it.']);
      }
      return Object.freeze({
        valid: true, errors: empty, query, filters: filtered.filters, items, incompatible, preparation,
        provenance: filtered.provenance, matrixRows: Object.freeze(filtered.matrixRows),
        permissions: filtered.permissions, riskReason: filtered.riskReason
      });
    } catch (error) {
      return failure([error instanceof Error ? error.message : 'Shared providers could not be evaluated safely.']);
    }
  }
  return Object.freeze({ compose });
}));
