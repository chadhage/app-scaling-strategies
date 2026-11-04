'use strict';

const {
  makeState, digest, closed, canonical, validateState, fail,
} = require('..\\C015\\contract.cjs');
const { requireCurrentConsent } = require('..\\C015\\consent.cjs');
const { resolveNamespace } = require('..\\C015\\paths.cjs');
const store = require('..\\C015\\store.cjs');

const kinds = Object.freeze(['submit', 'advance', 'finish']);

function expected(value) {
  if (!Number.isSafeInteger(value) || Object.is(value, -0) || value < 0 || value > 2) {
    fail('EXPECTED_EPOCH_RANGE', 'Expected epoch is exactly integer 0, 1 or 2; no coercion or implicit latest epoch.');
  }
}

function makeCommand(runId, expectedEpoch) {
  expected(expectedEpoch);
  return {
    schemaVersion: 1, kind: kinds[expectedEpoch], runId, expectedEpoch,
    candidate: makeState(runId, expectedEpoch + 1),
  };
}

function describeCommand(command) {
  closed(command, ['schemaVersion', 'kind', 'runId', 'expectedEpoch', 'candidate'], 'command');
  expected(command.expectedEpoch);
  const declared = makeCommand(command.runId, command.expectedEpoch);
  if (canonical(command) !== canonical(declared)) {
    fail('COMMAND_PAYLOAD_MISMATCH', 'Only the exact declared kind, run, expected epoch and closed C015 synthetic payload are accepted.');
  }
  const stateSha256 = digest(command.candidate);
  return Object.freeze({
    commandId: `C016-${digest({ runId: command.runId, expectedEpoch: command.expectedEpoch, candidate: command.candidate })}`,
    kind: command.kind, runId: command.runId, expectedEpoch: command.expectedEpoch,
    epoch: command.candidate.epoch, stateSha256,
  });
}

function base(namespace, command) {
  return {
    schemaVersion: 1, cardId: 'C016', mode: 'actual-local-filesystem-command',
    namespace, pid: process.pid, commandId: command?.commandId || null, command,
    outcome: 'negative', disposition: 'rejected', code: null,
    publicationPerformed: false, acknowledgment: null, observation: null, errors: [],
    allowedRecovery: 'correct-closed-command',
  };
}

function problem(error) {
  return { code: error.code || 'UNEXPECTED_LOCAL_ERROR', message: error.message || 'No local outcome was established.' };
}

function unknown(result, error, attemptedWrite) {
  return {
    ...result, outcome: 'unknown', disposition: 'unconfirmed', code: error.code || 'UNEXPECTED_LOCAL_ERROR',
    publicationPerformed: attemptedWrite ? null : false, errors: [...result.errors, problem(error)],
    allowedRecovery: error.code === 'HOLD_UNOBSERVED'
      ? 'operator-review-no-marker-reclamation' : 'inspect-and-retry-identical',
  };
}

function matching(result, restored) {
  const entry = restored.history.find((item) => item.epoch === result.command.epoch);
  if (!entry || entry.stateSha256 !== result.command.stateSha256) return null;
  const latest = restored.state.epoch === result.command.epoch;
  return {
    ...result, outcome: 'positive', disposition: 'idempotent-confirmed',
    code: latest ? 'MATCHING_LOCAL_ACK' : 'MATCHING_VERIFIED_HISTORY',
    publicationPerformed: false,
    // restore exposes only the latest acknowledgment. Older history confirms a digest, not a fabricated receipt.
    acknowledgment: latest ? restored.acknowledgment : null,
    observation: {
      source: 'C015.restore', observedEpoch: restored.state.epoch,
      matchedEpoch: entry.epoch, stateSha256: entry.stateSha256, history: restored.history,
    },
    allowedRecovery: 'none',
  };
}

function conflict(result, observedEpoch) {
  return {
    ...result, code: 'EXPECTED_EPOCH_CONFLICT',
    errors: [{ code: 'EXPECTED_EPOCH_CONFLICT', message:
      `Expected epoch ${result.command.expectedEpoch} does not match observed epoch ${observedEpoch}; no publication admitted.` }],
    allowedRecovery: 'inspect-and-declare-next',
  };
}

async function execute(namespace, input) {
  let result = base(null, null);
  if (arguments.length !== 2) {
    return { ...result, code: 'ARGUMENT_COUNT', errors: [
      { code: 'ARGUMENT_COUNT', message: 'Exactly namespace and closed command are accepted; no options or authority override.' },
    ] };
  }
  let candidate;
  try {
    const location = resolveNamespace(namespace);
    if (!location.testOnly) fail('TEST_NAMESPACE_REQUIRED', 'C016 never writes the retained C015 demo. The caller must own a freshly created unique C015 test UUID.');
    result.namespace = namespace;
    closed(input, ['schemaVersion', 'kind', 'runId', 'expectedEpoch', 'candidate'], 'command');
    const command = structuredClone(input);
    const consent = await requireCurrentConsent();
    candidate = await validateState(command.candidate, consent.C001);
    result = base(namespace, describeCommand(command));
  } catch (error) {
    return { ...result, code: error.code || 'COMMAND_INVALID', errors: [problem(error)] };
  }

  let observedEpoch;
  try {
    const restored = await store.restore(namespace, result.command.runId);
    const confirmed = matching(result, restored);
    if (confirmed) return confirmed;
    observedEpoch = restored.state.epoch;
  } catch (error) {
    if (error.code !== 'STATE_MISSING') return unknown(result, error, false);
    observedEpoch = 0;
  }
  if (observedEpoch !== result.command.expectedEpoch) return conflict(result, observedEpoch);

  try {
    const receipt = await store.persist(namespace, candidate);
    return {
      ...result, outcome: 'positive', disposition: 'published', code: 'LOCAL_PUBLISHED',
      publicationPerformed: true, acknowledgment: receipt.acknowledgment,
      observation: {
        source: 'C015.persist', observedEpoch: receipt.state.epoch, matchedEpoch: receipt.state.epoch,
        stateSha256: receipt.stateSha256,
        history: [{ epoch: receipt.state.epoch, stateSha256: receipt.stateSha256 }],
      },
      allowedRecovery: 'none',
    };
  } catch (error) {
    result.errors.push(problem(error));
    try {
      const restored = await store.restore(namespace, result.command.runId);
      const confirmed = matching(result, restored);
      if (confirmed) return confirmed;
      if (error.code === 'STALE_EPOCH') return { ...conflict(result, restored.state.epoch), errors: result.errors };
    } catch (readError) {
      return unknown(result, readError, true);
    }
    return unknown(result, error, true);
  }
}

module.exports = Object.freeze({ makeCommand, describeCommand, execute });
