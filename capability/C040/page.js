(function () {
  'use strict';
  const api = globalThis.C040Tables;
  const element = (id) => document.getElementById(id);
  const catalog = api && globalThis.C040Saved ? api.catalog(globalThis.C040Saved) : null;
  const defaults = () => ({ sort: { column: 'position', direction: 'asc' }, filter: 'all', search: '' });
  const current = { setId: '', tables: null, tableId: 'cohort', query: defaults() };
  const roleLabels = { historical: 'Saved accepted history', 'fictional-baseline': 'Fictional baseline', negative: 'Fictional negatives' };
  const initialStatus = 'No saved set is loaded. Nothing is assumed to have passed.';
  const initialSummary = 'No saved set is loaded: 0 of 0 rows are shown and nothing is assumed to have passed.';
  const text = (tag, value) => {
    const node = document.createElement(tag);
    node.textContent = value;
    return node;
  };
  const option = (value, label) => {
    const node = text('option', label);
    node.value = value;
    return node;
  };
  const titleOf = (id) => `${api.titles[id]} table`;
  function populate() {
    const groups = new Map();
    for (const id of catalog.ids) {
      const info = catalog.describe(id);
      if (!groups.has(info.role)) {
        const group = document.createElement('optgroup');
        group.label = roleLabels[info.role] || info.role;
        groups.set(info.role, group);
        element('saved-set').append(group);
      }
      groups.get(info.role).append(option(id, info.label));
    }
  }
  function enableControls(enabled) {
    for (const id of ['sort-column', 'sort-direction', 'status-filter', 'search']) element(id).disabled = !enabled;
  }
  function fillControls(table) {
    element('sort-column').replaceChildren(...table.columns.map((column) => option(column.key, column.label)));
    element('status-filter').replaceChildren(...api.filterOptions(table.tableId).map((item) => option(item.value, item.label)));
    element('sort-column').value = current.query.sort.column;
    element('sort-direction').value = current.query.sort.direction;
    element('status-filter').value = current.query.filter;
    element('search').value = current.query.search;
    enableControls(true);
  }
  function renderTabs() {
    for (const id of api.tableIds) {
      element(`tab-${id}`).setAttribute('aria-selected', String(id === current.tableId));
      element(`tab-${id}`).setAttribute('tabindex', id === current.tableId ? '0' : '-1');
    }
    element('panel').setAttribute('aria-labelledby', `tab-${current.tableId}`);
  }
  function rowElement(row, columns) {
    const item = document.createElement('tr');
    item.id = `row-${row.position}`;
    Object.assign(item.dataset, { rowId: row.id, position: String(row.position), status: row.status, kind: row.kind,
      attention: String(row.attention), flags: row.flags.join(' ') });
    for (const column of columns) item.append(text('td', row.text[column.key]));
    return item;
  }
  // The page re-reads what it rendered: counts must add up to the total, every failed or unknown row of the table must be on the
  // page, and no row identifier may repeat (a duplicated saved row still gets its own position-based identifier).
  function pageCheck(table) {
    const problems = [];
    const rows = Array.from(element('rows').children);
    const { total, shown } = element('summary').dataset;
    const counted = Array.from(element('status-counts').children).reduce((sum, item) => sum + Number(item.dataset.count), 0);
    if (counted !== Number(total)) problems.push(`the rendered status counts add up to ${counted}, not to the total ${total}`);
    if (rows.length !== Number(shown)) problems.push(`${rows.length} rows are rendered but the summary says ${shown}`);
    const identifiers = rows.map((row) => row.id);
    if (new Set(identifiers).size !== identifiers.length) problems.push('rendered row identifiers are not unique');
    const rendered = rows.filter((row) => row.dataset.attention === 'true').length;
    const expected = table.rows.filter((row) => row.attention).length;
    if (rendered !== expected) problems.push(`${rendered} failed or unknown rows are rendered but the table holds ${expected}`);
    return problems;
  }
  function show(prefix, refill) {
    renderTabs();
    element('table-title').textContent = titleOf(current.tableId);
    element('provenance').textContent = current.tables ? JSON.stringify(catalog.describe(current.setId), null, 2) : '';
    if (!current.tables) {
      for (const id of ['rows', 'head', 'status-counts', 'sort-column', 'status-filter']) element(id).replaceChildren();
      for (const id of ['producer-line', 'filter-note']) element(id).textContent = '';
      Object.assign(element('summary').dataset, { state: 'UNLOADED', total: '0', shown: '0' });
      element('summary').textContent = initialSummary;
      element('caption').textContent = 'No saved set is loaded';
      element('search').value = '';
      enableControls(false);
      element('status').dataset.state = 'UNLOADED';
      element('status').textContent = `${prefix} ${initialStatus}`;
      return;
    }
    const table = current.tables[current.tableId];
    const view = api.view(table, current.query);
    if (refill) fillControls(table);
    element('summary').dataset.state = view.state;
    element('summary').dataset.total = String(view.total);
    element('summary').dataset.shown = String(view.shown);
    element('summary').textContent = view.summary;
    element('producer-line').textContent = view.producerLine;
    element('filter-note').textContent = view.filterNote;
    element('caption').textContent = `${titleOf(current.tableId)} of saved set ${current.setId}: ${view.shown} of ${view.total} rows, ${view.state}`;
    element('status-counts').replaceChildren(...Object.entries(view.statusCounts).map(([status, count]) => {
      const item = text('li', `${status}: ${count}`);
      Object.assign(item.dataset, { status, count: String(count) });
      return item;
    }));
    element('head').replaceChildren(...table.columns.map((column) => {
      const cell = text('th', column.label);
      cell.scope = 'col';
      const sorted = column.key === view.query.sort.column;
      cell.setAttribute('aria-sort', sorted ? (view.query.sort.direction === 'asc' ? 'ascending' : 'descending') : 'none');
      return cell;
    }));
    element('rows').replaceChildren(...view.rows.map((row) => rowElement(row, table.columns)));
    const problems = pageCheck(table);
    element('error').textContent = problems.length ? `PAGE_CHECK_FAILED: ${problems.join('; ')}` : '';
    element('status').dataset.state = problems.length ? 'INCONSISTENT' : view.state;
    element('status').textContent = `${problems.length ? 'INCONSISTENT PAGE: ' : ''}${prefix} ${view.announcement}`.trim();
  }
  function load() {
    let tables = null;
    let code = '';
    try { tables = catalog.tables(element('saved-set').value); } catch (error) { code = error.code || 'SAVED_SET_UNAVAILABLE'; }
    Object.assign(current, { setId: tables ? element('saved-set').value : '', tables, query: defaults() });
    show(tables ? `Loaded saved set ${current.setId}.` : 'The saved set could not be loaded.', true);
    if (code) element('error').textContent = code;
  }
  function selectTab(id) {
    current.tableId = id;
    current.query = defaults();
    show(`Switched to the ${titleOf(id)}; sort, filter and search are back to their defaults.`, true);
  }
  function tabKey(id, event) {
    const order = api.tableIds;
    const at = order.indexOf(id);
    let next = null;
    if (event.key === 'ArrowRight') next = order[(at + 1) % order.length];
    else if (event.key === 'ArrowLeft') next = order[(at + order.length - 1) % order.length];
    else if (event.key === 'Home') next = order[0];
    else if (event.key === 'End') next = order[order.length - 1];
    if (!next) return;
    event.preventDefault();
    selectTab(next);
    element(`tab-${next}`).focus();
  }
  function changed(describe) {
    if (!current.tables) return;
    current.query = { sort: { column: element('sort-column').value, direction: element('sort-direction').value },
      filter: element('status-filter').value, search: element('search').value };
    show(describe(current.tables[current.tableId]), false);
  }
  if (!catalog) {
    element('status').dataset.state = 'REJECTED';
    element('error').textContent = 'ACCEPTED_SAVED_SETS_UNAVAILABLE';
    element('load').disabled = true;
    return;
  }
  populate();
  element('load').addEventListener('click', load);
  for (const id of api.tableIds) {
    element(`tab-${id}`).addEventListener('click', () => selectTab(id));
    element(`tab-${id}`).addEventListener('keydown', (event) => tabKey(id, event));
  }
  const columnLabel = (table) => table.columns.find((column) => column.key === current.query.sort.column).label;
  element('sort-column').addEventListener('change', () => changed((table) => `Sorted by ${columnLabel(table)}, ${current.query.sort.direction === 'asc' ? 'ascending' : 'descending'}.`));
  element('sort-direction').addEventListener('change', () => changed((table) => `Sorted by ${columnLabel(table)}, ${current.query.sort.direction === 'asc' ? 'ascending' : 'descending'}.`));
  element('status-filter').addEventListener('change', () => changed(() => 'Status filter changed.'));
  element('search').addEventListener('input', () => changed(() => (current.query.search.trim() ? `Search for "${current.query.search.trim()}".` : 'Search cleared.')));
  element('reset').addEventListener('click', () => {
    Object.assign(current, { setId: '', tables: null, query: defaults() });
    element('saved-set').value = '';
    element('error').textContent = '';
    show('Display reset.', true);
    element('saved-set').focus();
  });
  show('Ready.', true);
}());
