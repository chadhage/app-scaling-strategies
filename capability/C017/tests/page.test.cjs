'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { loadPage } = require('./dom-stub.cjs');
const C = require('../contract.js');

const realFetch = globalThis.fetch;
const reply = (status, body) => Promise.resolve({ status, json: async () => body });
const affirmative = /\b(was|were|been|is) (cancelled|undone|rolled back|reversed)\b/i;

async function pageOver(t, hold, fetchOverride) {
  const env = await h.serve(t);
  if (hold) env.ctx.g.hold(hold[0], hold[1]);
  const page = loadPage({ fetch: fetchOverride || realFetch, origin: env.origin });
  await page.settle();
  return { env, page };
}

async function startOnPage(env, page, hold) {
  await page.el('start').click();
  await page.settle();
  if (hold) await env.ctx.g.reached(hold[0], hold[1]);
}

test('an empty lease: nothing started, only Start is enabled, and the markup and script agree', async (t) => {
  const { page } = await pageOver(t);
  assert.equal(page.el('status').textContent, 'No action has been started.');
  assert.equal(page.el('lease').textContent, 'lease-synthetic-001');
  assert.deepEqual(['start', 'cancel', 'reconcile', 'compensate'].map((id) => page.el(id).disabled), [false, true, true, true]);
});

test('start, then Cancel before step 3: the page shows the server-reconciled partial outcome in plain words', async (t) => {
  const { env, page } = await pageOver(t, ['before', 3]);
  await startOnPage(env, page, ['before', 3]);
  assert.equal(page.sent[0].path, '/api/start');
  assert.equal(page.sent[0].body.key, 'k-uuid-1');
  assert.equal(page.el('status').textContent, 'In flight: 2 of 4 steps have taken effect.');
  assert.deepEqual(page.el('steps').texts().map((x) => x.slice(0, 22)), ['Step 1: STANDS (took e', 'Step 2: STANDS (took e', 'Step 3: not yet run (5', 'Step 4: not yet run (5']);
  assert.equal(page.el('cancel').disabled, false);
  assert.ok(page.timers.length >= 1, 'a live action is polled');
  await page.el('cancel').click();
  const text = page.el('outcome').textContent;
  assert.match(text, /^Stopped after step 2 of 4\. Step\(s\) 1, 2 took effect and STAND \(10 synthetic units\)/);
  assert.match(text, /Nothing was undone or rolled back\.$/);
  assert.doesNotMatch(text.replace('Nothing was undone or rolled back.', ''), /undone|rolled back|reversed/i);
  assert.deepEqual(page.el('facts').texts().slice(0, 3), ['Steps whose effect STANDS: 1, 2', 'Steps NOT RUN: 3, 4', 'Steps with UNKNOWN effect: none']);
  assert.equal(page.el('status').textContent, 'Stopped partway: some effects STAND. See the outcome below.');
  assert.equal(page.document.activeElement, page.el('outcome'));
  assert.equal(page.el('cancel').disabled, true);
  assert.equal(page.el('start').disabled, false);
  assert.ok(page.el('journal').texts().at(-1).includes('cancel-decided CANCELLED_PARTIAL'));
});

test('compensation: only a journaled COMPENSATED outcome uses the words reversed by compensating steps', async (t) => {
  const { env, page } = await pageOver(t, ['before', 3]);
  await startOnPage(env, page, ['before', 3]);
  page.el('compensate').checked = true;
  await page.el('cancel').click();
  assert.match(page.el('outcome').textContent, /^Stopped after step 2 and reversed by journaled compensating steps 2, 1/);
  assert.equal(page.sent.at(-1).body.compensate, true);
  assert.match(page.el('status').textContent, /reversed by journaled compensating steps/);
});

test('a blocked or lost cancel request is shown as not delivered and UNKNOWN, retried with the same key, never as cancelled', async (t) => {
  const blocked = (url, init) => (init && init.method === 'POST' ? Promise.reject(new TypeError('Failed to fetch')) : realFetch(url, init));
  const { env, page } = await pageOver(t, ['before', 3], blocked);
  await startOnPage(env, page, null);
  assert.match(page.el('outcome').textContent, /not delivered/i, 'even the start is reported honestly when blocked');
  const direct = await h.post(env.origin, '/api/start', { schemaVersion: 1, kind: 'start', key: 'direct-start-1', ...s.attribution, expectedEpoch: 0 });
  assert.equal(direct.status, 202);
  await env.ctx.g.reached('before', 3);
  await page.el('refresh').click();
  await page.settle();
  await page.el('cancel').click();
  const text = page.el('outcome').textContent;
  assert.ok(text.startsWith('The request was not delivered or its answer was lost. UNKNOWN: nothing is claimed as cancelled, stopped, started or undone.'));
  assert.doesNotMatch(text, affirmative);
  await page.el('cancel').click();
  const cancels = page.sent.filter((x) => x.path === '/api/cancel');
  assert.equal(cancels.length, 2);
  assert.equal(cancels[0].body.key, cancels[1].body.key, 'a retry reuses the key so it stays idempotent');
  assert.equal(s.decisions(env.ctx).length, 0);
  assert.equal(page.el('status').textContent, 'In flight: 2 of 4 steps have taken effect.');
});

