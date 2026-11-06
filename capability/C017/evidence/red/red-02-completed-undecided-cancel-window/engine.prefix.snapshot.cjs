'use strict';

// Serialized command engine for ONE synthetic action on a fictional lease. All truth is the journal: the runner appends
// intent and effect entries, a cancel is applied only at a step boundary, and every answer is built by reconcile.cjs from
// the journal. JavaScript's single thread plus synchronous appends serialize every decision; gates only add waiting points.
const { EventEmitter } = require('node:events');
const { randomBytes } = require('node:crypto');
const { digest } = require('../C015/contract.cjs');
const C = require('./contract.js');
const R = require('./reconcile.cjs');
const { openJournal, MAX_BYTES } = require('./journal.cjs');

const num = (a, b) => a - b;
const RESERVE_BYTES = 49152;
const defaultIds = () => randomBytes(4).toString('hex');
const defaultNow = () => new Date().toISOString();

function createEngine(options) {
  const { dir, steps = 4, unitsPerStep = 5, gates = {}, ids = defaultIds, now = defaultNow, faults = {} } = options || {};
  if (!Number.isInteger(steps) || steps < 1 || steps > 8 || !Number.isInteger(unitsPerStep) || unitsPerStep < 1 || unitsPerStep > 1000) {
    throw new RangeError('steps must be 1 to 8 and unitsPerStep 1 to 1000');
  }
  const events = new EventEmitter();
  events.setMaxListeners(0);
  const journal = openJournal(dir);
  let entries = [];
  let derived = null;
  let unreadable = null;
  let closed = false;
  let runner = Promise.resolve();
  let pending = null;
  let control = new AbortController();
  let closeNow;
  const closing = new Promise((resolve) => { closeNow = resolve; });

  const problem = (error) => ({ code: error.code || 'JOURNAL_UNREADABLE', message: String(error.message).slice(0, 200) });
  function markUnreadable(error) {
    unreadable = problem(error);
    derived = null;
    if (pending) {
      const waiting = pending;
      pending = null;
      waiting.resolve({ status: 503, body: R.unreadableCancelResult(waiting.key) });
    }
    events.emit('append');
  }

  function load() {
    try {
      entries = journal.read();
      derived = R.derive(entries);
    } catch (error) {
      entries = [];
      derived = null;
      unreadable = problem(error);
    }
  }

  function record(batch) {
    try {
      journal.append(batch);
      entries = entries.concat(batch.map((entry) => structuredClone(entry)));
      derived = R.derive(entries);
    } catch (error) {
      markUnreadable(error);
      throw error;
    }
    events.emit('append');
  }

  const current = () => (derived ? {
    leaseId: C.identity.leaseId, runId: C.identity.runId, userId: C.identity.userId, epoch: derived.epoch,
    actionId: derived.action ? derived.action.actionId : null, status: derived.action ? R.statusOf(derived.action) : null,
  } : null);
  const failure = (code, raw, details) => C.failure(code, { requested: raw && typeof raw === 'object' ? raw : {}, current: current(), details });
  const answer = (status, body) => ({ status, body });
  const cancelAnswer = (body) => answer(C.HTTP_STATUS[body.outcome], body);
  const actionOf = (actionId) => derived.actions.find((a) => a.actionId === actionId);

  function view() {
    if (unreadable) {
      return { schemaVersion: 1, kind: 'C017-state', journalStatus: 'UNREADABLE', problem: unreadable, lease: C.identity, epoch: null, action: null, journal: [], statement: C.describe('CANCEL_UNKNOWN', null) };
    }
    return {
      schemaVersion: 1, kind: 'C017-state', journalStatus: 'READABLE', problem: null, lease: C.identity, epoch: derived.epoch,
      action: derived.action ? R.actionView(derived.action) : null, journal: structuredClone(entries), statement: null,
    };
  }

  function waitFor(predicate) {
    return new Promise((resolve) => {
      const check = () => {
        const state = view();
        if (!predicate(state)) return false;
        events.off('append', check);
        resolve(state);
        return true;
      };
      if (!check()) events.on('append', check);
    });
  }

  const gateWait = (gate, step, signal) => Promise.resolve(gate ? gate(step, { signal }) : undefined);

  function decide(key) {
    const a = derived.action;
    const l = R.lists(a);
    record([{ type: 'cancel-decided', at: now(), actionId: a.actionId, key, outcome: R.classify(a), effectsStanding: l.standing, stepsNotRun: l.notRun, undone: l.undone, compensation: R.compensationOf(a) }]);
    return cancelAnswer(R.cancelResult(derived.action, key, false));
  }

  async function finishCancel() {
    const waiting = pending;
    const { actionId } = derived.action;
    if (waiting.compensate && !derived.action.completed) {
      for (;;) {
        const a = derived.action;
        const next = [...a.effects.keys()].filter((s) => !a.comp.effects.has(s)).sort(num).pop();
        if (!next) break;
        record([{ type: 'compensation-intent', at: now(), actionId, step: next }]);
        await Promise.race([gateWait(gates.inCompensation, next, control.signal), closing]);
        if (closed) return;
        if (faults.compensation && faults.compensation(next)) {
          record([{ type: 'compensation-failed', at: now(), actionId, step: next, reason: 'SYNTHETIC_FAULT' }]);
          break;
        }
        const units = a.effects.get(next);
        record([{ type: 'compensation-effect', at: now(), actionId, step: next, units: -units, standingUnits: R.standingUnitsOf(derived.action) - units }]);
      }
    }
    const result = decide(waiting.key);
    pending = null;
    waiting.resolve(result);
  }

  async function run(actionId) {
    const woken = new Promise((resolve) => control.signal.addEventListener('abort', resolve, { once: true }));
    for (let step = 1; step <= steps; step += 1) {
      await Promise.race([gateWait(gates.beforeStep, step, control.signal), woken]);
      if (closed) return;
      if (pending) return finishCancel();
      record([{ type: 'step-intent', at: now(), actionId, step }]);
      await Promise.race([gateWait(gates.inStep, step), closing]);
      if (closed) return;
      const standingUnits = R.standingUnitsOf(derived.action) + unitsPerStep;
      const batch = [{ type: 'step-effect', at: now(), actionId, step, units: unitsPerStep, standingUnits }];
      if (step === steps) batch.push({ type: 'action-completed', at: now(), actionId, standingUnits });
      record(batch);
      if (pending) return finishCancel();
    }
    return undefined;
  }

  function launch(actionId) {
    control = new AbortController();
    runner = run(actionId).catch((error) => { if (!unreadable) markUnreadable(error); });
  }

  function identityFailure(cmd) {
    if (cmd.leaseId !== C.identity.leaseId) return 'UNKNOWN_LEASE';
    if (cmd.runId !== C.identity.runId) return 'UNKNOWN_RUN';
    if (cmd.userId !== C.identity.userId) return 'UNKNOWN_USER';
    return null;
  }

  function epochFailure(cmd, wanted) {
    if (wanted < derived.epoch) return 'STALE_EPOCH';
    return wanted > derived.epoch ? 'FUTURE_EPOCH' : null;
  }

  function start(cmd) {
    const known = derived.keys.get(cmd.key);
    if (known) {
      if (known.kind !== 'start' || known.sha256 !== digest(cmd)) return failure('IDEMPOTENCY_CONFLICT', cmd);
      return answer(202, R.startResult(actionOf(known.actionId), true));
    }
    const refused = identityFailure(cmd) || epochFailure(cmd, cmd.expectedEpoch);
    if (refused) return failure(refused, cmd);
    const previous = derived.action;
    if (previous && !(previous.closed || previous.completed)) return failure('ACTION_NOT_SETTLED', cmd);
    if (journal.size() + RESERVE_BYTES > MAX_BYTES) return failure('JOURNAL_FULL', cmd);
    const epoch = derived.epoch + 1;
    const actionId = `act-${epoch}-${ids()}`;
    record([{
      type: 'action-accepted', at: now(), leaseId: cmd.leaseId, runId: cmd.runId, userId: cmd.userId, actionId, epoch, totalSteps: steps, unitsPerStep,
      startKey: cmd.key, startSha256: digest(cmd),
    }]);
    launch(actionId);
    return answer(202, R.startResult(derived.action, false));
  }

  function cancel(cmd) {
    const known = derived.keys.get(cmd.key);
    if (known) {
      if (known.kind !== 'cancel' || known.sha256 !== digest(cmd)) return failure('IDEMPOTENCY_CONFLICT', cmd);
      if (pending && pending.key === cmd.key) return pending.promise.then((first) => answer(first.status, { ...first.body, idempotentReplay: true }));
      return cancelAnswer(R.cancelResult(actionOf(known.actionId), cmd.key, true));
    }
    const refused = identityFailure(cmd) || epochFailure(cmd, cmd.epoch);
    if (refused) return failure(refused, cmd);
    const a = derived.action;
    if (!a || a.actionId !== cmd.actionId) return failure('UNKNOWN_ACTION', cmd);
    if (a.reconciled) return failure('ACTION_NOT_RUNNING', cmd);
    if (a.interrupted) return cancelAnswer(R.cancelResult(a, cmd.key, false));
    if (a.closed) return failure('ALREADY_TERMINAL', cmd);
    if (pending) return failure('CANCEL_IN_PROGRESS', cmd);
    record([{
      type: 'cancel-requested', at: now(), actionId: a.actionId, key: cmd.key, commandSha256: digest(cmd), compensate: cmd.compensate,
      observedEffects: a.effects.size, observedInFlight: a.pendingStep,
    }]);
    if (derived.action.completed) return decide(cmd.key);
    const waiting = { key: cmd.key, compensate: cmd.compensate };
    waiting.promise = new Promise((resolve) => { waiting.resolve = resolve; });
    pending = waiting;
    control.abort();
    return waiting.promise;
  }

  function reconcile(cmd) {
    const known = derived.keys.get(cmd.key);
    if (known) {
      if (known.kind !== 'reconcile' || known.sha256 !== digest(cmd)) return failure('IDEMPOTENCY_CONFLICT', cmd);
      return answer(200, R.reconcileResult(actionOf(known.actionId), cmd.key, true));
    }
    const refused = identityFailure(cmd) || epochFailure(cmd, cmd.epoch);
    if (refused) return failure(refused, cmd);
    const a = derived.action;
    if (!a || a.actionId !== cmd.actionId) return failure('UNKNOWN_ACTION', cmd);
    if (a.reconciled) return failure('ALREADY_TERMINAL', cmd);
    if (!a.interrupted) return failure('NOT_INTERRUPTED', cmd);
    const l = R.lists(a);
    record([{
      type: 'reconciled', at: now(), actionId: a.actionId, key: cmd.key, commandSha256: digest(cmd), determination: R.determinationOf(a),
      effectsStanding: l.standing, unknownSteps: l.unknown, stepsNotRun: l.notRun,
    }]);
    return answer(200, R.reconcileResult(derived.action, cmd.key, false));
  }

  const handlers = { start, cancel, reconcile };

  async function execute(raw) {
    const parsed = C.validateCommand(raw);
    if (!parsed.ok) return failure('INVALID_COMMAND', C.isPlain(raw) ? raw : {}, parsed.details);
    const cmd = parsed.command;
    if (closed) return failure('SERVER_CLOSING', cmd);
    if (unreadable) return cmd.kind === 'cancel' ? answer(503, R.unreadableCancelResult(cmd.key)) : failure('STATE_UNREADABLE', cmd);
    return handlers[cmd.kind](cmd);
  }

  async function close() {
    if (!closed) {
      closed = true;
      control.abort();
      closeNow();
      if (pending) {
        const waiting = pending;
        pending = null;
        waiting.resolve(failure('SERVER_CLOSING', {}));
      }
    }
    await runner;
  }

  load();
  if (!unreadable) record([{ type: 'boot', at: now(), bootId: ids() }]);
  return Object.freeze({ execute, view, waitFor, settled: () => runner, close });
}

module.exports = Object.freeze({ createEngine });
