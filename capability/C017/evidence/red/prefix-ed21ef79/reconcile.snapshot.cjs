'use strict';

// Pure derivation: every fact, status and cancel outcome is a function of the journal entries and nothing else.
// derive() also validates the journal grammar, so a forged or inconsistent decision makes the whole journal unreadable.
const C = require('./contract.js');

class JournalInconsistent extends Error {
  constructor(index, message) {
    super(`journal entry ${index}: ${message}`);
    this.name = 'JournalInconsistent';
    this.code = 'JOURNAL_INCONSISTENT';
    this.index = index;
  }
}
const bad = (index, message) => { throw new JournalInconsistent(index, message); };

const isInt = (v) => Number.isSafeInteger(v) && !Object.is(v, -0);
const kinds = {
  s: (v) => typeof v === 'string' && v.length <= 80, i: isInt, b: (v) => typeof v === 'boolean',
  a: (v) => Array.isArray(v) && v.length <= 16 && v.every((e) => isInt(e) || (C.isPlain(e) && isInt(e.step))),
};
const FIELDS = {
  boot: { bootId: 's' },
  'action-accepted': { leaseId: 's', runId: 's', userId: 's', actionId: 's', epoch: 'i', totalSteps: 'i', unitsPerStep: 'i', startKey: 's', startSha256: 's' },
  'step-intent': { actionId: 's', step: 'i' },
  'step-effect': { actionId: 's', step: 'i', units: 'i', standingUnits: 'i' },
  'action-completed': { actionId: 's', standingUnits: 'i' },
  'cancel-requested': { actionId: 's', key: 's', commandSha256: 's', compensate: 'b', observedEffects: 'i', observedInFlight: 'i' },
  'compensation-intent': { actionId: 's', step: 'i' },
  'compensation-effect': { actionId: 's', step: 'i', units: 'i', standingUnits: 'i' },
  'compensation-failed': { actionId: 's', step: 'i', reason: 's' },
  'cancel-decided': { actionId: 's', key: 's', outcome: 's', effectsStanding: 'a', stepsNotRun: 'a', undone: 'a', compensation: 's' },
  reconciled: { actionId: 's', key: 's', commandSha256: 's', determination: 's', effectsStanding: 'a', unknownSteps: 'a', stepsNotRun: 'a' },
};
const ENTRY_TYPES = Object.freeze(Object.keys(FIELDS));

function shape(entry, index) {
  if (!C.isPlain(entry) || typeof entry.type !== 'string' || !Object.hasOwn(FIELDS, entry.type)) bad(index, 'unknown entry type');
  const spec = FIELDS[entry.type];
  const keys = Object.keys(entry).sort().join();
  if (keys !== ['at', 'type', ...Object.keys(spec)].sort().join()) bad(index, 'fields are not exactly the closed set of the type');
  if (typeof entry.at !== 'string' || entry.at.length > 40) bad(index, 'the timestamp is not a short string');
  for (const [name, kind] of Object.entries(spec)) if (!kinds[kind](entry[name])) bad(index, `field ${name} has the wrong type`);
}

const num = (a, b) => a - b;
const sumOf = (map, skip) => [...map].filter(([step]) => !skip.has(step)).reduce((sum, [, units]) => sum + units, 0);
const same = (claimed, actual) => JSON.stringify(claimed.map((e) => (typeof e === 'number' ? e : e.step))) === JSON.stringify(actual);
const standingUnitsOf = (a) => sumOf(a.effects, a.comp.effects);

function newAction(e) {
  return {
    leaseId: e.leaseId, runId: e.runId, userId: e.userId, actionId: e.actionId, epoch: e.epoch, totalSteps: e.totalSteps, unitsPerStep: e.unitsPerStep,
    effects: new Map(), intents: new Set(), pendingStep: 0, completed: false, cancel: null,
    comp: { intents: new Set(), effects: new Map(), failed: null, pendingStep: 0 }, interrupted: false, reconciled: null, closed: false,
  };
}

function lists(a) {
  const unknown = [];
  if (a.interrupted) for (const step of [a.pendingStep, a.comp.pendingStep]) if (step && !unknown.includes(step)) unknown.push(step);
  unknown.sort(num);
  const standing = [...a.effects.keys()].filter((s) => !a.comp.effects.has(s) && !unknown.includes(s)).sort(num);
  const notRun = Array.from({ length: a.totalSteps }, (_, i) => i + 1).filter((s) => !a.intents.has(s));
  return { standing, undone: [...a.comp.effects.keys()], notRun, unknown };
}

function compensationOf(a) {
  if (!a.cancel || !a.cancel.compensate) return 'NOT_REQUESTED';
  if (a.comp.failed) return 'FAILED';
  if (a.effects.size > 0 && a.comp.effects.size === a.effects.size) return 'COMPLETE';
  if (a.comp.intents.size > 0) return a.interrupted ? 'INTERRUPTED' : 'IN_PROGRESS';
  return 'NOT_ATTEMPTED';
}

