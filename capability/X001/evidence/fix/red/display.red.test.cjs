'use strict';

// RED of the fix for review findings F3 (the display oracle compared 8 of the 16 console state lines, so four displayed lines could be wrong
// without any test failing) and F5 (the page branch "VERIFICATION FAILED" had no test). FROZEN. The display of the first publication is
// correct, so the RED is a MUTATION RED: replayed with the reviewer's surviving mutants D1, D2, D6, D7 and P12 applied to the first-publication
// bytes (node --require tests\base-shim.cjs with X001_BASE_MUTANTS=D1,D2,D6,D7,P12) one named test per displayed line fails; replayed unchanged
// against the final code every test passes. The oracle below is independent of timeline.js and describe.js: it folds the recorded entries with
// the C044 reducer itself and words every line from the fold.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ns = path.resolve(__dirname, '..', '..', '..');
const { loadPage } = require(path.join(ns, 'tests', 'dom-stub.cjs'));
const Reducer = require(path.resolve(ns, '..', 'C044', 'reducer.js'));
const saved = require(path.join(ns, 'saved.js'));

const ACTIONS = ['connect', 'open', 'disconnect', 'reconnect', 'event', 'failure', 'resync', 'notice', 'stop', 'counters'];
const CONSOLE_LINES = ['st-connection', 'st-epoch', 'st-last', 'st-applied', 'st-duplicates', 'st-out-of-order', 'st-rejected', 'st-reconnects', 'st-resyncs', 'st-gaps',
  'st-epoch-changes', 'st-marker', 'st-failure', 'st-completed', 'st-failed', 'st-unknown'];
const TRACE_LINES = ['st-attempts', 'st-observed', 'st-failed-attempts', 'st-unknown-attempts', 'st-running', 'st-failed', 'st-unknown'];
const valid = saved.runs.filter((run) => !run.source.hostile || run.kind === 'console');

const range = (from, to) => (from === to ? `sequence ${from}` : `sequences ${from} to ${to}`);
const gapsText = (state) => (state.gaps.length === 0 ? 'none' : `${state.gaps.length} (${state.gaps.map((gap) => `epoch ${gap.epoch}: ${range(gap.skippedFrom, gap.skippedTo)} not recorded`).join('; ')})`);
const markerText = (state) => (state.marker ? `${state.marker.kind}${state.marker.outcome ? ` (${state.marker.outcome})` : ''}` : 'none');

function consoleExpected(entries) {
  let state = Reducer.initial();
  let failed = 0;
  let unknown = 0;
  return entries.map((entry) => {
    const before = state;
    state = Reducer.reduce(state, entry);
    let mark = 'control';
    if (!entry || typeof entry !== 'object' || !ACTIONS.includes(entry.type)) mark = 'unknown-entry';
    else if (entry.type === 'event') {
      const grew = (key) => state.counts[key] - before.counts[key] > 0;
      if (grew('applied')) mark = 'applied';
      else if (grew('duplicates')) mark = 'duplicate';
      else if (grew('outOfOrder')) mark = 'out-of-order';
      else mark = state.dropped[state.dropped.length - 1].reason === 'unknown-event' ? 'unknown-event' : 'rejected';
    } else if (entry.type === 'failure') mark = state.failure.error.code === 'UNRECOGNIZED_ERROR' ? 'failure-unrecognized' : 'failure';
    else if (state === before) mark = 'no-effect';
    if (['rejected', 'failure'].includes(mark)) failed += 1;
    if (['unknown-event', 'failure-unrecognized', 'unknown-entry'].includes(mark)) unknown += 1;
    const { counts } = state;
    return {
      'st-connection': state.connection, 'st-epoch': state.epoch === null ? 'none yet' : String(state.epoch), 'st-last': state.lastId === null ? 'none yet' : state.lastId,
      'st-applied': String(counts.applied), 'st-duplicates': String(counts.duplicates), 'st-out-of-order': String(counts.outOfOrder), 'st-rejected': String(counts.rejected),
      'st-reconnects': String(counts.reconnects), 'st-resyncs': String(counts.resyncs), 'st-gaps': gapsText(state), 'st-epoch-changes': String(state.epochChanges.length),
      'st-marker': markerText(state), 'st-failure': state.failure ? state.failure.error.code : 'none', 'st-completed': state.completed ? 'yes' : 'no',
      'st-failed': String(failed), 'st-unknown': String(unknown),
    };
  });
}

