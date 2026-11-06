'use strict';

// F14 and F15 of the second independent review. F14: claimCheck validated actionStopped and actionCompleted only for CANCEL_UNKNOWN and
// CANCEL_TOO_LATE, so 18 mutants of an honest answer passed. F15: the checks THREW a TypeError on 383 of 88,858 malformed shapes, and the page
// then said "The server is not reachable" although the server had answered garbage. Every check is now total: the same mutant families run over
// every honest document of every scenario (views, the five cancel outcomes, reconcile, start, every typed failure) and no check ever throws.
const test = require('node:test');
const assert = require('node:assert/strict');
const { build } = require('./scenarios.cjs');
const C = require('../contract.js');
const R = require('../reconcile.cjs');

const documents = [];
const FALLBACK = 'the answer has a shape the check cannot read';
const checkOf = { 'C017-state': C.viewCheck, 'C017-cancel-result': C.claimCheck, 'C017-reconcile-result': C.reconcileCheck, 'C017-start-result': C.startCheck, 'C017-typed-failure': C.failureCheck };

test.before(async () => {
  for (const name of ['partial', 'before', 'compensated', 'failedCompensation', 'completed', 'interruptedCancel', 'reconciled', 'interrupted']) {
    const { journal } = await build(name);
    const derived = R.derive(journal);
    const a = derived.action;
    documents.push({ name: `${name} view`, body: { schemaVersion: 1, kind: 'C017-state', journalStatus: 'READABLE', problem: null, lease: C.identity, epoch: derived.epoch, action: R.actionView(a), journal, journalEntries: journal.length, journalOmitted: 0, statement: null } });
    if (R.outcomeOf(a)) documents.push({ name: `${name} cancel answer`, body: R.cancelResult(a, 'k-1234567', false) });
    if (a.interrupted || a.reconciled) documents.push({ name: `${name} reconcile answer`, body: R.reconcileResult(a, 'k-7654321', false) });
    if (name === 'partial') documents.push({ name: 'start answer', body: R.startResult(a, false) });
  }
  for (const code of Object.keys(C.failures)) documents.push({ name: `typed failure ${code}`, body: C.failure(code, {}).body });
});

// Every single-point mutant: each key deleted, set to each kind of scalar and structure; each array emptied, padded, duplicated, reversed.
function* mutants(root) {
  const scalars = [null, 0, -1, 1.5, 1e21, '', 'x', '<img src=x onerror=1>', 'x'.repeat(5000), true, false, [], {}, [null], { step: 1 }];
  const paths = [];
  (function walk(node, trail) {
    if (node && typeof node === 'object') for (const key of Object.keys(node)) { paths.push([...trail, key]); walk(node[key], [...trail, key]); }
  }(root, []));
  const at = (copy, trail) => trail.slice(0, -1).reduce((node, key) => node[key], copy);
  for (const trail of paths) {
    const last = trail[trail.length - 1];
    const fresh = () => { const copy = structuredClone(root); return [copy, at(copy, trail)]; };
    let [copy, parent] = fresh();
    if (Array.isArray(parent)) parent.splice(Number(last), 1); else delete parent[last];
    yield copy;
    for (const value of scalars) { [copy, parent] = fresh(); parent[last] = structuredClone(value); yield copy; }
    [copy, parent] = fresh();
    if (Array.isArray(parent[last])) {
      parent[last] = []; yield copy;
      [copy, parent] = fresh(); parent[last].push(parent[last][0] ?? null, 7); yield copy;
      [copy, parent] = fresh(); parent[last].reverse(); yield copy;
    }
    [copy, parent] = fresh();
    Object.defineProperty(parent, '__proto__', { value: { polluted: true }, enumerable: true, configurable: true, writable: true });
    yield copy;
  }
}

test('every honest document is accepted by its own check', () => {
  assert.ok(documents.length >= 40);
  for (const { name, body } of documents) assert.deepEqual(checkOf[body.kind](body), { ok: true, problems: [] }, name);
});

test('no check ever throws, whatever single point of an honest document is malformed, and none needs its catch-all', () => {
  let count = 0;
  const fallbacks = [];
  for (const { name, body } of documents) {
    const check = checkOf[body.kind];
    for (const mutant of mutants(body)) {
      count += 1;
      const verdict = check(mutant);
      assert.equal(typeof verdict.ok, 'boolean');
      assert.ok(Array.isArray(verdict.problems) && verdict.problems.every((problem) => typeof problem === 'string'));
      assert.equal(verdict.ok, verdict.problems.length === 0, name);
      if (verdict.problems.includes(FALLBACK)) fallbacks.push(name);
    }
  }
  assert.ok(count > 20000, `${count} mutants`);
  assert.deepEqual(fallbacks, [], 'a shape reached the catch-all of total(): fix the check that threw');
});

test('a check given anything at all answers with a refusal instead of throwing', () => {
  for (const weird of [undefined, null, 0, 'COMPENSATED', [], [[]], () => 1, Symbol('x'), { kind: 'C017-state' }, { kind: 'C017-state', schemaVersion: 1, journal: { length: 1 } }, Object.create(null)]) {
    for (const check of Object.values(checkOf)) assert.equal(check(weird).ok, false);
  }
  const proxy = new Proxy({}, { get() { throw new Error('hostile getter'); }, getPrototypeOf() { throw new Error('hostile prototype'); } });
  for (const check of Object.values(checkOf)) assert.deepEqual(check(proxy), { ok: false, problems: [FALLBACK] });
});

test('actionStopped and actionCompleted are validated for EVERY outcome (F14)', () => {
  const answers = documents.filter((doc) => doc.body.kind === 'C017-cancel-result');
  assert.deepEqual([...new Set(answers.map((doc) => doc.body.outcome))].sort(), [...C.OUTCOMES].sort(), 'all five outcomes are covered');
  const wrong = [1, 'x', true, false, null, [], {}, 0, undefined];
  let rejected = 0;
  for (const { body } of answers) {
    for (const field of ['actionStopped', 'actionCompleted']) {
      for (const value of wrong) {
        if (Object.is(value, body[field])) continue;
        // The one flag with two honest values: an unreadable journal cannot say whether the action completed (null), an interrupted one can (false).
        if (body.outcome === 'CANCEL_UNKNOWN' && field === 'actionCompleted' && (value === false || value === null)) continue;
        const forged = structuredClone(body);
        if (value === undefined) delete forged[field]; else forged[field] = value;
        const verdict = C.claimCheck(forged);
        assert.equal(verdict.ok, false, `${body.outcome}: ${field} = ${JSON.stringify(value)} was accepted`);
        assert.ok(verdict.problems.some((problem) => new RegExp(field).test(problem)), `${body.outcome}: ${field}: ${JSON.stringify(verdict.problems)}`);
        rejected += 1;
      }
    }
  }
  assert.ok(rejected >= 60, `${rejected} forgeries`);
});
