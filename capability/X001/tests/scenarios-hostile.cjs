'use strict';

// Hostile fictional console set (real producer events, tampered by this script) and the C034 saved traces: the two accepted
// traces are read from the accepted evidence bundle, the hostile ones are mutated copies that the accepted decoder must refuse.
const fs = require('node:fs');
const path = require('node:path');
const { session, clone, saved } = require('.\\scenarios-console.cjs');

function hostileMix() {
  const s = session(1);
  const ev = [null];
  for (let i = 1; i <= 12; i++) ev.push(s.run.produce());
  const put = (event, patch = {}) => { s.out.push({ type: 'event', id: event.id, event: event.event, data: clone(event.data), ...patch }); };
  s.act('connect').act('open');
  put(ev[1]); put(ev[2]); put(ev[3]);
  put(ev[4], { data: { ...clone(ev[4].data), seq: 5 } });
  put(ev[4], { event: 'step-failed' });
  put(ev[9]);
  put(ev[4]);
  put(ev[6]);
  put(ev[5]); put(ev[6]);
  put(ev[6]);
  s.out.push({ type: 'event', id: '../../etc/passwd', event: 'step-completed', data: {} });
  put({ ...ev[7], id: 'synthetic-run-002:1:7' }, { data: { ...clone(ev[7].data), runId: 'synthetic-run-002' } });
  s.out.push({ type: 'teleport', to: 'sequence 99' });
  s.out.push({ type: 'failure', failure: { code: 'TOTALLY_NEW', message: 'not in the closed table' } });
  s.act('notice', { code: 'REINSPECTED' }).act('reconnect', { cursor: null, rewound: 0, automatic: true }).act('open');
  put(ev[7]); put(ev[8]); put(ev[9]); put(ev[10]); put(ev[10]);
  const run = saved('c044-hostile-mix', 'Fictional hostile console set: tampered, reordered, foreign, malformed and unknown deliveries', s.run, s.out);
  return { ...run, source: { ...run.source, hostile: true, how: 'real producer events tampered by tests\\scenarios-hostile.cjs' } };
}

const bundlePath = path.join(__dirname, '..', '..', 'C034', 'evidence', 'raw', 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116', 'bundle.json');
const traceSource = { producer: 'C034', accepted: 'kanban/C034/01cc2dceb8ea', bundle: 'trace-7d3b0b84-675e-4f9b-92a4-2ea3b89e0116' };
const acceptedSnapshot = (id) => clone(JSON.parse(fs.readFileSync(bundlePath, 'utf8')).traces.find((entry) => entry.id === id).snapshot);
const trace = (id, title, snapshot, extra = {}) => ({ format: 'X001-saved-run/1', id, title, kind: 'trace', source: { ...traceSource, ...extra }, snapshot });

function traces() {
  const closed = () => acceptedSnapshot('closed-history');
  const reordered = closed();
  [reordered.events[1], reordered.events[2]] = [reordered.events[2], reordered.events[1]];
  const truncated = closed();
  truncated.events = truncated.events.slice(0, 20);
  const tampered = closed();
  tampered.events[7].elapsedMs += 1;
  const unknown = closed();
  unknown.events[7].code = 'TWO_READ_LOCAL_SEGMENT_VANISHED';
  const hostile = { hostile: true };
  return [
    trace('c034-closed-history', 'C034 saved client trace: six attempts, observed, failed (404) and unknown (stop, reset)', closed()),
    trace('c034-held-snapshot', 'C034 saved client trace: a held attempt that never finished (INCOMPLETE)', acceptedSnapshot('held-snapshot')),
    trace('c034-reordered', 'Hostile C034 trace: two adjacent actions swapped', reordered, hostile),
    trace('c034-truncated', 'Hostile C034 trace: cut off after 20 of 43 actions', truncated, hostile),
    trace('c034-tampered', 'Hostile C034 trace: one elapsed time changed', tampered, hostile),
    trace('c034-unknown-code', 'Hostile C034 trace: an unrecognised action code', unknown, hostile),
  ];
}

module.exports = Object.freeze({ hostileMix, traces, bundlePath });
