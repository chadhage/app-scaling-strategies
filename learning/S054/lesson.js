(function () {
  'use strict';
  const { createLesson, act, LIMITS } = window.S054Model;
  const byId = (id) => document.getElementById(id);
  const defaults = { migration: 'faithful', observation: 'complete', 'old-consumers': '2', 'old-work': '1' };
  let state = createLesson();

  function restoreDefaults() {
    Object.entries(defaults).forEach(([id, value]) => { byId(id).value = value; });
  }

  function clearError() {
    byId('input-error').hidden = true;
    byId('input-error').textContent = '';
    document.querySelectorAll('[aria-invalid]').forEach((input) => input.removeAttribute('aria-invalid'));
  }

  function readInteger(id, maximum, label) {
    const value = byId(id).value;
    if (!/^(0|[1-9]\d*)$/.test(value) || Number(value) > maximum) {
      const error = new Error(`${label} must be a whole number from 0 to ${maximum}; empty values are not zero.`);
      error.field = id;
      throw error;
    }
    return Number(value);
  }

  function readConfiguration() {
    return {
      migration: byId('migration').value, observation: byId('observation').value,
      oldConsumers: readInteger('old-consumers', 4, 'Old consumers'),
      oldWork: readInteger('old-work', 3, 'Old work'),
    };
  }

  function row(cells, attemptId) {
    const tr = document.createElement('tr');
    if (attemptId) tr.dataset.attempt = String(attemptId);
    cells.forEach((value) => {
      const td = document.createElement('td');
      td.textContent = String(value);
      tr.append(td);
    });
    return tr;
  }

  function emptyRow(message) {
    const tr = row([message]);
    tr.firstElementChild.colSpan = 6;
    return tr;
  }

  function render() {
    const current = state.current;
    const attempts = [...state.history, ...(current ? [current] : [])];
    const last = current?.events.at(-1);
    const phase = current?.phase;
    byId('configuration').disabled = Boolean(current);
    if (current) {
      byId('migration').value = current.config.migration;
      byId('observation').value = current.config.observation;
      byId('old-consumers').value = String(current.config.oldConsumers);
      byId('old-work').value = String(current.config.oldWork);
    }
    const eventLimit = Boolean(current && current.events.length >= LIMITS.events);
    byId('begin').disabled = Boolean(current) || attempts.length >= LIMITS.attempts;
    byId('expand').disabled = phase !== 'baseline' || eventLimit;
    byId('migrate').disabled = phase !== 'expanded' || eventLimit;
    byId('contract').disabled = !current || phase === 'contracted' || eventLimit;
    byId('upgrade').disabled = phase !== 'migrated' || !current.oldConsumers
      || current.migrationCheck.gate !== 'PASS' || eventLimit;
    byId('drain').disabled = phase !== 'migrated' || !current.oldWork || eventLimit;
    byId('new-attempt').disabled = !current || attempts.length >= LIMITS.attempts;
    byId('history-limit').hidden = attempts.length < LIMITS.attempts;
    byId('event-limit').hidden = !eventLimit;
    byId('phase').textContent = current ? `Phase: ${phase} · attempt ${current.id}/6` : 'Phase: idle';
    byId('gate').textContent = last ? `${last.action === 'contract' ? 'Contraction gate' : 'Stage check'}: ${last.gate} — ${last.decision}`
      : 'Contraction gate: not evaluated';
    byId('impact').textContent = `Synthetic user impact: ${last?.impact || 'not evaluated'}`;
    byId('completion').textContent = phase === 'contracted'
      ? 'Synthetic contraction complete; no native database result.' : 'No completed migration.';
    byId('dependencies').textContent = current
      ? `${current.oldConsumers} old consumers; ${current.newConsumers} new consumers; ${current.oldWork} old work pending; ` +
        `${current.completedOldWork} old work completed; legacy structure ${phase === 'contracted' ? 'removed' : 'retained'}.`
      : 'No active dependencies measured.';
    byId('metrics').textContent = current?.check
      ? `${current.check.expected} expected reads; ${current.check.observed} observed; ${current.check.passed} passed; ` +
        `${current.check.failed} failed; ${current.check.unknown} unknown; ${current.copiedRows}/4 rows copied.`
      : 'No read observations.';
    byId('reason').textContent = last?.message || 'Start a rehearsal to lock assumptions.';
    byId('reads').replaceChildren(...(current?.check
      ? current.check.reads.map((read) => row([read.id, read.reader, read.status, read.expected,
        read.actual === null ? 'not observed' : read.actual, read.reason]))
      : [emptyRow('No observed reads yet.')]));
    const trace = current?.events.map((event) => {
      const li = document.createElement('li');
      li.textContent = `${event.action} · ${event.phase} · ${event.gate}/${event.decision} · ${event.message} ` +
        `Consumers old/new ${event.oldConsumers}/${event.newConsumers}; old work ${event.oldWork}; ` +
        `reads observed/pass/fail/unknown ${event.observed}/${event.passed}/${event.failed}/${event.unknown}; impact ${event.impact}.`;
      return li;
    });
    if (trace) byId('trace').replaceChildren(...trace);
    else {
      const li = document.createElement('li');
      li.textContent = 'No active attempt.';
      byId('trace').replaceChildren(li);
    }
    byId('history').replaceChildren(...(attempts.length ? attempts.map((attempt) => {
      const event = attempt.events.at(-1);
      const tr = row([attempt.id, `${attempt.config.migration}; ${attempt.config.observation}; ` +
        `old consumers/work ${attempt.config.oldConsumers}/${attempt.config.oldWork}`, attempt.phase,
      `${event.gate}/${event.decision}`, event.impact, `${attempt.events.length}/12`], attempt.id);
      const details = document.createElement('details');
      const summary = document.createElement('summary');
      summary.textContent = `${attempt.events.length}/12 events · inspect retained trace`;
      const events = document.createElement('ol');
      for (const retained of attempt.events) {
        const li = document.createElement('li');
        li.textContent = `${retained.action}: ${retained.gate}/${retained.decision}; ${retained.impact}. ` +
          `${retained.message} Observed/pass/fail/unknown ${retained.observed}/${retained.passed}/${retained.failed}/${retained.unknown}.`;
        events.append(li);
      }
      details.append(summary, events);
      tr.lastElementChild.replaceChildren(details);
      return tr;
    }) : [emptyRow('No attempts yet.')]));
  }

  function focusAfter(action) {
    const current = state.current;
    let target = {
      begin: 'expand', expand: 'migrate', migrate: 'contract', upgrade: 'contract',
      drain: 'contract', newAttempt: 'migration', reset: 'migration',
    }[action];
    if (action === 'contract') {
      target = current.phase === 'contracted' ? 'new-attempt'
        : !byId('upgrade').disabled ? 'upgrade' : !byId('drain').disabled ? 'drain' : 'new-attempt';
    }
    if (!target || byId(target).disabled) target = 'reset-rehearsal';
    byId(target).focus();
  }

  function conduct(action) {
    clearError();
    try {
      state = action === 'begin' ? act(state, action, readConfiguration()) : act(state, action);
      if (action === 'newAttempt' || action === 'reset') restoreDefaults();
      render();
      focusAfter(action);
    } catch (error) {
      render();
      byId('input-error').textContent = error.message;
      byId('input-error').hidden = false;
      const target = error.field && byId(error.field);
      if (target) {
        target.setAttribute('aria-invalid', 'true');
        target.focus();
      } else byId('input-error').focus();
    }
  }

  byId('setup-form').addEventListener('submit', (event) => {
    event.preventDefault();
    conduct('begin');
  });
  for (const action of ['expand', 'migrate', 'contract', 'upgrade', 'drain']) {
    byId(action).addEventListener('click', () => conduct(action));
  }
  byId('new-attempt').addEventListener('click', () => conduct('newAttempt'));
  byId('reset-rehearsal').addEventListener('click', () => conduct('reset'));
  restoreDefaults();
  render();
}());
