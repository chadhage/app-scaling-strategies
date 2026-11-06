(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('..\\C044\\reducer.js'), () => require('..\\C034\\trace.js'));
  else Object.defineProperty(root, 'X001Timeline', { value: factory(root.C044Reducer, () => root.C034Trace) });
}(globalThis, function make(reducer, loadTrace) {
  'use strict';

  // Pure scrubbing model of a SAVED run. Nothing is started: a position is the fold of the recorded entries 0..i, computed with the
  // reducer the live C044 console uses (or, for a C034 trace, with the decoder's own outcomes), never a second formula for a console.
  // A position or sequence that was not recorded is a typed NOT_RECORDED. Synthetic data only; not a live Azure result.
  const FORMAT = 'X001-saved-run/1';
  const NOT_RECORDED = 'NOT_RECORDED';
  const MAX_ENTRIES = 500;
  const ID = /^[a-z0-9][a-z0-9-]{0,39}$/;
  const JUMPS = Object.freeze(['gap', 'failure', 'unknown', 'epoch']);
  const FAILED = new Set(['rejected', 'failure', 'failed']);
  const UNKNOWN = new Set(['unknown-event', 'failure-unrecognized', 'unknown-entry', 'unknown-outcome', 'unknown-code']);
  const ACTIONS = Object.freeze(['connect', 'open', 'disconnect', 'reconnect', 'event', 'failure', 'resync', 'notice', 'stop', 'counters']);
  const COUNTER_MARKS = Object.freeze({ applied: 'applied', duplicates: 'duplicate', outOfOrder: 'out-of-order', rejected: 'rejected' });

  const refuse = (code, detail = null) => Object.freeze({ ok: false, code, detail });
  const notRecorded = (reason, range = null) => Object.freeze({ ok: false, code: NOT_RECORDED, reason, range });
  const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const seen = new WeakSet();

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !seen.has(value)) {
      seen.add(value);
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }

  function canonical(value) {
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
    return JSON.stringify(value) ?? 'null';
  }

  // The mark of a console entry is read from what the reducer did to its state, so a duplicate, an out-of-order delivery or a
  // rejection can never be shown as a new applied event (the C044 F1 lesson) and an unknown entry never looks like success.
  function classifyConsole(before, after, entry) {
    const flags = { gap: null, epochChange: null };
    if (!isObject(entry) || !ACTIONS.includes(entry.type)) return { mark: 'unknown-entry', detail: 'unrecognised entry type', flags };
    if (entry.type === 'event') {
      const grown = Object.keys(COUNTER_MARKS).find((key) => after.counts[key] > before.counts[key]);
      const mark = COUNTER_MARKS[grown] || 'unknown-entry';
      const dropped = after.dropped[after.dropped.length - 1];
      if (mark === 'applied') {
        if (after.gaps.length > before.gaps.length) flags.gap = after.gaps[after.gaps.length - 1];
        if (after.epochChanges.length > before.epochChanges.length) flags.epochChange = after.epochChanges[after.epochChanges.length - 1];
        return { mark, detail: after.lastId, flags };
      }
      if (mark === 'rejected' && dropped.reason === 'unknown-event') return { mark: 'unknown-event', detail: dropped.reason, flags };
      return { mark, detail: dropped ? dropped.reason || dropped.display : null, flags };
    }
    if (entry.type === 'failure') {
      const code = after.failure.error.code;
      return { mark: code === 'UNRECOGNIZED_ERROR' ? 'failure-unrecognized' : 'failure', detail: code, flags };
    }
    return { mark: after === before ? 'no-effect' : 'control', detail: entry.type, flags };
  }

  function foldConsole(entries, freeze = true) {
    let state = reducer.initial();
    return entries.map((entry) => {
      const before = state;
      state = reducer.reduce(state, entry);
      return { state: freeze ? deepFreeze(state) : state, ...classifyConsole(before, state, entry) };
    });
  }

  // The running counts at every position, in one pass: byMark plus the failed and unknown classes, gaps and epoch changes so far.
  function runningTallies(steps) {
    const byMark = {};
    const out = { failed: 0, unknown: 0, gaps: 0, epochChanges: 0 };
    return steps.map((step) => {
      byMark[step.mark] = (byMark[step.mark] || 0) + 1;
      if (FAILED.has(step.mark)) out.failed += 1;
      if (UNKNOWN.has(step.mark)) out.unknown += 1;
      if (step.flags.gap) out.gaps += 1;
      if (step.flags.epochChange) out.epochChanges += 1;
      return deepFreeze({ byMark: { ...byMark }, ...out });
    });
  }
  const TRACE_MARKS = Object.freeze({
    ORIGINAL_ATTEMPT_STARTED: 'started', ACTUAL_READ_STARTED: 'read-started', ACTUAL_READ_ACKNOWLEDGED: 'read-acknowledged',
    BOUNDARY_HELD: 'held', RESUME_ORIGINAL_ATTEMPT: 'resumed', TWO_READ_LOCAL_SEGMENT_OBSERVED: 'observed',
    FAILED_HTTP_REPLY_404: 'failed', INTERRUPTED_BY_STOP: 'unknown-outcome', INTERRUPTED_BY_RESET: 'unknown-outcome',
    RESET_VIEW_HISTORY_RETAINED: 'reset',
  });
  const TRACE_CHANGES = Object.freeze({
    'read-started': (a) => ({ requests: a.requests + 1 }), 'read-acknowledged': (a) => ({ responses: a.responses + 1 }),
    held: () => ({ phase: 'paused' }), resumed: () => ({ phase: 'running' }), observed: () => ({ phase: 'observed' }),
    failed: (a) => ({ phase: 'failed', responses: a.responses + 1 }), 'unknown-outcome': () => ({ phase: 'unknown' }), reset: () => ({ reset: true }),
  });
  const DECODER_CLASSES = Object.freeze({
    observed: ['observed-local-segment', 'original-budget-exceeded'], failed: ['failed'], unknown: ['unknown'], running: ['partial-unknown'], paused: ['partial-unknown'],
  });
  const TERMINAL = Object.freeze(['observed', 'failed', 'unknown-outcome']);

  // A C034 trace is ordered by its own rules (the accepted decoder refuses any other order); this fold only counts what was recorded and
  // is cross-checked against the decoder's per-attempt answer, so it can never become a second opinion on the outcome.
  function stepTrace(state, entry) {
    const flags = { gap: null, epochChange: null };
    const code = isObject(entry) && typeof entry.code === 'string' ? entry.code : null;
    const mark = code !== null && Object.hasOwn(TRACE_MARKS, code) ? TRACE_MARKS[code] : 'unknown-code';
    if (mark === 'started') return { state: { attempts: [...state.attempts, { attemptId: entry.attemptId, phase: 'running', requests: 0, responses: 0, reset: false }] }, mark, detail: entry.attemptId, flags };
    if (mark === 'unknown-code') return { state, mark, detail: code, flags };
    const attempts = state.attempts.map((attempt) => ({ ...attempt }));
    const current = attempts.findLast((attempt) => attempt.attemptId === entry.attemptId);
    if (!current) return { state, mark: 'unknown-code', detail: code, flags };
    Object.assign(current, TRACE_CHANGES[mark](current));
    return { state: { attempts }, mark, detail: current.attemptId, flags };
  }

  function foldTrace(events, freeze = true) {
    let state = { attempts: [] };
    return events.map((entry) => {
      const step = stepTrace(state, entry);
      state = step.state;
      return { ...step, state: freeze ? deepFreeze(step.state) : step.state };
    });
  }

  function agrees(finalState, verdict) {
    return finalState.attempts.length === verdict.attempts.length && finalState.attempts.every((attempt, index) => {
      const decoded = verdict.attempts[index];
      return decoded.attemptId === attempt.attemptId && decoded.requests === attempt.requests && decoded.responses === attempt.responses
        && DECODER_CLASSES[attempt.phase].includes(decoded.classification);
    });
  }

  const listed = (steps, set) => steps.flatMap((step, index) => (set.has(step.mark) ? [{ position: index + 1, mark: step.mark, detail: step.detail }] : []));
  const positionsOf = (steps, mark) => steps.flatMap((step, index) => (step.mark === mark ? [index + 1] : []));
  const common = (kind, steps) => ({
    kind, positions: steps.length, failed: listed(steps, FAILED), unknown: listed(steps, UNKNOWN), duplicates: positionsOf(steps, 'duplicate'),
    outOfOrder: positionsOf(steps, 'out-of-order'), gaps: [], epochChanges: [], epochs: [], notRecorded: [], attempts: [], producer: null,
  });

  function traceLimits(steps, verdict) {
    const starts = new Map();
    const ends = new Map();
    steps.forEach((step, index) => {
      if (step.mark === 'started') starts.set(step.detail, index + 1);
      if (TERMINAL.includes(step.mark)) ends.set(step.detail, index + 1);
    });
    const attempts = steps[steps.length - 1].state.attempts.map((attempt, index) => ({
      attemptId: attempt.attemptId, phase: attempt.phase, classification: verdict.attempts[index].classification, requests: attempt.requests,
      responses: attempt.responses, startPosition: starts.get(attempt.attemptId), endPosition: ends.has(attempt.attemptId) ? ends.get(attempt.attemptId) : null,
    }));
    return { ...common('trace', steps), attempts, status: attempts.length > 0 && attempts.every((attempt) => attempt.endPosition !== null) ? 'COMPLETE' : 'INCOMPLETE' };
  }

  function consoleLimits(producer, steps) {
    const total = producer ? producer.lastSeq : null;
    const windows = new Map();
    for (const step of steps.filter((item) => item.mark === 'applied')) {
      const { epoch, lastSeq } = step.state;
      const window = windows.get(epoch) || { epoch, firstSeq: lastSeq, lastSeq, recorded: 0, total };
      window.lastSeq = lastSeq;
      window.recorded += 1;
      windows.set(epoch, window);
    }
    const gaps = steps.flatMap((step, index) => (step.flags.gap ? [{
      position: index + 1, epoch: step.flags.gap.epoch, from: step.flags.gap.skippedFrom, to: step.flags.gap.skippedTo,
      count: step.flags.gap.skippedTo - step.flags.gap.skippedFrom + 1,
    }] : []));
    const epochChanges = steps.flatMap((step, index) => (step.flags.epochChange ? [{
      position: index + 1, from: step.flags.epochChange.fromEpoch, to: step.flags.epochChange.toEpoch,
    }] : []));
    const epochs = [...windows.values()].sort((a, b) => a.epoch - b.epoch)
      .map((window) => ({ ...window, complete: total !== null && window.firstSeq === 1 && window.lastSeq === total && window.recorded === total }));
    const notRecordedRanges = epochs.flatMap((window) => [
      ...(window.firstSeq > 1 ? [{ epoch: window.epoch, from: 1, to: window.firstSeq - 1, why: 'before-first' }] : []),
      ...gaps.filter((gap) => gap.epoch === window.epoch).map((gap) => ({ epoch: window.epoch, from: gap.from, to: gap.to, why: 'gap' })),
      ...(total !== null && window.lastSeq < total ? [{ epoch: window.epoch, from: window.lastSeq + 1, to: total, why: 'after-last' }] : []),
    ]);
    const finished = steps[steps.length - 1].state.completed;
    return {
      ...common('console', steps), producer, epochs, gaps, epochChanges, notRecorded: notRecordedRanges,
      status: finished && notRecordedRanges.length === 0 ? 'COMPLETE' : 'INCOMPLETE',
    };
  }
  function prepareConsole(saved) {
    if (!Array.isArray(saved.entries) || saved.entries.length === 0) return refuse('ENTRIES_REQUIRED');
    if (saved.entries.length > MAX_ENTRIES) return refuse('TOO_MANY_ENTRIES');
    const producer = saved.producer === undefined ? null : saved.producer;
    if (producer !== null && !(isObject(producer) && [producer.lastSeq, producer.totalSteps, producer.replayWindow].every((value) => Number.isSafeInteger(value) && value >= 1))) {
      return refuse('PRODUCER_INVALID');
    }
    const steps = foldConsole(saved.entries);
    return { ok: true, entries: saved.entries, steps, limits: consoleLimits(producer, steps) };
  }

  function prepareTrace(saved) {
    const { snapshot } = saved;
    if (!isObject(snapshot) || !Array.isArray(snapshot.events) || snapshot.events.length === 0) return refuse('ENTRIES_REQUIRED');
    if (snapshot.events.length > MAX_ENTRIES) return refuse('TOO_MANY_ENTRIES');
    const decoder = loadTrace();
    if (!decoder || typeof decoder.validateSnapshot !== 'function') return refuse('DECODER_UNAVAILABLE');
    const verdict = decoder.validateSnapshot(snapshot);
    if (!verdict.valid) return refuse('DECODER_REFUSED', verdict.code);
    const steps = foldTrace(snapshot.events);
    if (!agrees(steps[steps.length - 1].state, verdict)) return refuse('DECODER_DISAGREES');
    return { ok: true, entries: snapshot.events, steps, limits: traceLimits(steps, verdict) };
  }

  const isHit = {
    gap: (step) => step.flags.gap !== null, failure: (step) => FAILED.has(step.mark), unknown: (step) => UNKNOWN.has(step.mark),
    epoch: (step) => step.flags.epochChange !== null,
  };

  function assemble(saved, { entries, steps, limits }) {
    const { length } = steps;
    const tallies = runningTallies(steps);
    const hits = Object.fromEntries(JUMPS.map((kind) => [kind, steps.flatMap((step, index) => (isHit[kind](step) ? [index] : []))]));
    const applied = new Map(steps.flatMap((step, index) => (step.mark === 'applied' ? [[`${step.state.epoch}:${step.state.lastSeq}`, index]] : [])));
    const stateAt = (index) => {
      if (!Number.isSafeInteger(index) || index < 0 || index >= length) return notRecorded('outside-recording', { from: 1, to: length });
      const step = steps[index];
      return Object.freeze({
        ok: true, index, position: index + 1, of: length, entry: entries[index], mark: step.mark, detail: step.detail, flags: step.flags,
        state: step.state, tallies: tallies[index],
      });
    };
    const locate = (epoch, seq) => {
      if (!Number.isSafeInteger(epoch) || !Number.isSafeInteger(seq) || seq < 1) return notRecorded('invalid-sequence');
      const window = limits.epochs.find((item) => item.epoch === epoch);
      if (!window) return notRecorded('unknown-epoch');
      const gap = limits.gaps.find((item) => item.epoch === epoch && seq >= item.from && seq <= item.to);
      if (gap) return notRecorded('gap', { from: gap.from, to: gap.to });
      if (seq < window.firstSeq) return notRecorded('before-recorded', { from: 1, to: window.firstSeq - 1 });
      if (seq > window.lastSeq) return notRecorded('after-recorded', { from: window.lastSeq + 1, to: window.total });
      return Object.freeze({ ok: true, index: applied.get(`${epoch}:${seq}`) });
    };
    return Object.freeze({
      ok: true, id: saved.id, title: typeof saved.title === 'string' ? saved.title.slice(0, 200) : saved.id, kind: saved.kind,
      source: isObject(saved.source) ? saved.source : null, length, entries, marks: steps.map((step) => step.mark),
      limits: deepFreeze(limits), hits: deepFreeze(hits), stateAt, locate,
    });
  }

  function build(saved) {
    if (!isObject(saved)) return refuse('SAVED_RUN_REQUIRED');
    if (saved.format !== FORMAT) return refuse('FORMAT_UNSUPPORTED');
    if (typeof saved.id !== 'string' || !ID.test(saved.id)) return refuse('ID_INVALID');
    if (saved.kind !== 'console' && saved.kind !== 'trace') return refuse('KIND_UNSUPPORTED');
    const prepared = saved.kind === 'console' ? prepareConsole(saved) : prepareTrace(saved);
    return prepared.ok ? assemble(saved, prepared) : prepared;
  }
  const stateAt = (timeline, index) => (isObject(timeline) && timeline.ok === true && typeof timeline.stateAt === 'function'
    ? timeline.stateAt(index) : refuse('TIMELINE_REQUIRED'));
  const locate = (timeline, epoch, seq) => (isObject(timeline) && timeline.ok === true && typeof timeline.locate === 'function'
    ? timeline.locate(epoch, seq) : refuse('TIMELINE_REQUIRED'));

  function jump(timeline, from, kind, direction) {
    if (!isObject(timeline) || timeline.ok !== true || !JUMPS.includes(kind) || (direction !== 1 && direction !== -1) || !Number.isSafeInteger(from)) return null;
    const list = timeline.hits[kind];
    const found = direction === 1 ? list.find((index) => index > from) : list.findLast((index) => index < from);
    return found === undefined ? null : found;
  }

  // An independent forward pass over the raw entries (own states, nothing shared with the cached scan of build()): position i of the
  // pass is the prefix 0..i folded from the initial state.
  function verify(saved, timeline) {
    if (!isObject(saved)) return { ok: false, checked: 0, mismatches: [], code: 'SAVED_RUN_REQUIRED' };
    const target = timeline === undefined ? build(saved) : timeline;
    if (!target || target.ok !== true) return { ok: false, checked: 0, mismatches: [], code: (target && target.code) || 'TIMELINE_REQUIRED' };
    const mismatches = [];
    const console_ = saved.kind === 'console';
    const events = console_ ? saved.entries : saved.snapshot.events;
    const steps = (console_ ? foldConsole : foldTrace)(events, false);
    const fresh = runningTallies(steps);
    if (target.length !== events.length) mismatches.push({ index: -1, what: 'length' });
    for (let index = 0; index < Math.min(target.length, events.length); index++) {
      const shown = target.stateAt(index);
      let what = null;
      if (!shown.ok) what = 'missing';
      else if (canonical(shown.state) !== canonical(steps[index].state)) what = 'state';
      else if (shown.mark !== steps[index].mark) what = 'mark';
      else if (canonical(shown.tallies) !== canonical(fresh[index])) what = 'tallies';
      if (what) mismatches.push({ index, what });
    }
    return { ok: mismatches.length === 0, checked: events.length, mismatches };
  }

  const POSITION = /^[1-9][0-9]{0,5}$/;
  function parseFragment(text, ids) {
    if (typeof text !== 'string') return refuse('FRAGMENT_INVALID');
    if (text === '' || text === '#') return refuse('FRAGMENT_EMPTY');
    if (text.length > 100) return refuse('FRAGMENT_TOO_LONG');
    if (text[0] !== '#') return refuse('FRAGMENT_INVALID');
    const found = {};
    for (const part of text.slice(1).split('&')) {
      const [key, value, ...rest] = part.split('=');
      if (rest.length > 0 || value === undefined) return refuse('FRAGMENT_MALFORMED');
      if (key !== 'run' && key !== 'pos') return refuse('FRAGMENT_UNKNOWN_KEY');
      if (Object.hasOwn(found, key)) return refuse('FRAGMENT_DUPLICATE_KEY');
      found[key] = value;
    }
    if (!Object.hasOwn(found, 'run') || !Object.hasOwn(found, 'pos')) return refuse('FRAGMENT_INCOMPLETE');
    if (!ID.test(found.run) || !Array.isArray(ids) || !ids.includes(found.run)) return refuse('RUN_UNKNOWN');
    if (!POSITION.test(found.pos)) return refuse('POSITION_INVALID');
    return Object.freeze({ ok: true, run: found.run, pos: Number(found.pos) });
  }

  const formatFragment = (run, pos) => `#run=${run}&pos=${pos}`;

  return Object.freeze({
    FORMAT, NOT_RECORDED, JUMPS, MAX_ENTRIES, build, stateAt, locate, jump, verify, parseFragment, formatFragment,
    using: (deps) => make(deps.reducer || reducer, Object.hasOwn(deps, 'trace') ? () => deps.trace : loadTrace),
  });
}));
