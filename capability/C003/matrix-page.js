(function () {
  'use strict';
  const byId = id => document.getElementById(id);
  const contract = globalThis.C003Contract;
  const baseline = globalThis.C003Matrix;
  const labels = {
    'app-service': 'App Service', 'container-apps': 'Container Apps', aks: 'AKS', functions: 'Functions',
    unselected: 'Unselected Java host', code: 'Code', container: 'Container', 'function-code': 'Function code',
    'code-or-container': 'Code or container', planned: 'Planned', 'documented-supported': 'Documented-supported',
    qualified: 'Qualified', unsupported: 'Unsupported', unknown: 'Unknown'
  };
  let current = null;

  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  function resetFilters() {
    ['query', 'host', 'format', 'status'].forEach(id => { byId(id).value = ''; });
  }
  function reject(message) {
    current = null;
    byId('matrix-rows').replaceChildren();
    byId('sources').replaceChildren();
    byId('provenance').textContent = 'No validated contract is displayed.';
    byId('permissions').textContent = 'No permission data displayed. All real Azure actions remain forbidden.';
    byId('design-summary').textContent = 'Invalid data cannot change the approved design or native-target approval.';
    byId('review-scope').textContent = 'No source claims from invalid input are displayed.';
    byId('data-origin').textContent = 'Local input rejected. Restore the documented baseline to continue.';
    byId('result-count').textContent = '0 configurations. No validated data; no native qualification.';
    byId('empty').hidden = true;
    byId('data-error').textContent = message;
    byId('data-error').hidden = false;
  }
  function documentationLink(source) {
    const link = element('a', source.title);
    link.href = source.url;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    return link;
  }
  function render() {
    if (!current) return;
    const rows = contract.filterRows(current, {
      query: byId('query').value, host: byId('host').value,
      format: byId('format').value, status: byId('status').value
    });
    const sources = new Map(current.sources.map(source => [source.id, source]));
    const body = byId('matrix-rows');
    body.replaceChildren();
    rows.forEach(row => {
      const tr = element('tr');
      tr.dataset.rowId = row.id;
      tr.dataset.status = row.status;
      const host = element('td');
      host.append(element('p', row.title), element('p', labels[row.host] + ' / ' + labels[row.format], 'subtle'),
        element('p', 'OS: ' + row.os + '; runtime: ' + row.runtime, 'subtle'));
      const mechanism = element('td', row.mechanism.replaceAll('-', ' '));
      const availability = element('td');
      availability.append(element('span', labels[row.status], 'badge status-' + row.status),
        element('p', 'Documentation: ' + row.documentedSupport),
        element('p', 'Native: unqualified; adapter: ' + row.adapter),
        element('p', 'Native evidence: 0'));
      const reason = element('td');
      reason.append(element('p', row.reason));
      const limits = element('ul');
      row.constraints.forEach(constraint => limits.append(element('li', constraint.text)));
      reason.append(limits);
      const citations = element('td');
      const refs = new Set(row.sourceIds.concat(row.constraints.flatMap(constraint => constraint.sourceIds)));
      refs.forEach(id => {
        const source = sources.get(id);
        const p = element('p');
        p.append(documentationLink(source), element('span', ' — ' + source.verification, 'subtle'));
        citations.append(p);
      });
      tr.append(host, mechanism, availability, reason, citations);
      body.append(tr);
    });
    byId('result-count').textContent = rows.length + ' of ' + current.rows.length +
      ' configurations. Qualified native configurations: 0.';
    byId('empty').hidden = rows.length !== 0;
  }
  function display(matrix, imported) {
    const validation = contract.validateMatrix(matrix);
    if (!validation.valid) {
      reject('Invalid local contract. ' + validation.errors.join(' | '));
      return;
    }
    current = matrix;
    resetFilters();
    byId('data-error').hidden = true;
    byId('data-error').textContent = '';
    byId('data-origin').textContent = imported
      ? 'Imported local JSON: schema-consistent only, not authenticated documentation, approval, or native evidence.'
      : 'Immutable documented baseline. No live target discovery or management operation has run.';
    byId('review-scope').textContent = matrix.provenance.reviewNote;
    byId('design-summary').textContent = matrix.design.runtime + ' / ' + matrix.design.framework + ' on ' +
      matrix.design.hosting + ' is the approved design, not an implemented production harness. ' +
      matrix.design.testTooling + ' is test tooling only; production runtime validation: false.';
    byId('permissions').textContent = JSON.stringify(matrix.permissions, null, 2);
    byId('provenance').textContent = 'Contract ' + matrix.schemaVersion + '; baseline commit ' +
      matrix.provenance.baselineCommit + '; documentation review: ' + matrix.provenance.documentationReview +
      (matrix.provenance.reviewedAtUtc ? ' at ' + matrix.provenance.reviewedAtUtc : ' (current facts unverified)') +
      '. C001 approval source: ' + matrix.provenance.approvalSourceCommit + '.';
    const sources = byId('sources');
    sources.replaceChildren();
    matrix.sources.forEach(source => {
      const item = element('li');
      item.append(documentationLink(source), element('span', ' — ' + source.verification + '; baseline: ' + source.baselinePath));
      sources.append(item);
    });
    render();
  }

  if (!contract || !baseline) {
    reject('Local contract scripts are unavailable. No native configuration is qualified or runnable.');
    ['inspect', 'restore', 'clear', 'query', 'host', 'format', 'status'].forEach(id => { byId(id).disabled = true; });
    return;
  }
  [['host', contract.HOSTS], ['format', contract.FORMATS], ['status', contract.STATUSES]].forEach(([id, values]) => {
    values.forEach(value => {
      const option = element('option', labels[value]);
      option.value = value;
      byId(id).append(option);
    });
  });
  ['query', 'host', 'format', 'status'].forEach(id => {
    byId(id).addEventListener(id === 'query' ? 'input' : 'change', render);
  });
  byId('clear').addEventListener('click', () => { resetFilters(); render(); byId('query').focus(); });
  byId('inspect').addEventListener('click', () => {
    const raw = byId('local-json').value;
    if (raw.length > 250000) { reject('Local JSON exceeds the 250,000 character limit.'); return; }
    let parsed;
    try { parsed = JSON.parse(raw); }
    catch { reject('Invalid JSON. Supply one versioned local matrix object; no input is executed.'); return; }
    display(parsed, true);
  });
  byId('restore').addEventListener('click', () => { display(baseline, false); byId('local-json').value = ''; });
  display(baseline, false);
}());
