(function () {
  'use strict';

  const byId = (id) => document.getElementById(id);
  const protocol = globalThis.C027Protocol;
  const origin = document.querySelector('meta[name="c027-origin"]').content;
  const ticket = document.querySelector('meta[name="c027-ticket"]').content;
  const configured = /^http:\/\/127\.0\.0\.1:([1-9]\d{0,4})$/.test(origin) &&
    Number(new URL(origin).port) <= 65535 && /^[a-f0-9]{48}$/.test(ticket);
  let model = new protocol.CursorSession(byId('profile').value);
  let source = null;
  let lastReadyState = null;
  let actionError = null;
  let unloadClosed = false;

  function closeSource() {
    if (source) {
      source.close();
      lastReadyState = source.readyState;
      source = null;
    }
  }

  function render() {
    const state = model.snapshot();
    const open = source !== null;
    byId('received').textContent = state.receivedCursor || 'none';
    byId('accepted').textContent = state.acceptedCursor;
    byId('accepted-count').textContent = `${state.acceptedSequence} / ${protocol.EVENT_COUNT}`;
    byId('pending').textContent = state.pendingSequences.join(', ') || 'none';
    byId('native-state').textContent = String(source?.readyState ?? lastReadyState ?? 'none');
    byId('observations').textContent = JSON.stringify(state, null, 2);
    byId('profile').disabled = open || state.attempts.length > 0;
    byId('mode').disabled = open;
    byId('connect').disabled = !configured || open;
    byId('accept').disabled = !state.transportOpen || !state.pendingSequences.length || Boolean(state.error);
    byId('disconnect').disabled = !open;
    byId('error').textContent = actionError || (state.error ? `${state.error.code} — ${state.error.message}` : '');
    const statuses = {
      idle: 'NOT STARTED — no stream has been observed.',
      connecting: 'CONNECTING — no success inferred.',
      streaming: `STREAMING — received ${state.receivedSequence}, accepted ${state.acceptedSequence}.`,
      'awaiting-acceptance': 'RECEIVED SUFFIX — explicit acceptance is still required.',
      disconnected: 'DISCONNECTED — only the accepted cursor will be resumed.',
      'verified-local': 'VERIFIED LOCAL ORDERED SUFFIX — HTTP stream is still open; local observation only.',
      error: `ERROR — ${state.error?.code}; acceptance did not advance.`,
      unknown: 'UNKNOWN — native EventSource transport failed; HTTP status is not exposed.'
    };
    byId('status').textContent = statuses[state.phase] || 'UNKNOWN — no verified result.';
  }

  function connect() {
    try {
      if (!configured || source) throw new Error('The exact configured file conductor and a closed previous source are required.');
      actionError = null;
      const acceptedAfter = model.begin();
      const url = new URL(`/c027/${ticket}/events`, origin);
      url.search = new URLSearchParams({
        profileId: byId('profile').value, version: protocol.VERSION,
        after: acceptedAfter, mode: byId('mode').value
      });
      const current = new EventSource(url.href, { withCredentials: false });
      source = current;
      current.onopen = () => {
        if (source !== current) return;
        model.opened();
        render();
      };
      current.addEventListener('profile', (event) => {
        if (source !== current) return;
        const result = model.receive({ id: event.lastEventId, data: event.data });
        if (!result.queued) closeSource();
        render();
      });
      current.addEventListener('tail', (event) => {
        if (source !== current) return;
        if (!model.tail(event.data).tailVerified) closeSource();
        render();
      });
      current.onmessage = () => {
        if (source !== current) return;
        model.receive({ id: '', data: '' });
        closeSource();
        render();
      };
      current.onerror = () => {
        if (source !== current) return;
        // Stop native automatic receipt-based reconnection before it can skip unaccepted events.
        closeSource();
        model.interrupt();
        render();
      };
    } catch (error) {
      closeSource();
      model.interrupt();
      actionError = error.message;
    }
    render();
  }

  byId('connect').addEventListener('click', connect);
  byId('accept').addEventListener('click', () => {
    try { actionError = null; model.acceptNext(); }
    catch (error) { actionError = `${error.code || 'UNKNOWN'} — ${error.message}`; }
    render();
  });
  byId('disconnect').addEventListener('click', () => {
    closeSource();
    model.disconnect();
    render();
  });
  byId('reset-conductor').addEventListener('click', () => {
    closeSource();
    model = new protocol.CursorSession(byId('profile').value);
    actionError = null;
    render();
  });
  byId('profile').addEventListener('change', () => {
    if (!model.snapshot().attempts.length) model = new protocol.CursorSession(byId('profile').value);
    render();
  });
  globalThis.addEventListener('pagehide', () => {
    closeSource();
    model.disconnect();
    unloadClosed = true;
  });
  Object.defineProperty(globalThis, 'C027Conductor', {
    value: Object.freeze({
      snapshot: () => model.snapshot(),
      nativeState: () => source?.readyState ?? lastReadyState,
      cleanup: () => { closeSource(); model.disconnect(); render(); return { closed: source === null, readyState: lastReadyState, unloadClosed }; }
    })
  });
  if (configured) byId('runtime').textContent = `Trusted file conductor → ${origin} · r1 · native EventSource · not production runtime certification.`;
  render();
}());
