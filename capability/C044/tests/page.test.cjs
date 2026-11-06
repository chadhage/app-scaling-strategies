'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const cursors = require('../cursor.js');
const { loadPage, markupElements } = require('./dom-stub.cjs');

const run = 'synthetic-run-001';
const id = (seq, epoch = 3) => cursors.format(run, epoch, seq);
const data = (seq, epoch = 3) => ({ runId: run, epoch, seq, step: seq - 1, of: 40, note: `synthetic step ${seq}` });
const deliver = (source, seq, event = 'step-completed') => source.emit(event, id(seq), data(seq));
const snapshot = (produced, status = 'running') => ({ counters: { produced, clientsAttached: 1 }, run: { headSeq: produced, status } });

test('the markup carries every control the page needs and starts disabled and honest', () => {
  const elements = markupElements();
  for (const name of ['connection', 'cursor', 'marker', 'disconnect', 'reconnect', 'rewind', 'failure', 'actions', 'log', 'dropped', 'count-duplicates']) {
    assert.ok(elements[name], name);
  }
  assert.equal(elements.disconnect.disabled, true);
  assert.equal(elements.reconnect.disabled, true);
  assert.equal(elements.rewind.value, '0');
});

test('the page opens one stream, shows state, applies events once and counts a dropped duplicate', async () => {
  const page = loadPage({ fetchHandler: () => snapshot(0) });
  assert.equal(page.sources.length, 1);
  assert.equal(page.sources[0].url, '/stream');
  assert.equal(page.texts('connection'), 'Connection: connecting');
  assert.equal(page.elements.disconnect.disabled, false);
  assert.equal(page.elements.reconnect.disabled, true);
  page.sources[0].open();
  assert.equal(page.texts('connection'), 'Connection: open');
  deliver(page.sources[0], 1, 'run-started');
  deliver(page.sources[0], 2);
  deliver(page.sources[0], 2);
  assert.equal(page.texts('cursor'), `Last applied id: ${id(2)}`);
  assert.equal(page.texts('count-applied'), '2');
  assert.equal(page.texts('count-duplicates'), '1');
  assert.deepEqual(page.items('log'), [`${id(1)} · run-started · synthetic step 1`, `${id(2)} · step-completed · synthetic step 2`]);
  assert.deepEqual(page.items('dropped'), [`dropped duplicate: ${id(2)}`], 'a duplicate is shown as dropped, never as a new event');
  assert.equal(page.elements.log.children[0].className, 'applied');
  assert.equal(page.elements.dropped.children[0].className, 'dropped');
  await page.flush();
  assert.match(page.texts('server-counters'), /^Server counters: produced 0, head 0, clients attached 1, run running\.$/);
});

test('Disconnect closes only the client stream, measures the server counter, and Reconnect resumes from the last applied id', async () => {
  let produced = 3;
  const page = loadPage({ fetchHandler: () => snapshot(produced) });
  const first = page.sources[0];
  first.open();
  deliver(first, 1, 'run-started');
  deliver(first, 2);
  deliver(first, 3);
  page.elements.disconnect.click();
  assert.equal(first.closed, true);
  assert.equal(page.elements.reconnect.focusCount, 1, 'keyboard focus moves to the control that is now available');
  assert.equal(page.texts('connection'), 'Connection: disconnected (by you; the server keeps producing)');
  assert.equal(page.elements.disconnect.disabled, true);
  assert.equal(page.elements.reconnect.disabled, false);
  await page.flush();
  assert.match(page.texts('detached'), /^Server counter at disconnect: 3\./);
  produced = 11;
  page.elements.reconnect.click();
  assert.equal(page.elements.disconnect.focusCount, 1);
  await page.flush();
  const second = page.sources[1];
  assert.equal(second.url, `/stream?lastEventId=${encodeURIComponent(id(3))}`);
  assert.equal(page.texts('marker'), `reconnected from id ${id(3)}`);
  assert.equal(page.texts('detached'), 'Produced while detached: 8 (server counter 3 to 11).');
  assert.equal(page.texts('count-reconnects'), '1');
  assert.equal(page.texts('count-disconnects'), '1');
  second.open();
  for (let seq = 4; seq <= 11; seq++) deliver(second, seq);
  assert.equal(page.texts('count-applied'), '11');
  assert.equal(page.texts('count-duplicates'), '0');
  assert.deepEqual(page.elements.log.children.map((child) => child.textContent.split(' · ')[0]), Array.from({ length: 11 }, (_, index) => id(index + 1)));
  deliver(first, 12);
  assert.equal(page.texts('count-applied'), '11', 'events from a closed stream are ignored');
});

