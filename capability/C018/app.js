(function () {
  'use strict';

  const get = (id) => document.getElementById(id);
  const input = get('run-id');
  const reopen = get('reopen');
  const reconnect = get('reconnect');
  const reset = get('reset');
  const loopback = location.protocol === 'http:' && location.hostname === '127.0.0.1' &&
    /^[1-9][0-9]{0,4}$/.test(location.port) && Number(location.port) <= 65535;

  function render(view) {
    get('status').textContent = view.message;
    get('status').dataset.outcome = view.status;
    const receipt = view.current;
    const state = receipt?.state;
    const values = {
      namespace: receipt?.namespace, 'observed-id': state?.runId,
      version: state ? `C015 schema ${state.schemaVersion}; no provider/runtime version inferred` : null,
      epoch: state?.epoch, 'run-status': state?.record.status,
      completed: state?.record.completedStep, pending: state?.record.pendingStep,
      units: state?.record.acknowledgedUnits, 'reader-pid': receipt?.pid, digest: receipt?.stateSha256,
    };
    for (const [id, value] of Object.entries(values)) get(id).textContent = value === null || value === undefined ? 'UNKNOWN' : String(value);
    get('receipt').value = receipt ? JSON.stringify(receipt, null, 2) : '';
    const journal = get('journal');
    journal.replaceChildren();
    for (const entry of view.journal) {
      const item = document.createElement('li');
      item.textContent = `${entry.outcome}: ${entry.code} — ${entry.runId || '(no ID)'} — ${entry.message}` +
        (entry.pid === null ? '' : ` PID ${entry.pid}, epoch ${entry.epoch}`);
      journal.append(item);
    }
    reopen.disabled = !loopback || view.blocked || view.status === 'READING';
    reconnect.disabled = !loopback || view.blocked || view.status === 'READING' || view.selectedRunId === null;
  }

  async function actualRead(runId) {
    if (!loopback) throw Object.assign(new Error('Static files have no live disk reader.'), { code: 'STATIC_UNKNOWN' });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetch(`/api/runs/${encodeURIComponent(runId)}`, {
        method: 'GET', cache: 'no-store', credentials: 'omit', redirect: 'error', signal: controller.signal,
      });
      const value = await response.json();
      if (!response.ok) {
        throw Object.assign(new Error(typeof value.message === 'string' ? value.message : 'Explicit read failure.'),
          { code: typeof value.code === 'string' ? value.code : 'READER_UNAVAILABLE' });
      }
      return value;
    } catch (error) {
      if (error.code && typeof error.code === 'string') throw error;
      throw Object.assign(new Error('The real read connection failed; no current run progress was observed.'), { code: 'READER_UNAVAILABLE' });
    } finally {
      clearTimeout(timeout);
    }
  }

  if (!globalThis.C018Inspection) {
    get('status').textContent = 'UNKNOWN: Inspection dependency unavailable; read controls stay disabled.';
    return;
  }
  const inspector = C018Inspection.createInspector(actualRead, render);
  get('transport').textContent = loopback
    ? 'Owned literal-loopback HTTP inspection. Each gesture rereads C015 disk in a new process; no bundled history is used.'
    : 'UNKNOWN: Static file, not a live disk read or reconnect. Start the approved bounded C018 loopback inspector to read a run.';
  render(inspector.snapshot());
  input.addEventListener('input', () => inspector.edit(input.value));
  input.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' && !reopen.disabled) { event.preventDefault(); reopen.click(); }
  });
  reopen.addEventListener('click', () => { void inspector.lookup(input.value); });
  reconnect.addEventListener('click', () => { void inspector.reconnect(); });
  reset.addEventListener('click', () => {
    input.value = '';
    inspector.resetDisplay();
    input.focus();
  });
  addEventListener('offline', () => inspector.disconnect());
}());
