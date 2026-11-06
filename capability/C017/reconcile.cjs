'use strict';

// The server's answer builders. Every fact, status and cancel outcome is a function of the journal entries and nothing else, and that
// function (derive() and its helpers: the ledger) lives in contract.js, so that the PAGE runs the very same code on the journal lines it is
// shown (F13). derive() also validates the journal grammar, so a forged or inconsistent decision makes the whole journal unreadable.
const C = require('./contract.js');

const {
  JournalInconsistent, ENTRY_TYPES, derive, lists, classify, compensationOf, determinationOf, outcomeOf, statusOf, factsOf, actionView, standingUnitsOf,
} = C.ledger;

const nullFacts = () => ({
  totalSteps: null, effectsStanding: null, stepsNotRun: null, unknownSteps: null, undone: null, standingUnits: null, standingUnitsExact: false, compensation: null, compensationFailure: null,
});

function cancelResult(a, key, replay) {
  const outcome = outcomeOf(a);
  if (!outcome) throw new Error('the cancel is not decided yet');
  const facts = factsOf(a);
  const unknown = outcome === 'CANCEL_UNKNOWN';
  return {
    schemaVersion: 1, kind: 'C017-cancel-result', outcome, key, leaseId: a.leaseId, runId: a.runId, userId: a.userId, actionId: a.actionId, epoch: a.epoch,
    idempotentReplay: Boolean(replay), effective: C.EFFECTIVE.includes(outcome), actionStopped: unknown ? null : outcome !== 'CANCEL_TOO_LATE', actionCompleted: a.completed,
    nothingUndone: unknown ? null : facts.undone.length === 0, facts, statement: C.describe(outcome, facts),
  };
}

function unreadableCancelResult(key) {
  return {
    schemaVersion: 1, kind: 'C017-cancel-result', outcome: 'CANCEL_UNKNOWN', key, leaseId: null, runId: null, userId: null, actionId: null, epoch: null, idempotentReplay: false,
    effective: false, actionStopped: null, actionCompleted: null, nothingUndone: null, facts: nullFacts(), statement: C.describe('CANCEL_UNKNOWN', null),
  };
}

function startResult(a, replay) {
  return { schemaVersion: 1, kind: 'C017-start-result', outcome: 'ACTION_ACCEPTED', idempotentReplay: Boolean(replay), action: actionView(a) };
}

function reconcileResult(a, key, replay) {
  const determination = a.reconciled ? a.reconciled.determination : determinationOf(a);
  const facts = factsOf(a);
  return {
    schemaVersion: 1, kind: 'C017-reconcile-result', determination, key, leaseId: a.leaseId, runId: a.runId, userId: a.userId, actionId: a.actionId, epoch: a.epoch,
    idempotentReplay: Boolean(replay), facts, statement: C.describeDetermination(determination, facts),
  };
}

module.exports = Object.freeze({
  JournalInconsistent, ENTRY_TYPES, derive, lists, classify, compensationOf, determinationOf, outcomeOf, statusOf, factsOf, actionView,
  cancelResult, unreadableCancelResult, startResult, reconcileResult, standingUnitsOf,
});
