'use strict';

// F13, F15 and F16 of the second independent review on the REAL page.js in the DOM stub: a forged journal pane is refused and none of its lines
// is displayed (the reviewer reproduced 9 of 10 forgeries being shown, also in real Edge); only lines the page re-derived are shown; a
// delivered view or answer with a shape that used to make a check throw is REFUSED, not reported as "not reachable" or "not delivered"; the poll
// of a live action survives a refused view and the screen recovers; and the sentence of a refused view does not outlive the next accepted view.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const { build } = require('./scenarios.cjs');
const { loadPage } = require('./dom-stub.cjs');
const { refusal, everything, buttons } = require('./forge.cjs');
const C = require('../contract.js');
const R = require('../reconcile.cjs');

const viewOf = (journal, omitted = 0) => {
  const derived = R.derive(journal);
  return { schemaVersion: 1, kind: 'C017-state', journalStatus: 'READABLE', problem: null, lease: C.identity, epoch: derived.epoch, action: derived.action ? R.actionView(derived.action) : null, journal: structuredClone(journal.slice(omitted)), journalEntries: journal.length, journalOmitted: omitted, statement: null };
};
const serving = (box) => () => Promise.resolve({ status: 200, json: async () => structuredClone(box.view) });
const FORBIDDEN = /COMPENSATED|compensation-effect|action-completed|rolled back|undone/i;

const forgeries = [
  ['the decision line says COMPENSATED without an actionId', (v) => { v.journal[v.journal.length - 1] = { type: 'cancel-decided', at: 't', outcome: 'COMPENSATED' }; }],
  ['compensation-effect lines for steps that STAND', (v) => { v.journal.push({ type: 'compensation-effect', at: 't', actionId: v.action.actionId, step: 1, units: -5, standingUnits: 5 }, { type: 'compensation-effect', at: 't', actionId: v.action.actionId, step: 2, units: -5, standingUnits: 0 }); }],
  ['action-completed on a cancelled action', (v) => { v.journal.push({ type: 'action-completed', at: 't', actionId: v.action.actionId, standingUnits: 10 }); }],
  ['a decision of a foreign action', (v) => { v.journal.push({ ...v.journal[v.journal.length - 1], actionId: 'act-9-aaaaaaaa', outcome: 'COMPENSATED' }); }],
  ['a view with no action whose journal decides a COMPENSATED cancel', (v) => { v.action = null; v.epoch = 0; v.journal = [{ type: 'cancel-decided', at: 't', actionId: 'act-1-00000002', key: 'k-1234567', outcome: 'COMPENSATED', effectsStanding: [], stepsNotRun: [], undone: [1, 2], compensation: 'COMPLETE' }]; }],
  ['a decision line rewritten to another outcome', (v) => { v.journal[v.journal.length - 1].outcome = 'COMPENSATED'; }],
];

test('a forged journal pane is refused by the real page and no forged line is displayed anywhere', async () => {
  const journal = (await build('partial')).journal;
  const honest = loadPage({ fetch: serving({ view: viewOf(journal) }), origin: 'http://x' });
  await honest.settle();
  assert.equal(honest.el('status').textContent, 'Stopped partway: some effects STAND. See the outcome below.');
  assert.equal(honest.el('journal').texts().length, journal.length, 'every re-derived line of an honest view is shown');
  for (const [name, forge] of forgeries) {
    const view = viewOf(journal);
    forge(view);
    const page = loadPage({ fetch: serving({ view }), origin: 'http://x' });
    await page.settle();
    assert.match(page.el('outcome').textContent, refusal, `${name}: the page must show the typed refusal`);
    assert.doesNotMatch(everything(page).replace(refusal, ''), FORBIDDEN, `${name}: a forged line is displayed`);
    assert.deepEqual([page.el('steps').texts().length, page.el('facts').texts().length, page.el('journal').texts().length], [0, 0, 0], `${name}: nothing is listed`);
    assert.deepEqual(['start', 'cancel', 'reconcile', 'compensate'].map((id) => buttons(page)[id]), [true, true, true, true], `${name}: nothing may be commanded`);
  }
});

