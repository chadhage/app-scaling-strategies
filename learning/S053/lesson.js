(function () {
  'use strict';
  const model = globalThis.S053;
  const get = (id) => document.getElementById(id);
  const form = get('migration-form');
  const error = get('error');
  let state = model.initialState();

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  function clearError() {
    error.textContent = '';
    error.hidden = true;
  }

  function render() {
    const latest = state.history.at(-1);
    get('history-count').textContent = `Retained attempts: ${state.history.length}/6. Explicit reset or page reload erases in-memory history.`;
    get('conduct').disabled = state.history.length >= model.LIMITS.maxAttempts;
    const history = get('history');
    history.replaceChildren();
    for (const attempt of state.history) {
      const { config, summary } = attempt;
      const row = element('li', `Attempt ${attempt.id}: ${attempt.verdict.toUpperCase()} / ${attempt.impact}; software ${config.deployment}, route ${config.route}, upgrades ${config.upgrades}, observation ${config.observation}; migrated ${summary.migrationFraction}, interruptions ${summary.interruptions}, unknown ${summary.unknown}.`);
      row.dataset.outcome = attempt.verdict;
      history.append(row);
    }
    get('metrics').replaceChildren();
    get('journeys').replaceChildren();
    if (!latest) {
      get('verdict').textContent = 'Synthetic verifier: NOT RUN';
      get('verdict').dataset.outcome = 'not-run';
      get('impact').textContent = 'Synthetic user impact: not observed';
      get('explanation').textContent = 'No attempt yet — no migration evidence.';
      return;
    }
    get('verdict').textContent = `Synthetic verifier: ${latest.verdict.toUpperCase()}`;
    get('verdict').dataset.outcome = latest.verdict;
    get('impact').textContent = `Synthetic user impact: ${latest.impact}`;
    get('explanation').textContent = latest.explanation;
    const metrics = [
      ['Attempted journeys', 'attempted'], ['Complete journeys', 'completed'],
      ['Migrated to green', 'migrated'], ['Interruptions', 'interruptions'],
      ['Unknown outcomes', 'unknown'], ['Successful but stayed on blue', 'stayedOnBlue'],
      ['Migration fraction (all attempts)', 'migrationFraction'],
    ];
    for (const [label, key] of metrics) {
      const value = element('dd', String(latest.summary[key]));
      value.id = `metric-${key}`;
      get('metrics').append(element('dt', label), value);
    }
    for (const journey of latest.rows) {
      const row = document.createElement('tr');
      row.append(
        element('td', `${journey.consumer} — requires API ${journey.expectedContract}`),
        element('td', journey.requestedEndpoint),
      );
      const observed = document.createElement('td');
      if (!journey.observed) {
        observed.textContent = 'UNKNOWN — no response or deployment observation.';
      } else {
        const value = journey.observed;
        observed.append(
          element('p', `${value.deployment} / software ${value.softwareVersion} / API ${value.apiContract || 'unsupported'} / HTTP ${value.httpStatus}; adapter: ${journey.adapterUsed ? 'yes' : 'no'}`),
          element('pre', JSON.stringify(value.body, null, 2)),
        );
      }
      const status = element('td', `${journey.status.toUpperCase()}: ${journey.reason}`);
      status.dataset.outcome = journey.status;
      row.append(observed, status);
      get('journeys').append(row);
    }
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      const next = model.conduct(state, {
        deployment: get('deployment').value, route: get('route').value,
        upgrades: get('upgrades').value, observation: get('observation').value,
      });
      state = next;
      clearError();
      render();
    } catch (failure) {
      error.textContent = `Attempt rejected: ${failure.message} Previous results are unchanged.`;
      error.hidden = false;
      error.focus();
    }
  });

  get('restart').addEventListener('click', () => {
    state = model.initialState();
    HTMLFormElement.prototype.reset.call(form);
    clearError();
    render();
    get('deployment').focus();
  });
  render();
}());
