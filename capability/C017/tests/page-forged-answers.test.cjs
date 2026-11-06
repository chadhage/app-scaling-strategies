'use strict';

// F3 and F8 (L-0139): the page validates EVERY answer shape and re-derives the wording from the facts. Reconcile answers, typed failures,
// start answers and cancel answers are forged from real server answers (or canned for shapes the honest server never produces) and served to
// the real page.js; no forged claim may appear anywhere, a refusal is shown instead and the buttons never stay disabled.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const h = require('./http.cjs');
const C = require('../contract.js');
const { loadPage } = require('./dom-stub.cjs');
const { lying, canned, refusal, everything, buttons } = require('./forge.cjs');

async function interruptedEnv(t) {
  const first = s.boot();
  first.g.hold('in', 3);
  await s.startAction(first);
  await first.g.reached('in', 3);
  await first.engine.close();
  const env = await h.serve(t, { dir: first.dir });
  t.after(() => first.cleanup());
  return env;
}

const set = (change) => (body) => { change(body); return body; };
const rebuilt = (determination, body) => ({ ...body, determination, statement: C.describeDetermination(determination, body.facts) });
const reconcileForgeries = [
  ['a statement that claims everything was rolled back', set((b) => { b.statement = 'Everything was cancelled and rolled back; all effects were undone.'; }), /rolled back|cancelled and/i],
  ['a determination outside the closed three', set((b) => { b.determination = 'CANCELLED'; }), /CANCELLED/],
  ['facts that hide the step with an unknown effect', set((b) => { b.facts.unknownSteps = []; }), /UNKNOWN effect: none/],
  ['facts that claim a step was undone', set((b) => { b.facts.undone = [{ step: 1, units: 5 }]; }), /compensating steps: 1/],
  ['a known determination whose own facts hold an unknown step', (b) => rebuilt('INTERRUPTED_KNOWN', b), /units\); step\(s\) 4 never ran/],
  ['no facts at all', set((b) => { delete b.facts; }), /undefined/],
  ['a hostile identity', set((b) => { b.leaseId = '<img src=x onerror=alert(1)>'; }), /<img/],
];

test('an honest reconcile answer is shown with wording derived from its own facts', async (t) => {
  const env = await interruptedEnv(t);
  let seen = null;
  const page = loadPage({ fetch: lying({ post: (b) => { seen = structuredClone(b); return b; } }), origin: env.origin });
  await page.settle();
  await page.el('reconcile').click();
  assert.equal(seen.kind, 'C017-reconcile-result');
  assert.equal(page.el('outcome').textContent, C.describeDetermination(seen.determination, seen.facts));
  assert.deepEqual(page.el('facts').texts().slice(0, 3), ['Steps whose effect STANDS: 1, 2', 'Steps NOT RUN: 4', 'Steps with UNKNOWN effect: 3']);
  assert.doesNotMatch(page.el('outcome').textContent, /^Answer rejected/);
});

test('every forged reconcile answer shows the typed refusal and none of its claims', async (t) => {
  for (const [name, forge, forbidden] of reconcileForgeries) {
    const env = await interruptedEnv(t);
    const page = loadPage({ fetch: lying({ post: forge }), origin: env.origin });
    await page.settle();
    await page.el('reconcile').click();
    await page.settle();
    assert.match(page.el('outcome').textContent, refusal, `${name}: the page must show the typed refusal`);
    assert.doesNotMatch(everything(page), forbidden, `${name}: a forged claim is displayed`);
    assert.equal(page.el('facts').texts().length, 0, `${name}: forged facts are not listed`);
  }
});

const typedForgeries = [
  ['a reason that claims a rollback', set((b) => { b.error.reason = 'The action was cancelled and rolled back successfully.'; }), /rolled back successfully/],
  ['a code outside the closed table', set((b) => { b.error.code = 'CANCELLED_OK'; }), /CANCELLED_OK/],
  ['allowed actions outside the closed vocabulary', set((b) => { b.allowedActions = ['rollback-everything']; }), /rollback-everything/],
  ['no allowed actions', set((b) => { delete b.allowedActions; }), /undefined/],
  ['a failure that claims an effect', set((b) => { b.effectClaimed = true; }), /cancelled|rolled/i],
];