function classify(a) {
  const l = lists(a);
  if (a.completed) return 'CANCEL_TOO_LATE';
  if (a.interrupted || l.unknown.length) return 'CANCEL_UNKNOWN';
  if (a.comp.failed) return 'CANCELLED_PARTIAL';
  if (a.cancel && a.cancel.compensate && l.undone.length > 0 && l.standing.length === 0) return 'COMPENSATED';
  if (l.standing.length === 0 && l.undone.length === 0 && a.intents.size === 0) return 'CANCELLED_BEFORE_EFFECT';
  return 'CANCELLED_PARTIAL';
}

function determinationOf(a) {
  if (a.cancel && !a.cancel.decided && !a.completed) return 'CANCEL_UNKNOWN';
  return lists(a).unknown.length ? 'INTERRUPTED_UNKNOWN' : 'INTERRUPTED_KNOWN';
}

function outcomeOf(a) {
  if (a.cancel && a.cancel.decided) return a.cancel.outcome;
  if (a.completed) return 'CANCEL_TOO_LATE';
  return a.interrupted ? 'CANCEL_UNKNOWN' : null;
}

function apply(a, e, i, claim) {
  const live = !a.interrupted && !a.closed && !a.completed;
  switch (e.type) {
    case 'step-intent':
      if (!live || a.cancel || a.pendingStep || e.step !== a.effects.size + 1 || e.step > a.totalSteps) bad(i, 'step intent is out of order');
      a.intents.add(e.step);
      a.pendingStep = e.step;
      break;
    case 'step-effect':
      if (a.interrupted || a.closed || a.pendingStep !== e.step || e.units !== a.unitsPerStep || e.standingUnits !== standingUnitsOf(a) + e.units) bad(i, 'step effect does not match its intent');
      a.effects.set(e.step, e.units);
      a.pendingStep = 0;
      break;
    case 'action-completed':
      if (!live || a.pendingStep || a.effects.size !== a.totalSteps || e.standingUnits !== standingUnitsOf(a)) bad(i, 'completion does not match the effects');
      a.completed = true;
      break;
    case 'cancel-requested':
      if (a.cancel || a.closed || a.interrupted || e.observedEffects !== a.effects.size || e.observedInFlight !== a.pendingStep) bad(i, 'cancel request does not match the state it saw');
      claim(i, e.key, 'cancel', e.commandSha256, a.actionId);
      a.cancel = { key: e.key, compensate: e.compensate, decided: false, outcome: null };
      break;
    case 'compensation-intent': {
      const next = [...a.effects.keys()].filter((s) => !a.comp.effects.has(s)).sort(num).pop();
      if (!a.cancel || !a.cancel.compensate || a.cancel.decided || !live || a.completed || a.pendingStep || a.comp.failed || a.comp.pendingStep || e.step !== next) bad(i, 'compensation is not allowed here');
      a.comp.pendingStep = e.step;
      a.comp.intents.add(e.step);
      break;
    }
    case 'compensation-effect':
      if (a.interrupted || a.comp.pendingStep !== e.step || e.units !== -a.effects.get(e.step) || e.standingUnits !== standingUnitsOf(a) + e.units) bad(i, 'compensating effect does not match its intent');
      a.comp.effects.set(e.step, a.effects.get(e.step));
      a.comp.pendingStep = 0;
      break;
    case 'compensation-failed':
      if (a.interrupted || a.comp.pendingStep !== e.step || e.reason !== 'SYNTHETIC_FAULT') bad(i, 'compensation failure does not match its intent');
      a.comp.failed = { step: e.step, reason: e.reason };
      a.comp.pendingStep = 0;
      break;
    case 'cancel-decided': {
      if (!a.cancel || a.cancel.key !== e.key || a.cancel.decided || a.pendingStep || a.comp.pendingStep || a.interrupted) bad(i, 'decision without a settled request');
      if (a.cancel.compensate && !a.completed && a.effects.size > 0 && !a.comp.failed && a.comp.effects.size !== a.effects.size) bad(i, 'decision before compensation finished');
      const l = lists(a);
      if (e.outcome !== classify(a) || !same(e.effectsStanding, l.standing) || !same(e.stepsNotRun, l.notRun) || !same(e.undone, l.undone) || e.compensation !== compensationOf(a)) {
        bad(i, 'the recorded decision is not what the journal proves');
      }
      a.cancel.decided = true;
      a.cancel.outcome = e.outcome;
      a.closed = true;
      break;
    }
    case 'reconciled': {
      if (!a.interrupted || a.closed) bad(i, 'only an interrupted action can be reconciled');
      claim(i, e.key, 'reconcile', e.commandSha256, a.actionId);
      const l = lists(a);
      if (e.determination !== determinationOf(a) || !same(e.effectsStanding, l.standing) || !same(e.unknownSteps, l.unknown) || !same(e.stepsNotRun, l.notRun)) bad(i, 'the reconciliation is not what the journal proves');
      a.reconciled = { key: e.key, determination: e.determination };
      a.closed = true;
      break;
    }
    default:
      bad(i, 'unexpected entry type');
  }
}

