'use strict';

(function start() {
  const { DEFAULTS, createLesson } = globalThis.KeyContinuity;
  const lesson = createLesson();
  const byId = (id) => document.getElementById(id);
  const controls = Object.fromEntries(Object.keys(DEFAULTS).map((key) => [key, byId(key)]));

  function element(tag, text) {
    const node = document.createElement(tag);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function table(caption, headings, rows) {
    const wrapper = element('div');
    wrapper.className = 'table-wrap';
    const node = element('table');
    node.append(element('caption', caption));
    const header = element('tr');
    headings.forEach((heading) => {
      const cell = element('th', heading);
      cell.scope = 'col';
      header.append(cell);
    });
    const head = element('thead');
    head.append(header);
    node.append(head);
    const body = element('tbody');
    rows.forEach((values) => {
      const row = element('tr');
      values.forEach((value) => row.append(element('td', String(value))));
      body.append(row);
    });
    node.append(body);
    wrapper.append(node);
    return wrapper;
  }

  function render(view) {
    const { current, history, remaining } = view;
    const output = byId('result');
    output.replaceChildren();
    byId('summary').textContent = current
      ? `${current.id} — Migration: ${current.migration} — ${current.userImpact}.`
      : 'No current result. Choose controls and rehearse.';
    byId('summary').dataset.migration = current?.migration || 'none';
    if (current) {
      const { attempted, accepted, rejected, unknown } = current.counts;
      const verification = element('p', `Verifier: ${current.verifier} — ${current.verifierReason}`);
      verification.id = 'verification';
      verification.dataset.verifier = current.verifier;
      output.append(verification);
      const counts = element('p', `Attempted ${attempted}; accepted ${accepted}; rejected ${rejected}; unknown ${unknown}. Success: ${current.successPercent.toFixed(2)}% of all attempted journeys.`);
      counts.id = 'counts';
      output.append(counts);
      output.append(table('Public fixture policies — not key material', ['Version', 'Issues label', 'Validates labels'],
        Object.entries(current.policies).map(([version, policy]) => [version, policy.signs, policy.accepts.join(' + ')])));
      const trace = table('Measured valid-credential cross-version journeys',
        ['Profile', 'Kind', 'Route', 'Key label', 'Outcome', 'Reason'],
        current.trace.map((entry) => [entry.profile, entry.credential, `${entry.from} → ${entry.to}`, entry.keyLabel, entry.outcome, entry.reason]));
      trace.id = 'trace';
      output.append(trace);
      const guards = table('Separate baseline and tamper guard probes — not migration credit',
        ['Version', 'Probe', 'Outcome'],
        current.guardChecks.map((entry) => [entry.version, entry.probe, entry.outcome]));
      guards.id = 'guards';
      output.append(guards, element('p', `Cleanup: ${current.cleanup}`));
    }
    const historyBody = byId('history');
    historyBody.replaceChildren();
    history.forEach((run) => {
      const row = element('tr');
      row.dataset.runId = run.id;
      row.dataset.migration = run.migration;
      const values = [run.id,
        `${run.configuration.credential}; ${run.configuration.rotation}; ${run.configuration.profiles} profiles; ${run.configuration.observation}`,
        run.migration, run.verifier, run.counts.attempted, run.counts.accepted, run.counts.rejected, run.counts.unknown];
      values.forEach((value) => row.append(element('td', String(value))));
      historyBody.append(row);
    });
    byId('run').disabled = remaining === 0;
    byId('capacity').textContent = `${history.length} of 8 runs recorded.${remaining === 0 ? ' History limit reached. Reset retains evidence and cannot reopen capacity; reload starts a new session.' : ''}`;
  }

  function clearError() {
    byId('error').hidden = true;
    byId('error').textContent = '';
  }

  byId('rotation-form').addEventListener('submit', (event) => {
    event.preventDefault();
    clearError();
    try {
      if (!/^[1-8]$/.test(controls.profiles.value)) throw new RangeError('Profiles must be one digit from 1 to 8; no decimals, spaces or exponents.');
      render(lesson.run({
        credential: controls.credential.value, rotation: controls.rotation.value,
        profiles: Number(controls.profiles.value), observation: controls.observation.value,
      }));
      byId('result-heading').focus();
    } catch (error) {
      byId('error').textContent = error.message;
      byId('error').hidden = false;
      byId('error').focus();
    }
  });

  byId('reset-controls').addEventListener('click', () => {
    for (const [field, value] of Object.entries(DEFAULTS)) controls[field].value = String(value);
    clearError();
    render(lesson.reset());
    controls.credential.focus();
  });

  render(lesson.snapshot());
}());
