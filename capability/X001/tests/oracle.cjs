'use strict';

// The INDEPENDENT oracle of the displayed state (L-0118, L-0190): every position of a saved run is folded here with the C044 reducer itself (never
// with timeline.js or describe.js) and every displayed text is worded here from the fold. tests\invariants.cjs compares the page with it line by line.
const Reducer = require('..\\..\\C044\\reducer.js');

const ACTIONS = ['connect', 'open', 'disconnect', 'reconnect', 'event', 'failure', 'resync', 'notice', 'stop', 'counters'];
const FAILED = ['rejected', 'failure', 'failed'];
const UNKNOWN = ['unknown-event', 'failure-unrecognized', 'unknown-entry', 'unknown-outcome', 'unknown-code'];
const CONSOLE_LINES = ['st-connection', 'st-epoch', 'st-last', 'st-applied', 'st-duplicates', 'st-out-of-order', 'st-rejected', 'st-reconnects', 'st-resyncs', 'st-gaps',
  'st-epoch-changes', 'st-marker', 'st-failure', 'st-completed', 'st-failed', 'st-unknown'];
const TRACE_LINES = ['st-attempts', 'st-observed', 'st-failed-attempts', 'st-unknown-attempts', 'st-running', 'st-failed', 'st-unknown'];
const LINE_LABELS = {
  console: ['Connection', 'Epoch', 'Last applied event', 'Applied events', 'Dropped duplicates', 'Dropped out of order', 'Rejected deliveries', 'Reconnects', 'Resyncs', 'Gaps', 'Epoch changes',
    'Last reconnect marker', 'Standing failure', 'Run completed', 'Failed entries so far', 'Unknown entries so far'],
  trace: ['Attempts started', 'Attempts observed', 'Attempts failed', 'Attempts with unknown outcome', 'Attempts running or held', 'Failed entries so far', 'Unknown entries so far'],
};
const LABEL = { applied: 'APPLIED', duplicate: 'DUPLICATE (dropped, not a new event)', 'out-of-order': 'OUT OF ORDER (dropped)', rejected: 'REJECTED (failed)',
  'unknown-event': 'UNKNOWN EVENT TYPE (rejected)', failure: 'FAILED (typed failure)', 'failure-unrecognized': 'UNKNOWN FAILURE (operator review needed)',
  'unknown-entry': 'UNKNOWN ENTRY (changed nothing)', control: 'SESSION ACTION', 'no-effect': 'RECORDED, CHANGED NOTHING', started: 'ATTEMPT STARTED', 'read-started': 'READ STARTED',
  'read-acknowledged': 'READ ACKNOWLEDGED', held: 'BOUNDARY HELD', resumed: 'RESUMED', observed: 'OBSERVED', failed: 'FAILED (HTTP 404 reply)',
  'unknown-outcome': 'UNKNOWN OUTCOME (interrupted)', reset: 'VIEW RESET (history kept)' };
const TRACE_MARK = { ORIGINAL_ATTEMPT_STARTED: 'started', ACTUAL_READ_STARTED: 'read-started', ACTUAL_READ_ACKNOWLEDGED: 'read-acknowledged', BOUNDARY_HELD: 'held',
  RESUME_ORIGINAL_ATTEMPT: 'resumed', TWO_READ_LOCAL_SEGMENT_OBSERVED: 'observed', FAILED_HTTP_REPLY_404: 'failed', INTERRUPTED_BY_STOP: 'unknown-outcome',
  INTERRUPTED_BY_RESET: 'unknown-outcome', RESET_VIEW_HISTORY_RETAINED: 'reset' };

const range = (from, to) => (from === to ? `sequence ${from}` : `sequences ${from} to ${to}`);
const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
const gapsText = (state) => (state.gaps.length === 0 ? 'none' : `${state.gaps.length} (${state.gaps.map((gap) => `epoch ${gap.epoch}: ${range(gap.skippedFrom, gap.skippedTo)} not recorded`).join('; ')})`);
const markerText = (state) => (state.marker ? `${state.marker.kind}${state.marker.outcome ? ` (${state.marker.outcome})` : ''}` : 'none');

