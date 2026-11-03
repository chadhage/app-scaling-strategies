(function () {
  'use strict';
  const core = globalThis.FeatureFlagRehearsal;
  const byId = (id) => document.getElementById(id);
  const form = byId('rehearsal-form');
  const archives = [];
  let run = core.createRun();
  let runNumber = 1;

  function text(tag, value) {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  }
  function clearError() {
    byId('input-error').hidden = true;
    byId('input-error').textContent = '';
  }
  function showError(error) {
    const output = byId('input-error');
    output.textContent = `${error.code || 'ERR_REHEARSAL'}: ${error.message} No action applied; prior results retained.`;
    output.hidden = false;
    output.focus();
  }
  function version(id) {
    const value = byId(id).value;
    if (value !== '1' && value !== '2') {
      throw new core.RehearsalInputError('ERR_EVENT_INPUT', 'Choose a declared version fixture: v1 or v2.');
    }
    return value === '1' ? 1 : 2;
  }
  function render() {
    const view = core.snapshot(run);
    const verdict = core.evaluate(run);
    byId('flag-state').textContent = `Applied flag: ${view.config.enabled ? 'ON' : 'OFF'}; selected cohort: ${view.config.cohort}; compatible config v${view.config.version}; revision ${view.config.revision}.`;
    byId('event-budget').textContent = `Run ${runNumber}: ${run.events.length}/${core.MAX_EVENTS} explicit synthetic events.`;
    byId('deployment-id').textContent = view.deploymentId;
    byId('code-version').textContent = view.codeVersion;
    byId('session-rows').replaceChildren(...view.clients.map((client) => {
      const row = document.createElement('tr');
      for (const value of [
        client.id, client.cohort, `v${client.stateVersion}`, client.sessionToken,
        client.cartId, client.cartCount, client.effects,
      ]) row.append(text('td', String(value)));
      return row;
    }));
    byId('verdict').textContent = `${verdict.status} — ${verdict.summary}`;
    byId('verdict').dataset.status = verdict.status;
    byId('user-outcome').textContent = `User impact: ${verdict.userOutcome}. Deployment migration: not evidenced.`;
    const counts = verdict.counts;
    byId('counts').textContent = `${counts.attempted} attempted; ${counts.successful} successful; ${counts.interrupted} interrupted (retained); ${counts.guardedPublications} guarded publications; 0 deployment changes.`;
    byId('checks').replaceChildren(...verdict.checks.map((check) =>
      text('li', `${check.passed ? 'PASS' : 'MISSING / FAIL'}: ${check.label}`)));
    byId('trace').replaceChildren(...view.trace.map((record) => {
      const item = document.createElement('li');
      item.append(text('h3', `${record.sequence}. ${record.type}: ${record.status} — ${record.code}`));
      item.append(text('p', record.message));
      item.append(text('code', JSON.stringify(record.input)));
      item.append(text('p', `Applied: ${record.configBefore.enabled ? 'ON' : 'OFF'} → ${record.configAfter.enabled ? 'ON' : 'OFF'}; config v${record.configAfter.version}; deployment ${record.deploymentId}.`));
      const observations = document.createElement('ul');
      for (const response of record.observations) {
        observations.append(text('li', `${response.clientId} (${response.cohort}): ${response.ok ? 'OK' : 'INTERRUPTED'}; ${response.behavior}; state v${response.stateVersion}; cart ${response.beforeCount} → ${response.afterCount}; effects +${response.effectApplied}; ${response.code}.`));
      }
      item.append(observations);
      return item;
    }));
    if (!view.trace.length) byId('trace').append(text('li', 'No events yet. Observe the off baseline first.'));
    byId('evidence-output').value = JSON.stringify({
      cardId: 'A-S010', sourceId: 'S010', mode: 'synthetic', nativeEvidence: false,
      banner: 'Training rehearsal - synthetic data - not a live Azure result',
      runNumber, run, snapshot: view, verdict,
    }, null, 2);
    byId('archive-count').textContent = `${archives.length} prior local result(s) retained in memory until this page closes.`;
    byId('archived-runs').replaceChildren(...archives.map((archive) => {
      const item = document.createElement('li');
      const detail = document.createElement('details');
      detail.append(text('summary', `Run ${archive.runNumber}: ${archive.verdict.status}; ${archive.verdict.counts.attempted} attempted; ${archive.verdict.counts.interrupted} interrupted; ${archive.snapshot.trace.length} events retained`));
      detail.append(text('pre', JSON.stringify(archive, null, 2)));
      item.append(detail);
      return item;
    }));
  }
  function dispatch(event) {
    run = core.applyEvent(run, event);
    clearError();
    render();
  }
  function action(id, eventFactory) {
    byId(id).addEventListener('click', () => {
      try {
        dispatch(eventFactory());
      } catch (error) {
        showError(error);
      }
    });
  }
  function flag(enabled) {
    return {
      type: 'publish-flag', cohort: byId('target-cohort').value,
      enabled, configVersion: version('config-version'),
    };
  }
  action('enable-flag', () => flag(true));
  action('turn-off', () => flag(false));
  action('revert-flag', () => ({ type: 'revert-flag' }));
  action('observe-journeys', () => ({ type: 'observe' }));
  action('apply-state', () => ({
    type: 'set-state-version', clientId: byId('fixture-client').value,
    stateVersion: version('state-version'),
  }));
  action('restore-state', () => ({
    type: 'set-state-version', clientId: byId('fixture-client').value, stateVersion: 1,
  }));
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    try {
      dispatch(core.parseEvent(byId('event-json').value));
    } catch (error) {
      showError(error);
    }
  });
  form.addEventListener('reset', () => {
    if (run.events.length) {
      archives.push({ runNumber, run, snapshot: core.snapshot(run), verdict: core.evaluate(run) });
    }
    run = core.createRun();
    runNumber += 1;
    clearError();
    render();
  });
  render();
}());