test('typed failures, forged answers and unrecognized answers claim nothing', async (t) => {
  const answers = [
    [409, C.failure('STALE_EPOCH', {}).body, /^Not applied \(STALE_EPOCH\): .* Allowed next steps: reinspect\. No outcome is claimed\.$/],
    [200, { kind: 'C017-cancel-result', outcome: 'COMPENSATED', effective: true, statement: 'Reversed.', facts: { totalSteps: 4, effectsStanding: [{ step: 1, units: 5 }], stepsNotRun: [3, 4], unknownSteps: [], undone: [], standingUnits: 5, compensation: 'NOT_REQUESTED' } }, /contradicts its own facts.*No cancellation, undo or completion is claimed\.$/],
    [200, { kind: 'something-else' }, /^The answer was not recognized\. Nothing is claimed\.$/],
  ];
  for (const [status, body, pattern] of answers) {
    const { env, page } = await pageOver(t, ['before', 3], (url, init) => (init && init.method === 'POST' ? reply(status, body) : realFetch(url, init)));
    const direct = await h.post(env.origin, '/api/start', { schemaVersion: 1, kind: 'start', key: 'forged-start-01', ...s.attribution, expectedEpoch: 0 });
    assert.equal(direct.status, 202);
    await env.ctx.g.reached('before', 3);
    await page.el('refresh').click();
    await page.el('cancel').click();
    assert.match(page.el('outcome').textContent, pattern);
    assert.doesNotMatch(page.el('outcome').textContent, affirmative);
    assert.equal(s.decisions(env.ctx).length, 0, 'a forged answer never changed the journal');
  }
});

test('an interrupted action is shown as neither cancelled nor completed and is reconciled only on request', async (t) => {
  const first = s.boot();
  first.g.hold('in', 3);
  const actionId = await s.startAction(first);
  await first.g.reached('in', 3);
  await first.engine.close();
  const env = await h.serve(t, { dir: first.dir });
  t.after(() => first.cleanup());
  const page = loadPage({ fetch: realFetch, origin: env.origin });
  await page.settle();
  assert.match(page.el('status').textContent, /^Interrupted by a server restart\. Not cancelled and not completed\./);
  assert.deepEqual(['start', 'cancel', 'reconcile'].map((id) => page.el(id).disabled), [true, true, false]);
  assert.ok(page.el('steps').texts().some((x) => x.startsWith('Step 3: UNKNOWN')));
  await page.el('reconcile').click();
  assert.match(page.el('outcome').textContent, /^Interrupted by a restart\. Journaled effects of step\(s\) 1, 2 STAND/);
  assert.match(page.el('outcome').textContent, /have an UNKNOWN effect.*not cancelled; nothing was undone\.$/);
  assert.equal(page.el('status').textContent, 'Interrupted and reconciled. The action neither completed nor was cancelled.');
  assert.equal(page.sent[0].body.actionId, actionId);
});

test('an unreadable journal is UNKNOWN on the page and nothing can be started or cancelled', async (t) => {
  const made = s.scratch('p');
  t.after(() => made.remove());
  fs.writeFileSync(path.join(made.dir, 'journal.jsonl'), 'not a journal\n');
  const env = await h.serve(t, { dir: made.dir });
  const page = loadPage({ fetch: realFetch, origin: env.origin });
  await page.settle();
  assert.match(page.el('status').textContent, /^The journal cannot be read\. The state is UNKNOWN/);
  assert.deepEqual(['start', 'cancel', 'reconcile'].map((id) => page.el(id).disabled), [true, true, true]);
});

test('polling follows a live action to completion, an unreachable server is reported, and text is never parsed as markup', async (t) => {
  const { env, page } = await pageOver(t, ['before', 3]);
  await startOnPage(env, page, ['before', 3]);
  env.ctx.g.release('before', 3);
  await s.wait(env.ctx, (state) => state.action.status === 'COMPLETED');
  await page.timers.shift()();
  assert.equal(page.el('status').textContent, 'Completed: all 4 steps took effect.');
  const count = page.timers.length;
  await page.el('refresh').click();
  assert.equal(page.timers.length, count, 'a settled action is not polled');
  const down = loadPage({ fetch: () => Promise.reject(new TypeError('offline')), origin: env.origin });
  await down.settle();
  assert.match(down.el('status').textContent, /^The server is not reachable\./);
  const forged = { schemaVersion: 1, kind: 'C017-state', journalStatus: 'READABLE', problem: null, lease: { leaseId: '<img src=x onerror=alert(1)>' }, epoch: 0, action: null, journal: [{ type: '<b>x</b>' }], journalOmitted: 5 };
  const evil = loadPage({ fetch: () => reply(200, forged), origin: env.origin });
  await evil.settle();
  assert.equal(evil.el('lease').textContent, '<img src=x onerror=alert(1)>');
  assert.equal(evil.el('journal').texts()[0], '5 earlier entries are not shown; the server keeps all of them.');
  assert.equal(evil.el('journal').children.every((child) => child.tag === 'li'), true);
  const source = fs.readFileSync(path.join(s.root, 'page.js'), 'utf8');
  assert.doesNotMatch(source, /innerHTML|outerHTML|insertAdjacentHTML|document\.write|\beval\(|new Function/);
});

test('the markup is keyboard-operable with native buttons and has no inline script or inline handler', () => {
  const html = fs.readFileSync(path.join(s.root, 'index.html'), 'utf8');
  for (const id of ['start', 'cancel', 'reconcile', 'refresh']) assert.match(html, new RegExp(`<button id="${id}" type="button">`));
  assert.deepEqual([...html.matchAll(/<script([^>]*)>/g)].map((m) => m[1].trim()), ['src="/contract.js"', 'src="/page.js"']);
  assert.doesNotMatch(html, /\son[a-z]+=|\sstyle=|tabindex="[1-9]|javascript:/i);
  assert.match(html, /<html lang="en">/);
  assert.match(html, /id="outcome" role="status" aria-live="polite" tabindex="-1"/);
});
