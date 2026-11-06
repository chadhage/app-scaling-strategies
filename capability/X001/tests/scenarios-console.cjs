'use strict';

// Saved C044 console sessions, recorded from the ACCEPTED producer: createRun with a manual scheduler (nothing runs by itself; this
// script calls produce()), typed refusals from resolveCursor and window replays from attach. Used only to BUILD saved.js and by the
// provenance test; the model and the page never load the producer.
const cursors = require('..\\..\\C044\\cursor.js');
const { createRun } = require('..\\..\\C044\\run.cjs');

const RUN = 'synthetic-run-001';
const manual = Object.freeze({ every() { return () => {}; }, after() { return () => {}; } });
const clone = (value) => JSON.parse(JSON.stringify(value));
const id = (epoch, seq) => cursors.format(RUN, epoch, seq);

function session(epoch, options = {}) {
  const run = createRun({ context: { runId: RUN, epoch, origin: 'x001-recording', stateSha256: '0'.repeat(64) }, scheduler: manual,
    totalSteps: 20, replayWindow: 8, ...options });
  run.start();
  const out = [];
  const api = {
    run, out,
    act(type, extra = {}) { out.push({ type, ...extra }); return api; },
    deliver(event) { out.push({ type: 'event', id: event.id, event: event.event, data: clone(event.data) }); return api; },
    live(count) { for (let i = 0; i < count; i++) api.deliver(run.produce()); return api; },
    detachedProduce(count) { for (let i = 0; i < count; i++) run.produce(); return api; },
    replay(afterSeq) { for (const event of run.attach(afterSeq, () => {}).replay) api.deliver(event); return api; },
    refuse(cursor) { out.push({ type: 'failure', failure: clone(run.resolveCursor({ header: cursor }).failure) }); return api; },
  };
  return api;
}

function producerOf(run) { return { runId: RUN, totalSteps: run.totalSteps, lastSeq: run.lastSeq, replayWindow: run.replayWindow }; }
const source = { producer: 'C044', accepted: 'kanban/C044/227be39bc2dc', how: 'createRun with a manual scheduler; typed failures from resolveCursor; replays from attach' };
const saved = (idText, title, run, entries) => ({ format: 'X001-saved-run/1', id: idText, title, kind: 'console', source, producer: producerOf(run), entries });

function restartGap() {
  const one = session(1);
  const stale = id(1, 9);
  one.act('connect').act('open').live(9).act('disconnect', { by: 'network' }).detachedProduce(11)
    .act('reconnect', { cursor: stale, rewound: 0, automatic: true }).refuse(stale)
    .act('resync').act('reconnect', { cursor: null, rewound: 0, automatic: false }).act('open').replay(null)
    .act('reconnect', { cursor: id(1, 17), rewound: 3, automatic: false }).act('open').replay(17)
    .act('disconnect', { by: 'network' });
  // The server restarts under epoch 2 while the console is detached: the old cursor is refused, the console resyncs.
  const old = id(1, 20);
  const two = session(2);
  two.detachedProduce(5).act('reconnect', { cursor: old, rewound: 0, automatic: true }).refuse(old)
    .act('resync').act('reconnect', { cursor: null, rewound: 0, automatic: false }).act('open').replay(null).live(3);
  return saved('c044-restart-gap', 'C044 console session: expired window (gap), replayed duplicates and a server restart', one.run,
    [...one.out, ...two.out]);
}

function complete() {
  const one = session(1);
  one.act('connect').act('open').live(22);
  return saved('c044-complete', 'C044 console session: one complete run, no gap, no duplicate', one.run, one.out);
}

function truncated() {
  const one = session(1);
  one.act('connect').act('open').live(15);
  return saved('c044-truncated', 'C044 console session cut off at 15 of 22 events (INCOMPLETE)', one.run, one.out);
}

module.exports = Object.freeze({ RUN, id, session, clone, saved, restartGap, complete, truncated });
