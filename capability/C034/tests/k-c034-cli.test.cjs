'use strict';

// Specified in K-C034.feature: the command line inspects only closed saved traces against exact sources and an exact known context.
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const trace = require('..\\trace.js');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const cli = path.join(root, 'cli.cjs');
const preload = path.join(__dirname, 'fixtures', 'cli-fixture-preload.cjs');
const noAdoption = { liveRunAdopted: false, approvalAdopted: false, identityVerified: false };

function run(args, mode) {
  const env = { ...process.env };
  if (mode) env.C034_K_MODE = mode;
  const argv = [...(mode ? ['--require', preload] : []), cli, ...args];
  return spawnSync(process.execPath, argv, { cwd: repository, env, encoding: 'utf8', timeout: 60000, windowsHide: true });
}
function failure(result, code) {
  assert.equal(result.status, 1, result.stdout);
  assert.equal(result.stdout, '');
  const lines = result.stderr.trim().split(/\r?\n/);
  assert.equal(lines.length, 1);
  assert.deepEqual(JSON.parse(lines[0]), { cardId: 'C034', valid: false, code, ...noAdoption });
}

test('only inspect with exactly one closed saved-trace ID is accepted, with no path, target, header or approval input', () => {
  for (const args of [[], ['inspect'], ['inspect', 'unknown'], ['inspect', '..\\C015'], ['write', 'closed-history'],
    ['inspect', 'closed-history', 'extra'], ['inspect', 'held-snapshot', 'X-Approved:true']]) {
    failure(run(args), 'CLOSED_INSPECTION_ARGUMENTS');
  }
});

test('each closed trace prints its exact saved originals and a read-only known context while adopting nothing', () => {
  for (const id of trace.ids) {
    const result = run(['inspect', id], 'ok');
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, '');
    const report = JSON.parse(result.stdout);
    const expected = trace.inspectSaved(id);
    assert.equal(report.cardId, 'C034');
    assert.equal(report.traceId, id);
    assert.deepEqual(report.inspection, JSON.parse(JSON.stringify(expected.inspection)));
    assert.deepEqual(report.originals, JSON.parse(JSON.stringify(expected.attempts.map(({ attemptId, classification, requests, responses, observedVersions }) =>
      ({ attemptId, classification, requests, responses, observedVersions })))));
    assert.ok(report.originals.length > 0);
    assert.equal(report.actualReadOnlyC015Context.writesPerformed, 0);
    assert.equal(report.actualReadOnlyC015Context.runId, 'synthetic-run-001');
    assert.equal(report.actualReadOnlyC015Context.association, 'declared-fixture-association-only-not-client-run-correlation');
    for (const flag of ['liveRunAdopted', 'approvalAdopted', 'identityVerified', 'actualRunCorrelation', 'migrationQualified',
      'fullJourneyQualified', 'nativeTransportQualified', 'productionRuntimeValidated']) assert.equal(report[flag], false, flag);
  }
});

test('a saved snapshot that no longer matches its exact pinned source is refused', () => {
  failure(run(['inspect', 'closed-history'], 'source-mismatch'), 'SAVED_SOURCE_MISMATCH');
});

test('a known context whose state, digest or acknowledgment differs from the saved one is refused as stale', () => {
  for (const mode of ['stale-state', 'stale-sha', 'stale-ack']) failure(run(['inspect', 'held-snapshot'], mode), 'CONTEXT_MISMATCH_OR_STALE');
});

test('an invalid inspection and an unexpected error without a code both fail closed with no adoption', () => {
  failure(run(['inspect', 'closed-history'], 'invalid-inspection'), 'FIXTURE_INVALID_INSPECTION');
  failure(run(['inspect', 'closed-history'], 'plain-error'), 'INSPECTION_UNAVAILABLE');
});