test('a re-request reconnects from an older cursor, resets the control and shows each re-sent event as a dropped duplicate', async () => {
  const page = loadPage({ fetchHandler: () => snapshot(5) });
  const first = page.sources[0];
  first.open();
  for (let seq = 1; seq <= 5; seq++) deliver(first, seq);
  page.elements.disconnect.click();
  page.elements.rewind.value = '3';
  page.elements.reconnect.click();
  assert.equal(page.elements.rewind.value, '0');
  const second = page.sources[1];
  assert.equal(second.url, `/stream?lastEventId=${encodeURIComponent(id(2))}`);
  assert.equal(page.texts('marker'), `reconnected from id ${id(2)} (re-requested 3 applied events)`);
  second.open();
  for (let seq = 3; seq <= 6; seq++) deliver(second, seq);
  assert.equal(page.texts('count-duplicates'), '3');
  assert.equal(page.texts('count-applied'), '6');
  assert.equal(page.items('dropped').length, 3);
  page.elements.disconnect.click();
  page.elements.rewind.value = '99';
  page.elements.reconnect.click();
  assert.equal(page.sources[2].url, `/stream?lastEventId=${encodeURIComponent(id(1))}`, 'a rewind is clamped to the first applied event');
  page.elements.disconnect.click();
  page.elements.rewind.value = 'abc';
  page.elements.reconnect.click();
  assert.equal(page.sources[3].url, `/stream?lastEventId=${encodeURIComponent(id(6))}`, 'garbage means no rewind');
  await page.flush();
});

test('a lost connection closes the stream and reconnects on its own with the up-to-date cursor', async () => {
  const page = loadPage({ fetchHandler: () => snapshot(2) });
  const first = page.sources[0];
  first.open();
  deliver(first, 1, 'run-started');
  deliver(first, 2);
  first.fail(0);
  assert.equal(first.closed, true, 'the page never relies on the browser replaying the original URL');
  assert.equal(page.texts('connection'), 'Connection: disconnected (connection lost; reconnecting)');
  assert.equal(page.elements.reconnect.disabled, false);
  assert.equal(page.timers.filter((timer) => timer.active).length, 1);
  assert.equal(page.timers[0].ms, 250);
  page.runTimers();
  await page.flush();
  assert.equal(page.sources[1].url, `/stream?lastEventId=${encodeURIComponent(id(2))}`);
  assert.equal(page.texts('marker'), `reconnected from id ${id(2)} [automatic]`);
  assert.equal(page.texts('count-reconnects'), '1');
  first.fail(0);
  assert.equal(page.sources.length, 2, 'a stale source cannot trigger anything');
});

test('a user disconnect cancels a pending automatic reconnect', async () => {
  const page = loadPage({ fetchHandler: () => snapshot(1) });
  page.sources[0].open();
  deliver(page.sources[0], 1, 'run-started');
  page.sources[0].fail(0);
  page.elements.reconnect.click();
  page.elements.disconnect.click();
  assert.equal(page.timers.filter((timer) => timer.active).length, 0);
  assert.equal(page.texts('connection'), 'Connection: disconnected (by you; the server keeps producing)');
  await page.flush();
});

function typedFailure(code, cursorSeq = 2) {
  return JSON.parse(JSON.stringify(cursors.failure(code, { runId: run, epoch: 3, headSeq: 40, firstRetainedSeq: 33, replayWindow: 8 }, id(cursorSeq))));
}

