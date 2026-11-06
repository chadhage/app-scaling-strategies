(function () {
  'use strict';

  // The page owns its cursor: on any loss it closes the EventSource and opens a new one with ?lastEventId=<last applied id>
  // after a short pause, so it never depends on the browser re-sending a header. Disconnect and Reconnect touch only this
  // client connection. Every delivery goes through the pure reducer, which drops duplicates and out-of-order deliveries.
  const cursors = globalThis.C044Cursor;
  const reducer = globalThis.C044Reducer;
  const ids = ['connection', 'cursor', 'marker', 'server-counters', 'detached', 'disconnect', 'reconnect', 'rewind',
    'count-applied', 'count-duplicates', 'count-out-of-order', 'count-rejected', 'count-reconnects', 'count-disconnects',
    'failure', 'actions', 'notice', 'evicted', 'log', 'dropped'];
  const el = Object.fromEntries(ids.map((id) => [id, document.getElementById(id)]));
  const retryMs = 250;
  let state = reducer.initial();
  let source = null;
  let timer = null;
  let activeCursor = null;
  let snapshot = null;

  function item(className, text) {
    const node = document.createElement('li');
    node.className = className;
    node.textContent = text;
    return node;
  }

  function markerText(marker) {
    if (!marker) return 'No reconnect yet.';
    if (marker.kind === 'resynced') return `resynced after id ${marker.fromId === null ? 'none' : marker.fromId} (the skipped range is a gap)`;
    const from = marker.fromId === null ? 'none (fresh stream)' : marker.fromId;
    return `reconnected from id ${from}${marker.rewound ? ` (re-requested ${marker.rewound} applied events)` : ''}${marker.automatic ? ' [automatic]' : ''}`;
  }

  function detachedText(detached) {
    if (!detached) return 'Produced while detached: not measured yet.';
    if (detached.advanced === null) return `Server counter at disconnect: ${detached.producedAtDisconnect}. Waiting for the reconnect.`;
    return `Produced while detached: ${detached.advanced} (server counter ${detached.producedAtDisconnect} to ${detached.producedAtReconnect}).`;
  }

  function render() {
    const by = state.detachedBy === 'user' ? 'by you; the server keeps producing' : 'connection lost; reconnecting';
    el.connection.textContent = `Connection: ${state.connection}${state.connection === 'disconnected' ? ` (${by})` : ''}`;
    el.cursor.textContent = state.lastId ? `Last applied id: ${state.lastId}` : 'No event applied yet.';
    el.marker.textContent = markerText(state.marker);
    el['server-counters'].textContent = snapshot
      ? `Server counters: produced ${snapshot.counters.produced}, head ${snapshot.run.headSeq}, clients attached ${snapshot.counters.clientsAttached}, run ${snapshot.run.status}.`
      : 'Server counters: not read yet.';
    el.detached.textContent = detachedText(state.detached);
    el['count-applied'].textContent = String(state.counts.applied);
    el['count-duplicates'].textContent = String(state.counts.duplicates);
    el['count-out-of-order'].textContent = String(state.counts.outOfOrder);
    el['count-rejected'].textContent = String(state.counts.rejected);
    el['count-reconnects'].textContent = String(state.counts.reconnects);
    el['count-disconnects'].textContent = String(state.counts.disconnects);
    el.disconnect.disabled = !['connecting', 'open'].includes(state.connection);
    el.reconnect.disabled = state.connection !== 'disconnected';
    el.evicted.textContent = state.eventsEvicted ? `${state.eventsEvicted} older applied events scrolled out of this view.` : 'All applied events are shown.';
    el.log.replaceChildren(...state.events.map((entry) => item('applied', `${entry.id} · ${entry.event} · ${entry.data.note}`)));
    el.dropped.replaceChildren(...state.dropped.map((entry) => item('dropped', `${entry.display}: ${entry.id}`)));
    el.notice.textContent = state.notice ? reducer.notices[state.notice] : 'No recovery action taken.';
    if (!state.failure) {
      el.failure.textContent = 'No failure.';
      el.actions.replaceChildren();
      return;
    }
    el.failure.textContent = `${state.failure.error.code} (${state.failure.error.group}): ${state.failure.error.message}`;
    el.actions.replaceChildren(...state.failure.allowedActions.map((allowed) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = allowed.label;
      button.title = allowed.description;
      button.addEventListener('click', () => takeAction(allowed.action));
      return button;
    }));
  }

  function dispatch(action) {
    state = reducer.reduce(state, action);
    render();
  }

  function closeStream() {
    if (source) {
      const old = source;
      source = null;
      old.close();
    }
  }

  function cancelTimer() {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
  }

  function readSnapshot(phase) {
    return fetch('/run.json').then((response) => response.json()).then((body) => {
      snapshot = body;
      dispatch({ type: 'counters', phase, produced: body.counters.produced });
    }).catch(() => {
      snapshot = null;
      render();
    });
  }

  function onEvent(message) {
    let data = null;
    try { data = JSON.parse(message.data); } catch { data = null; }
    dispatch({ type: 'event', id: message.lastEventId, event: message.type, data });
    if (state.completed) closeStream();
  }

  function scheduleRetry() {
    cancelTimer();
    timer = setTimeout(() => {
      timer = null;
      reconnect(true);
    }, retryMs);
  }

  async function diagnose() {
    try {
      const response = await fetch(`/cursor${activeCursor ? `?lastEventId=${encodeURIComponent(activeCursor)}` : ''}`);
      const body = await response.json();
      if (body && body.ok === true) {
        dispatch({ type: 'disconnect', by: 'network' });
        scheduleRetry();
        return;
      }
      dispatch({ type: 'failure', failure: body });
    } catch {
      dispatch({ type: 'failure', failure: null });
    }
  }

  function onError(current) {
    const refused = current.readyState === EventSource.CLOSED;
    closeStream();
    if (['complete', 'stopped'].includes(state.connection)) return;
    if (refused) {
      diagnose();
      return;
    }
    dispatch({ type: 'disconnect', by: 'network' });
    scheduleRetry();
  }

  function openStream(cursorId) {
    closeStream();
    activeCursor = cursorId;
    dispatch({ type: 'connect' });
    const current = new EventSource(cursorId ? `/stream?lastEventId=${encodeURIComponent(cursorId)}` : '/stream');
    source = current;
    current.onopen = () => { if (source === current) dispatch({ type: 'open' }); };
    current.onerror = () => { if (source === current) onError(current); };
    for (const name of reducer.eventNames) {
      current.addEventListener(name, (message) => { if (source === current) onEvent(message); });
    }
  }

  function reconnect(automatic) {
    cancelTimer();
    const requested = automatic ? 0 : Math.max(0, Math.floor(Number(el.rewind.value)) || 0);
    const rewound = state.lastSeq === null ? 0 : Math.min(requested, state.lastSeq - 1);
    const cursorId = state.lastSeq === null ? null : cursors.format(state.runId, state.epoch, state.lastSeq - rewound);
    if (!automatic) el.rewind.value = '0';
    readSnapshot('reconnect');
    dispatch({ type: 'reconnect', cursor: cursorId, rewound, automatic });
    openStream(cursorId);
  }

  function takeAction(action) {
    if (action === 'reinspect') {
      readSnapshot('inspect').then(() => dispatch({ type: 'notice', code: 'REINSPECTED' }));
    } else if (action === 'resync-from-snapshot') {
      dispatch({ type: 'resync' });
      if (state.connection === 'connecting') openStream(null);
    } else if (action === 'confirm-operator-review') {
      dispatch({ type: 'notice', code: 'REVIEW_NEEDED_CONFIRMED' });
    } else {
      cancelTimer();
      closeStream();
      dispatch({ type: 'stop' });
    }
  }

  el.disconnect.addEventListener('click', () => {
    cancelTimer();
    closeStream();
    readSnapshot('disconnect');
    dispatch({ type: 'disconnect', by: 'user' });
    el.reconnect.focus();
  });
  el.reconnect.addEventListener('click', () => {
    reconnect(false);
    el.disconnect.focus();
  });

  if (typeof EventSource === 'function') {
    render();
    readSnapshot('inspect');
    openStream(null);
  } else {
    el.connection.textContent = 'Connection: unavailable (this browser has no EventSource).';
  }
}());