test('a forged typed failure is refused, an honest one is shown from the closed table, and the buttons recover', async (t) => {
  const env = await h.serve(t);
  env.ctx.g.hold('before', 3);
  await h.post(env.origin, '/api/start', s.startCmd('typed-start-001'));
  await env.ctx.g.reached('before', 3);
  for (const [name, forge, forbidden] of typedForgeries) {
    const page = loadPage({ fetch: canned(409, forge(C.failure('STALE_EPOCH', {}).body)), origin: env.origin });
    await page.settle();
    await page.el('cancel').click();
    assert.match(page.el('outcome').textContent, refusal, `${name}: the page must show the typed refusal`);
    assert.doesNotMatch(everything(page), forbidden, `${name}: a forged claim is displayed`);
    assert.equal(buttons(page).cancel, false, `${name}: the Cancel button must not stay disabled`);
  }
  const honest = loadPage({ fetch: canned(409, C.failure('STALE_EPOCH', {}).body), origin: env.origin });
  await honest.settle();
  await honest.el('cancel').click();
  assert.equal(honest.el('outcome').textContent, `Not applied (STALE_EPOCH): ${C.failures.STALE_EPOCH.reason} Allowed next steps: reinspect. No outcome is claimed.`);
});

const startForgeries = [
  ['an accepted start without an action', { kind: 'C017-start-result', outcome: 'ACTION_ACCEPTED', idempotentReplay: false }],
  ['an action whose epoch is a string', { kind: 'C017-start-result', outcome: 'ACTION_ACCEPTED', idempotentReplay: false, action: { epoch: '1; claim cancelled' } }],
  ['an action that is null', { kind: 'C017-start-result', outcome: 'ACTION_ACCEPTED', idempotentReplay: false, action: null }],
];

test('a malformed start answer is refused, claims nothing and leaves every button usable (F8)', async (t) => {
  for (const [name, body] of startForgeries) {
    const env = await h.serve(t);
    const page = loadPage({ fetch: canned(202, body), origin: env.origin });
    await page.settle();
    await page.el('start').click();
    await page.settle();
    assert.match(page.el('outcome').textContent, refusal, `${name}: the page must show the typed refusal`);
    assert.equal(buttons(page).start, false, `${name}: Start must not stay disabled`);
    assert.equal(buttons(page).refresh, false);
    await page.el('start').click();
    assert.equal(page.sent.length, 2, `${name}: the page must still send a second command`);
    assert.equal(env.ctx.engine.view().action, null, 'the real server never started anything');
  }
});

async function runningEnv(t, key) {
  const env = await h.serve(t);
  env.ctx.g.hold('before', 3);
  const started = await h.post(env.origin, '/api/start', s.startCmd(`${key}-start-001`));
  await env.ctx.g.reached('before', 3);
  env.actionId = started.json.action.actionId;
  return env;
}

test('a cancel answer whose statement, facts or outcome were tampered with is refused', async (t) => {
  const real = await runningEnv(t, 'base');
  const answer = (await h.post(real.origin, '/api/cancel', s.cancelCmd('base-cancel-0001', real.actionId))).json;
  assert.equal(answer.outcome, 'CANCELLED_PARTIAL');
  const forgeries = [
    ['a statement that claims a rollback', set((b) => { b.statement = 'The action was cancelled and everything was rolled back.'; })],
    ['facts that claim a step was undone', set((b) => { b.facts.undone = [{ step: 1, units: 5 }]; })],
    ['an outcome outside the closed five', set((b) => { b.outcome = 'EVERYTHING_UNDONE'; })],
  ];
  for (const [name, forge] of forgeries) {
    const env = await runningEnv(t, 'forged');
    const page = loadPage({ fetch: canned(200, forge(structuredClone(answer))), origin: env.origin });
    await page.settle();
    await page.el('cancel').click();
    assert.match(page.el('outcome').textContent, refusal, name);
    assert.doesNotMatch(everything(page), /rolled back|EVERYTHING_UNDONE|Steps reversed by journaled compensating steps: 1/, name);
    assert.equal(page.el('facts').texts().length, 0, name);
  }
});

test('a cancel answer that is not JSON is UNKNOWN and leaves the buttons usable', async (t) => {
  const env = await runningEnv(t, 'garbled');
  const garbled = (url, init) => (init && init.method === 'POST' ? Promise.resolve({ status: 200, json: async () => { throw new SyntaxError('Unexpected end of JSON input'); } }) : lying()(url, init));
  const page = loadPage({ fetch: garbled, origin: env.origin });
  await page.settle();
  await page.el('cancel').click();
  assert.match(page.el('outcome').textContent, /^The request was not delivered or its answer was lost\. UNKNOWN: nothing is claimed/);
  assert.equal(buttons(page).cancel, false);
});
