(function () {
  'use strict';
  const model = globalThis.Lesson077;
  const $ = (id) => document.getElementById(id);
  const configuration = $('configuration');
  const interpretation = $('interpretation');
  const fields = { handler: $('handler'), firstOutcome: $('first-outcome'), prediction: $('prediction') };
  let state = model.createRehearsal();
  let predictionText = 'Interpretation not checked.';
  const text = (tag, value) => {
    const node = document.createElement(tag);
    node.textContent = String(value);
    return node;
  };
  const rows = (id, entries) => {
    $(id).replaceChildren(...entries.map((values) => {
      const row = document.createElement('tr');
      row.append(...values.map((value) => text('td', value)));
      return row;
    }));
  };
  const clearError = () => {
    $('input-error').hidden = true;
    $('input-error').textContent = '';
    Object.values(fields).forEach((field) => field.removeAttribute('aria-invalid'));
  };
  const showError = (error) => {
    $('input-error').textContent = error.message;
    $('input-error').hidden = false;
    if (fields[error.field]) fields[error.field].setAttribute('aria-invalid', 'true');
    $('input-error').focus();
  };
  const render = () => {
    const complete = state.phase === 'complete';
    $('phase').textContent = `Phase: ${state.phase}`;
    $('attempt-count').textContent = `Attempt: ${Math.min(state.history.length + (complete ? 0 : 1), 6)} / 6`;
    fields.handler.disabled = state.phase !== 'ready';
    fields.firstOutcome.disabled = state.phase !== 'ready';
    $('deliver-message').disabled = state.phase !== 'ready';
    $('expire-lock').disabled = state.phase !== 'locked';
    $('redeliver-message').disabled = state.phase !== 'expired';
    fields.prediction.disabled = !complete;
    $('check-prediction').disabled = !complete;
    $('new-attempt').disabled = !complete || state.history.length >= model.fixture.maxAttempts;
    const result = state.result;
    $('verdict').textContent = `Synthetic business result: ${result ? result.verdict : 'not evaluated'}`;
    $('impact').textContent = `Business impact: ${result ? result.impact : 'not evaluated'}`;
    $('metrics').textContent = result
      ? `Deliveries: ${result.deliveries}; repeated deliveries: ${result.repeatedDeliveries}; known effects: ${result.knownEffects}; duplicate effects: ${result.duplicateEffects}; unresolved effects: ${result.unresolvedEffects}; known credit: ${result.knownTotal} synthetic units.`
      : state.deliveries.length
        ? `Observed deliveries: ${state.deliveries.length}; known effects: ${state.effects.length}. Redelivery not yet verified.`
        : 'No synthetic deliveries observed.';
    $('uncertainty').textContent = result
      ? `Possible business-effect count: ${result.possibleEffects[0]} through ${result.possibleEffects[1]}. Unresolved outcomes are not assumed absent.`
      : 'No business-effect conclusion yet.';
    $('reason').textContent = result ? result.reason : '';
    rows('delivery-ledger', state.deliveries.map((entry) =>
      [entry.delivery, entry.messageId, entry.businessKey, entry.lock, entry.outcome]));
    rows('business-ledger', state.effects.map((entry) =>
      [entry.effectId, entry.delivery, entry.businessKey, `+${entry.amount}`]));
    $('trace').replaceChildren(...(state.events.length ? state.events : ['No attempt started.'])
      .map((event) => text('li', event)));
    $('prediction-result').textContent = predictionText;
    $('history-count').textContent = `Retained attempts: ${state.history.length} / 6`;
    rows('history', state.history.map((entry) => [
      entry.attempt, entry.config.handler, entry.config.firstOutcome, entry.verdict,
      entry.deliveries, entry.knownEffects, entry.duplicateEffects, entry.unresolvedEffects,
    ]));
    $('history-ledgers').replaceChildren(...state.history.map((entry) => {
      const details = document.createElement('details');
      details.append(
        text('summary', `Attempt ${entry.attempt} · ${entry.verdict} · retained ledgers`),
        text('pre', JSON.stringify({
          deliveryLedger: entry.deliveryLedger, businessLedger: entry.businessLedger,
          possibleEffects: entry.possibleEffects, reason: entry.reason,
        }, null, 2)),
      );
      return details;
    }));
  };
  const transition = (action, focusId, restoreDefaults = false) => {
    clearError();
    try {
      const next = action(state);
      if (restoreDefaults) {
        configuration.reset();
        interpretation.reset();
        predictionText = 'Interpretation not checked.';
      }
      state = next;
      render();
      $(focusId).focus();
    } catch (error) {
      showError(error);
    }
  };
  configuration.addEventListener('submit', (event) => {
    event.preventDefault();
    transition((current) => model.deliver(current, {
      handler: fields.handler.value, firstOutcome: fields.firstOutcome.value,
    }), 'expire-lock');
  });
  $('expire-lock').addEventListener('click', () => transition(model.expireLock, 'redeliver-message'));
  $('redeliver-message').addEventListener('click', () => transition(model.redeliver, 'prediction'));
  $('new-attempt').addEventListener('click', () => transition(model.newAttempt, 'deliver-message', true));
  $('reset-rehearsal').addEventListener('click', () => transition(model.reset, 'deliver-message', true));
  interpretation.addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      const answer = model.checkPrediction(state, fields.prediction.value);
      predictionText = `${answer.correct ? 'Correct' : 'Not correct'}; evidence supports ${answer.expected}. ${answer.explanation} Business result and history are unchanged.`;
      render();
    } catch (error) {
      showError(error);
    }
  });
  render();
}());
