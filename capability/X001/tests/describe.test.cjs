'use strict';

// Unit tests of describe.js: the wording of every mark, the announcement format, the state lines and the limit lines.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const D = require('..\\describe.js');
const saved = require('..\\saved.js');

const timelines = Object.fromEntries(saved.runs.filter((run) => !run.source.hostile || run.kind === 'console').map((run) => [run.id, T.build(run)]));
const answer = (id, index) => timelines[id].stateAt(index);
const first = (id, mark) => answer(id, timelines[id].marks.indexOf(mark));

test('the announcement follows the documented format and counts failures singular and plural', () => {
  const restart = timelines['c044-restart-gap'];
  const text = D.announce(answer('c044-restart-gap', 17));
  assert.equal(text, 'Position 18 of 44: step 12 of 20 completed; 1 failed event so far');
  assert.equal(D.announce(answer('c044-restart-gap', 43)), 'Position 44 of 44: step 7 of 20 completed; 2 failed events so far');
  assert.equal(D.announce(answer('c044-restart-gap', 0)), 'Position 1 of 44: session action connect; 0 failed events so far');
  const mix = timelines['c044-hostile-mix'];
  assert.match(D.announce(mix.stateAt(mix.length - 1)), /; 3 failed events so far, 3 unknown$/);
  assert.equal(restart.length, 44);
});

test('every mark has a text label and an unrecognised mark is UNKNOWN, never success-shaped', () => {
  for (const mark of Object.keys(D.LABELS)) assert.match(D.label(mark), /^[A-Z]/);
  assert.equal(D.label('totally-new'), 'UNKNOWN');
  assert.equal(D.label('__proto__'), 'UNKNOWN');
  assert.equal(D.label('constructor'), 'UNKNOWN');
  assert.match(D.label('rejected'), /failed/);
  assert.match(D.label('failure-unrecognized'), /UNKNOWN/);
  assert.match(D.label('duplicate'), /not a new event/);
});

test('the headline of each kind of position says what happened and never claims success for a drop', () => {
  const mix = 'c044-hostile-mix';
  const lines = Object.fromEntries(['applied', 'duplicate', 'out-of-order', 'rejected', 'unknown-event', 'unknown-entry', 'failure-unrecognized', 'control']
    .map((mark) => [mark, D.headline(first(mix, mark))]));
  assert.equal(lines.applied, 'run started (step 0 of 20)');
  assert.match(lines.duplicate, /^a duplicate delivery was dropped; nothing new was applied$/);
  assert.match(lines['out-of-order'], /out-of-order delivery was dropped/);
  assert.match(lines.rejected, /^a delivery was rejected \(attribution-mismatch\); nothing was applied$/);
  assert.match(lines['unknown-event'], /unknown event type was rejected/);
  assert.match(lines['unknown-entry'], /unrecognised recorded entry/);
  assert.match(lines['failure-unrecognized'], /operator review is needed/);
  assert.equal(lines.control, 'session action connect');
  assert.match(D.headline(first('c044-restart-gap', 'failure')), /^typed failure CURSOR_EXPIRED$/);
  const done = timelines['c044-complete'];
  assert.equal(D.headline(done.stateAt(done.length - 1)), 'run completed (step 20 of 20)');
  assert.equal(D.headline(done.stateAt(done.length - 2)), 'step 20 of 20 completed');
  const odd = T.build({ ...saved.runs[1], id: 'x', entries: [{ type: 'resync' }, { type: 'event', id: 'synthetic-run-001:1:1', event: 'run-started', data: { runId: 'synthetic-run-001', epoch: 1, seq: 1 } }] });
  assert.equal(D.headline(odd.stateAt(0)), 'session action resync was recorded and changed nothing');
  assert.equal(D.headline(odd.stateAt(1)), 'an event was applied');
  assert.match(D.headline({ mark: 'held', detail: 'a1' }), /^boundary held \(a1\)$/);
  assert.match(D.headline({ mark: 'held', detail: null }), /^boundary held \(\)$/);
});

