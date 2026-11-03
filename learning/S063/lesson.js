(function startLesson() {
  'use strict';
  const model = globalThis.S063;
  const byId = (id) => document.getElementById(id);
  const form = byId('comparison-form');
  const error = byId('error');
  const summary = byId('run-summary');
  let state = model.createState();
  const names = { 'in-place': 'In-place resize', 'parallel-failover': 'Parallel-capacity failover' };
  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }
  function clearError() {
    error.hidden = true;
    error.textContent = '';
    form.querySelectorAll('[aria-invalid]').forEach((control) => control.removeAttribute('aria-invalid'));
  }
  function budget(field) {
    const text = byId(field).value;
    if (!/^(0|[1-9]\d{0,3})$/.test(text) || Number(text) > 5000) {
      const problem = new Error('Enter whole milliseconds from 0 to 5000, without spaces, decimals or exponent notation.');
      problem.field = field;
      throw problem;
    }
    return Number(text);
  }
  function readInput() {
    return {
      path: byId('path').value,
      fixture: byId('fixture').value,
      readiness: byId('readiness').value,
      transaction: byId('transaction').value,
      observation: byId('observation').value,
      reconnectBudgetMs: budget('reconnectBudgetMs'),
      recoveryBudgetMs: budget('recoveryBudgetMs'),
    };
  }
  const time = (value) => value === null ? 'Not observed' : `${value} ms`;
  function render() {
    const latest = state.history.at(-1);
    const { result } = latest;
    byId('results').hidden = false;
    byId('comparison-rows').replaceChildren();
    for (const path of result.comparison) {
      const row = document.createElement('tr');
      row.dataset.path = path.path;
      const heading = element('th', `${names[path.path]}${path.path === result.input.path ? ' (inspected)' : ''}`);
      heading.scope = 'row';
      row.append(heading, element('td', path.operationClass));
      const verdict = element('td', path.verdict);
      verdict.dataset.verdict = path.verdict;
      row.append(verdict, element('td', time(path.reconnectMs)), element('td', time(path.recoveryMs)));
      const tx = path.transactions;
      row.append(element('td', `${tx.completed}/${tx.started} completed; ${tx.failed} failed; ${tx.unknown} unresolved; ${tx.notRun} not run`));
      byId('comparison-rows').append(row);
    }
    byId('trace').replaceChildren(...result.selected.trace.map((line) => element('li', line)));
    byId('transaction-rows').replaceChildren(...result.selected.transactions.rows.map((row) =>
      element('li', `${row.id}: ${row.outcome}; effects ${row.effects === null ? 'unknown' : row.effects}`)));
    if (!result.selected.attempted) {
      byId('transaction-rows').append(element('li', 'No transition transactions started; three not run. This is not a successful recovery.'));
    }
    byId('impact').textContent = `User impact: ${result.selected.userImpact}`;
    byId('native-limit').textContent = `Native qualification: ${result.selected.nativeQualification}`;
    byId('history').replaceChildren(...state.history.map(({ number, result: saved }) => {
      const item = document.createElement('li');
      const comparison = saved.comparison.map((path) => `${names[path.path]}: ${path.verdict}`).join(' / ');
      item.append(element('strong', `Run ${number}: ${names[saved.input.path]} — ${saved.selected.verdict}. `));
      item.append(document.createTextNode(`${saved.input.fixture}; budgets ${saved.input.reconnectBudgetMs}/${saved.input.recoveryBudgetMs} ms. ${comparison}.`));
      return item;
    }));
    byId('history-count').textContent = `${state.history.length} / ${model.MAX_RUNS}`;
    summary.textContent = `Run ${latest.number}: ${names[result.input.path]} ${result.selected.verdict}. Both paths compared; ${state.history.length} of ${model.MAX_RUNS} retained.`;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      state = model.run(state, readInput());
      render();
    } catch (problem) {
      error.textContent = problem.message;
      error.hidden = false;
      const control = byId(problem.field) || byId('clear-lesson');
      control.setAttribute('aria-invalid', 'true');
      control.focus();
    }
  });
  byId('clear-lesson').addEventListener('click', () => {
    HTMLFormElement.prototype.reset.call(form);
    state = model.createState();
    clearError();
    byId('results').hidden = true;
    for (const id of ['comparison-rows', 'trace', 'transaction-rows', 'history']) byId(id).replaceChildren();
    byId('impact').textContent = '';
    byId('native-limit').textContent = '';
    byId('history-count').textContent = `0 / ${model.MAX_RUNS}`;
    summary.textContent = 'Reset. No comparisons retained.';
    byId('path').focus();
  });
}());
