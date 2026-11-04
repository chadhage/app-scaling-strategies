(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./errors.js'));
  else Object.defineProperty(root, 'C019Recovery', { value: factory(root.C019Errors) });
}(globalThis, function (types) {
  'use strict';

  const historyLimit = 48;
  const inspectionLimit = 3;

  class RecoveryConsole {
    #state;

    constructor(mode = 'historical-teaching') {
      if (!types || !['historical-teaching', 'actual-read-only'].includes(mode)) {
        throw new TypeError('The closed error contract and a read-only mode are required.');
      }
      this.#state = types.freeze({
        schemaVersion: 1, status: 'uninspected', failure: null,
        mode, unknownContext: { runId: true, epoch: true, pendingStep: true },
        operatorReviewNeeded: false, operatorReviewAcknowledged: false,
        inspectionCount: 0, lastInspection: null, actions: [],
        recoveryConfirmed: false, writesAuthorized: false,
        revision: 0, history: [],
        notification: { code: 'NO_OBSERVATION', message: types.notices.NO_OBSERVATION },
      });
    }

    get state() { return this.#state; }

    #available(state) {
      if (!state.failure || state.status === 'stopped') return [];
      return types.map[state.failure.error.code].actions.filter((action) =>
        !(action === 'reinspect' && (state.failure.context.runId === null ||
          state.inspectionCount >= inspectionLimit)) &&
        !(action === 'confirm-operator-review' && state.operatorReviewAcknowledged));
    }

    #finish(code, action, accepted, changes = {}, inspection = null) {
      if (this.#state.history.length >= historyLimit) {
        return { accepted: false, code: 'HISTORY_LIMIT', state: this.#state };
      }
      if (this.#state.history.length === historyLimit - 1) {
        code = 'HISTORY_LIMIT';
        changes = { status: 'stopped' };
        action = null;
        accepted = false;
        inspection = null;
      }
      const next = { ...this.#state, ...changes, revision: this.#state.revision + 1,
        notification: { code, message: types.notices[code] } };
      const entry = {
        sequence: next.revision, code, action, accepted, mode: next.mode,
        status: next.status, failure: next.failure, inspection,
        recoveryConfirmed: false, writesAuthorized: false,
      };
      next.history = [...this.#state.history, entry];
      next.actions = this.#available(next);
      this.#state = types.freeze(next);
      return { accepted, code, state: this.#state };
    }

    reject(code) {
      if (!['UNKNOWN_SELECTION', 'SELECTION_CHANGED', 'INVALID_OBSERVATION'].includes(code)) {
        code = 'INVALID_OBSERVATION';
      }
      const status = this.#state.failure === null ? 'rejected' : this.#state.status;
      return this.#finish(code, null, false, { status });
    }

    observe(value) {
      if (this.#state.status === 'stopped') return this.#finish('STOPPED', null, false);
      const failure = types.failure(value);
      if (!failure) return this.reject('INVALID_OBSERVATION');
      const held = failure.error.code === 'HOLD_UNOBSERVED';
      return this.#finish(held ? 'HOLD_OBSERVED' : 'FAILURE_OBSERVED', null, true, {
        status: held ? 'held-unobserved' : 'failed', failure,
        unknownContext: Object.fromEntries(Object.entries(failure.context).map(([key, item]) => [key, item === null])),
        operatorReviewNeeded: true, operatorReviewAcknowledged: false,
        inspectionCount: 0, lastInspection: null,
      });
    }

    dispatch(action, revision, value) {
      if (!Number.isSafeInteger(revision) || Object.is(revision, -0) || revision !== this.#state.revision) {
        return this.#finish('STALE_ACTION', null, false);
      }
      if (typeof action !== 'string' || !this.#state.actions.includes(action)) {
        const code = action === 'reinspect' && this.#state.inspectionCount >= inspectionLimit
          ? 'READ_LIMIT' : 'ACTION_NOT_ALLOWED';
        return this.#finish(code, null, false);
      }
      if (action === 'stop') return this.#finish('STOPPED', action, true, { status: 'stopped' });
      if (action === 'confirm-operator-review') {
        return this.#finish('REVIEW_NEEDED_CONFIRMED', action, true, { operatorReviewAcknowledged: true });
      }
      const original = this.#state.failure;
      const failure = types.failure(value);
      const data = types.readData(value);
      if (this.#state.mode === 'historical-teaching') {
        const replay = value === undefined ? original : failure;
        if (!replay) return this.#finish('INVALID_REINSPECTION', action, false);
        if (types.canonical(replay) !== types.canonical(original)) {
          return this.#finish('CONTEXT_MISMATCH', action, false);
        }
        return this.#finish('HISTORICAL_REINSPECTION', action, true, {
          inspectionCount: this.#state.inspectionCount + 1, lastInspection: replay,
        }, replay);
      }
      if (!failure && !data) return this.#finish('INVALID_REINSPECTION', action, false);
      if (failure && (types.canonical(failure.context) !== types.canonical(original.context) ||
          types.canonical(failure.priorAcknowledgment) !== types.canonical(original.priorAcknowledgment))) {
        return this.#finish('CONTEXT_MISMATCH', action, false);
      }
      if (data && data.acknowledgment.runId !== original.context.runId) {
        return this.#finish('CONTEXT_MISMATCH', action, false);
      }
      const inspected = failure || data;
      return this.#finish(failure ? 'READ_ERROR_RETAINED' : 'READ_DATA_NOT_RECOVERY', action, true, {
        inspectionCount: this.#state.inspectionCount + 1, lastInspection: inspected,
      }, inspected);
    }

    resetView() {
      return this.#finish('VIEW_RESET', null, true);
    }
  }

  return Object.freeze({ RecoveryConsole, historyLimit, inspectionLimit });
}));