function derive(entries) {
  const keys = new Map();
  const actions = [];
  let cur = null;
  let boots = 0;
  const claim = (index, key, kind, sha256, actionId) => {
    if (keys.has(key)) bad(index, 'a key may be journaled once');
    keys.set(key, { kind, sha256, actionId });
  };
  entries.forEach((e, index) => {
    shape(e, index);
    if (e.type === 'boot') {
      boots += 1;
      if (cur && !cur.completed && !cur.closed) cur.interrupted = true;
    } else if (e.type === 'action-accepted') {
      if (cur && !(cur.closed || cur.completed)) bad(index, 'a new action began before the previous one settled');
      if (e.epoch !== (cur ? cur.epoch + 1 : 1) || e.totalSteps < 1 || e.totalSteps > 8 || e.unitsPerStep < 1 || e.unitsPerStep > 1000) bad(index, 'epoch or sizing is not valid');
      cur = newAction(e);
      actions.push(cur);
      claim(index, e.startKey, 'start', e.startSha256, e.actionId);
    } else {
      if (!cur || e.actionId !== cur.actionId) bad(index, 'entry does not belong to the current action');
      apply(cur, e, index, claim);
    }
  });
  return { keys, actions, action: cur, boots, epoch: cur ? cur.epoch : 0 };
}

function statusOf(a) {
  if (a.reconciled) return 'RECONCILED';
  if (a.cancel && a.cancel.decided) return a.cancel.outcome === 'CANCEL_TOO_LATE' ? 'COMPLETED' : 'CANCELLED';
  if (a.completed) return 'COMPLETED';
  if (a.interrupted) return 'INTERRUPTED';
  if (a.cancel) return 'CANCEL_REQUESTED';
  return a.intents.size ? 'RUNNING' : 'ACCEPTED';
}

function factsOf(a) {
  const l = lists(a);
  const unit = (step) => ({ step, units: a.effects.get(step) });
  const standing = l.standing.map(unit);
  return {
    totalSteps: a.totalSteps, effectsStanding: standing, stepsNotRun: l.notRun, unknownSteps: l.unknown, undone: l.undone.map(unit),
    standingUnits: standing.reduce((sum, e) => sum + e.units, 0), standingUnitsExact: l.unknown.length === 0, compensation: compensationOf(a),
    compensationFailure: a.comp.failed ? { step: a.comp.failed.step, reason: a.comp.failed.reason } : null,
  };
}

const nullFacts = () => ({
  totalSteps: null, effectsStanding: null, stepsNotRun: null, unknownSteps: null, undone: null, standingUnits: null, standingUnitsExact: false, compensation: null, compensationFailure: null,
});

function actionView(a) {
  const status = statusOf(a);
  const live = ['ACCEPTED', 'RUNNING', 'CANCEL_REQUESTED'].includes(status);
  const facts = factsOf(a);
  const l = lists(a);
  const stepState = (step) => {
    if (l.unknown.includes(step)) return 'UNKNOWN';
    if (a.comp.effects.has(step)) return 'REVERSED';
    if (a.effects.has(step)) return 'STANDS';
    if (a.intents.has(step)) return 'IN_FLIGHT';
    return live ? 'PENDING' : 'NOT_RUN';
  };
  return {
    leaseId: a.leaseId, runId: a.runId, userId: a.userId, actionId: a.actionId, epoch: a.epoch, status, live, totalSteps: a.totalSteps, unitsPerStep: a.unitsPerStep,
    steps: Array.from({ length: a.totalSteps }, (_, i) => ({ step: i + 1, state: stepState(i + 1), units: a.unitsPerStep })),
    effectsStanding: facts.effectsStanding, stepsNotRun: live ? [] : facts.stepsNotRun, stepsPending: live ? facts.stepsNotRun : [], unknownSteps: facts.unknownSteps,
    undone: facts.undone, standingUnits: facts.standingUnits, standingUnitsExact: facts.standingUnitsExact, compensation: facts.compensation, compensationFailure: facts.compensationFailure,
    cancel: a.cancel ? { key: a.cancel.key, compensate: a.cancel.compensate, decided: a.cancel.decided, outcome: outcomeOf(a), compensation: facts.compensation } : null,
    reconciliation: a.reconciled ? { ...a.reconciled } : null,
  };
}

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
