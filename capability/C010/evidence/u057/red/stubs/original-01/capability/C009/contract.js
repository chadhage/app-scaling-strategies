'use strict';

// C009 fixture contract: fake in-memory identities, the command x role table and input validation. Synthetic data only.
// A command that is missing from COMMANDS does not exist, and an entry without roles is denied for everyone (deny by default).
const ROLES = ['visitor', 'conductor', 'operator'];
const IDENTITIES = {
  visitor: { subject: 'visitor', role: 'visitor' },
  'conductor-a': { subject: 'conductor-a', role: 'conductor' },
  'conductor-b': { subject: 'conductor-b', role: 'conductor' },
  operator: { subject: 'operator', role: 'operator' }
};
const COMMANDS = {
  'run.create': { roles: ['conductor'] },
  'scratch.create': { roles: ['conductor'] },
  'pool.resize': { roles: ['operator'] },
  'experiment.approve': { roles: ['operator'] }
};
const LIMITS = {
  bodyBytes: 4096, auditEntries: 200, defaultTtlMs: 600000, maxTtlMs: 900000,
  // Per-connection and per-server resource bounds: idle time of a silent socket, open sockets, requests in flight per socket,
  // and the number of runs, scratches and approvals the in-memory state may hold.
  idleMs: 5000, connections: 256, pipelined: 4, entries: 1000,
  // One identity may hold at most ownerEntries runs, scratches and approvals, so two conductors and the operator's approvals always
  // fit under entries. The audit log keeps identified records (auditEntries) apart from anonymous refusals (anonymousEntries).
  ownerEntries: 400, anonymousEntries: 50,
  // Header and request timeout, and how often Node checks them: it checks only every checkMs (30 s unless set), so that is the slack.
  headerMs: 5000, checkMs: 1000
};
// Identity always comes from the verified token, so a body that names one is refused instead of ignored.
const CLAIM_FIELDS = ['role', 'roles', 'subject', 'owner', 'identity', 'actingAs'];
const EXPERIMENTS = ['exp-001', 'exp-002', 'exp-003'];
const COMMAND_NAME = /^[a-z][a-z0-9]*(\.[a-z][a-z0-9]*)*$/;
const NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
const isName = (value) => typeof value === 'string' && NAME.test(value);
const isInteger = (min, max) => (value) => Number.isInteger(value) && value >= min && value <= max;
const SCHEMAS = {
  'run.create': { name: isName, units: isInteger(1, 100) },
  'scratch.create': { name: isName },
  'pool.resize': { size: isInteger(0, 20) },
  'experiment.approve': { experimentId: (value) => EXPERIMENTS.includes(value) }
};

function isCommandName(value) {
  return typeof value === 'string' && value.length <= 64 && COMMAND_NAME.test(value);
}

function validateInput(command, body) {
  if (typeof command !== 'string' || !Object.hasOwn(SCHEMAS, command)) return { ok: false, code: 'COMMAND_UNKNOWN' };
  if (body === null || typeof body !== 'object' || Array.isArray(body)) return { ok: false, code: 'BODY_NOT_OBJECT' };
  const schema = SCHEMAS[command];
  for (const field of Object.keys(body)) {
    if (CLAIM_FIELDS.includes(field)) return { ok: false, code: 'IDENTITY_CLAIM_REJECTED', field };
    if (!Object.hasOwn(schema, field)) return { ok: false, code: 'INPUT_UNKNOWN_FIELD', field };
  }
  const value = {};
  for (const field of Object.keys(schema)) {
    if (!Object.hasOwn(body, field)) return { ok: false, code: 'INPUT_MISSING_FIELD', field };
    if (!schema[field](body[field])) return { ok: false, code: 'INPUT_INVALID', field };
    value[field] = body[field];
  }
  return { ok: true, value };
}

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}

module.exports = deepFreeze({
  roles: ROLES, identities: IDENTITIES, commands: COMMANDS, limits: LIMITS, claimFields: CLAIM_FIELDS, isCommandName, validateInput
});
