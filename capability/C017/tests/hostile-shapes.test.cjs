'use strict';

// Checklist items 6 and 7 for this card. 6: the oracle of the page tests (forge.cjs everything) covers EVERY element that carries text: the ids
// page.js writes with say() or fill() are enumerated from its source and must all be in the oracle's set, so a new line fails until it is compared.
// 7: the checks are total on hostile shapes beyond single-point mutants: cycles, holes, NaN and Infinity, huge sparse arrays, deep nesting, very
// long strings, throwing getters; every answer is a typed refusal, never a throw, and the work is bounded (proved with counters, not with time).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { build } = require('./scenarios.cjs');
const C = require('../contract.js');
const R = require('../reconcile.cjs');

const source = (name) => fs.readFileSync(path.join(__dirname, '..', name), 'utf8');
const ORACLE = ['status', 'outcome', 'units', 'lease', 'steps', 'facts', 'journal'];

test('every id page.js writes text to is compared by the oracle of the page tests', () => {
  const page = source('page.js');
  const written = new Set([...page.matchAll(/\bsay\('([a-z]+)'/g)].map((m) => m[1]));
  for (const m of page.matchAll(/\bfill\(el\.([a-z]+)/g)) written.add(m[1]);
  for (const m of page.matchAll(/for \(const id of \[([^\]]+)\]\) fill\(el\[id\]/g)) for (const id of m[1].matchAll(/'([a-z]+)'/g)) written.add(id[1]);
  assert.ok(written.size >= 6, [...written].join());
  assert.deepEqual([...written].filter((id) => !ORACLE.includes(id)), [], 'a rendered id the oracle does not compare');
  const oracle = fs.readFileSync(path.join(__dirname, 'forge.cjs'), 'utf8');
  for (const id of ORACLE) assert.ok(oracle.includes(`'${id}'`), `forge.cjs everything() does not read ${id}`);
  const html = source('index.html');
  for (const id of written) assert.ok(html.includes(`id="${id}"`), `${id} is not in index.html`);
});

test('the checks are total on hostile shapes: cycles, holes, NaN, huge sparse arrays, deep nesting, long strings, throwing getters', async () => {
  const journal = (await build('partial')).journal;
  const derived = R.derive(journal);
  const honest = () => ({ schemaVersion: 1, kind: 'C017-state', journalStatus: 'READABLE', problem: null, lease: { ...C.identity }, epoch: derived.epoch, action: R.actionView(derived.action), journal: structuredClone(journal), journalEntries: journal.length, journalOmitted: 0, statement: null });
  assert.equal(C.viewCheck(honest()).ok, true);
  const hostile = [];
  const cyclic = honest(); cyclic.action.self = cyclic; hostile.push(['a cycle in the action', cyclic]);
  const cyclicLine = honest(); cyclicLine.journal[2].loop = cyclicLine.journal; hostile.push(['a cycle in a journal line', cyclicLine]);
  const holes = honest(); delete holes.journal[3]; hostile.push(['a hole in the journal', holes]);
  const sparse = honest(); sparse.journal = new Array(250); hostile.push(['a sparse journal of 250 holes', sparse]);
  const huge = honest(); huge.journal = new Array(1e9); hostile.push(['a journal of 1e9 holes', huge]);
  const nan = honest(); nan.action.standingUnits = NaN; nan.epoch = Infinity; hostile.push(['NaN and Infinity', nan]);
  const long = honest(); long.action.actionId = 'a'.repeat(1e6); long.lease.leaseId = 'l'.repeat(1e6); hostile.push(['megabyte strings', long]);
  let deep = []; for (let i = 0; i < 20000; i += 1) deep = [deep];
  const nested = honest(); nested.action.steps = deep; hostile.push(['20,000 levels of nesting', nested]);
  const getter = honest(); Object.defineProperty(getter.action, 'status', { enumerable: true, get() { throw new Error('hostile getter'); } }); hostile.push(['a throwing getter', getter]);
  const proto = honest(); Object.setPrototypeOf(proto.action, { inherited: true }); hostile.push(['a foreign prototype', proto]);
  for (const [name, view] of hostile) {
    const verdict = C.viewCheck(view);
    assert.equal(verdict.ok, false, `${name}: accepted`);
    assert.ok(verdict.problems.length >= 1 && verdict.problems.every((problem) => typeof problem === 'string' && problem.length < 400), `${name}: ${JSON.stringify(verdict.problems).slice(0, 200)}`);
  }
  const cancel = R.cancelResult(derived.action, 'k-1234567', false);
  const cyclicAnswer = structuredClone(cancel); cyclicAnswer.facts.self = cyclicAnswer;
  // An extra key is not a contradiction (the page prints only the fields it knows): a cycle in it must neither throw nor hang.
  assert.equal(typeof C.claimCheck(cyclicAnswer).ok, 'boolean');
  for (const body of [Object.assign(structuredClone(cancel), { facts: new Array(1e9) }), Object.assign(structuredClone(cancel), { statement: 's'.repeat(1e6) })]) {
    assert.equal(C.claimCheck(body).ok, false);
  }
});
