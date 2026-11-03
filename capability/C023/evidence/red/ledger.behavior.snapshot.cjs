'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ledger = require(process.env.C023_TEST_SUBJECT
  ? path.resolve(__dirname, process.env.C023_TEST_SUBJECT)
  : '../../ledger.js');
const config = {
  jobId: 'job-001', workVersion: 'profile-effects/1',
  profileId: 'synthetic-001', implementation: 'v1'
};
const run = (interruption, effectIndex) => ({ type: 'run', interruption, effectIndex });
const resume = { type: 'resume', interruption: 'none', effectIndex: null };

test('job plan uses the real C020 lineage and an explicit version', () => {
  const state = ledger.create(config);
  assert.equal(state.schema, 'C023/1');
  assert.equal(state.plan.workVersion, config.workVersion);
  assert.equal(state.plan.source.stamp.fixtureRevision, 'C020-r1');
});

test('a cut after commit retains one known effect before any checkpoint', () => {
  const interrupted = ledger.apply(ledger.create(config), run('after-commit', 0));
  assert.equal(ledger.inspect(interrupted).counters.committedEffects, 1);
});

test('resume cannot apply a known committed effect twice', () => {
  const interrupted = ledger.apply(ledger.create(config), run('after-commit', 0));
  const done = ledger.apply(interrupted, resume);
  assert.equal(ledger.inspect(done).counters.effectApplications, 3);
  assert.equal(ledger.inspect(done).counters.duplicateSuppressions, 1);
});

test('unknown acknowledgment explicitly blocks resume', () => {
  const unknown = ledger.apply(ledger.create(config), run('unknown-ack', 0));
  assert.throws(() => ledger.apply(unknown, resume), { code: 'NEEDS_RECONCILIATION' });
});
