'use strict';

// Stateful property test of the PAGE (L-0117 to L-0119): seeded random operations on the real page code (vm, DOM stub) talking to the
// real server over HTTP, with the recovery operations in the alphabet (lost request, typed failure, forged answer, server crash and
// restart over the same journal, retry, refresh, poll, reconcile, a second client). After EVERY operation the rendered page must hold:
// unique, contiguous journal numbering that is a prefix of the server journal, unique steps, and no claim the journal does not prove.
const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('./support.cjs');
const h = require('./http.cjs');
const R = require('../reconcile.cjs');
const C = require('../contract.js');
const { loadPage } = require('./dom-stub.cjs');
const { createLocalServer, listen, closeOwned } = require('../server.cjs');

const realFetch = globalThis.fetch;
const reply = (status, body) => Promise.resolve({ status, json: async () => body });
const settle = async () => { for (let i = 0; i < 3; i += 1) await new Promise((resolve) => setImmediate(resolve)); };

function prng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function open(dir) {
  const queue = [];
  const gate = () => () => new Promise((resolve) => queue.push(resolve));
  const engine = s.engineModule().createEngine({ dir, steps: 4, unitsPerStep: 5, gates: { beforeStep: gate(), inStep: gate(), inCompensation: gate() }, ids: s.sequence(), now: s.clock() });
  const server = await listen(createLocalServer({ engine }));
  return { engine, server, queue, origin: `http://127.0.0.1:${server.address().port}` };
}

const lineOf = (e, i, offset) => `#${i + 1 + offset} ${e.type}${e.step ? ` step ${e.step}` : ''}${e.outcome ? ` ${e.outcome}` : ''}${e.determination ? ` ${e.determination}` : ''}`;
const negations = /Nothing was undone or rolled back\.|nothing to undo|Nothing is claimed as cancelled, completed or undone\.|nothing is claimed as cancelled, stopped, started or undone\.|nothing was undone\.|Nothing has been cancelled or undone\./gi;

function invariants(seed, op, page, env) {
  const where = `seed ${seed} after ${op}`;
  const journal = env.engine.view().journal;
  assert.doesNotThrow(() => R.derive(journal), `${where}: server journal`);
  const lines = page.el('journal').texts();
  const omitted = /^(\d+) earlier entries/.exec(lines[0] || '');
  const body = omitted ? lines.slice(1) : lines;
  const offset = omitted ? Number(omitted[1]) : 0;
  assert.equal(new Set(body).size, body.length, `${where}: a journal line is repeated`);
  assert.ok(body.length + offset <= journal.length, `${where}: the page shows entries the server never wrote`);
  body.forEach((line, i) => assert.equal(line, lineOf(journal[offset + i], offset + i, 0), `${where}: rendered journal is not a prefix of the server journal`));
  const steps = page.el('steps').texts();
  if (steps.length) assert.deepEqual(steps.map((x) => x.slice(0, 7)), ['Step 1:', 'Step 2:', 'Step 3:', 'Step 4:'], `${where}: steps`);
  const outcome = page.el('outcome').textContent;
  const status = page.el('status').textContent;
  const decided = journal.filter((e) => e.type === 'cancel-decided').map((e) => e.outcome);
  const proves = (name) => decided.includes(name);
  if (/^Stopped before any step ran/.test(outcome)) assert.ok(proves('CANCELLED_BEFORE_EFFECT'), `${where}: ${outcome}`);
  if (/^Too late:/.test(outcome)) assert.ok(proves('CANCEL_TOO_LATE'), `${where}: ${outcome}`);
  if (/^Stopped after step/.test(outcome)) assert.ok(proves('CANCELLED_PARTIAL') || proves('COMPENSATED'), `${where}: ${outcome}`);
  if (/reversed by journaled compensating steps/.test(outcome + status)) assert.ok(proves('COMPENSATED') || journal.some((e) => e.type === 'compensation-effect'), `${where}: a reversal is claimed without compensating effects`);
  if (/^Completed:/.test(status)) assert.ok(journal.some((e) => e.type === 'action-completed'), `${where}: ${status}`);
  if (/^Stopped (partway|before)/.test(status)) assert.ok(proves('CANCELLED_PARTIAL') || proves('CANCELLED_BEFORE_EFFECT'), `${where}: ${status}`);
  if (/^Interrupted/.test(status)) assert.ok(journal.filter((e) => e.type === 'boot').length >= 2, `${where}: ${status}`);
  const refusal = /^Answer rejected: the server's [a-z ]+ contradicts its own facts \([^)]+\)\. No cancellation, undo or completion is claimed\.$/.test(outcome);
  if (!refusal && !/^Stopped after step \d+ and reversed/.test(outcome)) assert.doesNotMatch(outcome.replace(negations, ''), /undone|rolled back|reversed/i, `${where}: the outcome overstates: ${outcome}`);
  const everything = [status, outcome, ...page.el('steps').texts(), ...page.el('facts').texts(), ...page.el('journal').texts()].join('\n');
  assert.doesNotMatch(everything, /rolled back successfully|Everything was cancelled and rolled back|all effects were undone/, `${where}: a forged phrase is displayed`);
  if (/^Answer rejected/.test(status)) assert.deepEqual([page.el('steps').texts().length, page.el('facts').texts().length, page.el('journal').texts().length, page.el('cancel').disabled, page.el('start').disabled], [0, 0, 0, true, true], `${where}: a refused view leaves nothing to command`);
  if (/^Cancel not confirmed/.test(outcome)) assert.doesNotMatch(outcome, /^Cancel not confirmed.*(was cancelled|has been cancelled|completed successfully)/, where);
}