test('a window that does not reach the start of the action shows only re-derived lines and counts the rest', async () => {
  const journal = (await build('compensated')).journal;
  const first = journal.findIndex((entry) => entry.type === 'action-accepted');
  const page = loadPage({ fetch: serving({ view: viewOf(journal, first) }), origin: 'http://x' });
  await page.settle();
  assert.equal(page.el('journal').texts()[0], `${first} earlier entries are not shown; the server keeps all of them.`);
  assert.equal(page.el('journal').texts()[1], `#${first + 1} action-accepted`);
  const mid = loadPage({ fetch: serving({ view: viewOf(journal, first + 3) }), origin: 'http://x' });
  await mid.settle();
  assert.deepEqual(mid.el('journal').texts(), [`${journal.length} earlier entries are not shown; the server keeps all of them.`]);
  assert.match(mid.el('status').textContent, /^Stopped, then reversed/, 'the facts are still shown');
});

test('a delivered answer whose shape used to make a check throw is refused, never called "not reachable" or "not delivered" (F15)', async () => {
  const journal = (await build('failedCompensation')).journal;
  const view = viewOf(journal);
  delete view.action.compensationFailure;
  const page = loadPage({ fetch: serving({ view }), origin: 'http://x' });
  await page.settle();
  assert.match(page.el('status').textContent, /^Answer rejected: the server's state view/);
  assert.doesNotMatch(everything(page), /not reachable/);
  const derived = R.derive(journal);
  const answer = R.cancelResult(derived.action, 'k-1234567', false);
  answer.facts.undone = 'x';
  assert.deepEqual(C.claimCheck(answer).ok, false);
  assert.equal(C.statementOf(answer), null, 'no wording can be built from facts that are not lists');
});

test('after a refused view the poll of a live action keeps going and the screen recovers; the sentence of the refusal does not outlive it (F15, F16)', async (t) => {
  const ctx = s.boot();
  t.after(() => ctx.cleanup());
  ctx.g.hold('before', 3);
  await ctx.engine.execute(s.startCmd('k-start-0001'));
  await ctx.g.reached('before', 3);
  const honest = ctx.engine.view();
  const box = { view: { ...honest, journalOmitted: 0, journalEntries: honest.journal.length } };
  const forged = structuredClone(box.view);
  forged.journal.push({ type: 'cancel-decided', at: 't', actionId: forged.action.actionId, key: 'k-1234567', outcome: 'COMPENSATED', effectsStanding: [], stepsNotRun: [], undone: [1, 2], compensation: 'COMPLETE' });
  const page = loadPage({ fetch: serving(box), origin: 'http://x' });
  await page.settle();
  assert.match(page.el('status').textContent, /^In flight: 2 of 4/);
  assert.equal(page.timers.length, 1, 'the poll of a live action is armed');
  const poll = async () => { await page.timers.shift()(); await page.settle(); };
  box.view = forged;
  await poll();
  assert.match(page.el('outcome').textContent, refusal);
  assert.equal(page.timers.length, 1, 'the poll is re-armed after a refused view');
  box.view = { ...honest, journalOmitted: 0, journalEntries: honest.journal.length };
  await poll();
  assert.match(page.el('status').textContent, /^In flight: 2 of 4/);
  assert.equal(page.el('outcome').textContent, '', 'the sentence of the refused view is gone');
  assert.equal(buttons(page).cancel, false, 'the page can be commanded again');
});

test('the not-JSON bodies keep their honest wording: the transfer was cut short, so the state shown may be stale', async () => {
  const page = loadPage({ fetch: () => Promise.resolve({ status: 200, json: async () => { throw new SyntaxError('cut'); } }), origin: 'http://x' });
  await page.settle();
  assert.match(page.el('status').textContent, /^The server is not reachable\./);
});
