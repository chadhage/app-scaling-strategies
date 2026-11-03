(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('../C005/catalog-contract.js'), require('../C003/matrix-contract.js'));
  } else Object.defineProperty(root, 'C007Filters', { value: factory(root.C005Contract, root.C003Contract) });
}(globalThis, function (catalogContract, matrixContract) {
  'use strict';

  const RISKS = Object.freeze(['all', 'unclassified', 'assessed', 'low', 'medium', 'high']);
  const READINESS = Object.freeze(['all', 'portable-available', 'portable-unavailable',
    'native-unavailable', 'native-runnable', 'native-qualified', 'parent-complete']);
  const HOST_LABELS = Object.freeze({
    'all': 'All hosts', 'app-service': 'App Service', 'container-apps': 'Container Apps',
    'aks': 'AKS', 'functions': 'Functions', 'unselected': 'Unselected / unknown host'
  });
  const ADAPTER_HOSTS = Object.freeze({
    P001: 'app-service', P002: 'container-apps', P003: 'aks', P004: 'functions'
  });
  const ALTERNATIVES = Object.freeze({
    HOST: Object.freeze(['P001', 'P002', 'P003', 'P004']),
    CONTAINER: Object.freeze(['P002', 'P003']),
    IMAGEHOST: Object.freeze(['P001', 'P002', 'P003']),
    HOSTJAVA: Object.freeze(['P001', 'P002', 'P003'])
  });

  function invalid(errors) {
    return {
      valid: false, errors, filters: null, items: [], incompatible: [],
      matrixRows: [], provenance: null, permissions: null, riskReason: null
    };
  }

  function assessHost(entry, host) {
    if (host === 'all') return {
      status: 'not-selected', reason: `No host filter selected. ${entry.support.reason}`
    };
    if (host === 'unselected') return {
      status: 'unknown', reason: `No concrete host is selected; unresolved entries are retained. ${entry.support.reason}`
    };
    const terms = entry.prerequisites.additional.split(', ');
    const clauses = terms.flatMap(term => Object.hasOwn(ADAPTER_HOSTS, term)
      ? [{ term, adapters: [term] }]
      : Object.hasOwn(ALTERNATIVES, term) ? [{ term, adapters: ALTERNATIVES[term] }] : []);
    // This is a shallow prerequisite exclusion, not a transitive dependency solver or support classifier.
    const conflicts = clauses.filter(clause => !clause.adapters.some(adapter => ADAPTER_HOSTS[adapter] === host));
    if (conflicts.length) {
      const requirements = conflicts.map(({ term, adapters }) =>
        `${term}: ${adapters.map(adapter => `${adapter} (${HOST_LABELS[ADAPTER_HOSTS[adapter]]})`).join(' OR ')}`
        + (adapters.length > 1 ? ` [${adapters.join(' OR ')}]` : '')).join('; ');
      return {
        status: 'incompatible',
        reason: `Incompatible direct host prerequisite for ${HOST_LABELS[host]} — ${requirements}. `
          + 'The required host under test is not merely another installed plugin. '
          + 'This excludes a source prerequisite conflict; it does not assess risk or grant execution.'
      };
    }
    const qualification = terms.includes('IMAGEHOST') ? ' IMAGEHOST still requires P001 in container mode OR P002 OR P003.'
      : terms.includes('HOSTJAVA') ? ' HOSTJAVA still requires a supported Java configuration.' : '';
    return {
      status: 'unknown',
      reason: `Unknown target support for ${HOST_LABELS[host]}; no explicit direct host-prerequisite conflict was found.`
        + qualification + ' BASE, transitive prerequisites, format, concrete target and native evidence are not resolved by this filter. '
        + entry.support.reason
    };
  }

  function matchesReadiness(entry, readiness) {
    switch (readiness) {
      case 'portable-available': return entry.learning.available;
      case 'portable-unavailable': return !entry.learning.available;
      case 'native-unavailable': return !entry.native.runnable;
      case 'native-runnable': return entry.native.runnable;
      case 'native-qualified': return entry.native.qualified;
      case 'parent-complete': return entry.parent.completed;
      default: return true;
    }
  }

  /** @param {unknown} catalog @param {unknown} matrix @param {import('./catalog-filters').Filters} [selection] */
  function filterCatalog(catalog, matrix, selection) {
    try {
      if (!catalogContract || !matrixContract) return invalid(['Accepted C005/C003 validators are unavailable.']);
      const validation = catalogContract.validateCatalog(catalog, matrix);
      if (!validation.valid) return invalid(validation.errors);
      selection = selection === undefined ? {} : selection;
      if (selection === null || typeof selection !== 'object' || Array.isArray(selection)
          || ![Object.prototype, null].includes(Object.getPrototypeOf(selection))
          || Object.keys(selection).some(key => !['host', 'risk', 'readiness'].includes(key))) {
        return invalid(['Filters must be an object containing only host, risk and readiness.']);
      }
      const choices = { host: ['all', ...matrixContract.HOSTS], risk: RISKS, readiness: READINESS };
      const normalized = {};
      for (const key of Object.keys(choices)) {
        const value = selection[key] === undefined || selection[key] === '' ? 'all' : selection[key];
        if (!choices[key].includes(value)) return invalid([`Invalid ${key} filter; select a listed value or all.`]);
        normalized[key] = value;
      }
      const items = [];
      const incompatible = [];
      for (const entry of catalog.entries) {
        const riskMatches = normalized.risk === 'all'
          || (normalized.risk === 'assessed' ? entry.risk !== 'unclassified' : entry.risk === normalized.risk);
        if (!riskMatches || !matchesReadiness(entry, normalized.readiness)) continue;
        const item = { entry, hostAssessment: assessHost(entry, normalized.host) };
        (item.hostAssessment.status === 'incompatible' ? incompatible : items).push(item);
      }
      return {
        valid: true, errors: [], filters: normalized, items, incompatible,
        matrixRows: matrixContract.filterRows(matrix, normalized.host === 'all' ? {} : { host: normalized.host }),
        provenance: {
          source: catalog.source, acceptanceSnapshot: catalog.acceptanceSnapshot,
          capabilityMatrix: catalog.capabilityMatrix
        },
        permissions: matrix.permissions, riskReason: catalog.common.riskReason
      };
    } catch {
      return invalid(['Catalog, matrix or filters could not be evaluated safely; no results or authority claims are retained.']);
    }
  }

  return Object.freeze({ RISKS, READINESS, HOST_LABELS, filterCatalog });
}));
