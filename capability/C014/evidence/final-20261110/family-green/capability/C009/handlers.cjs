'use strict';

// A typed domain refusal a handler may raise; the server maps it to its status and code and discards the draft.
class CommandError extends Error {
  constructor(status, code) {
    super(code);
    this.name = 'CommandError';
    this.status = status;
    this.code = code;
  }
}

const initialState = () => ({ pool: { size: 2 }, runs: [], scratches: [], approvals: [] });
const serial = (prefix, list) => `${prefix}-${String(list.length + 1).padStart(4, '0')}`;

// Handlers are synchronous: they get a private draft of the state, the verified actor and validated input, mutate the draft
// and return the result. The server keeps the draft only when the handler returns, so a failure has no effect.
const defaultHandlers = Object.freeze({
  'run.create'(draft, { actor, input }) {
    const run = { id: serial('run', draft.runs), name: input.name, units: input.units, owner: actor.subject };
    draft.runs.push(run);
    return { id: run.id };
  },
  'scratch.create'(draft, { actor, input }) {
    const scratch = { id: serial('scratch', draft.scratches), name: input.name, owner: actor.subject };
    draft.scratches.push(scratch);
    return { id: scratch.id };
  },
  'pool.resize'(draft, { input }) {
    draft.pool.size = input.size;
    return { size: input.size };
  },
  'experiment.approve'(draft, { actor, input }) {
    if (draft.approvals.some((approval) => approval.experimentId === input.experimentId)) throw new CommandError(409, 'ALREADY_APPROVED');
    draft.approvals.push({ experimentId: input.experimentId, approvedBy: actor.subject });
    return { experimentId: input.experimentId };
  }
});

module.exports = Object.freeze({ CommandError, defaultHandlers, initialState });
