'use strict';

const { makeCommand, describeCommand } = require('./commands.cjs');
const journal = require('./journal.js');
const { newScratch, fresh, duplicates, bytes, runId } = require('./tests/process-harness.cjs');

const cases = Object.freeze({
  retry: [['apply', 0], ['apply', 0], ['apply', 1], ['apply', 1]],
  unknown: [['lost-stdout', 0], ['apply', 0]],
  conflict: [['apply', 0], ['apply', 2]],
  hold: [['apply', 0], ['c015-fault', 1, 'after-publish'], ['apply', 0], ['apply', 1]],
  duplicates: [],
});

function entry(observed, attempt, expectedEpoch) {
  let result = observed.value;
  if (observed.exitCode !== 0) {
    const command = describeCommand(makeCommand(runId, expectedEpoch));
    result = {
      schemaVersion: 1, cardId: 'C016', mode: 'actual-local-filesystem-command',
      namespace: observed.args[1], pid: observed.value.pid,
      commandId: command.commandId, command,
      outcome: 'unknown', disposition: 'unconfirmed', code: observed.value.code,
      publicationPerformed: null, acknowledgment: null, observation: null,
      errors: [{ code: observed.value.code, message: 'The original process exited without returning a matching command acknowledgment.' }],
      allowedRecovery: observed.value.code === 'CLIENT_ACK_UNOBSERVED'
        ? 'inspect-and-retry-identical' : 'operator-review-no-marker-reclamation',
    };
  }
  return {
    schemaVersion: 1, attempt,
    process: { pid: result.pid, exitCode: observed.exitCode, stdout: observed.stdout, stderr: observed.stderr },
    result,
  };
}

async function conductOne(id) {
  const scratch = newScratch();
  const processes = [];
  const entries = [];
  let proof;
  try {
    if (id === 'duplicates') {
      const observed = await duplicates(scratch);
      processes.push(...observed);
      entries.push(...observed.map((item, index) => entry(item, index + 1, 0)));
    } else {
      for (const [action, epoch, variant] of cases[id]) {
        const observed = fresh(scratch, action, epoch, variant);
        processes.push(observed);
        entries.push(entry(observed, entries.length + 1, epoch));
      }
    }
    const retainedBytes = bytes(scratch);
    const inspection = fresh(scratch, 'read');
    processes.push(inspection);
    proof = {
      id, label: {
        retry: 'Submit, identical retry, advance and identical retry',
        unknown: 'Original unobserved stdout remains unknown after a confirmed retry',
        conflict: 'Future expected epoch is rejected without advancement',
        hold: 'Unobserved C015 publication holds, including an older matching retry',
        duplicates: 'Two concurrent duplicate processes; one intended publication',
      }[id],
      namespace: scratch.namespace,
      createdNamespacePath: scratch.location.root,
      processes, entries, journal: journal.replay(entries),
      retainedFileSha256: retainedBytes, actualEpochFiles: Object.keys(retainedBytes).length,
      finalInspection: inspection, exactOwnedScratchCleaned: false,
      externalBusinessExactlyOnce: false, cloudTransaction: false,
    };
  } finally {
    await scratch.cleanup();
  }
  proof.exactOwnedScratchCleaned = true;
  return proof;
}

async function conduct(selection) {
  if (selection !== 'all' && !Object.hasOwn(cases, selection)) throw new Error('Choose retry, unknown, conflict, hold, duplicates or all; no namespace or payload override.');
  const observations = [];
  for (const id of selection === 'all' ? Object.keys(cases) : [selection]) observations.push(await conductOne(id));
  return {
    schemaVersion: 1, cardId: 'C016',
    banner: 'Training rehearsal - synthetic data - not a live Azure result',
    kind: 'actual-fresh-node-local-command-observations', capturedAtUtc: new Date().toISOString(),
    nodeVersion: process.version, originalUnitCredits: 0,
    cooperativeEnvelope: 'C015 single writer marker on a local regular filesystem; no reclamation',
    cases: observations,
  };
}

module.exports = Object.freeze({ conduct, entry });
