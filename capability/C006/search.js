(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../C005/catalog-contract.js'));
  else Object.defineProperty(root, 'C006Search', { value: factory(root.C005Contract) });
}(globalThis, function (contract) {
  'use strict';

  function invalid(code, message) {
    const error = new TypeError(message);
    error.code = code;
    return error;
  }

  function denseArrays(value, seen = new WeakSet()) {
    if (value === null || typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) {
      if (Object.keys(value).length !== value.length) {
        throw new TypeError('Catalog and matrix arrays must contain only dense indexed values.');
      }
      for (let index = 0; index < value.length; index++) {
        if (!Object.hasOwn(value, index)) throw new TypeError('Sparse catalog or matrix arrays are invalid.');
      }
    }
    for (const child of Object.values(value)) denseArrays(child, seen);
  }

  /** @param {unknown} catalog @param {unknown} matrix @param {unknown} query
   * @returns {readonly import('../C005/catalog-contract').CatalogEntry[]} */
  function searchCatalog(catalog, matrix, query) {
    if (typeof query !== 'string') {
      throw invalid('ERR_SEARCH_QUERY', 'Search query must be a primitive string; use an empty string to show all entries.');
    }
    try {
      if (!contract || typeof contract.validateCatalog !== 'function') {
        throw new TypeError('The shared C005 validation contract is unavailable.');
      }
      const validation = contract.validateCatalog(catalog, matrix);
      if (!validation.valid) throw new TypeError(validation.errors.join('; '));
      // Shared schema validation uses array iteration; holes must not silently disappear in a search.
      denseArrays(catalog);
      denseArrays(matrix);
    } catch (caught) {
      throw invalid('ERR_CATALOG_DATA', `Catalog rejected by C005: ${caught instanceof Error ? caught.message : 'invalid shared data'}`);
    }
    const needle = query.trim().toLowerCase();
    return Object.freeze(catalog.entries.filter(entry => needle === ''
      || entry.title.toLowerCase().includes(needle)
      || entry.objective.toLowerCase().includes(needle)));
  }
  return Object.freeze({ SEARCH_VERSION: '1.0.0', searchCatalog });
}));
