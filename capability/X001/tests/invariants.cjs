'use strict';

// Global invariants of the rendered page, read back from the DOM after EVERY action (L-0118, L-0119). The oracle is independent of the
// model's answers: a console position is folded here with the C044 reducer and its marks are re-derived from counter changes.
const assert = require('node:assert/strict');
const Reducer = require('..\\..\\C044\\reducer.js');
const D = require('..\\describe.js');
const saved = require('..\\saved.js');

const FAILED = ['rejected', 'failure', 'failed'];
const UNKNOWN = ['unknown-event', 'failure-unrecognized', 'unknown-entry', 'unknown-outcome', 'unknown-code'];
const TRACE = { ORIGINAL_ATTEMPT_STARTED: 'started', TWO_READ_LOCAL_SEGMENT_OBSERVED: 'observed', FAILED_HTTP_REPLY_404: 'failed', INTERRUPTED_BY_STOP: 'unknown-outcome',
  INTERRUPTED_BY_RESET: 'unknown-outcome' };

// Marks of a console run, derived here from counters (no model code involved).
function consoleOracle(entries) {
  let state = Reducer.initial();
  return entries.map((entry, index) => {
    const before = state;
    state = Reducer.reduce(state, entry);
    const delta = (key) => state.counts[key] - before.counts[key];
    let mark = 'control';
    if (entry === null || typeof entry !== 'object' || !['connect', 'open', 'disconnect', 'reconnect', 'event', 'failure', 'resync', 'notice', 'stop', 'counters'].includes(entry.type)) mark = 'unknown-entry';
    else if (entry.type === 'event') {
      mark = delta('applied') ? 'applied' : delta('duplicates') ? 'duplicate' : delta('outOfOrder') ? 'out-of-order'
        : state.dropped[state.dropped.length - 1].reason === 'unknown-event' ? 'unknown-event' : 'rejected';
    } else if (entry.type === 'failure') mark = state.failure.error.code === 'UNRECOGNIZED_ERROR' ? 'failure-unrecognized' : 'failure';
    else if (state === before) mark = 'no-effect';
    return { index, state, mark };
  });
}

function traceOracle(events) {
  return events.map((event, index) => ({ index, mark: TRACE[event.code] || 'other' }));
}

const oracleCache = new Map();
function expectedFor(run, index) {
  if (run.kind === 'console') {
    if (!oracleCache.has(run.id)) oracleCache.set(run.id, consoleOracle(run.entries));
    const steps = oracleCache.get(run.id);
    const upto = steps.slice(0, index + 1);
    return { steps, state: upto[index].state, failed: upto.filter((s) => FAILED.includes(s.mark)).length, unknown: upto.filter((s) => UNKNOWN.includes(s.mark)).length,
      marks: steps.map((s) => s.mark), n: run.entries.length };
  }
  const upto = traceOracle(run.snapshot.events).slice(0, index + 1);
  return { failed: upto.filter((s) => s.mark === 'failed').length, unknown: upto.filter((s) => s.mark === 'unknown-outcome').length,
    started: upto.filter((s) => s.mark === 'started').length, observed: upto.filter((s) => s.mark === 'observed').length, n: run.snapshot.events.length };
}

