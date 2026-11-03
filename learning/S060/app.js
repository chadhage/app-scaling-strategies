(function () {
  'use strict';
  const model = globalThis.S060Model;
  const byId = (id) => document.getElementById(id);
  const form = byId('controls');
  const error = byId('input-error');
  let state = model.createState();
  const text = (id, value) => { byId(id).textContent = value; };
  const formatTotals = (totals) => totals
    ? Object.entries(totals).map(([currency, amount]) => `${currency} ${amount}`).join(' + ')
    : 'unobserved';
  const row = (values) => {
    const element = document.createElement('tr');
    for (const value of values) {
      const cell = document.createElement('td');
      cell.textContent = String(value);
      element.append(cell);
    }
    return element;
  };
  function render() {
    const full = state.history.length >= model.MAX_HISTORY;
    byId('configuration').disabled = state.phase !== 'ready' || full;
    byId('recovery-configuration').disabled = state.phase !== 'evolved' || full;
    text('phase', `Phase: ${state.phase} | active code: ${state.activeVersion} | schema: ${state.schema}`);
    text('capacity', `Retained decisions: ${state.history.length}/${model.MAX_HISTORY}${full
      ? ' - history limit reached; reload only if you intend to discard this workbook.' : ''}`);
    const summary = model.summarize(state);
    text('metrics', `Recovery attempts: ${summary.attempted} | success: ${summary.success} | failure: ${summary.failure}`
      + ` | unknown: ${summary.unknown} | safe aborts: ${summary.safeAborts}`
      + ` | success fraction: ${summary.successFraction || 'no evidence'}`);
    const result = state.result;
    const labels = {
      success: 'SUCCESS - all committed IDs and per-currency totals read within the synthetic budget.',
      failure: 'FAILURE - the read omitted a committed effect.',
      unknown: 'UNKNOWN - read evidence unavailable; attempt retained.',
      'safe-abort': 'SAFE ABORT - unsafe reversal blocked; no recovery migration.',
    };
    text('result', `Recovery result: ${result ? labels[result.outcome] : 'UNKNOWN - no attempted recovery observed.'}`);
    text('impact', `Synthetic user impact: ${!result ? 'not yet observed.' : result.outcome === 'success'
      ? 'correct fixed read journey.' : result.outcome === 'failure' ? 'interrupted; missing committed read.'
        : result.outcome === 'unknown' ? 'unverified; not successful.' : 'no exposure; v2 remains active.'}`);
    text('committed-caption', `${state.committed.length} committed synthetic orders; ${state.schema} fixture`);
    byId('committed').replaceChildren(...state.committed.map(({ id, ...fields }) => row([id, JSON.stringify(fields)])));
    text('observed', result
      ? `Observed effects: ${result.observedIds ? `${result.observedIds.length}/${result.expectedIds.length}` : 'unobserved'}`
        + ` | totals: ${formatTotals(result.observedTotals)} | expected: ${formatTotals(result.expectedTotals)}`
        + ` | latency: ${result.latencyMs === null ? 'unobserved' : `${result.latencyMs} ms`} / ${result.budgetMs} ms budget`
      : 'Observed effects: none. Empty evidence is not success.');
    const lines = [
      model.BANNER,
      `Mode: ${state.mode || 'not evolved'}; application ${state.activeVersion}; schema ${state.schema}.`,
      `Committed IDs: ${state.committed.map((entry) => entry.id).join(', ')}.`,
    ];
    if (result) {
      lines.push(`Decision #${result.sequence}: ${result.path}; ${result.outcome}; attempted=${result.attempted}.`,
        result.reason, `Committed fixture preserved: ${result.dataPreserved}.`,
        `Observed IDs: ${result.observedIds ? result.observedIds.join(', ') : 'unobserved'}.`);
    } else lines.push('Evolve the schema, then choose a recovery path. No recovery observation exists.');
    text('trace', lines.join('\n'));
    const historyRows = state.history.map((entry) => {
      const element = row([entry.sequence, entry.mode, entry.path, entry.outcome, entry.activeVersion,
        entry.observedIds ? `${entry.observedIds.length}/${entry.expectedIds.length}` : 'unobserved',
        formatTotals(entry.observedTotals)]);
      element.dataset.sequence = String(entry.sequence);
      return element;
    });
    byId('history').replaceChildren(...(historyRows.length ? historyRows : [row(['No recovery decisions yet.'])]));
  }
  function perform(action, focus, resetForm = false) {
    try {
      state = model.transition(state, action);
      if (resetForm) HTMLFormElement.prototype.reset.call(form);
      error.textContent = '';
      error.hidden = true;
      render();
      byId(typeof focus === 'function' ? focus() : focus).focus();
    } catch (failure) {
      error.textContent = failure.message;
      error.hidden = false;
      error.focus();
    }
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    perform({ type: 'evolve', mode: byId('mode').value }, 'rollback');
  });
  for (const path of ['rollback', 'forward']) {
    byId(path).addEventListener('click', () => perform({
      type: 'recover', path, observation: byId('observation').value,
    }, () => state.phase === 'recovered' ? 'reset-rehearsal' : 'forward'));
  }
  byId('reset-rehearsal').addEventListener('click', () => perform({ type: 'reset' }, 'mode', true));
  render();
}());
