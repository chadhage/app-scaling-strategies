'use strict';

const cursors = require('./cursor.js');
const { openLog } = require('./store.cjs');

// One synthetic run owned by the server process. Its ordered event producer runs on its own schedule and is stopped only
// by an explicit close(): attaching, detaching or losing a client never cancels, pauses or restarts it.
const defaultScheduler = Object.freeze({
  every(ms, fn) {
    const handle = setInterval(fn, ms);
    handle.unref();
    return () => clearInterval(handle);
  },
  after(ms, fn) {
    const handle = setTimeout(fn, ms);
    handle.unref();
    return () => clearTimeout(handle);
  },
});

function invalid(message) {
  return Object.assign(new TypeError(message), { code: 'CLOSED_SCHEMA' });
}

function integer(value, name, low, high) {
  if (!Number.isSafeInteger(value) || value < low || value > high) throw invalid(`${name} must be an integer from ${low} to ${high}.`);
  return value;
}

function createRun(options = {}) {
  const { context, scheduler = defaultScheduler, persistDir = null, note = null } = options;
  if (!context || typeof context !== 'object' || !/^synthetic-run-\d{3}$/.test(context.runId)) throw invalid('A closed run context is required.');
  const epoch = integer(context.epoch, 'epoch', 1, 999);
  const intervalMs = integer(options.intervalMs ?? 1000, 'intervalMs', 1, 3600000);
  const totalSteps = integer(options.totalSteps ?? 60, 'totalSteps', 1, 5000);
  const replayWindow = integer(options.replayWindow ?? 64, 'replayWindow', 1, 10000);
  const { runId } = context;
  const lastSeq = totalSteps + 2;
  const log = persistDir === null ? null : openLog(persistDir, context);

  const counters = {
    produced: 0, persisted: 0, clientsAttached: 0, clientsTotal: 0, disconnects: 0, resumes: 0,
    replayedEvents: 0, rejectedCursors: 0, slowReaderDrops: 0, heartbeats: 0,
  };
  const subscribers = new Set();
  let window = [];
  let head = 0;
  let status = 'idle';
  let fault = null;
  let cancelProducer = null;

  function decorate(spec) {
    const id = cursors.format(runId, epoch, spec.seq);
    return Object.freeze({
      seq: spec.seq, id, event: spec.event, data: spec.data,
      frame: `id: ${id}\nevent: ${spec.event}\ndata: ${JSON.stringify(spec.data)}\n\n`,
    });
  }

  function specFor(seq) {
    const kind = seq === 1 ? 'run-started' : seq === lastSeq ? 'run-completed' : 'step-completed';
    const step = kind === 'run-started' ? 0 : Math.min(seq - 1, totalSteps);
    return {
      seq, event: kind,
      data: { runId, epoch, seq, step, of: totalSteps, note: note ? note(seq, kind) : `synthetic ${kind} ${step} of ${totalSteps}` },
    };
  }

  if (log) {
    const restored = log.restored.events.slice(-replayWindow).map(decorate);
    window = restored;
    head = log.restored.events.length;
  }
  const restoreReport = log ? {
    persisted: true, restoredEvents: log.restored.events.length, created: log.restored.created,
    tornTailBytesDiscarded: log.restored.tornTailBytesDiscarded, knownEarlierEpochs: log.restored.knownEpochs,
  } : { persisted: false, restoredEvents: 0, created: true, tornTailBytesDiscarded: 0, knownEarlierEpochs: [] };

  function stopProducer() {
    if (cancelProducer) {
      cancelProducer();
      cancelProducer = null;
    }
  }

  function view() {
    return { runId, epoch, headSeq: head, firstRetainedSeq: head - window.length + 1, replayWindow };
  }

  function produce() {
    if (status !== 'running') return null;
    const spec = specFor(head + 1);
    if (log) {
      try {
        log.append(spec);
      } catch (error) {
        fault = error.code || 'STORAGE_ERROR';
        status = 'faulted';
        stopProducer();
        return null;
      }
      counters.persisted += 1;
    }
    head += 1;
    counters.produced += 1;
    const event = decorate(spec);
    window.push(event);
    if (window.length > replayWindow) window.shift();
    for (const send of [...subscribers]) {
      try { send(event); } catch { /* a failing client can never stop or alter the run */ }
    }
    if (head === lastSeq) {
      status = 'completed';
      stopProducer();
    }
    return event;
  }

  const run = {
    runId, epoch, counters, replayWindow, totalSteps, intervalMs, lastSeq,
    start() {
      if (status !== 'idle') return;
      status = head === lastSeq ? 'completed' : 'running';
      if (status === 'running') cancelProducer = scheduler.every(intervalMs, produce);
    },
    produce,
    view,
    isComplete() { return status === 'completed'; },
    resolveCursor(input) {
      const result = cursors.resolve(view(), input);
      if (!result.ok) counters.rejectedCursors += 1;
      return result;
    },
    attach(afterSeq, send) {
      const replay = window.filter((event) => afterSeq === null || event.seq > afterSeq);
      subscribers.add(send);
      counters.clientsAttached += 1;
      counters.clientsTotal += 1;
      counters.replayedEvents += replay.length;
      if (afterSeq !== null) counters.resumes += 1;
      let attached = true;
      return {
        replay,
        detach() {
          if (!attached) return;
          attached = false;
          subscribers.delete(send);
          counters.clientsAttached -= 1;
          counters.disconnects += 1;
        },
      };
    },
    snapshot() {
      const { headSeq, firstRetainedSeq } = view();
      return {
        schemaVersion: 1,
        context: { origin: context.origin || 'injected-fixture', runId, epoch, stateSha256: context.stateSha256 },
        run: {
          status, producerActive: cancelProducer !== null, totalSteps, headSeq, firstRetainedSeq, replayWindow, intervalMs,
          resumeCursor: headSeq > 0 ? cursors.format(runId, epoch, headSeq) : null, fault,
        },
        restore: restoreReport,
        counters: { ...counters },
      };
    },
    close() {
      stopProducer();
      if (status === 'running' || status === 'idle') status = 'closed';
      subscribers.clear();
      if (log) log.close();
    },
  };
  return run;
}

module.exports = Object.freeze({ createRun, defaultScheduler });
