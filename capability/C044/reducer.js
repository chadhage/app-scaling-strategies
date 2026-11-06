(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./cursor.js'));
  else Object.defineProperty(root, 'C044Reducer', { value: factory(root.C044Cursor) });
}(globalThis, function (cursors) {
  'use strict';

  // Pure client-side reducer: every delivery is judged by its server-owned id. A duplicate, out-of-order, foreign or
  // malformed delivery is dropped, counted and shown as dropped; it is never applied as a new event.
  const eventNames = Object.freeze(['run-started', 'step-completed', 'run-completed']);
  const notices = Object.freeze({
    REVIEW_NEEDED_CONFIRMED: 'Operator review is needed. It has not been performed and no recovery is claimed.',
    REINSPECTED: 'Read-only snapshot inspected. Nothing was repaired, reset or replayed.',
    RESYNCED: 'Resynced from the oldest retained event. The skipped range stays visible as a gap.',
    STOPPED: 'Stopped. Recorded events, counters and failures remain.',
  });
  const viewLimit = 200;
  const dropLimit = 100;
  const dataLimit = 2048;

  function frozen(state) {
    return Object.freeze({
      ...state, events: Object.freeze(state.events), dropped: Object.freeze(state.dropped),
      gaps: Object.freeze(state.gaps), counts: Object.freeze(state.counts),
    });
  }

  function initial() {
    return frozen({
      schemaVersion: 1, revision: 0, connection: 'idle', detachedBy: null, runId: null, epoch: null, lastSeq: null, lastId: null,
      events: [], eventsEvicted: 0, dropped: [], droppedTotal: 0, droppedEvicted: 0, gaps: [],
      counts: { applied: 0, duplicates: 0, outOfOrder: 0, rejected: 0, reconnects: 0, disconnects: 0, resyncs: 0 },
      marker: null, failure: null, detached: null, notice: null, completed: false,
    });
  }

  function next(state, changes) {
    return frozen({ ...state, ...changes, revision: state.revision + 1 });
  }

  function drop(state, entry, counter) {
    const dropped = [...state.dropped, entry];
    const overflow = Math.max(0, dropped.length - dropLimit);
    return next(state, {
      dropped: dropped.slice(overflow), droppedTotal: state.droppedTotal + 1, droppedEvicted: state.droppedEvicted + overflow,
      counts: { ...state.counts, [counter]: state.counts[counter] + 1 },
    });
  }

  function copyData(data) {
    try {
      const text = JSON.stringify(data);
      return typeof text === 'string' && text.length <= dataLimit ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }

  function event(state, action) {
    const label = typeof action.id === 'string' ? action.id.slice(0, 80) : null;
    const rejected = (reason) => drop(state, { id: label, reason, display: `rejected (${reason})` }, 'rejected');
    const parsed = cursors.parse(action.id);
    if (!parsed.ok) return rejected('malformed-id');
    const { runId, epoch, seq } = parsed.cursor;
    if (typeof action.event !== 'string' || !eventNames.includes(action.event)) return rejected('unknown-event');
    const data = copyData(action.data);
    if (!data || typeof data !== 'object' || data.runId !== runId || data.epoch !== epoch || data.seq !== seq) return rejected('attribution-mismatch');
    if (state.runId !== null && runId !== state.runId) return rejected('foreign-run');
    if (state.epoch !== null && epoch !== state.epoch) return rejected('foreign-epoch');
    if (state.lastSeq !== null && seq <= state.lastSeq) {
      return drop(state, { id: action.id, seq, reason: 'duplicate', display: 'dropped duplicate' }, 'duplicates');
    }
    if (state.lastSeq !== null && seq > state.lastSeq + 1) {
      return drop(state, {
        id: action.id, seq, reason: 'out-of-order', display: `dropped out-of-order (expected sequence ${state.lastSeq + 1})`,
      }, 'outOfOrder');
    }
    const events = [...state.events, { id: action.id, seq, event: action.event, data }];
    const overflow = Math.max(0, events.length - viewLimit);
    const completed = state.completed || action.event === 'run-completed';
    return next(state, {
      runId, epoch, lastSeq: seq, lastId: action.id, events: events.slice(overflow), eventsEvicted: state.eventsEvicted + overflow,
      counts: { ...state.counts, applied: state.counts.applied + 1 }, completed, failure: null,
      connection: completed ? 'complete' : state.connection,
    });
  }

  function reconnect(state, action) {
    const parsed = action.cursor === null ? { ok: true, cursor: null } : cursors.parse(action.cursor);
    const fromId = parsed.ok ? action.cursor : null;
    const rewound = Number.isSafeInteger(action.rewound) && action.rewound > 0 ? action.rewound : 0;
    return next(state, {
      connection: 'connecting', failure: null,
      counts: { ...state.counts, reconnects: state.counts.reconnects + 1 },
      marker: { kind: 'reconnected', fromId, fromSeq: parsed.ok && parsed.cursor ? parsed.cursor.seq : null, rewound, automatic: action.automatic === true },
    });
  }

  function resync(state) {
    const allowed = state.failure && state.failure.allowedActions.some((item) => item.action === 'resync-from-snapshot');
    if (!allowed) return state;
    return next(state, {
      connection: 'connecting', failure: null, epoch: null, lastSeq: null, lastId: null, notice: 'RESYNCED',
      gaps: [...state.gaps, { afterId: state.lastId, afterSeq: state.lastSeq }],
      counts: { ...state.counts, resyncs: state.counts.resyncs + 1 },
      marker: { kind: 'resynced', fromId: state.lastId, fromSeq: state.lastSeq, rewound: 0, automatic: false },
    });
  }

  function notice(state, action) {
    if (action.code === 'REINSPECTED') return next(state, { notice: 'REINSPECTED' });
    const allowed = state.failure && state.failure.allowedActions.some((item) => item.action === 'confirm-operator-review');
    return action.code === 'REVIEW_NEEDED_CONFIRMED' && allowed ? next(state, { notice: 'REVIEW_NEEDED_CONFIRMED' }) : state;
  }

  function counters(state, action) {
    const produced = action.produced;
    if (!Number.isSafeInteger(produced) || produced < 0) return state;
    if (action.phase === 'disconnect') return next(state, { detached: { producedAtDisconnect: produced, producedAtReconnect: null, advanced: null } });
    if (action.phase === 'reconnect' && state.detached && state.detached.advanced === null) {
      return next(state, {
        detached: { producedAtDisconnect: state.detached.producedAtDisconnect, producedAtReconnect: produced, advanced: produced - state.detached.producedAtDisconnect },
      });
    }
    return state;
  }

  function reduce(state, action) {
    if (!action || typeof action !== 'object') return state;
    switch (action.type) {
      case 'connect': return next(state, { connection: 'connecting' });
      case 'open': return state.connection === 'complete' || state.connection === 'stopped' ? state : next(state, { connection: 'open' });
      case 'disconnect':
        if (!['open', 'connecting'].includes(state.connection)) return state;
        return next(state, {
          connection: 'disconnected', detachedBy: action.by === 'user' ? 'user' : 'network',
          counts: { ...state.counts, disconnects: state.counts.disconnects + 1 },
        });
      case 'reconnect': return reconnect(state, action);
      case 'event': return event(state, action);
      case 'failure': return next(state, { failure: cursors.inspectFailure(action.failure), connection: 'failed' });
      case 'resync': return resync(state);
      case 'notice': return notice(state, action);
      case 'stop': return next(state, { connection: 'stopped', notice: 'STOPPED' });
      case 'counters': return counters(state, action);
      default: return state;
    }
  }

  return Object.freeze({ initial, reduce, eventNames, notices, viewLimit, dropLimit });
}));
