'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { replay, append, validateIdentity, limit } = require('..\\journal.js');
const observed = require('..\\observations.js');
const { makeCommand, describeCommand } = require('..\\commands.cjs');

test('all actual captured cases replay guarded immutable results, preserving original unknown user impact', () => {
  assert.equal(limit, 8);
  for (const id of ['synthetic-run-001', 'synthetic-run-002']) {
    for (const epoch of [0, 1, 2]) validateIdentity(describeCommand(makeCommand(id, epoch)));
  }
  for (const item of observed.cases) {
    let journal = replay([]);
    for (const entry of item.entries) journal = append(journal, entry);
    assert.deepEqual(journal, item.journal);
    assert.equal(journal.filesystemOperationNow, false);
    assert.equal(Object.isFrozen(journal.entries), true);
  }
  const unknown = observed.cases.find((item) => item.id === 'unknown');
  assert.equal(unknown.journal.originalUserImpact, 'unknown');
  assert.equal(unknown.journal.latestOutcome, 'positive');
  assert.deepEqual(unknown.journal.unknownAttempts, [1]);
  assert.equal(unknown.entries[0].result.acknowledgment, null);
  assert.equal(unknown.entries[0].process.exitCode, 87);
  assert.equal(unknown.entries[0].process.stdout, '');
});

test('guarded journal rejects fabricated receipt, changed original stdout, extra fields and unsafe replay', () => {
  const original = observed.cases.find((item) => item.id === 'unknown').entries;
  for (const mutate of [
    (value) => { value[0].result.outcome = 'positive'; },
    (value) => { value[0].result.acknowledgment = value[1].result.acknowledgment; },
    (value) => { value[1].result.commandId = 'C016-' + '0'.repeat(64); },
    (value) => { value[1].result.acknowledgment.epoch = 2; },
    (value) => { value[1].process.stdout = '{}'; },
    (value) => { value[0].result.userData = 'forbidden'; },
    (value) => { value[0].attempt = -0; },
    (value) => { value[0].process.pid = true; },
    (value) => {
      value[1].result.command.commandId = value[1].result.commandId = 'C016-' + '0'.repeat(64);
      value[1].process.stdout = `${JSON.stringify(value[1].result)}\n`;
    },
    (value) => {
      value[1].result.code = 'MATCHING_VERIFIED_HISTORY';
      value[1].result.acknowledgment = null;
      value[1].result.observation.observedEpoch = 2;
      value[1].process.stdout = `${JSON.stringify(value[1].result)}\n`;
    },
    (value) => {
      const error = JSON.parse(value[0].process.stderr);
      error.acknowledged = true;
      value[0].process.stderr = JSON.stringify(error);
    },
  ]) {
    const value = structuredClone(original);
    mutate(value);
    assert.throws(() => replay(value), /JOURNAL_INVALID/);
  }
  assert.throws(() => replay(Array(9).fill(original[0])), /eight-attempt bound/);
  const journal = structuredClone(replay([]));
  journal.originalUserImpact = 'positive';
  assert.throws(() => append(journal, original[0]), /projection was changed/);
});
