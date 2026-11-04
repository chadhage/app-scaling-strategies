'use strict';

(function runLesson() {
  const model = globalThis.ContainerLesson;
  const byId = (id) => document.getElementById(id);
  const form = byId('setup');
  const fixtureSelect = byId('fixture-select');
  const pathSelect = byId('path-select');
  const error = byId('error');
  let state = model.createState('prepared', 'manual');

  function element(tag, text) {
    const node = document.createElement(tag);
    node.textContent = text;
    return node;
  }

  fixtureSelect.replaceChildren(...model.fixtureIds.map((id) => {
    const option = element('option', model.fixtures[id].label);
    option.value = id;
    option.defaultSelected = id === 'prepared';
    return option;
  }));

  function renderFixture() {
    const data = model.fixtures[state.fixtureId];
    const fields = [
      ['Fixture', `${state.fixtureId}: ${data.label}`],
      ['Container DATA', data.container],
      ['Registry DATA', data.image.registry],
      ['Image reference DATA', data.image.reference],
      ['Candidate digest DATA', data.image.digest || 'none; mutable reference'],
      ['Expected digest DATA', data.image.expectedDigest],
      ['Pull observation DATA', data.image.pull],
      ['Entrypoint DATA', data.startup.entrypoint],
      ['Listening / target port DATA', `${data.startup.listeningPort} / ${data.startup.targetPort}`],
      ['Initialization DATA', data.startup.initialization],
      ['Dependency DATA', data.startup.dependencies],
      ['Warm-up DATA', `${data.startup.warmupStatus}; explicit accepted statuses [${data.startup.acceptableStatuses.join(', ')}]; meaningfulReady=${data.startup.meaningfulReady}`],
      ['Platform DATA', `${data.platform.host}; ${data.platform.os}; native auto-swap unsupported`],
      ['Shared overlap DATA', `${data.platform.productionUnits} active + ${data.platform.candidateUnits} candidate / ${data.platform.capacityUnits} plan units; ${data.platform.slots} slots add no compute`],
      ['Promotion DATA', `Controlled ${state.promotionPath}; no native action`],
      ['Swap-effect DATA', state.swapEffect],
      ['Journey envelope DATA', 'Two started candidate migrations; original 500 ms budget; same identity/session/state, compatible contract and exactly one effect'],
    ];
    byId('fixture-data').replaceChildren(...fields.flatMap(([label, value]) => [element('dt', label), element('dd', value)]));
  }

  function render() {
    byId('phase').textContent = state.phase;
    byId('production').textContent = state.production;
    byId('verdict').textContent = state.verifier;
    byId('impact').textContent = state.impact;
    byId('status').textContent = state.message;
    const counts = state.metrics;
    byId('metrics').textContent = `${counts.attempted} attempted · ${counts.positive} positive · ${counts.negative} negative · ${counts.unknown} unknown · ${
      counts.attempted ? `${counts.positive}/${counts.attempted} positive; unknowns and failures counted; not a reliability claim` : 'no migration evidence'}`;
    byId('journeys').replaceChildren(...state.journeys.map((observation) => {
      const row = document.createElement('tr');
      const value = (entry) => entry === null ? 'unknown' : String(entry);
      const evidence = [
        `status=${value(observation.status)}`,
        `latency=${value(observation.latencyMs)} ms / original budget=${observation.budgetMs} ms`,
        `identity=${observation.identityBefore} → ${value(observation.identityAfter)}`,
        `session=${observation.sessionBefore} → ${value(observation.sessionAfter)}`,
        `state=${observation.stateBefore} → ${value(observation.stateAfter)}`,
        `effects=${value(observation.effects)}`,
        `contractCompatible=${value(observation.contractCompatible)}`,
        observation.reason,
      ].join('; ');
      row.append(element('th', observation.id), element('td', `${observation.from} → ${value(observation.to)}`),
        element('td', observation.outcome), element('td', evidence));
      row.firstElementChild.scope = 'row';
      return row;
    }));
    byId('history').replaceChildren(...state.history.map((event) =>
      element('li', `${event.action} · ${event.classification} · ${event.phase} · ${event.message}`)));
    const full = state.history.length >= model.MAX_HISTORY;
    fixtureSelect.disabled = state.history.length > 0;
    pathSelect.disabled = state.history.length > 0;
    byId('prepare-button').disabled = state.phase !== 'new' || full;
    byId('initialize-button').disabled = state.phase !== 'prepared' || full;
    byId('promote-button').disabled = state.phase !== 'ready' || full;
    byId('observe-button').disabled = state.phase !== 'promoted' || full;
    byId('auto-swap-button').disabled = ['promoted', 'observed'].includes(state.phase) || full;
    renderFixture();
  }

  function focusNext() {
    const next = { new: 'prepare-button', prepared: 'initialize-button', ready: 'promote-button', promoted: 'observe-button' };
    const target = byId(next[state.phase] || 'reset-button');
    (target.disabled ? byId('reset-button') : target).focus();
  }

  function attempt(operation, moveFocus = true) {
    try {
      const result = operation();
      state = result;
      error.hidden = true;
      error.textContent = '';
      render();
      if (moveFocus) focusNext();
      return true;
    } catch (failure) {
      error.textContent = `Action rejected: ${failure.message} Correct the fixed selection or reset the rehearsal. No state was changed.`;
      error.hidden = false;
      error.focus();
      return false;
    }
  }

  for (const select of [fixtureSelect, pathSelect]) {
    select.addEventListener('change', () => attempt(() => {
      if (state.history.length) throw new Error('Reset before changing a fixture or promotion path.');
      return model.createState(fixtureSelect.value, pathSelect.value);
    }, false));
  }

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    attempt(() => {
      if (state.history.length && (fixtureSelect.value !== state.fixtureId || pathSelect.value !== state.promotionPath)) {
        throw new Error('Reset before changing a fixture or promotion path.');
      }
      const configured = state.history.length ? state : model.createState(fixtureSelect.value, pathSelect.value);
      return model.next(configured, { action: 'prepare' });
    });
  });

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => attempt(() => model.next(state, { action: button.dataset.action })));
  });

  byId('reset-button').addEventListener('click', () => {
    if (!attempt(() => model.reset(state), false)) return;
    HTMLFormElement.prototype.reset.call(form);
    fixtureSelect.value = state.fixtureId;
    pathSelect.value = state.promotionPath;
    fixtureSelect.focus();
  });

  render();
})();
