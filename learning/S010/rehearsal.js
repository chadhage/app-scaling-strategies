(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.FeatureFlagRehearsal = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const MAX_EVENTS = 60;
  const CLIENT_IDS = Object.freeze(['pilot-1', 'pilot-2', 'control-1', 'control-2']);
  const COHORTS = Object.freeze(['pilot', 'control']);
  const DEPLOYMENT_ID = 'synthetic-deployment-S010';
  class RehearsalInputError extends Error {
    constructor(code, message) {
      super(message);
      this.name = 'RehearsalInputError';
      this.code = code;
    }
  }
  function createRun() {
    return { schemaVersion: 1, events: [] };
  }
  function reject(code, message) {
    throw new RehearsalInputError(code, message);
  }
  function fields(value, expected, code, label) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) {
      reject(code, `${label} must be a plain object.`);
    }
    const actual = Reflect.ownKeys(value);
    if (actual.length !== expected.length || actual.some((key) => !expected.includes(key))) {
      reject(code, `${label} requires exactly these fields: ${expected.join(', ')}.`);
    }
  }
  function fixtureVersion(value, label) {
    if (!Number.isInteger(value) || ![1, 2].includes(value)) {
      reject('ERR_EVENT_INPUT', `${label} must be integer 1 (compatible) or 2 (deliberately incompatible).`);
    }
  }
  function validateEvent(event) {
    if (event === null || typeof event !== 'object' || Array.isArray(event)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(event))) {
      reject('ERR_EVENT_INPUT', 'Event must be a plain object.');
    }
    switch (event.type) {
      case 'observe':
      case 'revert-flag':
        fields(event, ['type'], 'ERR_EVENT_INPUT', 'Event');
        return { type: event.type };
      case 'publish-flag':
        fields(event, ['type', 'cohort', 'enabled', 'configVersion'], 'ERR_EVENT_INPUT', 'Flag event');
        if (!COHORTS.includes(event.cohort) || typeof event.enabled !== 'boolean') {
          reject('ERR_EVENT_INPUT', 'Cohort must be pilot/control and enabled must be a boolean.');
        }
        fixtureVersion(event.configVersion, 'configVersion');
        return {
          type: event.type, cohort: event.cohort,
          enabled: event.enabled, configVersion: event.configVersion,
        };
      case 'set-state-version':
        fields(event, ['type', 'clientId', 'stateVersion'], 'ERR_EVENT_INPUT', 'State-fixture event');
        if (!CLIENT_IDS.includes(event.clientId)) {
          reject('ERR_EVENT_INPUT', 'clientId must name one of the four declared synthetic sessions.');
        }
        fixtureVersion(event.stateVersion, 'stateVersion');
        return { type: event.type, clientId: event.clientId, stateVersion: event.stateVersion };
      default:
        reject('ERR_EVENT_TYPE', 'Unsupported event type. Use publish-flag, revert-flag, observe, or set-state-version.');
    }
  }
  function validateRun(run) {
    fields(run, ['schemaVersion', 'events'], 'ERR_RUN_INPUT', 'Run');
    if (run.schemaVersion !== 1) reject('ERR_RUN_VERSION', 'Only run schemaVersion 1 is supported.');
    if (!Array.isArray(run.events) || run.events.length > MAX_EVENTS) {
      reject('ERR_RUN_INPUT', `Run events must be an array of at most ${MAX_EVENTS} admitted events.`);
    }
    return Array.from(run.events, validateEvent);
  }
  function applyEvent(run, event) {
    const events = validateRun(run);
    const admitted = validateEvent(event);
    if (events.length === MAX_EVENTS) {
      reject('ERR_EVENT_LIMIT', `The ${MAX_EVENTS}-event limit is reached. Preserve the evidence, then reset.`);
    }
    return { schemaVersion: 1, events: [...events, admitted] };
  }
  function parseEvent(text) {
    if (typeof text !== 'string' || text.length > 2000) {
      reject('ERR_EVENT_INPUT', 'The event editor requires a string of at most 2000 characters.');
    }
    let event;
    try {
      event = JSON.parse(text);
    } catch {
      reject('ERR_EVENT_JSON', 'Enter one valid JSON event. No action was applied.');
    }
    return validateEvent(event);
  }
  function replay(events) {
    const view = {
      deploymentId: DEPLOYMENT_ID,
      codeVersion: 'compatible-code-1',
      reader: { configVersions: [1], stateVersions: [1] },
      config: { version: 1, cohort: 'pilot', enabled: false, revision: 0 },
      clients: CLIENT_IDS.map((id) => ({
        id, cohort: id.split('-')[0], sessionToken: `synthetic-session-${id}`,
        cartId: `synthetic-cart-${id}`, stateVersion: 1, cartCount: 1, effects: 0,
      })),
      trace: [],
    };
    for (const [index, event] of events.entries()) {
      const record = {
        sequence: index + 1, type: event.type, input: { ...event },
        status: 'applied', code: 'OK', message: '', deploymentId: DEPLOYMENT_ID,
        configBefore: { ...view.config }, configAfter: null, observations: [],
      };
      if (event.type === 'publish-flag') {
        const incompatible = view.clients.filter((client) => client.stateVersion !== 1);
        if (event.configVersion !== 1) {
          record.status = 'guarded';
          record.code = 'CONFIG_VERSION_UNSUPPORTED';
          record.message = 'Publication blocked: deployed code reads config v1, not proposed config v2. No flag change.';
        } else if (incompatible.length) {
          record.status = 'guarded';
          record.code = 'STATE_VERSION_UNSUPPORTED';
          record.message = `Publication blocked: deployed code cannot read state v2 for ${incompatible.map((client) => client.id).join(', ')}. No flag change.`;
        } else {
          view.config = {
            version: 1, cohort: event.cohort, enabled: event.enabled,
            revision: view.config.revision + 1,
          };
          record.message = `Compatible config v1 applied: ${event.cohort} flag ${event.enabled ? 'on' : 'off'}. Code/deployment unchanged; observe journeys next.`;
        }
      } else if (event.type === 'revert-flag') {
        view.config = { ...view.config, enabled: false, revision: view.config.revision + 1 };
        record.message = 'Flag reverted to off only. Code and state schemas are unchanged; prior failures remain. Observe journeys next.';
      } else if (event.type === 'set-state-version') {
        view.clients.find((client) => client.id === event.clientId).stateVersion = event.stateVersion;
        record.code = 'STATE_FIXTURE_CHANGED';
        record.message = `${event.clientId} synthetic state fixture set to v${event.stateVersion}; cart data/session unchanged. This is not a real schema conversion.`;
      } else if (event.type === 'observe') {
        for (const client of view.clients) {
          const ok = client.stateVersion === 1;
          const requestedBehavior = view.config.enabled && client.cohort === view.config.cohort
            ? 'enhanced' : 'standard';
          const beforeCount = client.cartCount;
          if (ok) {
            client.cartCount += 1;
            client.effects += 1;
          }
          record.observations.push({
            clientId: client.id, cohort: client.cohort, sessionToken: client.sessionToken,
            cartId: client.cartId, stateVersion: client.stateVersion, configVersion: view.config.version,
            deploymentId: DEPLOYMENT_ID, ok, requestedBehavior,
            behavior: ok ? requestedBehavior : 'blocked',
            code: ok ? 'OK' : 'STATE_VERSION_UNSUPPORTED',
            beforeCount, afterCount: client.cartCount, effectApplied: ok ? 1 : 0,
          });
        }
        const interrupted = record.observations.filter((item) => !item.ok).length;
        record.status = interrupted ? 'interrupted' : 'applied';
        record.code = interrupted ? 'JOURNEY_INTERRUPTED' : 'OK';
        record.message = `${4 - interrupted}/4 synthetic journeys completed; ${interrupted} interrupted. Each successful journey adds exactly one cart item.`;
      }
      record.configAfter = { ...view.config };
      view.trace.push(record);
    }
    return view;
  }
  function snapshot(run) {
    return replay(validateRun(run));
  }
  function evaluate(run) {
    const view = snapshot(run);
    const counts = { attempted: 0, successful: 0, interrupted: 0, guardedPublications: 0 };
    let everEnabled = false;
    let everExposed = false;
    let baseline = false;
    let cohort = false;
    let reversal = false;
    for (const record of view.trace) {
      if (record.status === 'guarded') counts.guardedPublications += 1;
      if (record.configAfter.enabled) everEnabled = true;
      if (record.type !== 'observe') continue;
      const observations = record.observations;
      counts.attempted += observations.length;
      counts.successful += observations.filter((item) => item.ok).length;
      counts.interrupted += observations.filter((item) => !item.ok).length;
      everExposed = everExposed || observations.some((item) => item.ok && item.behavior === 'enhanced');
      const allOk = observations.length === 4 && observations.every((item) => item.ok);
      if (allOk && !everEnabled && !record.configAfter.enabled) baseline = true;
      if (allOk && record.configAfter.enabled) cohort = true;
      if (allOk && cohort && !record.configAfter.enabled) reversal = true;
    }
    const missing = Object.entries({ baseline, cohort, reversal })
      .filter(([, passed]) => !passed).map(([id]) => id);
    let status = run.events.length ? 'IN_PROGRESS' : 'NOT_RUN';
    let summary = 'Unverified: observe baseline, enabled cohort, then reversed-off journeys.';
    let userOutcome = 'unverified rehearsal';
    if (counts.interrupted) {
      status = 'FAIL';
      summary = 'Synthetic interruptions retained. Reversing a flag does not repair incompatible state or erase failed attempts.';
      userOutcome = 'synthetic interruption observed';
    } else if (counts.guardedPublications) {
      status = 'GUARDED';
      summary = 'Compatibility guard blocked publication. A safe rejection is not a completed flag-continuity exercise.';
      userOutcome = everExposed ? 'publication blocked; prior exposure retained' : 'safe abort before exposure';
    } else if (!missing.length) {
      status = 'PASS';
      summary = 'Baseline, cohort-only activation, and reversal observed with intact synthetic sessions/data on unchanged code.';
      userOutcome = 'synthetic flag continuity observed';
    }
    return {
      status, summary, userOutcome, nativeEvidence: false,
      transitionOutcome: 'not-evidence-of-deployment-migration', deploymentChanges: 0,
      counts, missing,
      checks: [
        { id: 'baseline', passed: baseline, label: 'Observed off baseline before activation' },
        { id: 'cohort', passed: cohort, label: 'Observed selected-cohort-only enhanced behavior' },
        { id: 'reversal', passed: reversal, label: 'Observed standard behavior after reversal' },
        { id: 'deployment', passed: view.trace.every((record) => record.deploymentId === DEPLOYMENT_ID),
          label: 'Synthetic deployment identity unchanged (not migration)' },
        { id: 'continuity', passed: counts.attempted > 0 && counts.interrupted === 0,
          label: 'All attempted sessions/data operations uninterrupted' },
        { id: 'publication', passed: counts.guardedPublications === 0,
          label: 'No incompatible configuration/state publication attempts' },
      ],
    };
  }
  return { MAX_EVENTS, RehearsalInputError, createRun, applyEvent, parseEvent, snapshot, evaluate };
}));
