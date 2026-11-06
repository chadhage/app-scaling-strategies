'use strict';

// F3 (L-0139): the page must never print server prose or a claim the facts do not prove for a /api/state view either. Every forgery below
// starts from a REAL view produced by the real server (an action stopped partway: steps 1 and 2 STAND) and is served to the real page.js.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { loadPage } = require('./dom-stub.cjs');
const { lying, canned, refusal, everything, buttons } = require('./forge.cjs');

async function stoppedPartial(t) {
  const env = await h.serve(t);
  env.ctx.g.hold('before', 3);
  const started = await h.post(env.origin, '/api/start', s.startCmd('forge-start-001'));
  await env.ctx.g.reached('before', 3);
  const decided = await h.post(env.origin, '/api/cancel', s.cancelCmd('forge-cancel-001', started.json.action.actionId));
  assert.equal(decided.json.outcome, 'CANCELLED_PARTIAL');
  return env;
}

const set = (change) => (view) => { change(view); return view; };
const forgeries = [
  ['COMPENSATED while steps 1 and 2 STAND and nothing was undone', set((v) => { v.action.cancel.outcome = 'COMPENSATED'; }), /reversed|compensating/i],
  ['CANCELLED_BEFORE_EFFECT while steps STAND', set((v) => { v.action.cancel.outcome = 'CANCELLED_BEFORE_EFFECT'; }), /nothing to undo|Stopped before any/i],
  ['CANCEL_TOO_LATE on an action that did not complete', set((v) => { v.action.cancel.outcome = 'CANCEL_TOO_LATE'; }), /Too late|Completed before/i],
  ['an outcome word outside the closed five', set((v) => { v.action.cancel.outcome = 'EVERYTHING_ROLLED_BACK'; }), /ROLLED_BACK/],
  ['a step shown as REVERSED while the facts say it STANDS', set((v) => { v.action.steps[0].state = 'REVERSED'; }), /REVERSED/],
  ['standing units shown as 0 while two steps STAND', set((v) => { v.action.standingUnits = 0; }), /units: 0/],
  ['a journal line claiming a compensated decision', set((v) => { v.journal.push({ ...v.journal.at(-1), type: 'cancel-decided', outcome: 'COMPENSATED' }); }), /COMPENSATED/],
  ['status COMPLETED while only two steps took effect', set((v) => { v.action.status = 'COMPLETED'; }), /Completed: all/],
  ['a hostile lease id', set((v) => { v.lease.leaseId = '<img src=x onerror=alert(1)>'; }), /<img/],
  ['a hostile journal entry type', set((v) => { v.journal.push({ type: '<b>x</b>' }); }), /<b>/],
  ['a view of the wrong kind', () => ({ kind: 'something-else', action: null }), /something-else/],
  ['no object at all', () => 'all effects were undone', /undone/],
  ['null', () => null, /null/],
  ['an array', () => [], /\[\]/],
];

test('a tampered state view is refused with "Answer rejected" and no forged claim is shown anywhere on the page', async (t) => {
  const env = await stoppedPartial(t);
  const honest = loadPage({ fetch: lying({ get: (v) => v }), origin: env.origin });
  await honest.settle();
  assert.equal(honest.el('status').textContent, 'Stopped partway: some effects STAND. See the outcome below.', 'the unmodified real view is accepted');
  assert.doesNotMatch(honest.el('outcome').textContent, /^Answer rejected/);
  for (const [name, forge, forbidden] of forgeries) {
    const page = loadPage({ fetch: lying({ get: forge }), origin: env.origin });
    await page.settle();
    assert.match(page.el('outcome').textContent, refusal, `${name}: the page must show the typed refusal`);
    assert.doesNotMatch(everything(page), forbidden, `${name}: a forged claim is displayed`);
    assert.deepEqual(['start', 'cancel', 'reconcile', 'compensate'].map((id) => buttons(page)[id]), [true, true, true, true], `${name}: nothing may be commanded from a refused view`);
    assert.equal(buttons(page).refresh, false, `${name}: Refresh stays available`);
  }
});

test('a refused view replaces what an earlier honest view showed and a later honest view restores it', async (t) => {
  const env = await stoppedPartial(t);
  let lie = false;
  const fetcher = (url, init) => lying({ get: lie ? set((v) => { v.action.cancel.outcome = 'COMPENSATED'; }) : (v) => v })(url, init);
  const page = loadPage({ fetch: fetcher, origin: env.origin });
  await page.settle();
  assert.equal(page.el('steps').texts().length, 4);
  lie = true;
  await page.el('refresh').click();
  await page.settle();
  assert.match(page.el('outcome').textContent, refusal);
  assert.deepEqual([page.el('steps').texts().length, page.el('facts').texts().length, page.el('journal').texts().length], [0, 0, 0], 'stale claims are removed');
  lie = false;
  await page.el('refresh').click();
  await page.settle();
  assert.equal(page.el('steps').texts().length, 4);
  assert.equal(page.el('status').textContent, 'Stopped partway: some effects STAND. See the outcome below.');
});

test('a state view that is not JSON claims nothing and does not break the page', async (t) => {
  const env = await stoppedPartial(t);
  const broken = (url, init) => (init && init.method === 'POST' ? canned(200, {})(url, init) : Promise.resolve({ status: 200, json: async () => { throw new SyntaxError('Unexpected token'); } }));
  const page = loadPage({ fetch: broken, origin: env.origin });
  await page.settle();
  assert.match(page.el('status').textContent, /^The server is not reachable\./);
  assert.equal(buttons(page).refresh, false);
});
