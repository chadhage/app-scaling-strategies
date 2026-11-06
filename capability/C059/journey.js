(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../C042/contract.js'));
  else Object.defineProperty(root, 'C059Journey', { value: factory(root.C042Contract) });
}(globalThis, function (contract) {
  'use strict';

  // The journey's pure rules: client-side validation of the closed input, and the wording of every state, RE-DERIVED from
  // validated facts and fixed catalogs. Server prose is never printed (C017 F3); a tampered answer is rejected, not shown.
  const LEASES = Object.keys(contract.LEASES);
  const WORDS = {
    succeeded: ['Succeeded', '\u2714'], rejected: ['Rejected', '\u2716'], unsupported: ['Unsupported', '\u2298'],
    unknown: ['Unknown', '?'], cancelled: ['Cancelled', '\u25A0'], interrupted: ['Interrupted', '\u23F8'],
  };
  const REQUESTS = { submit: 'Conduct the step', inspect: 'Inspect the step', cancel: 'Cancel the step', resume: 'Resume the step', none: 'No step' };
  const STATES = { none: 'No step exists', 'in-flight': 'In flight', committed: 'Committed', cancelled: 'Cancelled', interrupted: 'Interrupted', uncertain: 'Not confirmed' };
  const LOCAL = {
    NO_VALID_RESPONSE: 'No answer arrived, so it is not known whether the request was applied.',
    ANSWER_REJECTED: 'The answer was not a valid result and was discarded.',
  };
  const FIELD_NAMES = { key: 'Idempotency key', lease: 'Lease', units: 'Units' };
  const MESSAGES = {
    KEY_REQUIRED: 'Enter an idempotency key.',
    KEY_FORMAT: 'The key needs 8 to 64 letters, digits, dots, hyphens or underscores, starting with a letter or digit.',
    LEASE_UNKNOWN: 'Choose one of the synthetic leases.',
    UNITS_REQUIRED: 'Enter the number of units.',
    UNITS_NOT_INTEGER: 'Units must be a whole number written with digits only.',
    UNITS_RANGE: `Units must be a whole number from ${contract.UNITS.min} to ${contract.UNITS.max}.`,
  };

  const labelOf = (name) => contract.ACTIONS[name].label;
  const own = (object, key) => typeof key === 'string' && Object.hasOwn(object, key);

  function validateForm({ key = '', lease = '', units = '' } = {}) {
    const problems = [];
    const need = (field, code) => problems.push({ field, code, message: MESSAGES[code] });
    if (key === '') need('key', 'KEY_REQUIRED'); else if (!contract.KEY_PATTERN.test(key)) need('key', 'KEY_FORMAT');
    if (!own(contract.LEASES, lease)) need('lease', 'LEASE_UNKNOWN');
    const text = String(units);
    if (text === '') need('units', 'UNITS_REQUIRED');
    else if (!/^[0-9]{1,6}$/.test(text)) need('units', 'UNITS_NOT_INTEGER');
    else if (Number(text) < contract.UNITS.min || Number(text) > contract.UNITS.max) need('units', 'UNITS_RANGE');
    if (problems.length) return { ok: false, problems };
    return { ok: true, input: { schemaVersion: contract.SCHEMA_VERSION, step: contract.STEP, idempotencyKey: key, leaseId: lease, units: Number(text) } };
  }

  const offered = (actions) => (actions.length ? `Offered: ${actions.map(labelOf).join(', ')}.` : 'No recovery action is offered.');
  const reservation = (effect) => (effect.applied === true ? 'A reservation is recorded for this step.' : effect.applied === false
    ? 'No reservation is recorded for this step.' : 'Whether a reservation was recorded is not confirmed.');

  function rejectAnswer(code, detail = []) {
    return { ok: false, code, detail };
  }

  // Validates one server answer ({ status, body }) and derives everything shown from the validated facts.
  function present({ status, body }) {
    const verdict = contract.validateResultEnvelope(body);
    if (!verdict.ok) return rejectAnswer('ENVELOPE_INVALID', verdict.problems);
    const code = body.error ? body.error.code : null;
    if ((Number.isInteger(status) && status >= 200 && status < 300) !== body.accepted) return rejectAnswer('STATUS_CONTRADICTS_ENVELOPE');
    if (code && !body.accepted && status !== contract.ERRORS[code].status) return rejectAnswer('STATUS_CONTRADICTS_CODE');
    if (code && contract.ERRORS[code].outcome !== body.outcome) return rejectAnswer('OUTCOME_CONTRADICTS_CODE');
    const state = body.step.state;
    const actions = (code && contract.ERRORS[code].actions) || contract.allowedActions(state);
    if (JSON.stringify(body.recovery.allowed) !== JSON.stringify(actions)) return rejectAnswer('RECOVERY_TAMPERED');
    if (body.recovery.reason !== (code ? contract.ERRORS[code].message : contract.STATE_REASONS[state])) return rejectAnswer('REASON_TAMPERED');
    const [word, symbol] = WORDS[body.outcome];
    const effect = body.effect;
    const where = effect.leaseId === null ? '' : ` ${effect.units} synthetic units on ${effect.leaseId}`;
    const replay = body.replayed ? ' This is the recorded result of an earlier request; no second reservation was made.' : '';
    const text = body.outcome === 'succeeded'
      ? `Succeeded. Reserved${where}; ${effect.reservedAfter} of ${effect.capacity} are now reserved.${replay} ${offered(actions)}`
      : `${word}. Code ${code}. ${contract.ERRORS[code].message} ${reservation(effect)} ${offered(actions)}`;
    return {
      ok: true, outcome: body.outcome, state, code, actions, key: body.idempotencyKey, input: body.validatedInput,
      heading: `Result: ${word}`, announcement: text,
      facts: [
        ['Outcome', `${symbol} ${word} (${body.classification})`], ['Request', REQUESTS[body.action]], ['Step state', STATES[state]],
        ['Reservation', reservation(effect)], ['Lease', effect.leaseId ?? 'none'], ['Units', effect.units === null ? 'none' : String(effect.units)],
        ['Reserved after', effect.reservedAfter === null ? 'not applicable' : `${effect.reservedAfter} of ${effect.capacity}`],
        ['Typed code', code ?? 'none'], ['Replayed', body.replayed ? 'Yes, the recorded result of an earlier request' : 'No'],
        ['Attempts', String(body.attempts)], ['Idempotency key', body.idempotencyKey ?? 'none'],
        ['Journal trail', body.trail.length ? body.trail.map((item) => `#${item.seq} ${item.type}`).join(', ') : 'empty'],
      ],
      didNot: body.didNot.map((item) => contract.DIDNOT[item.code]),
    };
  }

  // A failure the page itself observed (no answer, or an answer that failed validation): always the unknown outcome.
  function localFailure(code, actions, problem = '') {
    const [word, symbol] = WORDS.unknown;
    const reason = `${LOCAL[code]} Nothing is confirmed.`;
    return {
      ok: true, outcome: 'unknown', state: 'uncertain', code, actions, key: null, input: null, heading: `Result: ${word}`,
      announcement: `${word}. Code ${code}. ${reason} ${offered(actions)}`,
      facts: [['Outcome', `${symbol} ${word} (UNKNOWN)`], ['Typed code', code], ['Why', reason], ...(problem ? [['Check that failed', problem]] : [])],
      didNot: [contract.DIDNOT.NOT_CONFIRMED],
    };
  }

  function validationView(problems) {
    const names = [...new Set(problems.map((problem) => FIELD_NAMES[problem.field]))];
    return {
      outcome: 'validation', heading: 'Result: not submitted', actions: [], code: null,
      announcement: `Not submitted: ${problems.length} ${problems.length === 1 ? 'field needs' : 'fields need'} correction: ${names.join(', ')}. The first invalid field has the focus.`,
    };
  }

  const say = {
    ready: () => 'Ready. Choose a lesson, then conduct the step.',
    chosen: (lesson, closedPrevious) => `${lesson.id} chosen: ${lesson.title}.${closedPrevious ? ' The open lesson was closed.' : ''} Open it, or go on to conduct the step.`,
    opened: (lesson) => `${lesson.id} opened in an isolated frame. Press Tab to enter it; Shift+Tab or Close the lesson leaves it. Nothing was run or certified.`,
    closed: () => 'Lesson closed. Nothing was run and nothing was certified.',
    refused: () => 'Selection refused. Nothing is mounted.',
    chooseFirst: () => 'Choose a lesson first: no lesson is chosen.',
    noneOpen: () => 'No lesson is open.',
    startOver: () => 'Started over. Choose a lesson.',
    progress: (name) => `Working on "${REQUESTS[name]}". Waiting for the server; nothing is confirmed yet.`,
    correct: (newKey) => `Edit the form, then conduct the step again.${newKey ? ` A fresh key, ${newKey}, was entered.` : ''} ${contract.ACTIONS['correct-and-resubmit'].description}`,
  };

  return Object.freeze({ FIELD_NAMES, LEASES, MESSAGES, WORDS, labelOf, localFailure, present, say, validateForm, validationView });
}));