test('a refused stream is diagnosed and the typed failure and only its allowed actions are shown', async () => {
  const seen = [];
  const page = loadPage({
    fetchHandler: (url) => {
      seen.push(url);
      return url.startsWith('/cursor') ? typedFailure('CURSOR_EXPIRED') : snapshot(40);
    },
  });
  const first = page.sources[0];
  first.open();
  deliver(first, 1, 'run-started');
  deliver(first, 2);
  page.elements.disconnect.click();
  page.elements.reconnect.click();
  const refused = page.sources[1];
  assert.equal(refused.url, `/stream?lastEventId=${encodeURIComponent(id(2))}`);
  refused.fail(2);
  await page.flush();
  assert.ok(seen.includes(`/cursor?lastEventId=${encodeURIComponent(id(2))}`), 'the probe names the cursor that was refused');
  assert.match(page.texts('failure'), /^CURSOR_EXPIRED \(stale\): /);
  assert.deepEqual(page.elements.actions.children.map((button) => button.textContent), ['Resync from snapshot', 'Reinspect read-only', 'Stop reconnecting']);
  assert.equal(page.elements.actions.children[0].type, 'button');
  assert.match(page.elements.actions.children[0].title, /gap/);
  assert.equal(page.texts('connection'), 'Connection: failed');
  assert.equal(page.sources.length, 2, 'no silent restart');

  page.elements.actions.children[1].click();
  await page.flush();
  assert.match(page.texts('notice'), /Read-only snapshot inspected/);
  assert.equal(page.sources.length, 2);

  page.elements.actions.children[0].click();
  assert.equal(page.sources.length, 3);
  assert.equal(page.sources[2].url, '/stream', 'a resync is the only way to a fresh stream');
  assert.equal(page.texts('failure'), 'No failure.');
  assert.equal(page.texts('marker'), `resynced after id ${id(2)}: waiting for the first retained event`);
  assert.match(page.texts('notice'), /Resynced from the oldest retained event/);
  assert.equal(page.texts('count-applied'), '2', 'history is retained');
});

test('Stop ends reconnecting and a future cursor offers operator review, not a resync', async () => {
  const page = loadPage({ fetchHandler: (url) => (url.startsWith('/cursor') ? typedFailure('CURSOR_FROM_FUTURE', 99) : snapshot(1)) });
  page.sources[0].open();
  page.sources[0].fail(2);
  await page.flush();
  assert.deepEqual(page.elements.actions.children.map((button) => button.textContent), ['Confirm operator review is needed', 'Reinspect read-only', 'Stop reconnecting']);
  page.elements.actions.children[0].click();
  assert.match(page.texts('notice'), /Operator review is needed/);
  page.elements.actions.children[2].click();
  assert.equal(page.texts('connection'), 'Connection: stopped');
  assert.match(page.texts('notice'), /^Stopped\./);
  assert.equal(page.sources.length, 1);
  page.sources[0].fail(2);
  assert.equal(page.sources.length, 1);
});

test('an unparseable or forged failure body is an UNRECOGNIZED_ERROR and a good cursor probe retries instead', async () => {
  const forged = loadPage({ fetchHandler: (url) => (url.startsWith('/cursor') ? { ok: false, error: { code: 'CURSOR_EXPIRED' } } : snapshot(1)) });
  forged.sources[0].open();
  forged.sources[0].fail(2);
  await forged.flush();
  assert.match(forged.texts('failure'), /^UNRECOGNIZED_ERROR \(unknown\): /);
  assert.deepEqual(forged.elements.actions.children.map((button) => button.textContent), ['Confirm operator review is needed', 'Stop reconnecting']);

  const broken = loadPage({ fetchHandler: (url) => (url.startsWith('/cursor') ? new Error('not json') : snapshot(1)) });
  broken.sources[0].open();
  broken.sources[0].fail(2);
  await broken.flush();
  assert.match(broken.texts('failure'), /^UNRECOGNIZED_ERROR/);

  const healthy = loadPage({ fetchHandler: (url) => (url.startsWith('/cursor') ? { ok: true } : snapshot(1)) });
  healthy.sources[0].open();
  healthy.sources[0].fail(2);
  await healthy.flush();
  assert.equal(healthy.texts('failure'), 'No failure.');
  assert.equal(healthy.texts('connection'), 'Connection: disconnected (connection lost; reconnecting)');
  assert.equal(healthy.timers.filter((timer) => timer.active).length, 1);
});

