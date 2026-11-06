'use strict';

// Guards that the focused suites did not pin until the mutation self-check (tests\mutants.cjs, L-0147) found them unprotected: caps and exact
// boundaries, deep immutability of what a timeline hands out, jump directions, a finished run with a gap, clip limits, the refused-run address,
// the scrub bar and the sequence keys. Each test names the mutant it kills.
const test = require('node:test');
const assert = require('node:assert/strict');
const T = require('..\\timeline.js');
const D = require('..\\describe.js');
const saved = require('..\\saved.js');
const { loadPage } = require('.\\dom-stub.cjs');
const { assertShown } = require('.\\invariants.cjs');

const find = (id) => saved.runs.find((run) => run.id === id);
const complete = () => find('c044-complete');
const open = (count) => Array.from({ length: count }, () => ({ type: 'open' }));
const accepting = (attempts = []) => ({ trace: { validateSnapshot: () => ({ valid: true, attempts }) } });

test('the entry cap is exactly 500 for a console run and for a trace (cap raised, compared with >=, removed)', () => {
  assert.equal(T.MAX_ENTRIES, 500);
  assert.equal(T.build({ ...complete(), id: 'cap', entries: open(500) }).ok, true);
  assert.equal(T.build({ ...complete(), id: 'cap', entries: open(501) }).code, 'TOO_MANY_ENTRIES');
  const events = (count) => Array.from({ length: count }, () => ({ code: 'x', attemptId: 'a' }));
  assert.equal(T.using(accepting()).build({ ...find('c034-held-snapshot'), snapshot: { events: events(500) } }).ok, true);
  assert.equal(T.using(accepting()).build({ ...find('c034-held-snapshot'), snapshot: { events: events(501) } }).code, 'TOO_MANY_ENTRIES');
});

test('a run id may have 40 characters and not 41 (id cap raised or lowered)', () => {
  assert.equal(T.build({ ...complete(), id: 'a'.repeat(40) }).ok, true);
  assert.equal(T.build({ ...complete(), id: 'a'.repeat(41) }).code, 'ID_INVALID');
  assert.equal(T.parseFragment(`#run=${'a'.repeat(40)}&pos=999999`, ['a'.repeat(40)]).ok, true);
});

test('everything a timeline hands out is deeply frozen: states, their nested records, limits, hits and tallies (deep freeze removed)', () => {
  const timeline = T.build(find('c044-restart-gap'));
  const last = timeline.stateAt(timeline.length - 1);
  const values = [timeline, timeline.limits, timeline.limits.gaps[0], timeline.limits.epochs[0], timeline.limits.notRecorded[0], timeline.hits, timeline.hits.gap, last,
    last.state, last.state.events, last.state.events[0], last.state.gaps[0], last.state.epochChanges[0], last.tallies, last.tallies.byMark];
  values.forEach((value, index) => assert.equal(Object.isFrozen(value), true, `value ${index} is frozen`));
  assert.throws(() => { last.state.events[0].id = 'forged'; }, TypeError);
  assert.throws(() => { timeline.limits.gaps.push({}); }, TypeError);
  const trace = T.build(find('c034-closed-history')).stateAt(42);
  assert.equal(Object.isFrozen(trace.state.attempts[0]), true);
});

test('a jump needs the direction 1 or -1 and an integer start (direction and start unchecked)', () => {
  const timeline = T.build(find('c044-restart-gap'));
  for (const direction of [0, 2, -2, 0.5, '1', null, undefined]) assert.equal(T.jump(timeline, 999, 'gap', direction), null, String(direction));
  for (const from of [1.5, NaN, '1', null, undefined, Infinity]) assert.equal(T.jump(timeline, from, 'gap', 1), null, String(from));
  assert.equal(T.jump(timeline, 999, 'gap', -1), timeline.hits.gap[0]);
  assert.equal(T.jump(timeline, timeline.hits.gap[0], 'gap', -1), null, 'previous never includes the current position');
  assert.equal(T.jump(timeline, timeline.hits.gap[0], 'gap', 1), null, 'next never includes the current position');
});