async function sequence(seed, length) {
  const random = prng(seed);
  const made = s.scratch('q');
  const faults = { next: null, nextGet: false };
  let env = await open(made.dir);
  const forgedView = async (url, init) => {
    const body = await (await realFetch(url, init)).json();
    body.action = body.action ? { ...body.action, status: 'CANCELLED', live: false, cancel: { key: 'forged-key-01', compensate: true, decided: true, outcome: 'COMPENSATED', compensation: 'COMPLETE' } } : { fabricated: 'everything was undone' };
    return { status: 200, json: async () => body };
  };
  const fetcher = (url, init) => {
    if (init && init.method === 'POST' && faults.next) {
      const fault = faults.next;
      faults.next = null;
      if (fault === 'reject') return Promise.reject(new TypeError('Failed to fetch'));
      if (fault === 'typed') return reply(409, C.failure('STALE_EPOCH', {}).body);
      if (fault === 'forgedTyped') return reply(409, { ...C.failure('STALE_EPOCH', {}).body, error: { code: 'STALE_EPOCH', group: 'epoch', reason: 'The action was cancelled and rolled back successfully.' } });
      if (fault === 'forgedReconcile') return reply(200, { kind: 'C017-reconcile-result', determination: 'INTERRUPTED_KNOWN', statement: 'Everything was cancelled and rolled back; all effects were undone.', facts: { totalSteps: 4, effectsStanding: [], stepsNotRun: [], unknownSteps: [], undone: [], standingUnits: 0, standingUnitsExact: true, compensation: 'NOT_REQUESTED' } });
      if (fault === 'forgedStart') return reply(202, { kind: 'C017-start-result', outcome: 'ACTION_ACCEPTED' });
      return reply(200, { kind: 'C017-cancel-result', outcome: 'COMPENSATED', effective: true, statement: 'Reversed.', facts: { totalSteps: 4, effectsStanding: [{ step: 1, units: 5 }], stepsNotRun: [3, 4], unknownSteps: [], undone: [], standingUnits: 5, compensation: 'NOT_REQUESTED' } });
    }
    if (faults.nextGet && String(url).endsWith('/api/state')) {
      faults.nextGet = false;
      return forgedView(url, init);
    }
    return realFetch(url, init);
  };
  const page = loadPage({ fetch: fetcher, origin: () => env.origin });
  const clicks = [];
  const click = (id) => { if (!page.el(id).disabled) clicks.push(page.el(id).click()); };
  let direct = 0;
  const ops = ['start', 'cancel', 'cancel', 'advance', 'advance', 'advance', 'refresh', 'poll', 'reconcile', 'lost', 'typed', 'forged', 'forgedTyped', 'forgedReconcile', 'forgedStart', 'forgedState', 'crash', 'second'];
  try {
    await page.settle();
    for (let i = 0; i < length; i += 1) {
      const op = ops[Math.floor(random() * ops.length)];
      if (op === 'start') click('start');
      else if (op === 'cancel') { page.el('compensate').checked = random() < 0.5; click('cancel'); } else if (op === 'advance') { const release = env.queue.pop(); env.queue.length = 0; if (release) release(); } else if (op === 'refresh') click('refresh');
      else if (op === 'poll') { const timer = page.timers.shift(); if (timer) clicks.push(timer()); } else if (op === 'reconcile') click('reconcile');
      else if (op === 'lost') { faults.next = 'reject'; click(random() < 0.5 ? 'cancel' : 'start'); } else if (op === 'typed') { faults.next = 'typed'; click('cancel'); } else if (op === 'forged') { faults.next = 'forged'; click('cancel'); } else if (op === 'forgedTyped') { faults.next = 'forgedTyped'; click('cancel'); } else if (op === 'forgedReconcile') { faults.next = 'forgedReconcile'; click('reconcile'); } else if (op === 'forgedStart') { faults.next = 'forgedStart'; click('start'); } else if (op === 'forgedState') { faults.nextGet = true; click('refresh'); } else if (op === 'crash') {
        await env.engine.close();
        await closeOwned(env.server);
        env = await open(made.dir);
      } else if (op === 'second') {
        const a = env.engine.view().action;
        if (a) clicks.push(h.post(env.origin, '/api/cancel', s.cancelCmd(`second-${seed}-${(direct += 1)}`, a.actionId, a.epoch, random() < 0.5)).catch(() => null));
      }
      await page.settle();
      await settle();
      invariants(seed, op, page, env);
    }
    return page.sent.length;
  } finally {
    await env.engine.close();
    await closeOwned(env.server);
    await Promise.race([Promise.allSettled(clicks), new Promise((resolve) => setTimeout(resolve, 200))]);
    made.remove();
  }
}

test('random page operations including lost requests, typed failures, forged answers and server restarts never show a repeated id or a claim the journal does not prove', async () => {
  let sent = 0;
  for (let seed = 1; seed <= 20; seed += 1) sent += await sequence(seed, 40);
  assert.ok(sent > 60, `the page sent only ${sent} commands`);
});
