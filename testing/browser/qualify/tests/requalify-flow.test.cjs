'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { requalifyEdge } = require('../requalify.cjs');
const { fixtureAdapters, SHA } = require('./support.cjs');

const fixtures = path.join(__dirname, 'fixtures');
const VERSION = '156.0.4314.58';
const okReport = (extra = {}) => ({
  ok: true, reasons: [], reasonCodes: [], path: 'C:\\e\\msedge.exe', version: VERSION, major: 156,
  signature: { status: 'Valid', publisher: 'Microsoft Corporation' }, sha256: SHA, qualifiedMajors: [156], candidates: [], ...extra,
});
// The fixture suites print "Real Chromium <FIXTURE_BROWSER_VERSION>" like the isolated helper suites; a suite without it fails.
const base = (qualify, extra = {}) => ({
  qualify, cwd: fixtures, suiteTimeoutMs: 90000, suites: ['pass-suite.cjs'], env: { ...process.env, FIXTURE_BROWSER_VERSION: VERSION }, ...extra,
});

function recordingSlot() {
  const calls = [];
  return { calls, acquire: async () => { calls.push('acquire'); return '2'; }, release: async () => { calls.push('release'); } };
}

test('a qualified Edge and passing suites give ok, the counts, the slot and the Edge identity before and after', async () => {
  const slot = recordingSlot();
  const report = await requalifyEdge(base(async () => okReport(), { slot }));
  assert.equal(report.ok, true);
  assert.deepEqual(report.reasonCodes, []);
  assert.equal(report.version, '156.0.4314.58');
  assert.equal(report.requalification.ran, true);
  assert.equal(report.requalification.passed, true);
  assert.equal(report.requalification.candidateMajor, 156);
  assert.equal(report.requalification.heavySlot, '2');
  assert.deepEqual(report.requalification.totals, { tests: 2, suites: 0, pass: 2, fail: 0, cancelled: 0, skipped: 0, todo: 0 });
  assert.equal(report.requalification.suites.length, 1);
  assert.deepEqual(report.requalification.edgeAfter, { path: 'C:\\e\\msedge.exe', version: '156.0.4314.58', sha256: SHA, ok: true });
  assert.equal(report.requalification.edgeChangedDuringRun, false);
  assert.equal(report.requalification.node, process.version);
  assert.deepEqual(slot.calls, ['acquire', 'release']);
});

test('a new major that is signed still gets its suites run: that is what a requalification is for', async () => {
  const before = okReport({ ok: false, major: 157, version: '157.0.4400.2', reasonCodes: ['MAJOR_NOT_QUALIFIED'], reasons: ['MAJOR_NOT_QUALIFIED: major 157 is not in the qualified majors [156]'] });
  const report = await requalifyEdge(base(async () => before, { env: { ...process.env, FIXTURE_BROWSER_VERSION: '157.0.4400.2' } }));
  assert.equal(report.ok, false);
  assert.deepEqual(report.reasonCodes, ['MAJOR_NOT_QUALIFIED']);
  assert.equal(report.requalification.ran, true);
  assert.equal(report.requalification.passed, true);
  assert.equal(report.requalification.candidateMajor, 157);
  assert.equal(report.requalification.heavySlot, null);
});

test('an unsigned, foreign or missing binary is never launched: no slot, no suites', async () => {
  const slot = recordingSlot();
  let asked = 0;
  const blocked = okReport({ ok: false, reasonCodes: ['SIGNATURE_NOT_VALID', 'MAJOR_NOT_QUALIFIED'], reasons: ['SIGNATURE_NOT_VALID: x', 'MAJOR_NOT_QUALIFIED: y'] });
  const report = await requalifyEdge(base(async () => { asked += 1; return blocked; }, { slot }));
  assert.equal(report.ok, false);
  assert.equal(report.requalification.ran, false);
  assert.match(report.requalification.skipped, /SIGNATURE_NOT_VALID/);
  assert.doesNotMatch(report.requalification.skipped, /MAJOR_NOT_QUALIFIED/);
  assert.deepEqual(slot.calls, []);
  assert.equal(asked, 1);
});

test('a failing suite fails the requalification and the remaining suites still run', async () => {
  const report = await requalifyEdge(base(async () => okReport(), { suites: ['pass-suite.cjs', 'fail-suite.cjs'] }));
  assert.equal(report.ok, false);
  assert.equal(report.requalification.passed, false);
  assert.deepEqual(report.reasonCodes, ['REQUALIFICATION_FAILED']);
  assert.equal(report.reasons[0], 'REQUALIFICATION_FAILED: fail-suite.cjs passed 1 of 2 tests (1 failed)');
  assert.deepEqual([report.requalification.totals.tests, report.requalification.totals.pass, report.requalification.totals.fail], [4, 3, 1]);
  assert.deepEqual(report.requalification.suites.map((suite) => suite.passed), [true, false]);
});

test('an Edge that changes while the suites run fails closed even when every suite passes', async () => {
  let calls = 0;
  const qualify = async () => okReport(calls++ === 0 ? {} : { version: '156.0.4314.70', sha256: 'cd'.repeat(32) });
  const slot = recordingSlot();
  const report = await requalifyEdge(base(qualify, { slot }));
  assert.equal(report.ok, false);
  assert.equal(report.requalification.passed, false);
  assert.equal(report.requalification.edgeChangedDuringRun, true);
  assert.deepEqual(report.reasonCodes, ['EDGE_CHANGED_DURING_REQUALIFICATION']);
  assert.equal(report.requalification.edgeAfter.version, '156.0.4314.70');
  assert.deepEqual(slot.calls, ['acquire', 'release']);
});

test('the suites must have run the very Edge that was qualified: the version they print is recorded and a mismatch fails closed', async () => {
  const suites = ['version-suite.cjs'];
  const same = await requalifyEdge(base(async () => okReport(), { suites, env: { ...process.env, FIXTURE_BROWSER_VERSION: '156.0.4314.58' } }));
  assert.equal(same.ok, true);
  assert.deepEqual(same.requalification.browserVersionsSeen, ['156.0.4314.58']);
  const other = await requalifyEdge(base(async () => okReport(), { suites, env: { ...process.env, FIXTURE_BROWSER_VERSION: '156.0.9999.1' } }));
  assert.equal(other.ok, false);
  assert.equal(other.requalification.passed, false);
  assert.deepEqual(other.reasonCodes, ['BROWSER_VERSION_MISMATCH']);
  assert.match(other.reasons[0], /Chromium 156\.0\.9999\.1 but the qualified msedge\.exe is 156\.0\.4314\.58/);
});

test('by default requalifyEdge uses qualifyEdge with the given adapters', async () => {
  const report = await requalifyEdge({
    qualifyOptions: { adapters: fixtureAdapters() }, cwd: fixtures, suiteTimeoutMs: 90000, suites: ['pass-suite.cjs'],
    env: { ...process.env, FIXTURE_BROWSER_VERSION: VERSION },
  });
  assert.equal(report.ok, true);
  assert.equal(report.requalification.passed, true);
  assert.equal(report.sha256, SHA);
});