function stepText(entry) {
  const { step, of } = entry.data || {};
  if (!Number.isSafeInteger(step) || !Number.isSafeInteger(of)) return 'an event was applied';
  if (entry.event === 'run-started') return `run started (step ${step} of ${of})`;
  return entry.event === 'run-completed' ? `run completed (step ${step} of ${of})` : `step ${step} of ${of} completed`;
}

function headline(row) {
  switch (row.mark) {
    case 'applied': return stepText(row.entry);
    case 'duplicate': return 'a duplicate delivery was dropped; nothing new was applied';
    case 'out-of-order': return 'an out-of-order delivery was dropped; nothing new was applied';
    case 'rejected': return `a delivery was rejected (${row.detail}); nothing was applied`;
    case 'unknown-event': return 'an unknown event type was rejected; nothing was applied';
    case 'failure': return `typed failure ${row.detail}`;
    case 'failure-unrecognized': return 'an unrecognised failure; operator review is needed';
    case 'unknown-entry': return 'an unrecognised recorded entry; it changed nothing';
    case 'control': return `session action ${row.detail}`;
    case 'no-effect': return `session action ${row.detail} was recorded and changed nothing`;
    default: return `${LABEL[row.mark].toLowerCase()} (${row.detail})`;
  }
}

function entryText(entry) {
  if (entry.type === 'event') return `event ${String(entry.event).slice(0, 24)} ${String(entry.id).slice(0, 40)}`;
  if (entry.type === 'failure') return `typed failure ${entry.failure && entry.failure.error ? entry.failure.error.code : entry.failure && entry.failure.code}`;
  return typeof entry.type === 'string' ? entry.type : `${entry.code} ${entry.attemptId}`;
}

// One row per recorded entry of a console run: the mark derived from what the reducer did, the state after it and the displayed lines.
function consoleRows(entries) {
  let state = Reducer.initial();
  let failed = 0;
  let unknown = 0;
  return entries.map((entry, index) => {
    const before = state;
    state = Reducer.reduce(state, entry);
    let mark = 'control';
    let detail = entry && entry.type;
    if (!entry || typeof entry !== 'object' || !ACTIONS.includes(entry.type)) mark = 'unknown-entry';
    else if (entry.type === 'event') {
      const grew = (key) => state.counts[key] - before.counts[key] > 0;
      const dropped = state.dropped[state.dropped.length - 1];
      if (grew('applied')) mark = 'applied';
      else if (grew('duplicates')) mark = 'duplicate';
      else if (grew('outOfOrder')) mark = 'out-of-order';
      else { mark = dropped.reason === 'unknown-event' ? 'unknown-event' : 'rejected'; detail = dropped.reason; }
    } else if (entry.type === 'failure') { detail = state.failure.error.code; mark = detail === 'UNRECOGNIZED_ERROR' ? 'failure-unrecognized' : 'failure'; }
    else if (state === before) mark = 'no-effect';
    if (['rejected', 'failure'].includes(mark)) failed += 1;
    if (['unknown-event', 'failure-unrecognized', 'unknown-entry'].includes(mark)) unknown += 1;
    const { counts } = state;
    const gap = state.gaps.length > before.gaps.length ? state.gaps[state.gaps.length - 1] : null;
    const change = state.epochChanges.length > before.epochChanges.length ? state.epochChanges[state.epochChanges.length - 1] : null;
    const notes = [gap ? `GAP BEFORE: epoch ${gap.epoch} ${range(gap.skippedFrom, gap.skippedTo)} NOT RECORDED` : null, change ? `EPOCH CHANGE ${change.fromEpoch} to ${change.toEpoch}` : null].filter(Boolean);
    return {
      index, entry, state, before, mark, detail, failed, unknown, gap: Boolean(gap), change: Boolean(change), note: notes.join('; '),
      lines: {
        'st-connection': state.connection, 'st-epoch': state.epoch === null ? 'none yet' : String(state.epoch), 'st-last': state.lastId === null ? 'none yet' : state.lastId,
        'st-applied': String(counts.applied), 'st-duplicates': String(counts.duplicates), 'st-out-of-order': String(counts.outOfOrder), 'st-rejected': String(counts.rejected),
        'st-reconnects': String(counts.reconnects), 'st-resyncs': String(counts.resyncs), 'st-gaps': gapsText(state), 'st-epoch-changes': String(state.epochChanges.length),
        'st-marker': markerText(state), 'st-failure': state.failure ? state.failure.error.code : 'none', 'st-completed': state.completed ? 'yes' : 'no',
        'st-failed': String(failed), 'st-unknown': String(unknown),
      },
    };
  });
}

