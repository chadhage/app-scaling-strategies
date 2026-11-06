(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../C042/contract.js'));
  else Object.defineProperty(root, 'C043Contract', { value: factory(root.C042Contract) });
}(globalThis, function (c42) {
  'use strict';

  const freeze = c42.freeze;
  const SCHEMA_VERSION = 1;
  const SCOPE = c42.SCOPE;
  const LIMITS = freeze({ bodyBytes: 2048, steps: 8, runs: 64, durationMs: 60000, units: 80, journalBytes: 768 * 1024 });
  const PRESET_KEYS = freeze(['schemaVersion', 'preset', 'idempotencyKey', 'bounds', 'steps']);
  const BOUND_KEYS = freeze(['maxSteps', 'maxDurationMs', 'maxUnits']);
  const PRESET_NAME = /^[a-z][a-z0-9-]{0,31}$/;
  const OUTCOMES = freeze(['succeeded', 'rejected', 'unsupported', 'unknown', 'cancelled', 'interrupted', 'failed', 'bound-exceeded']);
  // C035 classification names; only a completed run of every step is COMPLETED.
  const CLASSIFICATIONS = freeze({
    succeeded: 'COMPLETED', rejected: 'FAILED', unsupported: 'UNSUPPORTED', unknown: 'UNKNOWN', cancelled: 'CANCELLED',
    interrupted: 'INTERRUPTED', failed: 'FAILED', 'bound-exceeded': 'FAILED',
  });
  const STATES = freeze(['none', 'running', 'completed', 'stopped', 'bounded', 'cancelled', 'interrupted']);
  const OPEN_STATES = freeze(['running', 'interrupted']);
  const REQUEST_ACTIONS = freeze(['run', 'inspect', 'cancel', 'resume', 'none']);
  const STEP_STATUSES = freeze(['succeeded', 'replayed', 'failed', 'unknown', 'interrupted', 'cancelled', 'running', 'not-run']);
  const SUCCESS_STATUSES = freeze(['succeeded', 'replayed']);
  const RECORD_TYPES = freeze(['begin', 'start', 'step', 'resume', 'cancel', 'end']);

  const ACTIONS = freeze({
    retry: { label: 'Retry with the same key', method: 'POST', path: '/v1/presets', description: 'Send the identical preset again. The recorded result comes back and no step is applied twice.' },
    'correct-and-resubmit': { label: 'Correct and resubmit', method: 'POST', path: '/v1/presets', description: 'Edit the preset and submit it again. A stopped, bounded or cancelled preset needs a new key; steps already applied replay with one effect.' },
    cancel: { label: 'Cancel the preset', method: 'POST', path: '/v1/presets/{key}/cancel', description: 'Explicitly cancel the preset. Nothing is undone; completed steps stand.' },
    resume: { label: 'Resume the preset', method: 'POST', path: '/v1/presets/{key}/resume', description: 'Continue at the first step that is not acknowledged. Never automatic.' },
    inspect: { label: 'Inspect the preset', method: 'GET', path: '/v1/presets/{key}', description: 'Read the current state of the preset. Changes nothing.' },
  });
  const ACTION_NAMES = freeze(Object.keys(ACTIONS));
  const STATE_ACTIONS = freeze({
    none: [], running: ['cancel', 'retry', 'inspect'], completed: ['retry', 'inspect'], stopped: ['correct-and-resubmit', 'inspect'],
    bounded: ['correct-and-resubmit', 'inspect'], cancelled: ['correct-and-resubmit', 'inspect'], interrupted: ['resume', 'cancel', 'inspect'],
  });
  const STATE_REASONS = freeze({
    none: 'No preset run exists for this key.',
    running: 'The preset is running; its outcome is not known yet.',
    completed: 'Every step succeeded within the bounds; each effect is recorded exactly once.',
    stopped: 'A step did not succeed; later steps were not run and earlier effects stand.',
    bounded: 'A declared bound was exceeded; the steps that ran stand and the others were not run.',
    cancelled: 'The preset was cancelled explicitly; completed effects stand and nothing was undone.',
    interrupted: 'The preset began but has no terminal record; it was not resumed or cancelled automatically.',
  });
  const DIDNOT = freeze({
    NO_EFFECT: 'No capacity was reserved by this answer; the lease ledger is unchanged.',
    NO_JOURNAL_ENTRY: 'Nothing was written to either journal; the preset key is still unused.',
    NO_STEP_CALLED: 'No step function was called.',
    LATER_STEPS_NOT_RUN: 'The steps after the stopping point were never called.',
    NO_UNDO: 'Nothing was undone; effects of completed steps stand and this service has no undo or rollback.',
    NO_AUTOMATIC_RETRY: 'Nothing was retried, resumed or cancelled automatically.',
    NO_SECOND_EFFECT: 'No step was applied a second time.',
    NO_EFFECT_BY_THIS_REQUEST: 'This request applied no effect itself; it reports the recorded state.',
    NOT_CONFIRMED: 'An effect or a write is not confirmed; this is not reported as success.',
    ACTION_NOT_PERFORMED: 'The requested action was not performed.',
    NO_CLOUD_CALL: 'No cloud, network or real service was contacted; all data is synthetic.',
    STEPS_NOT_CONFIRMED: 'The step service does not confirm the effect of the first unconfirmed step or of the steps after it; they are not reported as standing, and nothing was repaired, re-run or undone.',
  });

  const entry = (group, status, outcome, actions, message) => ({ group, status, outcome, actions, message });
  const input = (message, status = 400) => entry('input', status, 'rejected', ['correct-and-resubmit'], message);
  // Answers that Node would give itself (and never call the handler): they are typed refusals like every other.
  const refused = (status, message) => entry('transport', status, 'rejected', [], message);
  const INHERITED = ['INVALID_JSON', 'REQUIRED_JSON', 'INVALID_ENCODING', 'INVALID_SHAPE', 'REQUIRED_FIELD', 'UNKNOWN_FIELD', 'DUPLICATE_FIELD',
    'FORBIDDEN_FIELD', 'WRONG_TYPE', 'UNSAFE_NUMBER', 'FIELD_OUT_OF_RANGE', 'INVALID_FORMAT', 'NESTING_TOO_DEEP', 'STRING_TOO_LONG', 'BODY_TOO_LARGE',
    'UNSUPPORTED_MEDIA_TYPE', 'UNEXPECTED_BODY', 'INVALID_QUERY', 'INVALID_URL', 'URL_TOO_LONG', 'LOCAL_HOST_REQUIRED', 'CROSS_ORIGIN_DENIED',
    'NOT_FOUND', 'METHOD_NOT_ALLOWED', 'IDEMPOTENCY_KEY_CONFLICT', 'ACTION_NOT_ALLOWED', 'UNSUPPORTED_STEP', 'UNSUPPORTED_SCHEMA_VERSION',
    'UNSUPPORTED_ACTION', 'TRANSCRIPT_UNAVAILABLE', 'INTERNAL_ERROR'];
  const OWN = Object.freeze(Object.fromEntries(INHERITED.map((code) => [code, c42.ERRORS[code]])));
  const ERRORS = freeze({
    ...OWN,
    UNSUPPORTED_PRESET_VERSION: entry('unsupported', 422, 'unsupported', ['correct-and-resubmit'], 'Only preset schemaVersion 1 is supported.'),
    TOO_MANY_STEPS: input('A preset holds at most 8 steps.'),
    DUPLICATE_STEP_KEY: input('Two steps of one preset must not share an idempotency key.'),
    PRESET_BOUND_EXCEEDED: entry('run', 409, 'bound-exceeded', null, 'A declared bound of the preset was exceeded; the steps that ran stand and the others were not run.'),
    PRESET_STEP_FAILED: entry('run', 409, 'failed', null, 'A step did not succeed; later steps were not run and earlier effects stand.'),
    PRESET_CANCELLED: entry('run', 409, 'cancelled', null, 'The preset was cancelled explicitly; completed effects stand and nothing was undone.'),
    PRESET_INTERRUPTED: entry('run', 409, 'interrupted', null, 'The preset began but never finished; it was not resumed or cancelled automatically.'),
    PRESET_UNCONFIRMED: entry('run', 503, 'unknown', null, 'A step effect could not be confirmed; this is not reported as success.'),
    PRESET_STEP_SERVICE_DISAGREES: entry('run', 503, 'unknown', null, 'The step service does not confirm a step that the preset journal acknowledged; the run is not reported as completed.'),
    PRESET_IN_FLIGHT: entry('run', 409, 'unknown', null, 'The preset is running; its outcome is not known yet.'),
    RUN_NOT_FOUND: entry('state', 404, 'rejected', ['correct-and-resubmit'], 'No preset was admitted under that key.'),
    EXPECTATION_FAILED: refused(417, 'No Expect header is supported except 100-continue.'),
    MALFORMED_REQUEST: refused(400, 'The request is not valid HTTP and was not parsed.'),
    HEADERS_TOO_LARGE: refused(431, 'The request headers exceed the size or count bound.'),
    REQUEST_TIMEOUT: refused(408, 'The request did not arrive in time.'),
    RUN_LIMIT_REACHED: entry('conflict', 503, 'rejected', [], 'The bounded number of preset runs is reached; nothing was admitted.'),
    RUN_JOURNAL_UNCERTAIN: entry('persistence', 503, 'unknown', ['retry', 'inspect'], 'A preset-journal write could not be confirmed; the next request re-reads the journal to decide.'),
    RUN_JOURNAL_UNAVAILABLE: entry('persistence', 503, 'unknown', [], 'The preset journal cannot be read; nothing is reported as done.'),
  });
  const RUN_CODE_STATE = freeze({
    PRESET_BOUND_EXCEEDED: ['none', 'bounded'], PRESET_STEP_FAILED: ['stopped'], PRESET_CANCELLED: ['cancelled'],
    PRESET_INTERRUPTED: ['interrupted'], PRESET_UNCONFIRMED: ['interrupted'], PRESET_IN_FLIGHT: ['running'], PRESET_STEP_SERVICE_DISAGREES: ['stopped'],
  });
  // A step's own typed code (C042 catalog) may appear as the reason a preset stopped.
  const STEP_CODES = freeze(Object.keys(c42.ERRORS));
  const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);
  const integer = (value, min, max = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && !Object.is(value, -0) && value >= min && value <= max;
  const allowedActions = (state) => (own(STATE_ACTIONS, state) ? [...STATE_ACTIONS[state]] : []);
  const catalogEntry = (code) => (own(ERRORS, code) ? ERRORS[code] : own(c42.ERRORS, code) ? c42.ERRORS[code] : null);
  // The closed vocabulary of error.details[].path (F4): the root, the URL key, a field of the preset, a bound, or a step by
  // index with one of its fields. Only the codes that name a field the CLIENT chose (unknown, forbidden, duplicated) may
  // carry a name of the server's own path alphabet (C042 safePath: no space, no sentence). Anything else is rejected, so a
  // tampered failure can never make the page print a server-chosen sentence.
  const NAMED = freeze(['UNKNOWN_FIELD', 'FORBIDDEN_FIELD', 'DUPLICATE_FIELD']);
  const NAME_ALPHABET = /^[A-Za-z0-9_.$?[\]-]{1,64}$/;
  function pathOk(path, code) {
    if (typeof path !== 'string' || path.length === 0 || path.length > 64) return false;
    if (path === '$' || path === 'key') return true;
    if (NAMED.includes(code) && NAME_ALPHABET.test(path)) return true;
    const parts = path.split('.');
    const step = /^steps\[(\d{1,2})\]$/.exec(parts[0]);
    const fields = parts[0] === 'bounds' ? BOUND_KEYS : step !== null && Number(step[1]) < LIMITS.steps ? c42.INPUT_KEYS : null;
    if (parts.length === 1) return PRESET_KEYS.includes(parts[0]) || fields === c42.INPUT_KEYS;
    return parts.length === 2 && fields !== null && fields.includes(parts[1]);
  }
  // The controls an answer offers: the typed code decides when it names them, otherwise the run state does. An
  // interrupted run whose every step already succeeded has nothing left to cancel, so cancel is not offered.
  function expectedActions(code, state, cancelable = true) {
    const known = code !== null && own(ERRORS, code) ? ERRORS[code] : null;
    if (known && known.actions !== null) return [...known.actions];
    if (code === 'PRESET_BOUND_EXCEEDED' && state === 'none') return ['correct-and-resubmit'];
    const allowed = allowedActions(state);
    return state === 'interrupted' && !cancelable ? allowed.filter((name) => name !== 'cancel') : allowed;
  }

  return freeze({
    SCHEMA_VERSION, SCOPE, LIMITS, PRESET_KEYS, BOUND_KEYS, PRESET_NAME, OUTCOMES, CLASSIFICATIONS, STATES, OPEN_STATES, REQUEST_ACTIONS,
    STEP_STATUSES, SUCCESS_STATUSES, RECORD_TYPES, ACTIONS, ACTION_NAMES, STATE_ACTIONS, STATE_REASONS, DIDNOT, ERRORS, RUN_CODE_STATE,
    STEP_CODES, own, integer, allowedActions, expectedActions, catalogEntry, pathOk, c42, freeze,
  });
}));
