'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const source = require('..\\source.cjs');
const { readCurrent } = require('..\\current.cjs');
const foreignIndex = require('..\\foreign-index.cjs');
const { withFixture, foreignPath } = require('.\\foreign-fixture.cjs');

test('unchanged accepted C015 and C029 raw, LF and Git pins, underlying original history and helper verify independently', () => {
  const checked = source.checkImports();
  assert.equal(checked.direct.length, 21);
  assert.equal(checked.unchangedC029Underlying.length, 22);
  assert.equal(checked.helperRawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.ok(checked.direct.some((entry) => entry.rawSha256 !== entry.crlfToLfSha256));
  source.checkGates(source.readGates());
});
test('actual fixed public C015 restore is a current read-only receipt, not browser/native cancellation', async () => {
  const current = await readCurrent();
  assert.equal(current.origin, 'ACTUAL_CURRENT_NODE_C015_PUBLIC_RESTORE_READ_ONLY');
  assert.equal(current.receipt.writesPerformed, 0);
  assert.equal(current.receipt.restored, true);
  assert.equal(current.receipt.state.runId, 'synthetic-run-001');
  assert.equal(current.receipt.state.epoch, 3);
  assert.equal(current.receipt.state.record.status, 'completed');
  assert.deepEqual(current.closedRecordStatuses, ['prepared', 'running', 'completed']);
  assert.match(current.C015Cancellation, /UNSUPPORTED/);
  assert.match(current.C017Cancellation, /NOT DONE/);
  assert.equal(current.sourceWrites, 0);
  assert.equal(current.authenticatedCurrentAssociation, false);
  const closed = require('..\\..\\C015\\contract.cjs');
  assert.equal(closed.canonical(current.receipt.state), closed.canonical(closed.makeState('synthetic-run-001', 3)));
  assert.deepEqual(current.receipt.state.envelope, require('..\\..\\C002\\synthetic-fixture.js').envelope);
  await assert.rejects(readCurrent({ runId: 'forged' }), /NO_CURRENT_CONTEXT_OVERRIDES/);
});
test('current acceptance/consent guards reject missing, string, duplicate, stale and unreviewed sources', () => {
  const original = source.readGates();
  const mutations = [
    (value) => { value.C001LocalConsent = 'true'; }, (value) => { value.C015FixtureApproval = false; },
    (value) => { value.readHandlesClosedBeforeRelease = false; },
    (value) => { value.cards[0].state = 'In Progress'; },
    (value) => { value.cards[0].publication.commit = '0'.repeat(40); },
    (value) => { value.cards[1].reviewCommit = '0'.repeat(40); },
    (value) => { value.cards[1].browserObserved = 'true'; },
    (value) => { value.cards[1] = structuredClone(value.cards[0]); }
  ];
  for (const mutate of mutations) {
    const candidate = structuredClone(original);
    mutate(candidate);
    assert.throws(() => source.checkGates(candidate));
  }
  assert.throws(() => source.readGates('custom-path'), /NO_GATE_OR_AUTHORITY_OVERRIDES/);
  assert.throws(() => source.checkImports({ approval: true }), /NO_DEPENDENCY_OVERRIDES/);
});
test('actual separate Node CLI uses read-only current context and preserves a failed original across reset/new positive', () => {
  const run = spawnSync(process.execPath, [path.join(__dirname, '..', 'cli.cjs'), 'session'], {
    cwd: source.repository, input: [
      '{"type":"inspect","id":"closed-history"}', '{"type":"reset"}',
      '{"type":"inspect","id":"modeled-complete"}', '{"type":"reset"}', ''
    ].join('\r\n'), encoding: 'utf8', timeout: 60000, maxBuffer: 1048576, windowsHide: true
  });
  assert.equal(run.status, 1, run.stderr);
  const output = JSON.parse(run.stdout);
  assert.equal(output.currentContext.receipt.pid > 0, true);
  assert.equal(output.currentContext.receipt.writesPerformed, 0);
  assert.equal(output.session.retainedDecision, 'FAIL');
  assert.equal(output.session.latest, null);
  assert.equal(output.session.history.length, 2);
  assert.equal(output.session.history[0].result.counts.fail, 2);
  assert.equal(output.session.history[1].result.decision, 'PASS');
});
test('ordinary foreign C048 staged content, stage entry and ordinary flags are untouched', () => withFixture((fixture) => {
  const initial = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'foreign-index-initial.json'), 'utf8'));
  const blob = fixture.stageForeign('foreign content staged by another card\n');
  fixture.changeOwn();
  const before = foreignIndex.snapshot(fixture.directory);
  assert.deepEqual(before.paths, [foreignPath]);
  assert.equal(foreignPath, initial.path.replaceAll('\\', '/'));
  assert.equal(before.nameStatus, initial.stagedChange);
  assert.equal(before.flags, initial.flags);
  assert.equal(before.entries, `100644 ${blob} 0\t${foreignPath}\n`);
  assert.match(before.debug, /^capability\/C048\/evidence\/red\/replay\.cjs\.txt\n {2}ctime: \d+:\d+\n {2}mtime: \d+:\d+\n {2}dev: \d+\tino: \d+\n {2}uid: \d+\tgid: \d+\n {2}size: 39\tflags: 0\n$/);
  fixture.publishOwn();
  const after = foreignIndex.snapshot(fixture.directory);
  assert.deepEqual(after, before);
  assert.equal(foreignIndex.verify(before, fixture.directory).preserved, true);
  assert.equal(fixture.git('status', '--porcelain'), `M  ${foreignPath}\n`);
  assert.equal(fixture.git('show', `HEAD:${foreignPath}`), 'foreign base\n');
  assert.equal(fixture.git('show', 'HEAD:capability/C035/own.txt'), 'own changed\n');
}));
