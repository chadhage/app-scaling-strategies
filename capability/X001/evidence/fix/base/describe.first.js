(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'X001Describe', { value: factory() });
}(globalThis, function () {
  'use strict';

  // Pure wording for a position and for the limits of a recording. Every number is read from the model's answer; nothing is
  // computed here and recorded text is clipped to plain ASCII, so a hostile recording can only ever show a harmless label.
  const LABELS = Object.freeze({
    applied: 'APPLIED', duplicate: 'DUPLICATE (dropped, not a new event)', 'out-of-order': 'OUT OF ORDER (dropped)', rejected: 'REJECTED (failed)',
    'unknown-event': 'UNKNOWN EVENT TYPE (rejected)', failure: 'FAILED (typed failure)', 'failure-unrecognized': 'UNKNOWN FAILURE (operator review needed)',
    'unknown-entry': 'UNKNOWN ENTRY (changed nothing)', control: 'SESSION ACTION', 'no-effect': 'RECORDED, CHANGED NOTHING',
    started: 'ATTEMPT STARTED', 'read-started': 'READ STARTED', 'read-acknowledged': 'READ ACKNOWLEDGED', held: 'BOUNDARY HELD', resumed: 'RESUMED',
    observed: 'OBSERVED', failed: 'FAILED (HTTP 404 reply)', 'unknown-outcome': 'UNKNOWN OUTCOME (interrupted)', reset: 'VIEW RESET (history kept)',
    'unknown-code': 'UNKNOWN ACTION CODE',
  });

  const clip = (value, limit = 60) => String(value).replace(/[^\x20-\x7e]/g, '?').slice(0, limit);
  const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;
  const label = (mark) => (Object.hasOwn(LABELS, mark) ? LABELS[mark] : 'UNKNOWN');
  const range = (from, to) => (from === to ? `sequence ${from}` : `sequences ${from} to ${to === null ? 'the end of the run' : to}`);

  function entryText(entry) {
    if (entry === null || typeof entry !== 'object') return clip(JSON.stringify(entry) ?? 'undefined', 80);
    const type = typeof entry.type === 'string' ? clip(entry.type, 20) : null;
    if (type === 'event') return `event ${clip(entry.event, 24)} ${clip(entry.id, 40)}`;
    if (type === 'failure') return `typed failure ${clip(entry.failure && entry.failure.error ? entry.failure.error.code : entry.failure && entry.failure.code, 40)}`;
    if (type !== null) return type;
    return `${clip(entry.code, 40)} ${clip(entry.attemptId, 40)}`;
  }

  const stepWording = (answer) => {
    const { step, of } = answer.entry.data || {};
    if (!Number.isSafeInteger(step) || !Number.isSafeInteger(of)) return 'an event was applied';
    if (answer.entry.event === 'run-started') return `run started (step ${step} of ${of})`;
    return answer.entry.event === 'run-completed' ? `run completed (step ${step} of ${of})` : `step ${step} of ${of} completed`;
  };

  function headline(answer) {
    const detail = clip(answer.detail === null ? '' : answer.detail);
    switch (answer.mark) {
      case 'applied': return stepWording(answer);
      case 'duplicate': return 'a duplicate delivery was dropped; nothing new was applied';
      case 'out-of-order': return 'an out-of-order delivery was dropped; nothing new was applied';
      case 'rejected': return `a delivery was rejected (${detail}); nothing was applied`;
      case 'unknown-event': return 'an unknown event type was rejected; nothing was applied';
      case 'failure': return `typed failure ${detail}`;
      case 'failure-unrecognized': return 'an unrecognised failure; operator review is needed';
      case 'unknown-entry': return 'an unrecognised recorded entry; it changed nothing';
      case 'control': return `session action ${detail}`;
      case 'no-effect': return `session action ${detail} was recorded and changed nothing`;
      default: return `${label(answer.mark).toLowerCase()} (${detail})`;
    }
  }

  function announce(answer) {
    const { failed, unknown } = answer.tallies;
    const tail = unknown > 0 ? `, ${unknown} unknown` : '';
    return `Position ${answer.position} of ${answer.of}: ${headline(answer)}; ${plural(failed, 'failed event')} so far${tail}`;
  }

  function stateLines(answer) {
    const { state, tallies } = answer;
    const common = [['failed', 'Failed entries so far', tallies.failed], ['unknown', 'Unknown entries so far', tallies.unknown]];
    if (state.attempts) {
      const count = (phase) => state.attempts.filter((attempt) => attempt.phase === phase).length;
      return [
        ['attempts', 'Attempts started', state.attempts.length], ['observed', 'Attempts observed', count('observed')],
        ['failed-attempts', 'Attempts failed', count('failed')], ['unknown-attempts', 'Attempts with unknown outcome', count('unknown')],
        ['running', 'Attempts running or held', count('running') + count('paused')], ...common,
      ].map(([id, name, value]) => ({ id: `st-${id}`, label: name, value: String(value) }));
    }
    const { counts } = state;
    const ranges = state.gaps.map((gap) => `epoch ${gap.epoch}: ${range(gap.skippedFrom, gap.skippedTo)} not recorded`).join('; ');
    const marker = state.marker ? `${state.marker.kind}${state.marker.outcome ? ` (${state.marker.outcome})` : ''}` : 'none';
    return [
      ['connection', 'Connection', state.connection], ['epoch', 'Epoch', state.epoch === null ? 'none yet' : state.epoch],
      ['last', 'Last applied event', state.lastId === null ? 'none yet' : state.lastId], ['applied', 'Applied events', counts.applied],
      ['duplicates', 'Dropped duplicates', counts.duplicates], ['out-of-order', 'Dropped out of order', counts.outOfOrder],
      ['rejected', 'Rejected deliveries', counts.rejected], ['reconnects', 'Reconnects', counts.reconnects], ['resyncs', 'Resyncs', counts.resyncs],
      ['gaps', 'Gaps', state.gaps.length === 0 ? 'none' : `${state.gaps.length} (${ranges})`], ['epoch-changes', 'Epoch changes', state.epochChanges.length],
      ['marker', 'Last reconnect marker', marker], ['failure', 'Standing failure', state.failure ? state.failure.error.code : 'none'],
      ['completed', 'Run completed', state.completed ? 'yes' : 'no'], ...common,
    ].map(([id, name, value]) => ({ id: `st-${id}`, label: name, value: String(value) }));
  }

  function limitLines(limits) {
    const lines = [`Recording: ${limits.status}. ${plural(limits.positions, 'position')} recorded.`];
    for (const epoch of limits.epochs) {
      const total = epoch.total === null ? 'an unknown total' : `${epoch.total} produced`;
      lines.push(`Epoch ${epoch.epoch}: ${range(epoch.firstSeq, epoch.lastSeq)} recorded (${plural(epoch.recorded, 'event')} of ${total})${epoch.complete ? ', complete' : ''}.`);
    }
    for (const gap of limits.notRecorded) lines.push(`NOT RECORDED (${gap.why}): epoch ${gap.epoch}, ${range(gap.from, gap.to)}.`);
    for (const change of limits.epochChanges) lines.push(`Epoch change ${change.from} to ${change.to} at position ${change.position}.`);
    if (limits.duplicates.length) lines.push(`Dropped duplicates (never shown as new events) at positions ${limits.duplicates.join(', ')}.`);
    if (limits.outOfOrder.length) lines.push(`Dropped out-of-order deliveries at positions ${limits.outOfOrder.join(', ')}.`);
    for (const item of limits.failed) lines.push(`FAILED at position ${item.position}: ${label(item.mark)} ${clip(item.detail)}.`);
    for (const item of limits.unknown) lines.push(`UNKNOWN at position ${item.position}: ${label(item.mark)} ${clip(item.detail)}.`);
    for (const attempt of limits.attempts) {
      const end = attempt.endPosition === null ? 'no terminal event recorded, outcome unknown' : `ended at position ${attempt.endPosition}`;
      lines.push(`Attempt ${clip(attempt.attemptId)}: ${attempt.classification}, ${attempt.requests} requests, ${attempt.responses} responses, started at position ${attempt.startPosition}, ${end}.`);
    }
    return lines;
  }

  // What a position says about the limits of the recording right at the entry where they show: the exact range that was never recorded.
  function notes(flags) {
    const found = [];
    if (flags.gap) found.push(`GAP BEFORE: epoch ${flags.gap.epoch} ${range(flags.gap.skippedFrom, flags.gap.skippedTo)} NOT RECORDED`);
    if (flags.epochChange) found.push(`EPOCH CHANGE ${flags.epochChange.fromEpoch} to ${flags.epochChange.toEpoch}`);
    return found.join('; ');
  }

  // The typed NOT_RECORDED answer of a sequence lookup, worded with its exact range; never the nearest state.
  function notRecordedText(answer, epoch, seq, kind) {
    if (kind === 'trace') return 'NOT_RECORDED: this recording is a client trace; it has no run epochs or sequence numbers.';
    const span = answer.range ? range(answer.range.from, answer.range.to) : '';
    const reasons = {
      gap: `lies in a gap; ${span} were never recorded`,
      'before-recorded': `is before the first recorded event; ${span} were not recorded`,
      'after-recorded': `is after the last recorded event; ${span} were not recorded`,
    };
    const why = Object.hasOwn(reasons, answer.reason) ? reasons[answer.reason] : `has no recorded event (epoch ${epoch} is not in this recording)`;
    return `NOT_RECORDED: sequence ${seq} of epoch ${epoch} ${why}. No nearby state is shown instead.`;
  }

  return Object.freeze({ LABELS, label, clip, entryText, headline, announce, stateLines, limitLines, notes, notRecordedText });
}));
