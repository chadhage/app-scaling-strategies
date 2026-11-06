(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./contract.js'), require('./validate.js'), require('./envelope.js'));
  else Object.defineProperty(root, 'C043Verify', { value: factory(root.C043Contract, root.C043Validate, root.C043Envelope) });
}(globalThis, function (contract, v, envelope) {
  'use strict';

  const REQUIRED_CODES = ['DUPLICATE_FIELD', 'FORBIDDEN_FIELD', 'UNSUPPORTED_PRESET_VERSION', 'TOO_MANY_STEPS', 'FIELD_OUT_OF_RANGE', 'DUPLICATE_STEP_KEY',
    'IDEMPOTENCY_KEY_CONFLICT', 'PRESET_BOUND_EXCEEDED', 'PRESET_STEP_FAILED', 'PRESET_CANCELLED', 'PRESET_INTERRUPTED', 'PRESET_IN_FLIGHT',
    'UNSUPPORTED_ACTION', 'ACTION_NOT_ALLOWED'];
  const canon = (preset) => JSON.stringify([preset.schemaVersion, preset.preset, preset.idempotencyKey, contract.BOUND_KEYS.map((key) => preset.bounds[key]),
    preset.steps.map((step) => contract.c42.INPUT_KEYS.map((key) => step[key]))]);

  // The HTTP status an honest answer carries; a tampered status is therefore detectable.
  function expectedStatus(value) {
    if (!value.accepted) return contract.ERRORS[value.error.code].status;
    if (value.action === 'run' && value.steps.some((step) => step.appliedByThisRequest)) return 201;
    return value.run.state === 'running' ? 202 : 200;
  }

  // An answer is shown only when it is a valid envelope, the status is the honest one and, unless the key was reused
  // for another preset, the preset it reports is the one that was sent.
  function checkAnswer(status, value, sentPreset) {
    const verdict = envelope.validateResultEnvelope(value);
    if (!verdict.ok) return { ok: false, problems: verdict.problems };
    if (status !== expectedStatus(value)) return { ok: false, problems: ['HTTP_STATUS_CONTRADICTS_ENVELOPE'] };
    const conflict = value.error !== null && value.error.code === 'IDEMPOTENCY_KEY_CONFLICT';
    // A strict reader on the server may refuse what the page's lenient JSON.parse accepts (a duplicated key), so an answer
    // without a preset is fine; an answer WITH a preset must show exactly the preset that was sent.
    if (value.action === 'run' && sentPreset !== undefined && !conflict && value.preset !== null) {
      const sentOk = sentPreset !== null && v.validatePresetShape(sentPreset).ok;
      if (!sentOk || canon(value.preset) !== canon(sentPreset)) return { ok: false, problems: ['PRESET_DIFFERS_FROM_REQUEST'] };
    }
    return { ok: true, problems: [] };
  }

  function inspectTranscript(transcript) {
    const fail = (code, message) => ({ ok: false, code, message });
    const events = transcript && Array.isArray(transcript.events) ? transcript.events : [];
    if (!transcript || transcript.kind !== 'C043-server-transcript' || transcript.schemaVersion !== 1 || transcript.scope !== contract.SCOPE || events.length === 0 || events.length > 300) {
      return fail('TRANSCRIPT_SHAPE', 'The transcript has the wrong kind, version, scope or size.');
    }
    const outcomes = {};
    const codes = new Set();
    const reserved = new Map();
    const appliers = new Map();
    const ledger = new Map();
    let replays = 0;
    let exchanges = 0;
    for (const [index, event] of events.entries()) {
      if (event.n !== index + 1) return fail('SEQUENCE_GAP', `Event ${index + 1} is out of order or missing.`);
      if (!['exchange', 'note'].includes(event.kind)) return fail('EVENT_SHAPE', `Event ${event.n} has an unknown kind.`);
      if (event.kind === 'note') continue;
      exchanges += 1;
      const answer = event.response;
      if (!answer || !Number.isInteger(answer.status) || !answer.body) return fail('EVENT_SHAPE', `Event ${event.n} has no response.`);
      const body = answer.body;
      if (body.kind === 'C043-preset-catalog') {
        if (!envelope.validateCatalog(body).ok) return fail('CATALOG_INVALID', `Event ${event.n}: the catalog is not a valid closed catalog.`);
        continue;
      }
      if (body.kind === 'C042-lease-snapshot') {
        for (const [leaseId, lease] of Object.entries(body.leases)) {
          if (lease.committed !== (ledger.get(`${event.scenario}/${leaseId}`) ?? 0) || lease.committed + lease.held > lease.capacity) return fail('LEDGER_MISMATCH', `Event ${event.n}: the ledger disagrees with the recorded effects.`);
        }
        continue;
      }
      const verdict = checkAnswer(answer.status, body, undefined);
      if (!verdict.ok) return fail('ENVELOPE_INVALID', `Event ${event.n}: ${verdict.problems.join(', ')}.`);
      outcomes[body.outcome] = (outcomes[body.outcome] ?? 0) + 1;
      if (body.error) codes.add(body.error.code);
      if (body.replayed) replays += 1;
      for (const effect of body.effects) {
        const id = `${event.scenario}/${effect.key}`;
        if (reserved.has(id) && reserved.get(id) !== effect.reservedAfter) return fail('SECOND_EFFECT', `Event ${event.n}: a step shows two different effects.`);
        if (!reserved.has(id)) ledger.set(`${event.scenario}/${effect.leaseId}`, (ledger.get(`${event.scenario}/${effect.leaseId}`) ?? 0) + effect.units);
        reserved.set(id, effect.reservedAfter);
      }
      for (const step of body.steps.filter((item) => item.appliedByThisRequest)) {
        const id = `${event.scenario}/${step.key}`;
        appliers.set(id, (appliers.get(id) ?? 0) + 1);
        if (appliers.get(id) > 1) return fail('SECOND_EFFECT', `Event ${event.n}: two requests claim to have applied one step.`);
      }
    }
    const missing = [...contract.OUTCOMES.filter((name) => !outcomes[name]), ...REQUIRED_CODES.filter((code) => !codes.has(code))];
    if (missing.length || replays < 1) return fail('MISSING_EVIDENCE', `The transcript lacks required evidence: ${missing.join(', ') || 'a replay'}.`);
    return { ok: true, summary: { verified: true, exchanges, outcomes, replays, effects: reserved.size, typedFailures: [...codes].sort() } };
  }

  function verifyTranscript(transcript) {
    try {
      return inspectTranscript(transcript);
    } catch {
      return { ok: false, code: 'TRANSCRIPT_SHAPE', message: 'The transcript could not be read as a closed C043 transcript.' };
    }
  }

  return Object.freeze({ REQUIRED_CODES, canon, expectedStatus, checkAnswer, verifyTranscript });
}));
