(function () {
  'use strict';

  const model = globalThis.SessionBoundary;
  const byId = (id) => document.getElementById(id);
  const form = byId('exercise');
  const controls = {
    action: byId('action'), readiness: byId('readiness'), sessionId: byId('session-id'),
    weight: byId('nominal-weight'), minutes: byId('clock-minutes')
  };
  const help = Object.freeze({
    'check-green': 'Only a warm, compatible fixture marks green ready. This does not move admission.',
    'set-weight': 'Record an advisory percentage. Inspect observed service bindings rather than inferring a migration.',
    'switch-new': 'Requires ready green. Starts ten synthetic minutes of rollback retention; existing blue work stays blue.',
    'admit-new': 'Creates one session at the current NEW-admission target and observes its start request.',
    'read-pinned': 'Issues one modeled request through the still-old pinned binding, including after unsafe retirement.',
    'finish-old': 'Finishes old-journey on its admitted blue binding, preserving subject/cart and recording one receipt.',
    'finish-session': 'Finishes the session ID below on its original service, including green work admitted before rollback.',
    'reconnect-pinned': 'Explicitly closes the idle old binding and creates reconnected-pinned on ready green with the same state.',
    'finish-work': 'Executes the one pending blue work effect. It is not a session request and cannot be executed twice.',
    tick: 'Advances only the synthetic clock. It does not close clients, finish work, or prove elapsed wall time.',
    retire: 'Rejects unless old journeys, pinned clients, work, readiness, and separate rollback retention all permit retirement.',
    rollback: 'Within retention, moves NEW admission back to retained blue. Admitted green journeys remain on green.',
    'force-retire': 'UNSAFE counterexample: bypasses gates. Expect explicit interruption/lost work, not migration success.'
  });
  let state = model.start();

  function text(id, value) { byId(id).textContent = value; }
  function list(id, values) {
    byId(id).replaceChildren(...values.map((value) => {
      const item = document.createElement('li');
      item.textContent = value;
      return item;
    }));
  }
  function table(id, values, empty) {
    const rows = values.map((valuesInRow) => {
      const row = document.createElement('tr');
      for (const value of valuesInRow) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      return row;
    });
    if (!rows.length) {
      const row = document.createElement('tr');
      const cell = document.createElement('td');
      cell.colSpan = 5;
      cell.textContent = empty;
      row.append(cell);
      rows.push(row);
    }
    byId(id).replaceChildren(...rows);
  }
  function describeAction() {
    text('action-help', help[controls.action.value] || 'Unknown action: it will be rejected without dispatching a request.');
    byId('unsafe-warning').hidden = controls.action.value !== 'force-retire';
  }
  function render() {
    const summary = model.summarize(state);
    const counts = summary.counts;
    text('action-status', `${state.lastOutcome.code}: ${state.lastOutcome.message}`);
    byId('action-status').className = state.lastOutcome.ok ? 'status' : 'status rejected';
    text('safety-verdict', summary.verdict);
    byId('safety-verdict').className = `verdict ${summary.verdict.startsWith('FAIL') ? 'failed' : summary.verdict.startsWith('PASS') ? 'passed' : 'pending'}`;
    text('user-impact', summary.impact);
    text('blue-state', state.blue.alive ? 'AVAILABLE — retained for old bindings and rollback.' : `RETIRED — ${state.retirement}.`);
    text('green-state', `${state.green.alive ? 'Available' : 'Unavailable'}; ${state.green.ready ? 'READY' : 'NOT READY'} (${state.green.assessment}).`);
    text('blue-observed', `${counts.blueRequests} observed blue request(s); ${counts.activeBlue} active blue journey/journeys; ${counts.unresolvedPinned} unresolved pinned client(s).`);
    text('green-observed', `${counts.greenRequests} observed green request(s). Existing green bindings survive a new-admission rollback.`);
    text('admission-target', state.newSessionTarget.toUpperCase());
    text('displayed-weight', `${state.nominalGreenPercent}% — advisory, not observed traffic`);
    text('clock-state', `${state.clock} synthetic minute(s)`);
    text('work-state', `${state.work.status}; effects=${state.work.effects}; output=${state.work.output || 'none'}`);
    text('drain-state', summary.drain.complete ? 'COMPLETE — known old dependencies explicitly resolved.' : 'INCOMPLETE — unresolved old dependencies or irreversible impact.');
    list('drain-blockers', summary.drain.blockers);
    text('retention-state', !summary.retention.started ? 'NOT STARTED — no current green cutover window.'
      : summary.retention.elapsed ? `ELAPSED at synthetic minute ${summary.retention.until}. This does not imply drain completion.`
        : `OPEN — ${summary.retention.remaining} synthetic minute(s) remain; deadline ${summary.retention.until}. Blue is still needed for rollback.`);
    text('retirement-state', state.retirement === 'guarded' ? 'COMPLETED by the guarded model path; finite fixture evidence only.'
      : state.retirement === 'forced' ? 'UNSAFE retirement occurred. A failed gate is not erased by removing blue.'
        : summary.retire.allowed ? 'ALLOWED by the current modeled gates; apply guarded retirement explicitly.'
          : 'BLOCKED — inspect each independent reason below.');
    list('retirement-blockers', summary.retire.blockers);
    table('session-rows', state.sessions.map((session) => [
      `${session.id} / ${session.cohort}`, session.version.toUpperCase(),
      `${session.status}; ${session.pinned ? 'PINNED — unresolved' : 'not pinned'}`,
      `${session.state.subject} / ${session.state.cart.join(', ')} / schema ${session.state.schema}`,
      `${session.state.revision} / ${session.state.receipt || 'no receipt'}`
    ]), 'No sessions.');
    text('request-counts', `Observed requests: ${state.requests.length} total; blue=${counts.blueRequests}; green=${counts.greenRequests}; failed=${counts.failedRequests}. Work effects are separate.`);
    table('request-rows', state.requests.map((request) => [
      `${request.sequence} / ${request.sessionId} / ${request.cohort}`, request.operation, request.version.toUpperCase(),
      request.status, request.stateValid
        ? `VALID; revision ${request.before.revision} → ${request.after.revision}; subject/cart preserved${request.after.receipt ? `; ${request.after.receipt}` : ''}`
        : 'NO valid completion evidence — unavailable'
    ]), 'No requests observed. Starting fixtures are preconditions, not fabricated request history.');
    list('event-trace', state.events.length
      ? state.events.map((event) => `#${event.sequence} · t=${event.clock} · ${event.action} → ${event.code}: ${event.detail}`)
      : ['No actions yet. The initial fixture is not request history.']);
    text('raw-state', JSON.stringify(state, null, 2));
    describeAction();
  }
  function wholeNumber(value) {
    return /^\d+$/.test(value) ? Number(value) : NaN;
  }
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const command = { type: controls.action.value };
    if (command.type === 'check-green') command.condition = controls.readiness.value;
    if (command.type === 'set-weight') command.percent = wholeNumber(controls.weight.value);
    if (command.type === 'tick') command.minutes = wholeNumber(controls.minutes.value);
    if (['admit-new', 'finish-session'].includes(command.type)) command.sessionId = controls.sessionId.value;
    try {
      state = model.apply(state, command);
      render();
    } catch (error) {
      text('action-status', `Rejected invalid data: ${error.message}`);
      text('safety-verdict', 'FAIL — invalid rehearsal data; no safety claim.');
      byId('safety-verdict').className = 'verdict failed';
      byId('action-status').className = 'status rejected';
    }
  });
  controls.action.addEventListener('change', describeAction);
  byId('reset-rehearsal').addEventListener('click', () => {
    form.reset();
    state = model.start();
    render();
  });
  render();
}());