test('the recorded entry is shown as clipped plain text, whatever it holds', () => {
  const entries = timelines['c044-hostile-mix'].entries;
  assert.equal(D.entryText(entries[2]), 'event run-started synthetic-run-001:1:1');
  assert.equal(D.entryText({ type: 'failure', failure: { error: { code: 'CURSOR_EXPIRED' } } }), 'typed failure CURSOR_EXPIRED');
  assert.equal(D.entryText({ type: 'failure', failure: { code: 'TOTALLY_NEW' } }), 'typed failure TOTALLY_NEW');
  assert.equal(D.entryText({ type: 'failure' }), 'typed failure undefined');
  assert.equal(D.entryText({ type: 'teleport' }), 'teleport');
  assert.equal(D.entryText({ code: 'BOUNDARY_HELD', attemptId: 'a1' }), 'BOUNDARY_HELD a1');
  assert.deepEqual([D.entryText(null), D.entryText(undefined), D.entryText(7), D.entryText('x')], ['null', 'undefined', '7', '"x"']);
  assert.equal(D.entryText({ type: 'event', event: '<script>alert(1)</script>', id: '\u0000\u202e'.repeat(40) }).includes('<script'), true);
  assert.equal(/[^\x20-\x7e]/.test(D.entryText({ type: 'event', event: 'é\n\u202e', id: '\t' })), false);
  assert.equal(D.clip('x'.repeat(500)).length, 60);
  assert.equal(D.clip('x'.repeat(500), 5), 'xxxxx');
});

test('the state lines of a console position list every count and the standing failure', () => {
  const restart = timelines['c044-restart-gap'];
  const lines = Object.fromEntries(D.stateLines(restart.stateAt(restart.length - 1)).map((line) => [line.id, line.value]));
  assert.deepEqual([lines['st-applied'], lines['st-duplicates'], lines['st-epoch'], lines['st-last'], lines['st-completed'], lines['st-failed'], lines['st-unknown']],
    ['25', '3', '2', 'synthetic-run-001:2:8', 'no', '2', '0']);
  assert.equal(lines['st-gaps'], '1 (epoch 1: sequences 10 to 12 not recorded)');
  assert.equal(lines['st-epoch-changes'], '1');
  assert.equal(lines['st-failure'], 'none');
  assert.match(lines['st-marker'], /^reconnected$|^resynced \(new-epoch\)$/);
  const start = Object.fromEntries(D.stateLines(restart.stateAt(0)).map((line) => [line.id, line.value]));
  assert.deepEqual([start['st-epoch'], start['st-last'], start['st-marker'], start['st-gaps']], ['none yet', 'none yet', 'none', 'none']);
  const failure = answer('c044-restart-gap', timelines['c044-restart-gap'].marks.indexOf('failure'));
  assert.equal(Object.fromEntries(D.stateLines(failure).map((line) => [line.id, line.value]))['st-failure'], 'CURSOR_EXPIRED');
  const done = timelines['c044-complete'];
  assert.equal(Object.fromEntries(D.stateLines(done.stateAt(done.length - 1)).map((line) => [line.id, line.value]))['st-completed'], 'yes');
  assert.equal(new Set(D.stateLines(restart.stateAt(5)).map((line) => line.id)).size, D.stateLines(restart.stateAt(5)).length);
});

test('the state lines of a trace position count attempts by phase', () => {
  const closed = timelines['c034-closed-history'];
  const lines = Object.fromEntries(D.stateLines(closed.stateAt(42)).map((line) => [line.id, line.value]));
  assert.deepEqual([lines['st-attempts'], lines['st-observed'], lines['st-failed-attempts'], lines['st-unknown-attempts'], lines['st-running'], lines['st-failed'], lines['st-unknown']],
    ['6', '3', '1', '2', '0', '1', '2']);
  assert.equal(D.stateLines(closed.stateAt(1))[4].value, '1');
});

