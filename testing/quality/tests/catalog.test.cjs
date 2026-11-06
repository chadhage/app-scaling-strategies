'use strict';
// Completeness: every rule code has a negative test, and a packet built like revision 1 is rejected for the four reasons of the review.
const fs = require('node:fs');
const path = require('node:path');
const { assert, test, load, run, reseal } = require('./support.cjs');
const { RULE_CODES } = require('../packet-validator.cjs');

test('the rule catalog is large, unique and uppercase', () => {
  assert.ok(RULE_CODES.length >= 85, `only ${RULE_CODES.length} rule codes`);
  assert.equal(new Set(RULE_CODES).size, RULE_CODES.length);
  assert.ok(RULE_CODES.every((c) => /^[A-Z][A-Z0-9_]+$/.test(c)));
});

test('every rule code is named in at least one negative test', () => {
  const dir = __dirname;
  const sources = fs.readdirSync(dir).filter((f) => f.endsWith('.test.cjs') && f !== 'catalog.test.cjs').map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
  const missing = RULE_CODES.filter((code) => !sources.includes(`'${code}'`));
  assert.deepEqual(missing, [], `rule codes without a negative test: ${missing.join(', ')}`);
});

test('a packet built like revision 1 is rejected for guards, latency, the zero wording and the quota status', () => {
  const p = load();
  for (const s of p.cleanupAndRollback.deletionOrder) s.guards = [];
  p.cleanupAndRollback.deletionOrder.forEach((s) => { s.commands = s.commands.map((c) => c.replace(' --subscription <subscription-id>', '')); });
  for (const o of p.options) {
    delete o.teardownLatencyHours;
    for (const c of o.regionCandidates) delete c.quotaStatus;
  }
  p.requiredResources[0].pricing = 'No meter queried; no charge expected (estimated).';
  p.requiredResources[0].pricingStatus = 'priced';
  p.requiredResources[0].includedInTotals = true;
  reseal(p);
  const codes = new Set(run(p).findings.map((f) => f.code));
  for (const expected of ['DELETE_UNGUARDED', 'AZ_NO_SUBSCRIPTION', 'OPTION_LATENCY_MISSING', 'ZERO_COST_UNSOURCED', 'QUOTA_STATUS_MISSING']) {
    assert.ok(codes.has(expected), `missing ${expected}; got ${[...codes].join(', ')}`);
  }
});

test('revision 1 shaped strings: unguarded command strings and the no-charge-expected row without a status', () => {
  const p = load();
  p.cleanupAndRollback.deletionOrder = [{ n: 2, step: 'Stop the meter', command: 'az webapp delete --resource-group <rg> --name <app>; az appservice plan delete --resource-group <rg> --name <plan> --yes', label: 'estimated' }];
  delete p.requiredResources[0].pricingStatus;
  p.requiredResources[0].pricing = 'No meter queried; no charge expected (estimated).';
  reseal(p);
  const codes = new Set(run(p).findings.map((f) => f.code));
  for (const expected of ['DELETE_UNGUARDED', 'AZ_NO_SUBSCRIPTION', 'ZERO_COST_UNSOURCED']) assert.ok(codes.has(expected), expected);
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