test('a run that completed after a gap is INCOMPLETE and its epoch is not complete (status and completeness ignore missing ranges)', () => {
  const expired = find('c044-restart-gap').entries.find((entry) => entry.type === 'failure');
  const entries = [...complete().entries.slice(0, 5), expired, { type: 'resync' }, { type: 'reconnect', cursor: null, rewound: 0, automatic: false }, { type: 'open' }, ...complete().entries.slice(9)];
  const timeline = T.build({ ...complete(), id: 'gap-complete', entries });
  const last = timeline.stateAt(timeline.length - 1);
  assert.equal(last.state.completed, true);
  assert.deepEqual(timeline.limits.gaps.map(({ epoch, from, to, count }) => ({ epoch, from, to, count })), [{ epoch: 1, from: 4, to: 7, count: 4 }]);
  assert.deepEqual([timeline.limits.status, timeline.limits.epochs[0].complete, timeline.limits.epochs[0].recorded, timeline.limits.epochs[0].total], ['INCOMPLETE', false, 18, 22]);
  assert.deepEqual(timeline.limits.notRecorded.map(({ from, to, why }) => ({ from, to, why })), [{ from: 4, to: 7, why: 'gap' }]);
  assert.equal(T.locate(timeline, 1, 5).reason, 'gap');
  assert.equal(T.build(complete()).limits.status, 'COMPLETE');
  assert.equal(T.build(complete()).limits.epochs[0].complete, true);
});

test('text limits: a recorded primitive is clipped to 80 characters and a hostile title or mark never grows the display', () => {
  assert.ok(D.entryText('x'.repeat(300)).length <= 80);
  assert.equal(D.entryText('x'.repeat(300)).length, 80);
  assert.ok(D.entryText({ type: 'event', event: 'e'.repeat(500), id: 'i'.repeat(500) }).length < 80);
  assert.equal(D.label('not-a-mark'), 'UNKNOWN');
  assert.equal(D.announce({ position: 1, of: 2, mark: 'unknown-entry', detail: null, entry: null, tallies: { failed: 1, unknown: 0 } }), 'Position 1 of 2: an unrecognised recorded entry; it changed nothing; 1 failed event so far');
});

test('page: a refused run rewrites the address to the request, the scrub bar tracks the position and a shown state is marked', () => {
  const page = loadPage({ hash: '#run=c044-complete&pos=1' });
  assert.equal(page.$('scrub-fill').style.width, '0%');
  assert.equal(page.$('status').dataset.state, 'SHOWN');
  page.key('End');
  assert.equal(page.$('scrub-fill').style.width, '100%');
  page.changeHash('#run=c044-complete&pos=13');
  assert.equal(Math.round(Number.parseFloat(page.$('scrub-fill').style.width)), 52);
  page.$('saved-run').value = 'c034-tampered';
  page.click('load');
  assert.equal(page.location.hash, '#run=c034-tampered&pos=1');
  assert.equal(page.$('status').dataset.state, 'UNLOADED');
  page.changeHash('#run=c044-complete&pos=2');
  assertShown(page, 'c044-complete', 1, 'recovered');
});

test('page: only Enter finds a sequence from the keyboard and the sequence digits are strict', () => {
  const page = loadPage({ hash: '#run=c044-restart-gap&pos=1' });
  page.$('seq-epoch').value = '1';
  page.$('seq-number').value = '2';
  for (const key of [' ', 'Escape', 'Tab', 'a', 'Spacebar']) page.$('seq-number').dispatch('keydown', { key });
  assert.equal(page.text('seq-result'), '');
  page.$('seq-number').dispatch('keydown', { key: 'Enter' });
  assert.match(page.text('seq-result'), /^Sequence 2 of epoch 1 is recorded at position 4\.$/);
  for (const [epoch, sequence] of [['1', '1234567'], ['0', '1'], ['01', '1'], ['1', '00'], ['', '1']]) {
    page.$('seq-epoch').value = epoch;
    page.$('seq-number').value = sequence;
    page.click('seq-find');
    assert.match(page.text('seq-result'), /^SEQUENCE_INVALID/, `${epoch}:${sequence}`);
  }
  page.$('seq-epoch').value = '1';
  page.$('seq-number').value = '999999';
  page.click('seq-find');
  assert.match(page.text('seq-result'), /^NOT_RECORDED: sequence 999999 of epoch 1 is after the last recorded event/);
});
