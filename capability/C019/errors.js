(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C019Errors', { value: factory() });
}(globalThis, function () {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const groups = {
    input: ['UNKNOWN_FIXTURE_ID', 'UNKNOWN_RUN_ID', 'UNKNOWN_EPOCH', 'INVALID_JSON_DATA',
      'CLOSED_SCHEMA', 'STATE_VERSION_OR_SCOPE', 'INVALID_ENVELOPE', 'NON_SYNTHETIC_STATE',
      'INVALID_ARGUMENTS', 'TEST_FAULT_SCOPE'],
    consent: ['LOCAL_CONSENT_REQUIRED', 'C001_CONSENT_DENIED', 'SCOPED_C015_APPROVAL_REQUIRED',
      'SCOPED_C015_APPROVAL_DRIFT', 'CURRENT_CONSENT_UNAVAILABLE', 'CURRENT_CONSENT_INVALID'],
    integrity: ['FILE_VERSION', 'STATE_DIGEST', 'HISTORY_CHAIN', 'ACKNOWLEDGMENT_MISMATCH',
      'INVALID_UTF8', 'CORRUPT_JSON', 'UNEXPECTED_FILE', 'STATE_OVERSIZE',
      'STATE_CHANGED_DURING_READ', 'HISTORY_GAP', 'EPOCH_IDENTITY', 'PUBLISH_VERIFICATION'],
    unsafe: ['PATH_SCOPE', 'UNSAFE_PATH', 'UNSAFE_FILE', 'STORAGE_ERROR',
      'PUBLISH_EXISTS', 'WRITE_INCOMPLETE'],
    missing: ['STATE_MISSING'],
    held: ['HOLD_UNOBSERVED'],
    stale: ['STALE_EPOCH'],
  };
  const reasons = {
    input: 'C015 rejected the supplied closed synthetic input. Review the public schema; this console cannot correct or resubmit it.',
    consent: 'Current authoritative local consent could not be established. Confirm that operator review is needed; browser choices cannot approve it.',
    integrity: 'C015 could not validate immutable history. Preserve evidence for operator review; do not repair, delete, initialize, or roll back files.',
    unsafe: 'C015 refused an unsafe or unsuccessful storage operation. Preserve the failure and stop or request operator review.',
    missing: 'Selected persisted state is absent. A read does not initialize it, and prior acknowledgment is not a current-state fallback.',
    held: 'Publication is incomplete or unobserved. A remaining marker or staging file is not permission to reclaim it or assume a previous success.',
    stale: 'The requested epoch is not the exact next epoch. Immutable history is not overwritten and a prior receipt does not make this request successful.',
  };
  const actions = freeze({
    reinspect: {
      label: 'Reinspect read-only',
      description: 'At most three inspections. In this browser, replay only the same historical failure; no filesystem read or recovery is performed.',
    },
    'confirm-operator-review': {
      label: 'Confirm operator review is needed',
      description: 'Acknowledge the need for review, not that review happened, recovery succeeded, or a write is authorized.',
    },
    stop: {
      label: 'Stop rehearsal',
      description: 'Stop presentation actions while preserving every recorded failure and history entry. No files or processes are repaired.',
    },
  });
  const map = {};
  for (const [group, codes] of Object.entries(groups)) {
    for (const code of codes) {
      map[code] = { group, reason: reasons[group], actions: Object.keys(actions) };
    }
  }
  map.UNRECOGNIZED_ERROR = {
    group: 'unknown',
    reason: 'The error is not a recognized C015 typed code. Message, stack, path, details, and unknown code text were not retained. Operator review is needed.',
    actions: ['confirm-operator-review', 'stop'],
  };
  const notices = freeze({
    NO_OBSERVATION: 'No failure inspected. No live storage state, consent, or recovery is inferred.',
    FAILURE_OBSERVED: 'Observed failure retained. No recovery is confirmed and no write is authorized.',
    HOLD_OBSERVED: 'Held unobserved publication retained. Never reclaim a marker or fall back to previous success.',
    INVALID_OBSERVATION: 'Rejected invalid or success-shaped observation. Existing failure and history remain intact; rejected input was not retained.',
    ACTION_NOT_ALLOWED: 'Rejected action. Only the currently listed bounded read-only steps are allowed; rejected action text was not retained.',
    STALE_ACTION: 'Rejected stale or invalid revision. Reinspect the current display; no earlier decision can authorize an action.',
    CONTEXT_MISMATCH: 'Rejected substituted inspection context. The original run, epoch, pending step, and unknowns remain intact.',
    READ_LIMIT: 'Read-only inspection limit reached. Stop or confirm that operator review is needed; no automatic retry occurs.',
    INVALID_REINSPECTION: 'Rejected inspection result. A fabricated success is not proof of recovery; existing failure and history remain intact.',
    HISTORICAL_REINSPECTION: 'Historical teaching replay only. This is not a new disk inspection, restart, repair, or recovery.',
    READ_DATA_NOT_RECOVERY: 'Actual read-only C015 data was observed. The earlier failed request remains unresolved; data availability is not recovery.',
    READ_ERROR_RETAINED: 'Actual read-only inspection still reports a typed failure. Both observations remain inspectable; no fallback was returned.',
    REVIEW_NEEDED_CONFIRMED: 'Confirmed that operator review is needed. Review has not been performed and recovery is not confirmed.',
    STOPPED: 'Rehearsal stopped. Unresolved failures and all history remain; no filesystem or cloud operation occurred.',
    VIEW_RESET: 'Presentation reset only. The unresolved failure, pending context, and history remain; no storage reset occurred.',
    UNKNOWN_SELECTION: 'Rejected unknown fixture selection. No submitted value was retained and no live state was inferred.',
    SELECTION_CHANGED: 'Selection changed. The last observed failure remains visible until a valid historical observation is inspected.',
    HISTORY_LIMIT: 'History reached its explicit 48-entry ceiling. Presentation stopped without evicting evidence; no further actions are accepted.',
  });
  const runIds = freeze(['synthetic-run-001', 'synthetic-run-002']);
  const epochs = freeze([1, 2, 3]);
  const pendingSteps = freeze(['advance', 'finish', 'none']);
  const knownCodes = freeze(Object.keys(map).filter((code) => code !== 'UNRECOGNIZED_ERROR'));

  function record(value, keys) {
    try {
      if (!value || typeof value !== 'object' || Array.isArray(value) ||
          ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return null;
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const names = Reflect.ownKeys(descriptors);
      if (names.length !== keys.length || names.some((key) => typeof key !== 'string' ||
          !keys.includes(key) || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable)) return null;
      return Object.fromEntries(keys.map((key) => [key, descriptors[key].value]));
    } catch {
      return null;
    }
  }

  function context(value) {
    const item = record(value, ['runId', 'epoch', 'pendingStep']);
    if (!item || !(item.runId === null || runIds.includes(item.runId)) ||
        !(item.epoch === null || epochs.includes(item.epoch)) ||
        !(item.pendingStep === null || pendingSteps.includes(item.pendingStep))) return null;
    return freeze(item);
  }

  function acknowledgment(value) {
    const item = record(value, ['schemaVersion', 'kind', 'runId', 'epoch', 'stateSha256',
      'regularFileFlushed', 'published']);
    if (!item || item.schemaVersion !== 1 || item.kind !== 'local-file-write-receipt' ||
        !runIds.includes(item.runId) || !epochs.includes(item.epoch) ||
        typeof item.stateSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(item.stateSha256) ||
        item.regularFileFlushed !== true || item.published !== true) return null;
    return freeze(item);
  }

  function failure(value) {
    const item = record(value, ['schemaVersion', 'kind', 'error', 'context',
      'priorAcknowledgment', 'provenance']);
    if (!item || item.schemaVersion !== 1 || item.kind !== 'C019-typed-failure' ||
        !['actual-C015-API', 'actual-C015-process'].includes(item.provenance)) return null;
    const error = record(item.error, ['source', 'name', 'code']);
    if (!error || !((error.source === 'C015' && error.name === 'C015FixtureError' &&
        knownCodes.includes(error.code)) || (error.source === 'C019' && error.name === null &&
        error.code === 'UNRECOGNIZED_ERROR'))) return null;
    const checkedContext = context(item.context);
    const prior = item.priorAcknowledgment === null ? null : acknowledgment(item.priorAcknowledgment);
    if (!checkedContext || (item.priorAcknowledgment !== null && prior === null)) return null;
    return freeze({ ...item, error, context: checkedContext, priorAcknowledgment: prior });
  }

  function readData(value) {
    const item = record(value, ['schemaVersion', 'kind', 'provenance', 'acknowledgment',
      'writesPerformed', 'recoveryConfirmed']);
    if (!item || item.schemaVersion !== 1 || item.kind !== 'C019-read-data' ||
        item.provenance !== 'actual-C015-API' || item.writesPerformed !== 0 ||
        item.recoveryConfirmed !== false) return null;
    const ack = acknowledgment(item.acknowledgment);
    return ack ? freeze({ ...item, acknowledgment: ack }) : null;
  }

  function canonical(value, depth = 0) {
    if (depth > 16) throw new TypeError('Bounded plain JSON data is required.');
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
    if (typeof value === 'number' && Number.isSafeInteger(value) && !Object.is(value, -0)) return JSON.stringify(value);
    if (!value || typeof value !== 'object' ||
        ![Object.prototype, null, Array.prototype].includes(Object.getPrototypeOf(value))) {
      throw new TypeError('Bounded plain JSON data is required.');
    }
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const names = Reflect.ownKeys(descriptors).filter((key) => !(Array.isArray(value) && key === 'length'));
    if (names.some((key) => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value') ||
        !descriptors[key].enumerable)) throw new TypeError('Bounded plain JSON data is required.');
    if (Array.isArray(value)) {
      if (value.length > 64 || names.length !== value.length ||
          names.some((key, index) => key !== String(index))) throw new TypeError('Bounded plain JSON data is required.');
      return `[${names.map((key) => canonical(descriptors[key].value, depth + 1)).join(',')}]`;
    }
    if (names.length > 32) throw new TypeError('Bounded plain JSON data is required.');
    return `{${names.sort().map((key) => `${JSON.stringify(key)}:${canonical(descriptors[key].value, depth + 1)}`).join(',')}}`;
  }

  return freeze({ map, actions, notices, runIds, epochs, pendingSteps, knownCodes,
    freeze, record, context, acknowledgment, failure, readData, canonical });
}));
