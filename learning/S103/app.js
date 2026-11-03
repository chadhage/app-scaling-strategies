'use strict';

(function start() {
  const byId = (id) => document.getElementById(id);
  const error = byId('error');
  const controls = byId('controls');
  try {
    const lesson = globalThis.S103Lesson;
    if (!lesson || typeof lesson.createState !== 'function') throw new Error('Missing local model.');
    let state = lesson.createState();
    const form = byId('lessonForm');
    const selects = ['hostnameId', 'certificateId', 'inventoryId'].map(byId);
    const selected = () => Object.fromEntries(selects.map((element) => [element.id, element.value]));

    function render(message) {
      error.hidden = true;
      error.textContent = '';
      byId('admitted').textContent = `${state.admitted.join(', ')} (synthetic only)`;
      const current = state.activeAttempt === null ? null : state.history[state.activeAttempt];
      byId('measurements').replaceChildren();
      if (current) {
        const measured = current.observation;
        byId('measuredSelection').textContent = `Attempt ${current.number}: ${measured.requiredHostname} / ${measured.selection.certificateId} / ${measured.selection.inventoryId}.`;
        byId('activeResult').textContent = `Synthetic client outcome ${measured.verdict}: ${measured.totals.pass} pass / ${measured.totals.fail} fail / ${measured.totals.unknown} unknown = ${measured.totals.total}.`;
        byId('gateResult').textContent = current.decision ? `Gate verifier ${current.decision.verifier}; admission ${current.decision.result}. ${current.decision.reason}` : 'Admission not checked; candidate remains gated.';
        for (const row of measured.measurements) {
          const tr = document.createElement('tr');
          for (const key of ['destinationId', 'clientId', 'hostname', 'trust', 'validity', 'tls', 'outcome']) {
            const td = document.createElement('td');
            td.textContent = row[key];
            tr.append(td);
          }
          byId('measurements').append(tr);
        }
        byId('excluded').textContent = `Excluded as fixed ineligible: ${measured.excluded.join(', ')}. Excluded destinations contribute no successful observation.`;
      } else {
        byId('measuredSelection').textContent = 'No active measured combination.';
        byId('activeResult').textContent = 'Unmeasured — no candidate approval.';
        byId('gateResult').textContent = 'Admission not checked.';
        byId('excluded').textContent = 'Parked is fixed ineligible; it is not a success observation.';
      }
      const sum = lesson.totals(state);
      byId('cumulative').textContent = `${sum.pass} pass / ${sum.fail} fail / ${sum.unknown} unknown = ${sum.total} synthetic client observations.`;
      byId('allowance').textContent = `${state.history.length} of ${lesson.MAX_ATTEMPTS} measured attempts used.`;
      byId('history').replaceChildren();
      for (const attempt of state.history) {
        const item = document.createElement('li');
        const observed = attempt.observation;
        item.textContent = `Attempt ${attempt.number}: ${observed.requiredHostname} / ${observed.selection.certificateId} / ${observed.selection.inventoryId}: ${observed.totals.pass} pass, ${observed.totals.fail} fail, ${observed.totals.unknown} unknown; client outcome ${observed.verdict}; ${attempt.decision ? `admission ${attempt.decision.result}, gate verifier ${attempt.decision.verifier}` : 'gate pending'}.`;
        byId('history').append(item);
      }
      byId('teachingData').textContent = JSON.stringify({ hostnames: lesson.HOSTNAMES, certificates: lesson.CERTIFICATES, inventories: lesson.INVENTORIES, clients: lesson.CLIENTS }, null, 2);
      byId('status').textContent = message;
    }
    function act(type) {
      try {
        state = lesson.step(state, { type, selection: selected() });
        render(type === 'probe' ? 'Fixed synthetic checks measured. Candidate remains gated until admission is checked.' : `Candidate admission ${state.history[state.activeAttempt].decision.result}; synthetic client outcomes remain separately counted.`);
      } catch (failure) {
        error.textContent = `Input rejected: ${failure.message} Last valid state and history are retained.`;
        error.hidden = false;
        error.focus();
      }
    }
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      act('probe');
    });
    byId('checkAdmission').addEventListener('click', () => act('admit'));
    byId('resetCurrent').addEventListener('click', () => {
      state = lesson.reset(state);
      form.reset();
      render(`Current controls reset. ${state.history.length} earlier attempts retained; only old is admitted.`);
      byId('hostnameId').focus();
    });
    selects.forEach((element) => element.addEventListener('change', () => {
      state = lesson.reset(state);
      render('Selection changed. Only old is admitted; rehearse before requesting candidate admission.');
    }));
    render('Unmeasured. Only old is admitted; choose a fixed combination and rehearse checks.');
    controls.disabled = false;
  } catch {
    controls.disabled = true;
    error.hidden = false;
    error.textContent = 'Lesson could not start. Reload the local files; no result is verified.';
  }
})();
