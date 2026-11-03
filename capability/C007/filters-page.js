(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./catalog-filters.js'), require('../C005/catalog-contract.js'));
  } else {
    const page = factory(root.C007Filters, root.C005Contract);
    Object.defineProperty(root, 'C007Page', { value: page });
    page.render(root.C005Catalog, root.C003Matrix, root.document);
  }
}(globalThis, function (filterApi, catalogContract) {
  'use strict';

  const states = new WeakMap();
  function element(doc, tag, text, className) {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function link(doc, text, href, className) {
    const node = element(doc, 'a', text, className);
    node.setAttribute('href', href);
    node.setAttribute('rel', 'noreferrer');
    return node;
  }
  function sourceLinks(doc, catalog, entry) {
    const links = element(doc, 'p', undefined, 'source-links');
    for (const reference of entry.sourceReferences) {
      links.append(link(doc, `${entry.id} · ${reference.document} source line ${reference.line}`,
        catalogContract.sourceHref(catalog, reference), 'source-link'));
    }
    return links;
  }
  function entryCard(doc, catalog, item, excluded) {
    const { entry, hostAssessment } = item;
    const card = element(doc, 'article', undefined, excluded ? 'incompatible-entry' : 'catalog-entry');
    card.id = entry.id;
    card.dataset.entryId = entry.id;
    card.dataset.hostStatus = hostAssessment.status;
    card.dataset.risk = entry.risk;
    card.dataset.kind = entry.kind;
    card.append(element(doc, 'h3', `${entry.id} — ${entry.title}`));
    card.append(element(doc, 'p', entry.objective, 'objective'));
    card.append(element(doc, 'p', `Risk: ${entry.risk.toUpperCase()} · Priority: ${entry.priority} (not risk).`, 'risk-status'));
    card.append(element(doc, 'p', hostAssessment.reason, excluded ? 'incompatible-reason' : 'host-status'));
    card.append(element(doc, 'p', `Canonical direct prerequisites: ${entry.prerequisites.additional}. `
      + (entry.prerequisites.inheritsBase ? 'Also inherits the source-defined BASE prerequisite.' : 'No inherited scenario BASE is added.'),
    'prerequisite-context'));
    const learning = element(doc, 'p', `${entry.learning.available ? 'Portable lesson accepted (historical snapshot)' : 'Portable lesson unavailable'}: `
      + entry.learning.reason, 'learning-status');
    if (entry.learning.available) {
      learning.append(doc.createTextNode(' '),
        link(doc, `Open historical portable lesson ${entry.id}`, entry.learning.href, 'lesson-link'));
    }
    card.append(learning);
    card.append(element(doc, 'p', `Native runnable: ${entry.native.runnable}; qualified: ${entry.native.qualified}. `
      + entry.native.reason, 'native-status'));
    card.append(element(doc, 'p', `${entry.parentId}: incomplete; completed: ${entry.parent.completed}. `
      + entry.parent.reason, 'parent-status'));
    card.append(sourceLinks(doc, catalog, entry));
    return card;
  }
  function bind(doc) {
    if (states.has(doc)) return states.get(doc);
    const host = doc.getElementById('host-filter');
    for (const [value, label] of Object.entries(filterApi.HOST_LABELS)) {
      if (value !== 'all') {
        const option = element(doc, 'option', label);
        option.value = value;
        host.append(option);
      }
    }
    const state = {
      catalog: undefined, matrix: undefined,
      host, risk: doc.getElementById('risk-filter'), readiness: doc.getElementById('readiness-filter')
    };
    states.set(doc, state);
    const refresh = () => render(state.catalog, state.matrix, doc);
    const form = doc.getElementById('filters');
    form.addEventListener('change', refresh);
    form.addEventListener('submit', event => { event.preventDefault(); refresh(); });
    form.addEventListener('reset', event => {
      event.preventDefault();
      for (const control of [state.host, state.risk, state.readiness]) control.value = 'all';
      refresh();
      state.host.focus();
    });
    return state;
  }
  function render(catalog, matrix, doc) {
    const state = bind(doc);
    // Store even invalid input, so later control events cannot resurrect an older valid catalog.
    state.catalog = catalog;
    state.matrix = matrix;
    const byId = id => doc.getElementById(id);
    for (const id of ['catalog-entries', 'incompatible-entries', 'matrix-rows', 'snapshot-source', 'dependency-reference']) {
      byId(id).replaceChildren();
    }
    byId('snapshot-summary').textContent = 'No validated committed snapshot. Availability is unverified.';
    byId('risk-reason').textContent = '';
    byId('permission-values').textContent = 'No validated permissions.';
    byId('incompatible-summary').textContent = 'No validated host assessment.';
    const result = filterApi.filterCatalog(catalog, matrix, {
      host: state.host.value, risk: state.risk.value, readiness: state.readiness.value
    });
    const error = byId('catalog-error');
    const empty = byId('catalog-empty');
    error.hidden = result.valid;
    empty.hidden = result.valid && result.items.length > 0;
    if (!result.valid) {
      error.textContent = `Catalog / filters unavailable: ${result.errors.join('; ')}`;
      empty.textContent = 'No entries are displayed; data is unverified, not an empty source catalog.';
      byId('catalog-count').textContent = 'Catalog unavailable / unverified; 0 entries displayed.';
      return false;
    }
    error.textContent = '';
    const { acceptanceSnapshot: snapshot, source } = result.provenance;
    byId('snapshot-summary').textContent = `Historical snapshot, not live availability. Commit ${snapshot.commit}; `
      + `commit time ${snapshot.commitTimeUtc}; ledger updated ${snapshot.ledgerUpdatedAtUtc}. Source pin ${source.commit}.`;
    byId('snapshot-source').append(link(doc, 'View the committed historical acceptance ledger',
      `https://github.com/chadhage/app-scaling-strategies/blob/${snapshot.commit}/.docs/wiki/flow-state.json`));
    byId('risk-reason').textContent = result.riskReason;
    byId('dependency-reference').append(link(doc, 'Canonical prerequisite notation and OR / BASE rules',
      catalogContract.sourceHref(catalog, catalog.common.dependencyRules.reference)));
    byId('permission-values').textContent = JSON.stringify(result.permissions, null, 2);
    const portableCount = result.items.filter(item => item.entry.learning.available).length;
    byId('catalog-count').textContent = `${result.items.length} of ${catalog.entries.length} catalog entries · `
      + `${result.incompatible.length} explicit host-prerequisite conflicts after risk/readiness filters · `
      + `${portableCount} accepted portable lessons matching (historical snapshot) · `
      + '0 native runnable · 0 completed source parents.';
    empty.textContent = 'No entries match all selected filters. '
      + (result.filters.risk !== 'all' && result.filters.risk !== 'unclassified'
        ? `All source risks are UNCLASSIFIED; there are no ${result.filters.risk} assessed-risk records. `
        : '')
      + 'Native runnable, native qualified and completed source parents remain zero. Reset filters to see all entries.';
    for (const item of result.items) byId('catalog-entries').append(entryCard(doc, catalog, item, false));
    byId('incompatible-summary').textContent = `${result.incompatible.length} excluded direct host-prerequisite conflicts `
      + 'after the same risk/readiness filters. Unknowns stay in the matching list; no support is inferred.';
    for (const item of result.incompatible) byId('incompatible-entries').append(entryCard(doc, catalog, item, true));
    for (const row of result.matrixRows) {
      const node = element(doc, 'article', undefined, 'matrix-row');
      node.dataset.matrixId = row.id;
      node.dataset.status = row.status;
      node.append(element(doc, 'h3', `${row.title} — ${row.status}`));
      node.append(element(doc, 'p', row.reason, 'matrix-reason'));
      node.append(element(doc, 'p', `Documented support: ${row.documentedSupport}; adapter: ${row.adapter}; qualified: ${row.qualified}.`));
      const constraints = element(doc, 'ul');
      for (const constraint of row.constraints) constraints.append(element(doc, 'li', constraint.text));
      node.append(constraints);
      const sources = element(doc, 'p', undefined, 'source-links');
      for (const id of row.sourceIds) {
        const reference = matrix.sources.find(sourceReference => sourceReference.id === id);
        sources.append(link(doc, reference.title, reference.url, 'matrix-source-link'));
      }
      node.append(sources);
      byId('matrix-rows').append(node);
    }
    return true;
  }

  return Object.freeze({ render });
}));