function traceRows(events) {
  const phases = new Map();
  let failed = 0;
  let unknown = 0;
  return events.map((entry, index) => {
    const mark = TRACE_MARK[entry.code];
    if (mark === 'started') phases.set(entry.attemptId, 'running');
    if (mark === 'held') phases.set(entry.attemptId, 'paused');
    if (mark === 'resumed') phases.set(entry.attemptId, 'running');
    if (mark === 'observed') phases.set(entry.attemptId, 'observed');
    if (mark === 'failed') { phases.set(entry.attemptId, 'failed'); failed += 1; }
    if (mark === 'unknown-outcome') { phases.set(entry.attemptId, 'unknown'); unknown += 1; }
    const count = (...names) => [...phases.values()].filter((phase) => names.includes(phase)).length;
    return {
      index, entry, mark, detail: entry.attemptId, failed, unknown, gap: false, change: false, note: '',
      lines: {
        'st-attempts': String(phases.size), 'st-observed': String(count('observed')), 'st-failed-attempts': String(count('failed')), 'st-unknown-attempts': String(count('unknown')),
        'st-running': String(count('running', 'paused')), 'st-failed': String(failed), 'st-unknown': String(unknown),
      },
    };
  });
}

const cache = new Map();
function rowsOf(run) {
  if (!cache.has(run.id)) cache.set(run.id, run.kind === 'console' ? consoleRows(run.entries) : traceRows(run.snapshot.events));
  return cache.get(run.id);
}

// What the page must show at 0-based `index` of `run`: every console or trace state line, the announcement, the producing entry and each row.
function expectedFor(run, index) {
  const rows = rowsOf(run);
  const row = rows[index];
  const traceHead = `${LABEL[row.mark].toLowerCase()} (${row.detail})`;
  return {
    rows, row, n: rows.length, lines: row.lines, ids: run.kind === 'console' ? CONSOLE_LINES : TRACE_LINES,
    announcement: `Position ${index + 1} of ${rows.length}: ${run.kind === 'console' ? headline(row) : traceHead}; ${plural(row.failed, 'failed event')} so far${row.unknown > 0 ? `, ${row.unknown} unknown` : ''}`,
    producing: `Producing entry: ${LABEL[row.mark]}. ${entryText(row.entry)}`,
    verified: `Verified: ${rows.length} of ${rows.length} positions recomputed from the recorded entries match the displayed states.`,
    rowClass: (i) => (FAILED.includes(rows[i].mark) ? 'failed' : UNKNOWN.includes(rows[i].mark) ? 'unknown' : 'ok'),
  };
}

function hitsFor(run) {
  const rows = rowsOf(run);
  const at = (test) => rows.flatMap((row, i) => (test(row) ? [i] : []));
  return { gap: at((row) => row.gap), failure: at((row) => FAILED.includes(row.mark)), unknown: at((row) => UNKNOWN.includes(row.mark)), epoch: at((row) => row.change) };
}

function appliedIndex(run) {
  if (run.kind !== 'console') return new Map();
  return new Map(rowsOf(run).flatMap((row) => (row.mark === 'applied' ? [[`${row.state.epoch}:${row.state.lastSeq}`, row.index]] : [])));
}

module.exports = Object.freeze({ expectedFor, hitsFor, appliedIndex, rowsOf, consoleRows, traceRows, headline, entryText, FAILED, UNKNOWN, LABEL, LINE_LABELS, CONSOLE_LINES, TRACE_LINES });
