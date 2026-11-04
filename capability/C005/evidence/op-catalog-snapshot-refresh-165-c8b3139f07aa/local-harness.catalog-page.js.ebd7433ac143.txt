(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./composition.js'), require('../C005/catalog-contract.js'),
      require('../C007/catalog-filters.js'));
  } else {
    const page = factory(root.CatalogComposition, root.C005Contract, root.C007Filters);
    Object.defineProperty(root, 'CatalogFlow', { value: page });
    page.mount(root.C005Catalog, root.C003Matrix, root.document);
  }
}(globalThis, function (composition, contract, filters) {
  'use strict';
  const mounts = new WeakMap();
  function element(doc, tag, text, className) {
    const node = doc.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function paragraph(parent, text, className) {
    const node = element(parent.ownerDocument, 'p', text, className);
    parent.append(node);
    return node;
  }
  function link(parent, text, href, className) {
    const node = element(parent.ownerDocument, 'a', text, className);
    node.setAttribute('href', href);
    node.rel = 'noopener noreferrer';
    parent.append(node);
    return node;
  }
  function fields(parent, pairs) {
    const doc = parent.ownerDocument;
    const list = element(doc, 'dl');
    for (const [label, value] of pairs) list.append(element(doc, 'dt', label), element(doc, 'dd', String(value)));
    parent.append(list);
  }
  function sourceLinks(parent, catalog, entry) {
    for (const reference of entry.sourceReferences) {
      const row = paragraph(parent, '', 'source-link');
      link(row, `${entry.id} · ${reference.path} · line ${reference.line} · ${reference.anchor}`,
        contract.sourceHref(catalog, reference));
    }
  }
  function snapshot(parent, result) {
    const { source, acceptanceSnapshot: pin } = result.provenance;
    paragraph(parent, `Historical snapshot, not live availability. Source pin ${source.commit}. `
      + `Acceptance commit ${pin.commit}; commit time ${pin.commitTimeUtc}; ledger updated ${pin.ledgerUpdatedAtUtc}.`);
    link(parent, 'Pinned committed acceptance ledger',
      `https://github.com/chadhage/app-scaling-strategies/blob/${pin.commit}/${pin.ledgerPath.replaceAll('\\', '/')}`);
    paragraph(parent, result.riskReason);
    paragraph(parent, 'Later files, publications and acceptances do not refresh this snapshot. '
      + 'Structural validation is not authentication of arbitrary data or execution approval; there is no import interface.');
  }
  function preparation(parent, result) {
    const doc = parent.ownerDocument;
    const view = result.preparation;
    const { catalog, entry, matrix, approved, approvalValidation } = view;
    const chosen = [...result.items, ...result.incompatible].find(item => item.entry === entry);
    paragraph(parent, entry.objective, 'preparation-objective');
    fields(parent, [
      ['Source ID / parent', `${entry.id} / ${entry.parentId}`],
      ['Category / source priority (not risk)', `${entry.category.title} / ${entry.priority}`],
      ['Exact implementation requirement', entry.implementation],
      ['Exact acceptance requirement — not satisfied here', entry.acceptance]
    ]);
    sourceLinks(parent, catalog, entry);
    parent.append(element(doc, 'h3', 'Portable preparation'));
    parent.dataset.learningMode = view.learningMode;
    paragraph(parent, `Preparation mode: ${view.learningMode}. ${entry.learning.reason}`, 'learning-status');
    if (entry.learning.available) {
      paragraph(parent, 'Read the original lesson’s preconditions, synthetic inputs, controls, assertions and limitations. '
        + 'Use only its local exercise/reset controls. Training rehearsal — synthetic data — not a live Azure result.');
      const lesson = link(parent, `Open accepted synthetic lesson ${entry.learning.cardId} (new tab)`,
        entry.learning.href, 'lesson-link');
      lesson.target = '_blank';
      fields(parent, [
        ['Historical accepted implementation', entry.learning.evidence.commit],
        ['Published lesson tag', entry.learning.evidence.tag],
        ['Accepted at (snapshot)', entry.learning.evidence.acceptedAtUtc]
      ]);
      paragraph(parent, 'Close the lesson tab to return to this preparation. Back to these results preserves your query and filters.');
    } else {
      paragraph(parent, 'Source preparation remains readable, but no accepted portable exercise or fallback is supplied here. '
        + 'Workflow practice can be unsupported without claiming every native host is unsupported.');
    }
    parent.append(element(doc, 'h3', 'Exact prerequisites and separately gated native limits'));
    fields(parent, [['Additional source prerequisites', entry.prerequisites.additional]]);
    paragraph(parent, entry.prerequisites.inheritsBase
      ? 'This scenario also inherits BASE. “none” means no additional prerequisites, never no BASE.'
      : 'This workflow retains its own listed prerequisites; no D-S BASE rule is added to the workflow.');
    paragraph(parent, chosen.hostAssessment.reason, 'host-status');
    paragraph(parent, `Support: ${entry.support.status}. ${entry.support.reason}`, 'support-status');
    paragraph(parent, `Native runnable: ${entry.native.runnable}; qualified: ${entry.native.qualified}. ${entry.native.reason}`, 'native-status');
    paragraph(parent, `Source parent ${entry.parentId}: ${entry.parent.status}; completed: ${entry.parent.completed}. ${entry.parent.reason}`, 'parent-status');
    paragraph(parent, `Risk: ${entry.risk.toUpperCase()}. ${catalog.common.riskReason}`, 'risk-status');
    paragraph(parent, 'OR clauses are alternatives, not all-host requirements. No native configuration is assigned by these filters. '
      + 'Missing limits are not defaults. Pricing is unknown, not a free-resource quote. '
      + 'Native verification is unverified; actual user impact is unmeasured; cloud cleanup is unobserved. '
      + 'Reset is local navigation, not H010 cleanup, lease release or evidence export.');
    fields(parent, [
      ['First planned native host — not selected for this entry', approved.approval.firstNativeHost],
      ['Unresolved native choices (C001)', approvalValidation.unresolvedNativeChoices.join(', ')],
      ...Object.entries(matrix.design.target).map(([key, value]) => [`Native ${key}`, value === null ? 'Unapproved — no value supplied; not a default.' : value]),
      ['Runtime design — not validated production', matrix.design.runtime],
      ['Production runtime validated', approvalValidation.productionRuntimeValidated]
    ]);
    parent.append(element(doc, 'h4', 'Unchanged C003 permissions and C001 operating envelope'));
    fields(parent, Object.entries(result.permissions));
    fields(parent, Object.entries(approved.approval.operatingEnvelope));
    paragraph(parent, 'These read-only zeros prohibit live runs and spending. Native, IaC, scaffold, identity registration, '
      + 'deployment and expenditure are unapproved; this page supplies no executor or approval controls.');
    link(parent, 'Inspect C001 approval and integrity boundaries', '../C001/index.html');
    const design = element(doc, 'details');
    design.append(element(doc, 'summary', 'Exact unchanged C001 approved design — not native consent'),
      element(doc, 'pre', JSON.stringify(approved.approval, null, 2)));
    parent.append(design);
    for (const [key, title] of [
      ['dependencyRules', 'Canonical BASE, AND / OR prerequisite notation'],
      ['operatingLimits', 'Exact lifecycle and operating limits'],
      ['sharedDefinitionOfDone', 'Original shared Done gates — not completed here'],
      ['acceptanceAndEvidence', 'Original acceptance and evidence requirements']
    ]) {
      const source = catalog.common[key];
      const detail = element(doc, 'details', undefined, 'source-excerpt');
      detail.dataset.sourceSection = key;
      detail.append(element(doc, 'summary', title), element(doc, 'pre', source.text));
      link(detail, `${source.reference.path} · line ${source.reference.line}`,
        contract.sourceHref(catalog, source.reference), 'common-source-link');
      parent.append(detail);
    }
    if (entry.kind === 'workflow') paragraph(parent, catalog.common.workflowScope);
    const reference = element(doc, 'details');
    reference.id = 'matrix-reference';
    reference.append(element(doc, 'summary', `${result.matrixRows.length} unchanged C003 configurations for this host selection`));
    paragraph(reference, 'These are reference configurations, not per-entry support assignments. '
      + 'Documented-supported is not implemented, runnable or qualified. Unsupported and unknown retain their original meanings.');
    link(reference, 'Full C003 host / format authority', '../C003/index.html');
    for (const row of result.matrixRows) {
      const block = element(doc, 'section', undefined, 'matrix-row');
      block.dataset.matrixId = row.id;
      block.append(element(doc, 'h4', row.title));
      paragraph(block, `${row.status}; documented support: ${row.documentedSupport}; qualified: ${row.qualified}. ${row.reason}`);
      const list = element(doc, 'ul');
      for (const constraint of row.constraints) list.append(element(doc, 'li', constraint.text));
      block.append(list);
      reference.append(block);
    }
    parent.append(reference);
  }
  function mount(catalog, matrix, doc) {
    mounts.get(doc)?.dispose();
    const byId = id => doc.getElementById(id);
    const query = byId('catalog-query');
    const selects = ['host-filter', 'risk-filter', 'readiness-filter'].map(byId);
    const form = byId('catalog-form');
    let revision = 0;
    let disposed = false;
    let current = null;
    let selectedId = '';
    function clear() {
      for (const id of ['matching-entries', 'excluded-entries', 'snapshot-body', 'preparation-body']) byId(id).replaceChildren();
      for (const id of ['snapshot', 'preparation', 'excluded']) byId(id).hidden = true;
      byId('preparation-heading').textContent = '';
      byId('preparation-body').removeAttribute('data-learning-mode');
      byId('catalog-error').hidden = true;
      byId('catalog-error').textContent = '';
      byId('catalog-empty').hidden = true;
      byId('catalog-status').textContent = 'Validating accepted providers… No retained results or preparation.';
      current = null;
    }
    function failed(errors) {
      clear();
      byId('catalog-error').hidden = false;
      byId('catalog-error').textContent = `Catalog / preparation unavailable: ${errors.join('; ')}`;
      byId('catalog-status').textContent = 'Unverified data; no results, preparation, snapshot or authority claims are retained.';
    }
    function card(parent, item) {
      const { entry, hostAssessment } = item;
      const node = element(doc, 'article', undefined, 'catalog-entry');
      node.id = entry.id;
      node.dataset.entryId = entry.id;
      node.dataset.hostStatus = hostAssessment.status;
      node.append(element(doc, 'h3', `${entry.id} — ${entry.title}`));
      paragraph(node, entry.objective, 'objective');
      paragraph(node, `Risk: ${entry.risk.toUpperCase()} (not source priority ${entry.priority}).`, 'risk-status');
      paragraph(node, hostAssessment.reason, 'host-status');
      paragraph(node, `${entry.learning.available ? 'Portable accepted (historical snapshot)' : 'Portable unavailable'}: ${entry.learning.reason}`, 'learning-status');
      paragraph(node, `Native runnable: ${entry.native.runnable}; qualified: ${entry.native.qualified}. ${entry.native.reason}`, 'native-status');
      paragraph(node, `${entry.parentId}: incomplete; completed: ${entry.parent.completed}. ${entry.parent.reason}`, 'parent-status');
      const button = element(doc, 'button', `Read ${entry.id} preparation`);
      button.id = `prepare-${entry.id}`;
      button.type = 'button';
      button.setAttribute('aria-controls', 'preparation');
      button.setAttribute('aria-expanded', String(selectedId === entry.id));
      button.addEventListener('click', () => { void refresh(entry.id, 'heading'); });
      node.append(button);
      parent.append(node);
    }
    function count(result) {
      return `${result.items.length} matching · ${result.incompatible.length} excluded direct host conflicts · `
        + `${result.items.filter(item => item.entry.learning.available).length} matching accepted portable lessons (historical snapshot). `
        + `Query: “${result.query}”. All selected filters combine with AND; original source order is retained.`;
    }
    async function refresh(entryId = '', focus = '') {
      if (disposed) return false;
      const token = ++revision;
      selectedId = '';
      clear();
      try {
        if (!composition || typeof composition.compose !== 'function'
            || !contract || contract.SCHEMA_VERSION !== '1.0.0' || typeof contract.sourceHref !== 'function') {
          throw new Error('Accepted composition / source-link providers are unavailable or incompatible.');
        }
        const result = await composition.compose(catalog, matrix, {
          query: query.value,
          filters: { host: selects[0].value, risk: selects[1].value, readiness: selects[2].value },
          entryId
        });
        if (disposed || token !== revision) return false;
        if (!result.valid) { failed(result.errors); return false; }
        selectedId = result.preparation.state === 'ready' ? result.preparation.entry.id : '';
        snapshot(byId('snapshot-body'), result);
        byId('snapshot').hidden = false;
        for (const item of result.items) card(byId('matching-entries'), item);
        for (const item of result.incompatible) card(byId('excluded-entries'), item);
        byId('excluded').hidden = result.incompatible.length === 0;
        byId('catalog-empty').hidden = result.items.length > 0;
        byId('catalog-status').textContent = count(result);
        byId('catalog-controls').disabled = false;
        if (selectedId) {
          preparation(byId('preparation-body'), result);
          byId('preparation-heading').textContent = `${result.preparation.entry.id} — ${result.preparation.entry.title}`;
          byId('preparation').hidden = false;
          byId('catalog-status').textContent += ` ${selectedId} preparation opened. No native result.`;
        }
        current = result;
        if (focus === 'heading') byId('preparation-heading').focus();
        if (focus === 'query') query.focus();
        return true;
      } catch (error) {
        if (!disposed && token === revision) failed([error instanceof Error ? error.message : 'Provider evaluation failed safely.']);
        return false;
      }
    }
    function reset() {
      if (disposed) return Promise.resolve(false);
      query.value = '';
      for (const select of selects) select.value = 'all';
      return refresh('', 'query');
    }
    function back() {
      if (disposed) return;
      const id = selectedId;
      ++revision;
      selectedId = '';
      byId('preparation').hidden = true;
      byId('preparation-heading').textContent = '';
      byId('preparation-body').replaceChildren();
      byId('preparation-body').removeAttribute('data-learning-mode');
      const button = byId(`prepare-${id}`);
      if (button) button.setAttribute('aria-expanded', 'false');
      if (current) byId('catalog-status').textContent = count(current);
      (button || query).focus();
    }
    const refreshEvent = () => { void refresh(); };
    const submitEvent = event => { event.preventDefault(); void refresh(); };
    const resetEvent = event => { event.preventDefault(); void reset(); };
    query.addEventListener('input', refreshEvent);
    for (const select of selects) select.addEventListener('change', refreshEvent);
    form.addEventListener('submit', submitEvent);
    form.addEventListener('reset', resetEvent);
    byId('back-results').addEventListener('click', back);
    function dispose() {
      if (disposed) return;
      disposed = true;
      ++revision;
      query.removeEventListener('input', refreshEvent);
      for (const select of selects) select.removeEventListener('change', refreshEvent);
      form.removeEventListener('submit', submitEvent);
      form.removeEventListener('reset', resetEvent);
      byId('back-results').removeEventListener('click', back);
      clear();
    }
    let ready;
    try {
      if (!filters || !filters.HOST_LABELS || !Array.isArray(filters.RISKS) || !Array.isArray(filters.READINESS)) {
        throw new Error('The accepted C007 selection vocabulary is unavailable.');
      }
      const labels = {
        'all': 'All', 'unclassified': 'UNCLASSIFIED', 'assessed': 'Assessed risk (none classified)',
        'portable-available': 'Portable accepted (historical snapshot)', 'portable-unavailable': 'Portable unavailable',
        'native-unavailable': 'Native unavailable / unverified', 'native-runnable': 'Native runnable',
        'native-qualified': 'Native qualified', 'parent-complete': 'Source parent complete'
      };
      for (const [index, choices] of [
        Object.entries(filters.HOST_LABELS),
        filters.RISKS.map(value => [value, labels[value] || value]),
        filters.READINESS.map(value => [value, labels[value] || value])
      ].entries()) {
        const previous = selects[index].value;
        selects[index].replaceChildren();
        for (const [value, label] of choices) {
          const option = element(doc, 'option', label);
          option.value = value;
          selects[index].append(option);
        }
        selects[index].value = previous;
      }
      ready = refresh();
    } catch (error) {
      failed([error.message]);
      ready = Promise.resolve(false);
    }
    const controller = Object.freeze({ ready, refresh, open: id => refresh(id, 'heading'), reset, back, dispose });
    mounts.set(doc, controller);
    return controller;
  }
  return Object.freeze({ mount });
}));
