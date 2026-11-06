'use strict';

const { CommandError, initialState } = require('./handlers.cjs');

// The only place state changes. commit() applies a handler to a private draft and keeps it only if the handler returns
// and the draft still fits the limits (one identity's share, then the whole state), so neither a failure nor an over-limit command
// has any effect. The audit log has one ring PER identified subject and, apart, a ring of anonymous refusals, so that neither a flood of
// anonymous requests nor one identity's denials can ever evict the record of another identity (review F5, F11). Subjects come from the
// closed identity table of contract.js (four), so the log holds at most four rings of auditLimit plus the anonymous ring.
const ownedBy = (draft, subject) => [...draft.runs, ...draft.scratches].filter((entry) => entry.owner === subject).length
  + draft.approvals.filter((approval) => approval.approvedBy === subject).length;

function createLedger(auditLimit, entryLimit, { ownerLimit = entryLimit, anonymousLimit = auditLimit } = {}) {
  let state = initialState();
  let revision = 0;
  let sequence = 0;
  const rings = new Map();
  let anonymous = [];
  return {
    snapshot: () => ({ revision, state: structuredClone(state) }),
    auditLog: () => [...rings.values()].flat().concat(anonymous).sort((first, second) => first.seq - second.seq),
    record(entry) {
      sequence += 1;
      const stored = Object.freeze({ seq: sequence, ...entry });
      if (stored.subject === null) anonymous = [...anonymous, stored].slice(-anonymousLimit);
      else rings.set(stored.subject, [...(rings.get(stored.subject) || []), stored].slice(-auditLimit));
      return stored;
    },
    commit(handler, context) {
      const draft = structuredClone(state);
      const result = handler(draft, context);
      if (ownedBy(draft, context.actor.subject) > ownerLimit) throw new CommandError(409, 'OWNER_QUOTA_FULL');
      if (draft.runs.length + draft.scratches.length + draft.approvals.length > entryLimit) throw new CommandError(409, 'STATE_FULL');
      state = draft;
      revision += 1;
      return { revision, result };
    }
  };
}

module.exports = Object.freeze({ createLedger });
