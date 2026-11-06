'use strict';

// RED subject: a behaviorless stub with the final API shape. It answers every request "not implemented" (HTTP 501),
// validates nothing, never calls a step and journals nothing, so every behavioral assertion of the initial tests fails.
const answer = () => ({
  status: 501,
  body: {
    kind: 'C043-not-implemented', accepted: false, replayed: false, outcome: 'rejected', classification: 'FAILED', run: { state: 'none' },
    bound: null, steps: [], ran: [], notRun: [], effects: [], recovery: { allowed: [], reason: 'not implemented' },
    error: { code: 'NOT_IMPLEMENTED', group: 'stub', message: 'not implemented', details: [{ path: '$', code: 'NOT_IMPLEMENTED' }] },
  },
});

async function openRunner() {
  return {
    run: async () => answer(),
    inspect: () => answer(),
    cancel: async () => answer(),
    resume: async () => answer(),
    unsupportedAction: () => answer(),
    halt() {},
  };
}

module.exports = Object.freeze({ openRunner });
