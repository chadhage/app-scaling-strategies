'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const cli = path.join(root, 'cli.cjs');

function invoke(args, input) {
  const run = spawnSync(process.execPath, [cli, ...args], {
    cwd: root, input, timeout: 90000, maxBuffer: 16 * 1024 * 1024, windowsHide: true
  });
  return { status: run.status, stdout: run.stdout.toString('utf8'), stderr: run.stderr.toString('utf8') };
}
const parse = (run) => JSON.parse(run.stdout);

test('cli: context prints the as-of Node read and an unassessed presentation without work or cancellation', () => {
  const run = invoke(['context']);
  assert.equal(run.status, 0, run.stderr);
  const output = parse(run);
  assert.equal(output.schema, 'C035-cli/1');
  assert.equal(output.currentContext.receipt.writesPerformed, 0);
  assert.equal(output.session.latest, null);
  assert.equal(output.nativeAuthority, false);
});
test('cli: a standalone reset starts a fresh presentation, not a stored-history reset', () => {
  const run = invoke(['reset']);
  assert.equal(run.status, 2, run.stderr);
  const output = parse(run);
  assert.equal(output.session.presentationReset, true);
  assert.equal(output.session.storedWorkChanged, false);
  assert.equal(output.session.retainedEntries, 0);
  assert.equal(output.session.retainedDecision, 'HOLD');
});
test('cli: inspect keeps the original FAIL, HOLD and PASS exit codes distinct', () => {
  for (const [id, status, decision] of [['closed-history', 1, 'FAIL'], ['modeled-cancel-request', 2, 'HOLD'], ['modeled-complete', 0, 'PASS']]) {
    const run = invoke(['inspect', id]);
    assert.equal(run.status, status, `${id}: ${run.stderr}`);
    assert.equal(parse(run).session.retainedDecision, decision, id);
  }
});
test('cli: compare retry and cancellation print a bounded comparison, not a repaired original', () => {
  for (const id of ['retry', 'cancellation']) {
    const run = invoke(['compare', id]);
    assert.ok([1, 2].includes(run.status), `${id}: ${run.status} ${run.stderr}`);
    const latest = parse(run).session.latest;
    assert.equal(latest.schema, 'C035-comparison/1');
    assert.equal(latest.valid, true);
  }
});
test('cli: copy prints the exact selected source and inspect-copy accepts only that agreement', () => {
  const copy = invoke(['copy', 'closed-history']);
  assert.equal(copy.status, 0, copy.stderr);
  assert.ok(copy.stdout.startsWith('{'));
  const accepted = invoke(['inspect-copy', 'closed-history'], copy.stdout);
  assert.equal(accepted.status, 1, accepted.stderr);
  assert.equal(parse(accepted).session.latest.valid, true);
  const forged = invoke(['inspect-copy', 'closed-history'], '{"forged":true}');
  assert.equal(forged.status, 3);
  assert.equal(parse(forged).session.history[0].result.valid, false);
});
test('cli: invalid UTF-8 and oversize stdin reject with a retained visible code and exit 3', () => {
  const invalid = invoke(['inspect-copy', 'closed-history'], Buffer.from([0xff, 0xfe, 0xfd]));
  assert.equal(invalid.status, 3);
  assert.equal(parse(invalid).code, 'INVALID_UTF8');
  assert.equal(parse(invalid).candidateAdopted, false);
  const oversize = invoke(['inspect-copy', 'closed-history'], Buffer.alloc(300000, 0x20));
  assert.equal(oversize.status, 3);
  assert.equal(parse(oversize).code, 'BOUNDED_STDIN_REQUIRED');
});
test('cli: session refuses an empty or over-long command stream instead of dropping commands', () => {
  for (const input of ['', `${'{"type":"reset"}\n'.repeat(19)}`]) {
    const run = invoke(['session'], input);
    assert.equal(run.status, 3);
    assert.equal(parse(run).code, 'BOUNDED_SESSION_COMMANDS_REQUIRED');
    assert.equal(parse(run).actualCancellationPerformed, false);
  }
});
