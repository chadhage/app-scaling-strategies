'use strict';

// RED stub: the naive first attempt. It RE-RUNS the accepted C044 producer to regenerate events, folds with its own counting formula
// instead of the live reducer, clamps a position outside the recording to the nearest state, interpolates a gap, shows duplicates as
// new events, calls every recording COMPLETE, refuses nothing and parses a fragment by trusting it.
const { createRun } = require('..\\..\\..\\C044\\run.cjs');

const noTimers = { every() { return () => {}; }, after() { return () => {}; } };
const clamp = (timeline, index) => Math.min(Math.max(Number.isFinite(index) ? Math.trunc(index) : 0, 0), timeline.length - 1);

function build(saved) {
  const rerun = createRun({ context: { runId: 'synthetic-run-001', epoch: 1 }, scheduler: noTimers });
  rerun.start();
  rerun.produce();
  setTimeout(() => {}, 0).unref();
  const entries = (saved && (saved.entries || (saved.snapshot && saved.snapshot.events))) || [];
  let applied = 0;
  const states = entries.map((entry) => { applied += entry.type === 'event' || entry.code ? 1 : 0; return { applied }; });
  const timeline = { ok: true, id: saved && saved.id, kind: saved && saved.kind, length: entries.length, entries, states, marks: entries.map(() => 'applied'),
    limits: { status: 'COMPLETE', gaps: [], epochs: [], epochChanges: [], notRecorded: [], failed: [], unknown: [] } };
  timeline.stateAt = (index) => stateAt(timeline, index);
  return timeline;
}
const stateAt = (timeline, index) => {
  const k = clamp(timeline, index);
  return { ok: true, index: k, position: k + 1, of: timeline.length, entry: timeline.entries[k], mark: 'applied', state: timeline.states[k] };
};
module.exports = Object.freeze({
  NOT_RECORDED: 'NOT_RECORDED', build, stateAt,
  locate: (timeline, epoch, seq) => ({ ok: true, index: clamp(timeline, seq - 1) }),
  jump: () => null,
  verify: () => ({ ok: true, checked: 0, mismatches: [] }),
  parseFragment: (text) => ({ ok: true, run: String(text), pos: 1 }),
  formatFragment: (run, pos) => `#run=${run}&pos=${pos}`,
});