test('completion closes the stream for good and a later error changes nothing', async () => {
  const page = loadPage({ fetchHandler: () => snapshot(3, 'completed') });
  const [source] = page.sources;
  source.open();
  deliver(source, 1, 'run-started');
  deliver(source, 2, 'run-completed');
  assert.equal(source.closed, true);
  assert.equal(page.texts('connection'), 'Connection: complete');
  assert.equal(page.elements.disconnect.disabled, true);
  assert.equal(page.elements.reconnect.disabled, true);
  source.fail(0);
  assert.equal(page.sources.length, 1);
  assert.equal(page.timers.filter((timer) => timer.active).length, 0);
  await page.flush();
});

test('foreign or unparseable deliveries are rejected and counted, never shown as events', async () => {
  const page = loadPage({ fetchHandler: () => snapshot(1) });
  const [source] = page.sources;
  source.open();
  deliver(source, 1, 'run-started');
  source.emit('step-completed', id(2, 4), data(2, 4));
  source.emit('step-completed', id(2), '{not json');
  source.emit('step-completed', id(2), { ...data(2), seq: 7 });
  assert.equal(page.texts('count-rejected'), '3');
  assert.equal(page.texts('count-applied'), '1');
  assert.equal(page.items('log').length, 1);
  assert.deepEqual(page.items('dropped').map((text) => text.split(':')[0]), ['rejected (foreign-epoch)', 'rejected (attribution-mismatch)', 'rejected (attribution-mismatch)']);
  await page.flush();
});

test('a failing snapshot read leaves the console working and says the counters are unknown', async () => {
  const page = loadPage({ fetchHandler: () => new Error('offline') });
  await page.flush();
  assert.equal(page.texts('server-counters'), 'Server counters: not read yet.');
  page.sources[0].open();
  deliver(page.sources[0], 1, 'run-started');
  assert.equal(page.texts('count-applied'), '1');
});

test('a browser without EventSource gets an explicit message and no stream', () => {
  const page = loadPage({ eventSource: false });
  assert.equal(page.texts('connection'), 'Connection: unavailable (this browser has no EventSource).');
  assert.equal(page.sources.length, 0);
});

test('the evicted-event note appears only when the bounded view dropped something', async () => {
  const page = loadPage({ fetchHandler: () => snapshot(1) });
  const [source] = page.sources;
  source.open();
  for (let seq = 1; seq <= 205; seq++) deliver(source, seq, seq === 1 ? 'run-started' : 'step-completed');
  assert.equal(page.texts('evicted'), '5 older applied events scrolled out of this view.');
  assert.equal(page.elements.log.children.length, 200);
  assert.equal(page.texts('count-applied'), '205');
  await page.flush();
});

test('the resync marker reads "continued" when the stream resumes at the next event and "fresh" when nothing was applied before', async () => {
  const continued = loadPage({ fetchHandler: (url) => (url.startsWith('/cursor') ? typedFailure('CURSOR_EXPIRED') : snapshot(5)) });
  continued.sources[0].open();
  for (let seq = 1; seq <= 5; seq++) deliver(continued.sources[0], seq, seq === 1 ? 'run-started' : 'step-completed');
  continued.sources[0].fail(2);
  await continued.flush();
  continued.elements.actions.children[0].click();
  deliver(continued.sources[1], 6);
  assert.equal(continued.texts('marker'), `resynced after id ${id(5)}: nothing was skipped; the stream continued at the next event`);
  const fresh = loadPage({ fetchHandler: (url) => (url.startsWith('/cursor') ? typedFailure('CURSOR_MALFORMED') : snapshot(0)) });
  fresh.sources[0].fail(2);
  await fresh.flush();
  fresh.elements.actions.children[0].click();
  deliver(fresh.sources[1], 9);
  assert.equal(fresh.texts('marker'), 'resynced before any event was applied: nothing was skipped');
  assert.equal(fresh.texts('count-applied'), '1');
});