// Asserts everything the page promises for run `id` shown at 0-based `index`. options.skipError / options.skipStatus leave the error and
// announcement checks to a caller that models refusals (the property test).
function assertShown(page, id, index, label = '', options = {}) {
  const run = saved.runs.find((item) => item.id === id);
  const expected = expectedFor(run, index);
  const ids = page.ids();
  assert.equal(new Set(ids).size, ids.length, `${label} ids are unique`);
  const items = page.$('entries').children;
  assert.equal(items.length, expected.n, `${label} every recorded entry is listed once`);
  assert.deepEqual(['seq-find', 'seq-epoch', 'seq-number'].map((id) => page.$(id).disabled), [false, false, false], `${label} the sequence lookup is available while a run is shown`);
  if (run.kind === 'console') {
    const steps = oracleCache.get(run.id);
    steps.forEach((step, i) => {
      const parts = [];
      const before = i ? steps[i - 1].state : { gaps: [], epochChanges: [] };
      if (step.state.gaps.length > before.gaps.length) {
        const gap = step.state.gaps[step.state.gaps.length - 1];
        parts.push(`GAP BEFORE: epoch ${gap.epoch} ${gap.skippedFrom === gap.skippedTo ? `sequence ${gap.skippedFrom}` : `sequences ${gap.skippedFrom} to ${gap.skippedTo}`} NOT RECORDED`);
      }
      if (step.state.epochChanges.length > before.epochChanges.length) {
        const change = step.state.epochChanges[step.state.epochChanges.length - 1];
        parts.push(`EPOCH CHANGE ${change.fromEpoch} to ${change.toEpoch}`);
      }
      assert.equal(items[i].children[3].textContent, parts.join('; '), `${label} the limits show right where they occur (entry ${i + 1})`);
    });
  }
  items.forEach((item, i) => {
    assert.equal(item.id, `entry-${i + 1}`);
    const here = i === index;
    assert.equal(item.getAttribute('aria-current'), here ? 'step' : null, `${label} one current entry`);
    assert.equal(item.children[2].textContent, here ? 'current position' : '');
    assert.equal(item.className, here ? 'current' : '');
  });
  if (run.kind === 'console') {
    items.forEach((item, i) => {
      assert.equal(item.children[0].textContent, D.label(expected.marks[i]), `${label} text label of entry ${i + 1}`);
      assert.equal(item.dataset.class, FAILED.includes(expected.marks[i]) ? 'failed' : UNKNOWN.includes(expected.marks[i]) ? 'unknown' : 'ok', `${label} failed/unknown never look ok`);
    });
  }
  assert.equal(page.$('saved-run').value, id, `${label} the chooser names the displayed run`);
  assert.equal(page.position(), index + 1);
  assert.equal(page.text('position'), `Position ${index + 1} of ${expected.n}`);
  const slider = page.$('scrub');
  assert.deepEqual(['aria-valuemin', 'aria-valuemax', 'aria-valuenow', 'aria-disabled', 'tabindex'].map((name) => slider.getAttribute(name)), ['1', String(expected.n), String(index + 1), 'false', '0']);
  assert.equal(slider.getAttribute('aria-valuetext') === page.text('status') || options.skipStatus === true, true, `${label} announcement equals the slider text`);
  if (!options.skipStatus) assert.match(page.text('status'), new RegExp(`^Position ${index + 1} of ${expected.n}: .*; ${expected.failed} failed events? so far`));
  assert.equal(page.location.hash, `#run=${id}&pos=${index + 1}`, `${label} the URL names the displayed position`);
  if (!options.skipError) assert.equal(page.text('error'), '', `${label} no error while a valid position is shown`);
  const line = Object.fromEntries(page.$('state').descendants().filter((node) => node.id).map((node) => [node.id, node.textContent]));
  assert.equal(line['st-failed'], String(expected.failed));
  assert.equal(line['st-unknown'], String(expected.unknown));
  if (run.kind === 'console') {
    const { counts } = expected.state;
    assert.deepEqual([line['st-applied'], line['st-duplicates'], line['st-out-of-order'], line['st-rejected']].map(Number),
      [counts.applied, counts.duplicates, counts.outOfOrder, counts.rejected]);
    const delivered = run.entries.slice(0, index + 1).filter((entry) => entry && entry.type === 'event').length;
    assert.equal(delivered, counts.applied + counts.duplicates + counts.outOfOrder + counts.rejected, `${label} delivered = applied + dropped + rejected`);
    for (const gap of expected.state.gaps) {
      assert.ok(line['st-gaps'].includes(gap.skippedFrom === gap.skippedTo ? `sequence ${gap.skippedFrom} ` : `sequences ${gap.skippedFrom} to ${gap.skippedTo} `), `${label} the gap names its exact range`);
    }
    assert.equal(line['st-gaps'] === 'none', expected.state.gaps.length === 0);
    assert.equal(line['st-last'], expected.state.lastId === null ? 'none yet' : expected.state.lastId);
  } else {
    assert.deepEqual([line['st-attempts'], line['st-observed']].map(Number), [expected.started, expected.observed]);
  }
  assert.match(page.text('verified'), new RegExp(`^Verified: ${expected.n} of ${expected.n} positions`));
  assert.deepEqual(page.calls, [], `${label} nothing was fetched, timed or opened`);
  return expected;
}

function hitsFor(run) {
  if (run.kind === 'trace') {
    const at = (codes) => run.snapshot.events.flatMap((event, i) => (codes.includes(event.code) ? [i] : []));
    return { gap: [], failure: at(['FAILED_HTTP_REPLY_404']), unknown: at(['INTERRUPTED_BY_STOP', 'INTERRUPTED_BY_RESET']), epoch: [] };
  }
  expectedFor(run, 0);
  const steps = oracleCache.get(run.id);
  const grew = (key) => steps.flatMap((step, i) => (step.state[key].length > (i ? steps[i - 1].state[key].length : 0) ? [i] : []));
  const marked = (list) => steps.flatMap((step, i) => (list.includes(step.mark) ? [i] : []));
  return { gap: grew('gaps'), failure: marked(FAILED), unknown: marked(UNKNOWN), epoch: grew('epochChanges') };
}

function appliedIndex(run) {
  if (run.kind !== 'console') return new Map();
  expectedFor(run, 0);
  return new Map(oracleCache.get(run.id).flatMap((step) => (step.mark === 'applied' ? [[`${step.state.epoch}:${step.state.lastSeq}`, step.index]] : [])));
}

module.exports = Object.freeze({ assertShown, consoleOracle, expectedFor, hitsFor, appliedIndex, FAILED, UNKNOWN });
