(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C042Contract', { value: factory() });
}(globalThis, function () {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const SCHEMA_VERSION = 1;
  const STEP = 'reserve-capacity';
  const SCOPE = 'synthetic-loopback-only';
  const LEASES = freeze({ 'synthetic-lease-001': 100, 'synthetic-lease-002': 10 });
  const UNITS = freeze({ min: 1, max: 10 });
  const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{7,63}$/;
  const LIMITS = freeze({ bodyBytes: 2048, steps: 256, depth: 6, stringLength: 128 });
  const INPUT_KEYS = freeze(['schemaVersion', 'step', 'idempotencyKey', 'leaseId', 'units']);
  const OUTCOMES = freeze(['succeeded', 'rejected', 'unsupported', 'unknown', 'cancelled', 'interrupted']);
  // C035's honest classification names; only a journaled effect is ever COMPLETED.
  const CLASSIFICATIONS = freeze({
    succeeded: 'COMPLETED', rejected: 'FAILED', unsupported: 'UNSUPPORTED',
    unknown: 'UNKNOWN', cancelled: 'CANCELLED', interrupted: 'INTERRUPTED',
  });
  const STATES = freeze(['none', 'in-flight', 'committed', 'cancelled', 'interrupted', 'uncertain']);
  const REQUEST_ACTIONS = freeze(['submit', 'inspect', 'cancel', 'resume', 'none']);
  const RECORD_TYPES = freeze(['begin', 'resume', 'commit', 'cancel']);

  const ACTIONS = freeze({
    retry: {
      label: 'Retry with the same key', method: 'POST', path: '/v1/steps',
      description: 'Resend the identical request. The recorded result comes back and no second effect is applied.',
    },
    'correct-and-resubmit': {
      label: 'Correct and resubmit', method: 'POST', path: '/v1/steps',
      description: 'Edit the request and submit it again. A rejected request never used its key; a cancelled step needs a new key.',
    },
    cancel: {
      label: 'Cancel the step', method: 'POST', path: '/v1/steps/{key}/cancel',
      description: 'Explicitly cancel a step whose effect is not recorded. Nothing is undone because nothing was applied.',
    },
    resume: {
      label: 'Resume the step', method: 'POST', path: '/v1/steps/{key}/resume',
      description: 'Run an interrupted step from its persisted input to exactly one effect. Never automatic.',
    },
    inspect: {
      label: 'Inspect the step', method: 'GET', path: '/v1/steps/{key}',
      description: 'Read the current state of the step. Changes nothing.',
    },
  });
  const ACTION_NAMES = freeze(Object.keys(ACTIONS));

  const DIDNOT = freeze({
    NO_EFFECT: 'No capacity was reserved; the lease ledger is unchanged.',
    NO_JOURNAL_ENTRY: 'Nothing was written to the journal; the idempotency key is still unused.',
    NO_SECOND_EFFECT: 'No second reservation was made for this key.',
    NO_EFFECT_BY_THIS_REQUEST: 'This request applied no effect itself; it reports the recorded state.',
    NO_UNDO: 'Nothing was undone; this service has no undo or rollback.',
    NO_AUTOMATIC_RETRY: 'Nothing was retried, resumed or cancelled automatically.',
    NOT_CONFIRMED: 'The effect is not confirmed; this is not reported as success.',
    ACTION_NOT_PERFORMED: 'The requested action was not performed.',
    NO_CLOUD_CALL: 'No cloud, network or real service was contacted; all data is synthetic.',
  });

  const STATE_ACTIONS = freeze({
    none: [], 'in-flight': ['cancel', 'retry', 'inspect'], committed: ['retry', 'inspect'],
    cancelled: ['correct-and-resubmit', 'inspect'], interrupted: ['resume', 'cancel', 'inspect'],
    uncertain: ['retry', 'inspect'],
  });
  const STATE_REASONS = freeze({
    none: 'No step exists for this key.',
    'in-flight': 'The effect is not recorded yet, so the outcome is unknown until the step finishes.',
    committed: 'The effect is recorded exactly once; no recovery is needed.',
    cancelled: 'The step was cancelled explicitly; no effect exists.',
    interrupted: 'The step began but has no terminal record; it was not resumed or cancelled automatically.',
    uncertain: 'The journal write could not be confirmed; a retry re-reads the journal to decide.',
  });

  const entry = (group, status, outcome, actions, message) => ({ group, status, outcome, actions, message });
  const input = (message, status = 400) => entry('input', status, 'rejected', ['correct-and-resubmit'], message);
  const refused = (status, message) => entry('transport', status, 'rejected', [], message);
  const ERRORS = freeze({
    INVALID_JSON: input('The body is not valid JSON.'),
    REQUIRED_JSON: input('A JSON body is required; none was supplied.'),
    INVALID_ENCODING: input('The body is not valid UTF-8.'),
    INVALID_SHAPE: input('The body must be exactly one JSON object.'),
    REQUIRED_FIELD: input('A required field is missing; no default is supplied.'),
    UNKNOWN_FIELD: input('The contract is closed; unknown fields are refused.'),
    DUPLICATE_FIELD: input('A field appears more than once; a later value never hides an earlier one.'),
    FORBIDDEN_FIELD: input('Prototype-related field names are refused.'),
    WRONG_TYPE: input('A field has the wrong JSON type.'),
    UNSAFE_NUMBER: input('Numbers must be plain safe integers: no fraction, exponent, negative zero or overflow.'),
    FIELD_OUT_OF_RANGE: input('A value is outside the closed range or set.'),
    INVALID_FORMAT: input('A string does not match its required format.'),
    NESTING_TOO_DEEP: input('The JSON nesting exceeds the limit.'),
    STRING_TOO_LONG: input('A string exceeds the length limit.'),
    BODY_TOO_LARGE: input('The body exceeds the size limit.', 413),
    UNSUPPORTED_MEDIA_TYPE: input('Only application/json with an optional utf-8 charset is accepted.', 415),
    UNEXPECTED_BODY: refused(400, 'This request must not carry a body.'),
    INVALID_QUERY: refused(400, 'This route accepts no query parameters.'),
    INVALID_URL: refused(400, 'An explicit local URL without a fragment is required.'),
    URL_TOO_LONG: refused(414, 'The request URL is too long.'),
    LOCAL_HOST_REQUIRED: refused(421, 'Only the actual 127.0.0.1 listener is supported.'),
    CROSS_ORIGIN_DENIED: refused(403, 'Only the loopback origin of this service is supported.'),
    NOT_FOUND: refused(404, 'No route has that path.'),
    METHOD_NOT_ALLOWED: refused(405, 'That method is not supported for this route.'),
    IDEMPOTENCY_KEY_CONFLICT: entry('conflict', 409, 'rejected', ['correct-and-resubmit', 'inspect'],
      'The key was already used with different inputs; nothing was changed.'),
    CAPACITY_EXHAUSTED: entry('conflict', 409, 'rejected', ['correct-and-resubmit'],
      'The lease does not have that many free synthetic units.'),
    STEP_LIMIT_REACHED: entry('conflict', 503, 'rejected', [], 'The bounded number of steps is reached; nothing was admitted.'),
    STEP_NOT_FOUND: entry('state', 404, 'rejected', ['correct-and-resubmit'], 'No step was admitted under that key.'),
    ACTION_NOT_ALLOWED: entry('state', 409, 'rejected', null, 'That action is not offered in the current state of the step.'),
    UNSUPPORTED_STEP: entry('unsupported', 422, 'unsupported', ['correct-and-resubmit'], 'Only the reserve-capacity step is supported.'),
    UNSUPPORTED_SCHEMA_VERSION: entry('unsupported', 422, 'unsupported', ['correct-and-resubmit'], 'Only schemaVersion 1 is supported.'),
    UNSUPPORTED_ACTION: entry('unsupported', 422, 'unsupported', null, 'That action does not exist; there is no undo, rollback or release.'),
    STEP_IN_FLIGHT: entry('lifecycle', 409, 'unknown', null, 'The step is in flight; its effect is not recorded yet.'),
    STEP_CANCELLED: entry('lifecycle', 409, 'cancelled', null, 'The step was cancelled explicitly; no effect exists.'),
    STEP_INTERRUPTED: entry('lifecycle', 409, 'interrupted', null, 'The step began but never finished; no effect is recorded.'),
    JOURNAL_UNCERTAIN: entry('persistence', 503, 'unknown', null, 'The journal write could not be confirmed; the effect is not confirmed.'),
    JOURNAL_UNAVAILABLE: entry('persistence', 503, 'unknown', [], 'The journal cannot be read; nothing is reported as done.'),
    INTERNAL_ERROR: entry('persistence', 500, 'unknown', ['retry', 'inspect'], 'An unexpected local failure occurred; nothing is reported as done.'),
    TRANSCRIPT_UNAVAILABLE: refused(500, 'The server-produced transcript could not be produced; no observation was made.'),
  });

  const ENVELOPE_KEYS = ['schemaVersion', 'kind', 'action', 'accepted', 'replayed', 'outcome', 'classification', 'terminal',
    'idempotencyKey', 'inputSha256', 'validatedInput', 'step', 'effect', 'didNot', 'error', 'recovery', 'trail', 'attempts', 'scope'];
  const EFFECT_KEYS = ['applied', 'appliedByThisRequest', 'leaseId', 'units', 'reservedAfter', 'capacity'];
  const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
  const record = (value, keys) => value !== null && typeof value === 'object' && !Array.isArray(value) &&
    Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
  const integer = (value, min, max = Number.MAX_SAFE_INTEGER) =>
    Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max;
  const text = (value, max) => typeof value === 'string' && value.length > 0 && value.length <= max;

  function allowedActions(state) {
    return own(STATE_ACTIONS, state) ? [...STATE_ACTIONS[state]] : [];
  }

  function inputOk(value) {
    return record(value, INPUT_KEYS) && value.schemaVersion === SCHEMA_VERSION && value.step === STEP &&
      typeof value.idempotencyKey === 'string' && KEY_PATTERN.test(value.idempotencyKey) &&
      own(LEASES, value.leaseId) && integer(value.units, UNITS.min, UNITS.max);
  }

  function effectOk(effect) {
    if (!record(effect, EFFECT_KEYS) || typeof effect.appliedByThisRequest !== 'boolean' ||
        ![true, false, null].includes(effect.applied)) return false;
    const named = effect.leaseId !== null;
    return named === (effect.units !== null) && (named ? own(LEASES, effect.leaseId) &&
      integer(effect.units, UNITS.min, UNITS.max) && effect.capacity === LEASES[effect.leaseId] : effect.capacity === null) &&
      (effect.reservedAfter === null || (named && integer(effect.reservedAfter, effect.units, effect.capacity)));
  }

  function errorOk(error) {
    if (error === null) return true;
    if (!record(error, ['code', 'group', 'message', 'details']) || !own(ERRORS, error.code)) return false;
    const known = ERRORS[error.code];
    return error.group === known.group && error.message === known.message && Array.isArray(error.details) &&
      error.details.length <= 16 && error.details.every((detail) => record(detail, ['path', 'code', 'message']) &&
      text(detail.path, 64) && own(ERRORS, detail.code) && ERRORS[detail.code].group === 'input' &&
      detail.message === ERRORS[detail.code].message);
  }

  function listsOk(value) {
    const recovery = value.recovery;
    return Array.isArray(value.didNot) && value.didNot.length >= 1 && value.didNot.length <= 9 &&
      value.didNot.every((item) => record(item, ['code', 'text']) && own(DIDNOT, item.code) && item.text === DIDNOT[item.code]) &&
      record(recovery, ['allowed', 'reason']) && Array.isArray(recovery.allowed) &&
      recovery.allowed.every((name, index) => ACTION_NAMES.includes(name) && recovery.allowed.indexOf(name) === index) &&
      text(recovery.reason, 200) && Array.isArray(value.trail) && value.trail.length <= 64 &&
      value.trail.every((item, index) => record(item, ['seq', 'type']) && RECORD_TYPES.includes(item.type) &&
        integer(item.seq, 1) && (index === 0 || item.seq > value.trail[index - 1].seq));
  }

  // Closed shape plus the honesty rules: only a journaled effect is success, and nothing else is described as success.
  function validateResultEnvelope(value) {
    if (!record(value, ENVELOPE_KEYS)) return { ok: false, problems: ['ENVELOPE_KEYS'] };
    const problems = [];
    const need = (condition, name) => { if (!condition) problems.push(name); };
    need(value.schemaVersion === SCHEMA_VERSION && value.kind === 'C042-step-result' && value.scope === SCOPE, 'IDENTITY');
    need(REQUEST_ACTIONS.includes(value.action), 'ACTION');
    need(['accepted', 'replayed', 'terminal'].every((name) => typeof value[name] === 'boolean'), 'FLAGS');
    need(own(CLASSIFICATIONS, value.outcome) && value.classification === CLASSIFICATIONS[value.outcome], 'OUTCOME');
    need(record(value.step, ['state']) && STATES.includes(value.step.state), 'STEP');
    need(effectOk(value.effect) && errorOk(value.error) && listsOk(value), 'PARTS');
    need(value.validatedInput === null || inputOk(value.validatedInput), 'VALIDATED_INPUT');
    need((value.validatedInput === null) === (value.inputSha256 === null) &&
      (value.inputSha256 === null || /^[0-9a-f]{64}$/.test(value.inputSha256)), 'INPUT_DIGEST');
    need(value.idempotencyKey === null || (typeof value.idempotencyKey === 'string' && KEY_PATTERN.test(value.idempotencyKey)), 'KEY');
    need(integer(value.attempts, 0), 'ATTEMPTS');
    if (problems.length) return { ok: false, problems };
    const state = value.step.state;
    const succeeded = value.outcome === 'succeeded';
    need(succeeded === (value.error === null), 'ERROR_PRESENCE');
    need(!succeeded || (state === 'committed' && value.effect.applied === true && value.terminal && value.accepted), 'SUCCESS_NEEDS_JOURNALED_EFFECT');
    need((value.effect.applied === true) === (state === 'committed') && (value.effect.applied === null) === (state === 'uncertain'), 'EFFECT_STATE');
    need((value.effect.reservedAfter !== null) === (state === 'committed'), 'RESERVED_AFTER');
    need(value.terminal === !['in-flight', 'interrupted', 'uncertain'].includes(state), 'TERMINAL_STATE');
    need(!value.effect.appliedByThisRequest || (succeeded && !value.replayed && ['submit', 'resume'].includes(value.action)), 'EFFECT_ATTRIBUTION');
    need(!value.accepted || (value.action === 'cancel' ? value.outcome === 'cancelled' :
      value.action === 'inspect' ? state !== 'none' : ['submit', 'resume'].includes(value.action) && succeeded), 'ACCEPTED_MEANING');
    need(value.validatedInput === null || value.idempotencyKey === value.validatedInput.idempotencyKey, 'KEY_MATCH');
    need(state !== 'none' || (value.trail.length === 0 && value.attempts === 0), 'NO_STEP_NO_TRAIL');
    need(state !== 'committed' || value.trail.at(-1)?.type === 'commit', 'COMMIT_TRAILS');
    need(state !== 'cancelled' || value.trail.at(-1)?.type === 'cancel', 'CANCEL_TRAILS');
    return { ok: problems.length === 0, problems };
  }

  return freeze({
    SCHEMA_VERSION, STEP, SCOPE, LEASES, UNITS, KEY_PATTERN, LIMITS, INPUT_KEYS, OUTCOMES, CLASSIFICATIONS, STATES,
    REQUEST_ACTIONS, RECORD_TYPES, ACTIONS, ACTION_NAMES, DIDNOT, STATE_ACTIONS, STATE_REASONS, ERRORS,
    allowedActions, validateResultEnvelope, freeze,
  });
}));
