'use strict';

// Review fix F1 (page): REPRO 2 of the verdict, driven through the real page.js, reducer.js and cursor.js under the DOM stub.
const assert = require('node:assert/strict');
const test = require('node:test');
const cursors = require('../cursor.js');
const { loadPage } = require('./dom-stub.cjs');

const run = 'synthetic-run-001';
const id = (seq, epoch = 3) => cursors.format(run, epoch, seq);
const data = (seq, epoch = 3) => ({ runId: run, epoch, seq, step: seq - 1, of: 500, note: `synthetic step ${seq}` });
const deliver = (source, seq, epoch = 3) => source.emit(seq === 1 ? 'run-started' : 'step-completed', id(seq, epoch), data(seq, epoch));
const range = (from, to) => Array.from({ length: to - from + 1 }, (_, index) => from + index);
const snapshot = (produced) => ({ counters: { produced, clientsAttached: 1 }, run: { headSeq: produced, status: 'running' } });
const typed = (code, headSeq, replayWindow, epoch = 3) => JSON.parse(JSON.stringify(cursors.failure(code, {
  runId: run, epoch, headSeq, firstRetainedSeq: Math.max(1, headSeq - replayWindow + 1), replayWindow,
}, id(13))));
const loggedIds = (page) => page.items('log').map((text) => text.split(' · ')[0]);

async function refuseAndResync(page, rewind, failure) {
  page.elements.disconnect.click();
  page.elements.rewind.value = String(rewind);
  page.elements.reconnect.click();
  const refused = page.sources.at(-1);
  refused.fail(2);
  await page.flush();
  const resync = page.elements.actions.children.find((button) => button.textContent === 'Resync from snapshot');
  assert.ok(resync, `Resync is offered for ${failure.error.code}`);
  resync.click();
  const fresh = page.sources.at(-1);
  assert.equal(fresh.url, '/stream', 'a resync opens a fresh cursorless stream');
  fresh.open();
  return fresh;
}

test('F1 page: after Resync no id is repeated in #log, #count-duplicates equals the overlap and the marker is truthful', async () => {
  const failure = typed('CURSOR_EXPIRED', 73, 40);
  const page = loadPage({ fetchHandler: (url) => (url.startsWith('/cursor') ? failure : snapshot(73)) });
  page.sources[0].open();
  for (const seq of range(1, 73)) deliver(page.sources[0], seq);
  const fresh = await refuseAndResync(page, 60, failure);
  assert.equal(page.sources[1].url, `/stream?lastEventId=${encodeURIComponent(id(13))}`, 'the page re-requested 60 applied events');
  for (const seq of range(39, 78)) deliver(fresh, seq);
  assert.deepEqual(loggedIds(page), range(1, 78).map((seq) => id(seq)), 'no id appears twice');
  assert.equal(page.texts('count-duplicates'), '35');
  assert.equal(page.texts('count-applied'), '78');
  assert.equal(page.items('dropped').length, 35);
  assert.ok(page.items('dropped').every((text) => text.startsWith('dropped duplicate: synthetic-run-001:3:')));
  assert.equal(page.texts('cursor'), `Last applied id: ${id(78)}`);
  assert.match(page.texts('marker'), /^resynced after id synthetic-run-001:3:73: nothing was skipped/);
  assert.doesNotMatch(page.texts('marker'), /is a gap/, 'the marker never claims a gap that did not happen');
  assert.match(page.texts('notice'), /^Resynced from the oldest retained event\./);
});

test('F1 page: a window that starts after the cursor shows the exact skipped range once and applies every event once', async () => {
  const failure = typed('CURSOR_EXPIRED', 79, 40);
  const page = loadPage({ fetchHandler: (url) => (url.startsWith('/cursor') ? failure : snapshot(79)) });
  page.sources[0].open();
  for (const seq of range(1, 13)) deliver(page.sources[0], seq);
  const fresh = await refuseAndResync(page, 0, failure);
  assert.match(page.texts('marker'), /^resynced after id synthetic-run-001:3:13: waiting for the first retained event$/);
  for (const seq of range(40, 79)) deliver(fresh, seq);
  assert.equal(page.texts('marker'), `resynced after id ${id(13)}: skipped sequences 14 to 39 (26 events are no longer retained)`);
  assert.deepEqual(loggedIds(page), [...range(1, 13), ...range(40, 79)].map((seq) => id(seq)));
  assert.deepEqual([page.texts('count-duplicates'), page.texts('count-applied')], ['0', '53']);
});

test('F1 page: a restart under a new epoch starts that epoch at its own beginning and never shows an old id again', async () => {
  const failure = typed('CURSOR_EPOCH_MISMATCH', 4, 40, 4);
  const page = loadPage({ fetchHandler: (url) => (url.startsWith('/cursor') ? failure : snapshot(4)) });
  page.sources[0].open();
  for (const seq of range(1, 20)) deliver(page.sources[0], seq);
  const fresh = await refuseAndResync(page, 0, failure);
  for (const seq of range(1, 4)) deliver(fresh, seq, 4);
  assert.deepEqual(loggedIds(page), [...range(1, 20).map((seq) => id(seq)), ...range(1, 4).map((seq) => id(seq, 4))]);
  assert.equal(page.texts('marker'), `resynced after id ${id(20)}: epoch 4 started, its events count from its own beginning`);
  deliver(fresh, 21, 3);
  assert.equal(page.texts('count-rejected'), '1', 'an old-epoch event is rejected, never applied again');
  assert.equal(page.items('log').length, 24);
});

test('F1 page: a resync that has not delivered yet stays cursorless when the stream is lost and re-opened', async () => {
  const failure = typed('CURSOR_EXPIRED', 90, 40);
  const page = loadPage({ fetchHandler: (url) => (url.startsWith('/cursor') ? failure : snapshot(90)) });
  page.sources[0].open();
  for (const seq of range(1, 10)) deliver(page.sources[0], seq);
  const fresh = await refuseAndResync(page, 0, failure);
  fresh.fail(0);
  await page.flush();
  page.runTimers();
  await page.flush();
  assert.equal(page.sources.at(-1).url, '/stream', 'no old cursor is sent before the resync has delivered anything');
  page.sources.at(-1).open();
  for (const seq of range(51, 60)) deliver(page.sources.at(-1), seq);
  assert.equal(page.texts('count-applied'), '20');
  assert.match(page.texts('marker'), /^resynced after id synthetic-run-001:3:10: skipped sequences 11 to 50 /);
});