test('the notes show the exact unrecorded range right where it occurs and a sequence lookup is worded as a typed NOT_RECORDED', () => {
  assert.equal(D.notes({ gap: null, epochChange: null }), '');
  assert.equal(D.notes({ gap: { epoch: 1, skippedFrom: 10, skippedTo: 12 }, epochChange: null }), 'GAP BEFORE: epoch 1 sequences 10 to 12 NOT RECORDED');
  assert.equal(D.notes({ gap: { epoch: 2, skippedFrom: 7, skippedTo: 7 }, epochChange: { fromEpoch: 1, toEpoch: 2 } }), 'GAP BEFORE: epoch 2 sequence 7 NOT RECORDED; EPOCH CHANGE 1 to 2');
  const timeline = timelines['c044-restart-gap'];
  const text = (epoch, seq) => D.notRecordedText(timeline.locate(epoch, seq), epoch, seq, 'console');
  assert.equal(text(1, 11), 'NOT_RECORDED: sequence 11 of epoch 1 lies in a gap; sequences 10 to 12 were never recorded. No nearby state is shown instead.');
  assert.equal(text(2, 20), 'NOT_RECORDED: sequence 20 of epoch 2 is after the last recorded event; sequences 9 to 22 were not recorded. No nearby state is shown instead.');
  assert.equal(text(7, 1), 'NOT_RECORDED: sequence 1 of epoch 7 has no recorded event (epoch 7 is not in this recording). No nearby state is shown instead.');
  const mid = T.build({ ...saved.runs[1], id: 'x', entries: saved.runs[1].entries.slice(0, 2).concat(saved.runs[1].entries.slice(6, 9)) });
  assert.match(D.notRecordedText(mid.locate(1, 2), 1, 2, 'console'), /is before the first recorded event; sequences 1 to 4 were not recorded/);
  assert.match(D.notRecordedText({ reason: 'after-recorded', range: { from: 4, to: null } }, 1, 9, 'console'), /sequences 4 to the end of the run were not recorded/);
  assert.match(D.notRecordedText(timelines['c034-closed-history'].locate(1, 1), 1, 1, 'trace'), /^NOT_RECORDED: this recording is a client trace/);
});

test('the limit lines state the status, what is not recorded, every failure and unknown, and each attempt', () => {
  const restart = D.limitLines(timelines['c044-restart-gap'].limits);
  assert.match(restart[0], /^Recording: INCOMPLETE\. 44 positions recorded\.$/);
  assert.ok(restart.includes('Epoch 1: sequences 1 to 20 recorded (17 events of 22 produced).'));
  assert.ok(restart.includes('NOT RECORDED (gap): epoch 1, sequences 10 to 12.'));
  assert.ok(restart.includes('NOT RECORDED (after-last): epoch 1, sequences 21 to 22.'));
  assert.ok(restart.includes('NOT RECORDED (after-last): epoch 2, sequences 9 to 22.'));
  assert.ok(restart.some((line) => /^Epoch change 1 to 2 at position \d+\.$/.test(line)));
  assert.ok(restart.some((line) => /^Dropped duplicates \(never shown as new events\) at positions \d+, \d+, \d+\.$/.test(line)));
  assert.ok(D.limitLines(timelines['c044-complete'].limits).includes('Epoch 1: sequences 1 to 22 recorded (22 events of 22 produced), complete.'));
  const mix = D.limitLines(timelines['c044-hostile-mix'].limits);
  assert.ok(mix.some((line) => /^FAILED at position \d+: REJECTED \(failed\) attribution-mismatch\.$/.test(line)));
  assert.ok(mix.some((line) => /^UNKNOWN at position \d+: UNKNOWN EVENT TYPE \(rejected\) unknown-event\.$/.test(line)));
  assert.ok(mix.some((line) => /^Dropped out-of-order deliveries at positions \d+, \d+\.$/.test(line)));
  const held = D.limitLines(timelines['c034-held-snapshot'].limits);
  assert.ok(held.some((line) => /ended at position 8\./.test(line)));
  assert.ok(held.some((line) => /no terminal event recorded, outcome unknown/.test(line)));
  const noTotal = D.limitLines(T.build({ ...saved.runs[1], id: 'x', producer: null }).limits);
  assert.ok(noTotal.includes('Epoch 1: sequences 1 to 22 recorded (22 events of an unknown total).'));
  const single = D.limitLines(T.build({ ...saved.runs[1], id: 'x', entries: saved.runs[1].entries.slice(0, 3), producer: null }).limits);
  assert.ok(single.includes('Epoch 1: sequence 1 recorded (1 event of an unknown total).'));
  assert.ok(D.limitLines({ ...timelines['c044-truncated'].limits, notRecorded: [{ epoch: 1, from: 16, to: null, why: 'after-last' }] }).includes('NOT RECORDED (after-last): epoch 1, sequences 16 to the end of the run.'));
});
