(function () {
  'use strict';
  const model = globalThis.StandbyPromise;
  const get = (id) => document.getElementById(id);
  const form = get('rehearsal-controls');
  const controls = ['fixture', 'budget', 'answer'].map(get);
  let session = model.createSession();
  const seconds = (value) => value === null ? 'unknown' : `${value} s`;
  const capacity = (value) => value === null ? 'unknown' : String(value);
  const setText = (id, value) => { get(id).textContent = String(value); };

  function rows(target, values) {
    get(target).replaceChildren(...values.map((cells) => {
      const row = document.createElement('tr');
      row.append(...cells.map((value) => {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        return cell;
      }));
      return row;
    }));
  }

  function clearError() {
    get('error').hidden = true;
    setText('error', '');
  }

  function showError(error) {
    setText('error', `${error.code || 'ERR_REHEARSAL'}: ${error.message}`);
    get('error').hidden = false;
    get('error').focus();
  }

  function render() {
    const counts = model.totals(session);
    ['attempted', 'success', 'failure', 'unknown'].forEach((key) => setText(`total-${key}`, counts[key]));
    setText('history-evidence', counts.evidence === 'none' ? 'No evidence yet.' : 'Synthetic promise checks only; not user-migration evidence.');
    const full = counts.attempted === model.MAX_ATTEMPTS;
    const locked = session.phase === 'checked';
    controls.forEach((control) => { control.disabled = locked; });
    get('check-promise').disabled = locked || full;
    setText('current-status', full ? 'Session full: all six checks remain recorded; reset does not renew the allowance.'
      : locked ? `Check ${counts.attempted} recorded. Reset the current rehearsal before another decision.`
        : `Ready for a separate declared promise. ${model.MAX_ATTEMPTS - counts.attempted} checks remain.`);
    get('history').replaceChildren(...session.history.map((record) => {
      const item = document.createElement('li');
      item.dataset.acceptance = record.result.acceptance;
      item.textContent = `Check ${record.attempt}: ${record.result.selected.label}; original budget ${record.input.budgetSeconds} s; recovery ${seconds(record.result.selected.recoverySeconds)}; promise ${record.result.acceptance}; timing ${record.result.selected.timing}; answer ${record.input.answer}; verifier ${record.result.verifier}. ${record.result.selected.reasons.join(' ')}`;
      return item;
    }));
    get('result').hidden = !session.current;
    if (!session.current) {
      delete get('result').dataset.acceptance;
      delete get('result').dataset.verifier;
      get('comparison').replaceChildren();
      get('trace').replaceChildren();
      return;
    }
    const { input, result } = session.current;
    const selected = result.selected;
    get('result').dataset.acceptance = result.acceptance;
    get('result').dataset.verifier = result.verifier;
    setText('verdict', `Recovery promise acceptance: ${result.acceptance}.`);
    setText('decision-verifier', `Decision verifier: ${result.verifier}. Chosen ${input.answer}; expected ${result.expectedAnswer}. This checks the answer, not native recovery.`);
    const relation = selected.timing === 'unknown' ? 'Completed recovery time is unobserved.'
      : `${selected.recoverySeconds} s ${selected.timing === 'success' ? '≤' : '>'} original ${input.budgetSeconds} s budget.`;
    setText('recovery-impact', `Synthetic recovery timing: ${selected.timing}. ${relation} No actual user recovery is certified.`);
    setText('retention-gate', `Retained readiness/capacity/compatibility acceptance: ${selected.retentionAcceptance}. ${selected.coverage}`);
    setText('selected-capacity', `Minimum ready retained capacity: ${capacity(selected.minimumReadyCapacity)} / ${selected.requiredCapacity} required units. Recovered capacity: ${selected.recoveredCapacity}.`);
    get('reasons').replaceChildren(...selected.reasons.map((reason) => {
      const item = document.createElement('li');
      item.textContent = reason;
      return item;
    }));
    setText('cold-delay', `Warm 4 s versus cold 20 s: ${result.coldDelaySeconds} s extra cold delay. Even a 24 s timing budget cannot repair a cold retention gap.`);
    rows('comparison', result.comparison.map((reference) => [
      reference.label, reference.coverage,
      `${capacity(reference.minimumReadyCapacity)} / ${reference.requiredCapacity}`,
      seconds(reference.recoverySeconds), reference.timing, reference.acceptance,
    ]));
    setText('trace-caption', `${selected.label}: request at ${selected.rollbackAtSeconds} s of ${selected.retentionSeconds} s retention.`);
    rows('trace', selected.phases.map((phase) => [phase.name, seconds(phase.durationSeconds), seconds(phase.cumulativeSeconds)]));
    ['success', 'failure', 'unknown'].forEach((key) => setText(`sample-${key}`, Number(result.acceptance === key)));
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      const budget = get('budget').value;
      session = model.decide(session, {
        fixture: get('fixture').value,
        budgetSeconds: budget === '6' ? 6 : budget === '24' ? 24 : null,
        answer: get('answer').value,
      });
      render();
    } catch (error) {
      showError(error);
    }
  });

  get('reset-rehearsal').addEventListener('click', () => {
    try {
      session = model.resetSession(session);
      HTMLFormElement.prototype.reset.call(form);
      clearError();
      render();
      get('fixture').focus();
    } catch (error) {
      showError(error);
    }
  });
  render();
}());