function traceExpected(events) {
  const phases = new Map();
  let failed = 0;
  let unknown = 0;
  return events.map((event) => {
    if (event.code === 'ORIGINAL_ATTEMPT_STARTED') phases.set(event.attemptId, 'running');
    if (event.code === 'BOUNDARY_HELD') phases.set(event.attemptId, 'paused');
    if (event.code === 'RESUME_ORIGINAL_ATTEMPT') phases.set(event.attemptId, 'running');
    if (event.code === 'TWO_READ_LOCAL_SEGMENT_OBSERVED') phases.set(event.attemptId, 'observed');
    if (event.code === 'FAILED_HTTP_REPLY_404') { phases.set(event.attemptId, 'failed'); failed += 1; }
    if (event.code === 'INTERRUPTED_BY_STOP' || event.code === 'INTERRUPTED_BY_RESET') { phases.set(event.attemptId, 'unknown'); unknown += 1; }
    const count = (...names) => [...phases.values()].filter((phase) => names.includes(phase)).length;
    return {
      'st-attempts': String(phases.size), 'st-observed': String(count('observed')), 'st-failed-attempts': String(count('failed')), 'st-unknown-attempts': String(count('unknown')),
      'st-running': String(count('running', 'paused')), 'st-failed': String(failed), 'st-unknown': String(unknown),
    };
  });
}

// Every position of every valid saved run as the page shows it (one page per run, positions by fragment) next to the independent fold.
let cache = null;
function table() {
  if (cache) return cache;
  cache = valid.map((run) => {
    const page = loadPage({ hash: `#run=${run.id}&pos=1` });
    const expected = run.kind === 'console' ? consoleExpected(run.entries) : traceExpected(run.snapshot.events);
    const shown = expected.map((_, index) => {
      page.changeHash(`#run=${run.id}&pos=${index + 1}`);
      const nodes = page.$('state').descendants().filter((node) => node.id);
      return { ids: nodes.map((node) => node.id), lines: Object.fromEntries(nodes.map((node) => [node.id, node.textContent])) };
    });
    return { run, expected, shown };
  });
  return cache;
}

test('the state panel of a console run lists exactly the sixteen lines, in order, at every position', () => {
  for (const { run, shown } of table().filter((item) => item.run.kind === 'console')) shown.forEach((position, index) => assert.deepEqual(position.ids, CONSOLE_LINES, `${run.id} position ${index + 1}`));
});

test('the state panel of a trace lists exactly its attempt lines and the two tallies, in order, at every position', () => {
  for (const { run, shown } of table().filter((item) => item.run.kind === 'trace')) shown.forEach((position, index) => assert.deepEqual(position.ids, TRACE_LINES, `${run.id} position ${index + 1}`));
});

for (const id of CONSOLE_LINES) {
  test(`display line ${id} equals the independent fold at every position of every console run`, () => {
    let checked = 0;
    for (const { run, expected, shown } of table().filter((item) => item.run.kind === 'console')) {
      shown.forEach((position, index) => { assert.equal(position.lines[id], expected[index][id], `${run.id} position ${index + 1}`); checked += 1; });
    }
    assert.equal(checked, table().filter((item) => item.run.kind === 'console').reduce((sum, item) => sum + item.run.entries.length, 0), 'every position of the four console runs was compared');
    assert.ok(checked > 100);
  });
}

for (const id of TRACE_LINES) {
  test(`display line ${id} equals the independent fold at every position of every valid trace`, () => {
    let checked = 0;
    for (const { run, expected, shown } of table().filter((item) => item.run.kind === 'trace')) {
      shown.forEach((position, index) => { assert.equal(position.lines[id], expected[index][id], `${run.id} position ${index + 1}`); checked += 1; });
    }
    assert.ok(checked > 20, 'every position of the valid traces was compared');
  });
}

test('F5: a verification that fails is shown as VERIFICATION FAILED with its count and the page keeps scrubbing; it is never shown as Verified', () => {
  const anchor = 'jump, verify,';
  const failing = (source) => {
    assert.equal(source.split(anchor).length, 2, 'the export list of timeline.js names verify exactly once');
    return source.replace(anchor, "jump, verify: () => ({ ok: false, checked: 2, mismatches: [{ index: 0, what: 'state' }, { index: 1, what: 'flags' }] }),");
  };
  const page = loadPage({ hash: '#run=c044-complete&pos=3', patch: { 'timeline.js': failing } });
  assert.equal(page.text('verified'), 'VERIFICATION FAILED at 2 positions: do not trust this display.');
  assert.equal(page.position(), 3);
  page.key('ArrowRight');
  assert.equal(page.position(), 4);
  assert.equal(page.text('verified'), 'VERIFICATION FAILED at 2 positions: do not trust this display.');
  const honest = loadPage({ hash: '#run=c044-complete&pos=3' });
  const entries = saved.runs.find((run) => run.id === 'c044-complete').entries.length;
  assert.equal(honest.text('verified'), `Verified: ${entries} of ${entries} positions recomputed from the recorded entries match the displayed states.`);
});
