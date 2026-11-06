'use strict';
// Naive RED subject, retained and never edited: it believes whatever the client says. It authenticates nothing,
// takes the role from a client header and accepts every command, so the specified server-side enforcement is absent.
module.exports = {
  roles: ['visitor', 'conductor', 'operator'],
  identities: {
    visitor: { subject: 'visitor', role: 'visitor' },
    'conductor-a': { subject: 'conductor-a', role: 'conductor' },
    'conductor-b': { subject: 'conductor-b', role: 'conductor' },
    operator: { subject: 'operator', role: 'operator' }
  },
  commands: {
    'run.create': { roles: ['conductor'] },
    'scratch.create': { roles: ['conductor'] },
    'pool.resize': { roles: ['operator'] },
    'experiment.approve': { roles: ['operator'] }
  },
  limits: { bodyBytes: 4096, auditEntries: 200 },
  validateInput: (command, body) => ({ ok: true, value: body })
};
