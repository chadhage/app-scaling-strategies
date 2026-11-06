'use strict';
// Completeness (V11): every rule code is asserted by a test (a negative(), reject() or findings assertion; a mention in a comment does not
// count), every code a production file emits is in the catalog, and a packet built like revision 1 is rejected for the reasons of the reviews.
const fs = require('node:fs');
const path = require('node:path');
const { assert, test, load, run, reseal } = require('./support.cjs');
const { RULE_CODES } = require('../packet-validator.cjs');

const ROOT = path.join(__dirname, '..');
const stripComments = (src) => src.split('\n').filter((l) => !/^\s*\/\//.test(l)).map((l) => l.replace(/\s\/\/ .*$/, '')).join('\n');
const ASSERTING = /negative\(|reject\(|\.has\(|\.includes\(|\.code\b|codes\.|found\.|^const [A-Z_]+ = \[|^\s*\}, \[|^\s*[A-Z][A-Z0-9_]+: \(/;

// Codes named on a line that asserts something about findings, in test files other than this one.
function assertedCodes() {
  const covered = new Set();
  const files = fs.readdirSync(__dirname).filter((f) => f.endsWith('.test.cjs') && f !== 'catalog.test.cjs');
  for (const file of files) {
    for (const line of stripComments(fs.readFileSync(path.join(__dirname, file), 'utf8')).split('\n')) {
      if (ASSERTING.test(line)) for (const m of line.matchAll(/\b([A-Z][A-Z0-9_]{3,})\b/g)) covered.add(m[1]);
    }
  }
  return covered;
}

// Codes a production file adds as findings: add('CODE', ...) and { code: 'CODE' }.
function emittedCodes() {
  const emitted = new Set();
  for (const file of fs.readdirSync(ROOT).filter((f) => f.endsWith('.cjs'))) {
    for (const m of stripComments(fs.readFileSync(path.join(ROOT, file), 'utf8')).matchAll(/(?:add\(|code: )'([A-Z][A-Z0-9_]+)'/g)) emitted.add(m[1]);
  }
  return emitted;
}

test('the rule catalog is large, unique and uppercase', () => {
  assert.ok(RULE_CODES.length >= 130, `only ${RULE_CODES.length} rule codes`);
  assert.equal(new Set(RULE_CODES).size, RULE_CODES.length);
  assert.ok(RULE_CODES.every((c) => /^[A-Z][A-Z0-9_]+$/.test(c)));
});

test('every rule code is asserted in a test that checks findings, not merely named in a comment or a list', () => {
  const covered = assertedCodes();
  const missing = RULE_CODES.filter((code) => !covered.has(code));
  assert.deepEqual(missing, [], `rule codes without an asserting test: ${missing.join(', ')}`);
});

test('every code that a production file emits is in the catalog', () => {
  const unknown = [...emittedCodes()].filter((code) => !RULE_CODES.includes(code));
  assert.deepEqual(unknown, [], `emitted but not in RULE_CODES: ${unknown.join(', ')}`);
  assert.ok(emittedCodes().size >= 120);
});

test('a packet built like revision 1 is rejected for guards, latency, the zero wording and the quota status', () => {
  const p = load();
  for (const s of p.cleanupAndRollback.deletionOrder) s.commands = s.commands.map((c) => c.replace('Assert-Subscription; Assert-Lease; ', '').replace(' --subscription $Subscription', ''));
  for (const o of p.options) {
    delete o.teardownLatencyHours;
    for (const c of o.regionCandidates) delete c.quotaStatus;
  }
  p.requiredResources[0].pricing = 'No meter queried; no charge expected (estimated).';
  p.requiredResources[0].pricingStatus = 'priced';
  p.requiredResources[0].includedInTotals = true;
  reseal(p);
  const found = new Set(run(p).findings.map((f) => f.code));
  for (const expected of ['DELETE_UNGUARDED', 'AZ_NO_SUBSCRIPTION', 'OPTION_LATENCY_MISSING', 'ZERO_COST_UNSOURCED', 'QUOTA_STATUS_MISSING']) {
    assert.ok(found.has(expected), `missing ${expected}; got ${[...found].join(', ')}`);
  }
});

test('revision 1 shaped strings: unguarded command strings and the no-charge-expected row without a status', () => {
  const p = load();
  p.cleanupAndRollback.deletionOrder = [{ n: 2, step: 'Stop the meter', command: 'az webapp delete --resource-group <rg> --name <app>; az appservice plan delete --resource-group <rg> --name <plan> --yes', label: 'estimated' }];
  delete p.requiredResources[0].pricingStatus;
  p.requiredResources[0].pricing = 'No meter queried; no charge expected (estimated).';
  reseal(p);
  const found = new Set(run(p).findings.map((f) => f.code));
  for (const expected of ['PLAN_SHAPE', 'DELETE_OUTSIDE_COMMANDS', 'ZERO_COST_UNSOURCED']) assert.ok(found.has(expected), expected);
});

test('findings name a path that exists or is the missing field and are stable between runs', () => {
  const p = load();
  p.options[1].regionCandidates[0].perHourSteadyUsd = 1;
  reseal(p);
  const a = run(p).findings;
  const b = run(p).findings;
  assert.deepEqual(a, b);
  assert.ok(a.some((f) => f.path === 'options[1].regionCandidates[0].perHourSteadyUsd'));
});
