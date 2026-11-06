'use strict';

const { CommandError, initialState } = require('./handlers.cjs');

// The only place state changes. commit() applies a handler to a private draft and keeps it only if the handler returns
// and the draft still fits the entry limit, so neither a failure nor an over-limit command has any effect.
function createLedger(auditLimit, entryLimit) {
  let state = initialState();
  let revision = 0;
  let sequence = 0;
  let audit = [];
  return {
    snapshot: () => ({ revision, state: structuredClone(state) }),
    auditLog: () => [...audit],
    record(entry) {
      sequence += 1;
      const stored = Object.freeze({ seq: sequence, ...entry });
      audit = [...audit, stored].slice(-auditLimit);
      return stored;
    },
    commit(handler, context) {
      const draft = structuredClone(state);
      const result = handler(draft, context);
      if (draft.runs.length + draft.scratches.length + draft.approvals.length > entryLimit) throw new CommandError(409, 'STATE_FULL');
      state = draft;
      revision += 1;
      return { revision, result };
    }
  };
}

module.exports = Object.freeze({ createLedger });
