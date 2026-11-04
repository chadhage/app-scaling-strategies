(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('..\\C020\\inspector.js'), require('..\\C033\\journey.js'),
      () => require('./saved.cjs'));
  } else {
    Object.defineProperty(root, 'C034Trace', {
      value: factory(root.C020Inspector, root.C033Journey, () => root.C034Saved)
    });
  }
}(globalThis, function (profiles, driver, saved) {
  'use strict';

  const MAX_BYTES = 131072;
  const ids = Object.freeze(['closed-history', 'held-snapshot']);
  const common = ['attemptId', 'code', 'at', 'elapsedMs'];
  const recordKeys = ['attemptId', 'original', 'outcome', 'code', 'replyCode', 'startedAt',
    'deadline', 'endedAt', 'elapsedMs', 'pausedMs', 'budgetExceeded', 'clockValid',
    'requests', 'responses', 'acknowledgements', 'fullJourneyQualified'];
  const snapshotKeys = ['phase', 'attemptId', 'original', 'startedAt', 'deadline', 'sampledAt',
    'elapsedMs', 'pausedMs', 'budgetExceeded', 'clockValid', 'requests', 'responses',
    'acknowledgements', 'outcome', 'code', 'history', 'events', 'fullJourneyQualified',
    'nativeTransportQualified', 'productionRuntimeValidated'];
  function fail(code) { throw Object.assign(new Error(code), { code }); }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function data(value, ancestors = new Set()) {
    if (value === null || typeof value === 'string' || typeof value === 'boolean') return;
    if (typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER && !Object.is(value, -0)) return;
    if (!value || typeof value !== 'object' || ancestors.has(value) || ancestors.size > 16 ||
        (!Array.isArray(value) && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))) fail('JSON_DATA');
    const descriptors = Object.getOwnPropertyDescriptors(value);
    const keys = Reflect.ownKeys(descriptors).filter((key) => !(Array.isArray(value) && key === 'length'));
    if (keys.some((key) => typeof key !== 'string' || !Object.hasOwn(descriptors[key], 'value') || !descriptors[key].enumerable) ||
        (Array.isArray(value) && (keys.length !== value.length || keys.some((key, index) => key !== String(index))))) fail('JSON_DATA');
    ancestors.add(value);
    for (const key of keys) data(descriptors[key].value, ancestors);
    ancestors.delete(value);
  }
  function canonicalValue(value) {
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonicalValue).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalValue(value[key])}`).join(',')}}`;
  }
  function canonical(value) { data(value); return canonicalValue(value); }
  function closed(value, keys, code) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail(code);
  }
  function same(actual, expected, code) { if (canonical(actual) !== canonical(expected)) fail(code); }
  function decimal(text) {
    const parts = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(text);
    const fraction = parts[3] || '';
    let digits = `${parts[2]}${fraction}`.replace(/^0+/, '');
    if (!digits) return '0';
    let scale = Number(parts[4] || 0) - fraction.length;
    if (!Number.isSafeInteger(scale)) fail('UNSAFE_NUMBER_LITERAL');
    const tail = /0+$/.exec(digits)?.[0].length || 0;
    if (tail) { digits = digits.slice(0, -tail); scale += tail; }
    return `${parts[1]}${digits}e${scale}`;
  }
  function parseJson(text) {
    if (typeof text !== 'string' || !text.trim()) fail('REQUIRED_JSON');
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) fail('JSON_OVERSIZE');
    let value;
    try { value = JSON.parse(text); } catch { fail('INVALID_JSON'); }
    const tokens = text.match(/"(?:\\[\s\S]|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\],:]/g);
    let index = 0;
    function scan(depth) {
      if (depth > 16) fail('JSON_DEPTH');
      const token = tokens[index++];
      if (token === '{') {
        const keys = new Set();
        while (tokens[index] !== '}') {
          const key = JSON.parse(tokens[index++]);
          if (keys.has(key)) fail('DUPLICATE_FIELD');
          keys.add(key);
          index++;
          scan(depth + 1);
          if (tokens[index] !== ',') break;
          index++;
        }
        index++;
      } else if (token === '[') {
        while (tokens[index] !== ']') {
          scan(depth + 1);
          if (tokens[index] !== ',') break;
          index++;
        }
        index++;
      } else if (/^-?\d/.test(token)) {
        const number = Number(token);
        if (!Number.isFinite(number) || Math.abs(number) > Number.MAX_SAFE_INTEGER || Object.is(number, -0) ||
            decimal(token) !== decimal(JSON.stringify(number))) fail('UNSAFE_NUMBER_LITERAL');
      }
    }
    scan(0);
    data(value);
    return value;
  }
  function time(value) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 86400000 || Object.is(value, -0)) fail('MONOTONIC_TIME_REQUIRED');
  }
  function original(value) {
    closed(value, ['profileId', 'draft', 'boundary', 'budgetMs'], 'ORIGINAL_CONTEXT_REQUIRED');
    if (!driver || !driver.profiles.includes(value.profileId) || !driver.drafts.includes(value.draft) ||
        !driver.boundaries.includes(value.boundary) || !driver.budgets.includes(value.budgetMs)) fail('ORIGINAL_CONTEXT_REQUIRED');
  }
  function validate(value) {
    data(value);
    closed(value, snapshotKeys, 'CLOSED_SNAPSHOT_SCHEMA');
    if (!Array.isArray(value.history) || value.history.length > 16 ||
        !Array.isArray(value.events) || value.events.length > 256) fail('BOUNDED_TRACE_REQUIRED');
    if ([value.fullJourneyQualified, value.nativeTransportQualified, value.productionRuntimeValidated].some((field) => field !== false)) fail('QUALIFICATION_CLAIM_FORBIDDEN');
    time(value.sampledAt);
    const records = new Map();
    for (const record of value.history) {
      closed(record, recordKeys, 'CLOSED_ORIGINAL_RECORD');
      original(record.original);
      if (records.has(record.attemptId)) fail('DUPLICATE_ORIGINAL_ATTEMPT');
      records.set(record.attemptId, record);
    }
    if (value.attemptId !== null) {
      original(value.original);
      if (!records.has(value.attemptId)) records.set(value.attemptId, value);
    }
    const attempts = [];
    const seen = new Set();
    let active = null;
    let lastTime = 0;
    for (const event of value.events) {
      if (event.code === 'ORIGINAL_ATTEMPT_STARTED') {
        closed(event, [...common, 'boundary'], 'CLOSED_ACTION');
        if (active && !active.terminal) fail('ORIGINAL_ATTEMPT_OVERLAP');
        if (seen.has(event.attemptId)) fail('DUPLICATE_ORIGINAL_ATTEMPT');
        if (!/^synthetic-C033-attempt-(?:[1-9]|1[0-6])$/.test(event.attemptId)) fail('ORIGINAL_IDENTITY_REQUIRED');
        const record = records.get(event.attemptId);
        if (!record || event.boundary !== record.original.boundary) fail('ORIGINAL_CONTEXT_REQUIRED');
        seen.add(event.attemptId);
        active = {
          attemptId: event.attemptId, original: record.original, startedAt: event.at,
          deadline: event.at + record.original.budgetMs, requests: 0, responses: 0,
          acknowledgements: [], pending: null, held: false, heldOnce: false, resumed: false,
          pausedMs: 0, pausedAt: null, terminal: false, reset: false, events: []
        };
        attempts.push(active);
      } else {
        if (!active || active.attemptId !== event.attemptId) fail('ORIGINAL_ACTION_ORDER');
        if (active.terminal && event.code !== 'RESET_VIEW_HISTORY_RETAINED') fail('ACTION_AFTER_TERMINAL');
        if (event.code === 'ACTUAL_READ_STARTED') {
          closed(event, [...common, 'implementation', 'ordinal'], 'CLOSED_ACTION');
          if (active.pending || active.held || active.requests >= 2 || event.ordinal !== active.requests + 1 ||
              event.implementation !== ['v1', 'v2'][active.requests]) fail('REQUEST_RESPONSE_ORDER');
          if ((active.original.boundary === 'before-first-read' || active.requests === 1) && !active.resumed) fail('BOUNDARY_ACTION_ORDER');
          active.requests++;
          active.pending = { implementation: event.implementation, ordinal: event.ordinal };
        } else if (event.code === 'ACTUAL_READ_ACKNOWLEDGED') {
          closed(event, [...common, 'implementation', 'ordinal'], 'CLOSED_ACTION');
          if (!active.pending || active.pending.implementation !== event.implementation ||
              active.pending.ordinal !== event.ordinal) fail('REQUEST_RESPONSE_ORDER');
          const record = records.get(active.attemptId);
          const reply = record.acknowledgements?.[active.acknowledgements.length];
          if (!reply) fail('MISSING_ACKNOWLEDGED_REPLY');
          try { profiles.inspect(reply, event.implementation, active.original.profileId); }
          catch { fail('IMMUTABLE_C020_REPLY_MISMATCH'); }
          active.acknowledgements.push(reply);
          active.responses++;
          active.pending = null;
        } else if (event.code === 'BOUNDARY_HELD') {
          closed(event, [...common, 'boundary', 'requests'], 'CLOSED_ACTION');
          const count = active.original.boundary === 'before-first-read' ? 0 : 1;
          if (active.heldOnce || active.pending || event.boundary !== active.original.boundary ||
              event.requests !== count || active.requests !== count || active.responses !== count) fail('BOUNDARY_ACTION_ORDER');
          active.held = true;
          active.heldOnce = true;
          active.pausedAt = event.at;
        } else if (event.code === 'RESUME_ORIGINAL_ATTEMPT') {
          closed(event, common, 'CLOSED_ACTION');
          if (!active.held || active.resumed) fail('BOUNDARY_ACTION_ORDER');
          active.pausedMs += event.at - active.pausedAt;
          active.pausedAt = null;
          active.held = false;
          active.resumed = true;
        } else if (event.code === 'RESET_VIEW_HISTORY_RETAINED') {
          closed(event, common, 'CLOSED_ACTION');
          if (!active.terminal || active.reset) fail('RESET_ACTION_ORDER');
          active.reset = true;
        } else {
          const outcomes = {
            TWO_READ_LOCAL_SEGMENT_OBSERVED: 'observed', FAILED_HTTP_REPLY_404: 'failed',
            INTERRUPTED_BY_STOP: 'unknown', INTERRUPTED_BY_RESET: 'unknown'
          };
          if (!Object.hasOwn(outcomes, event.code)) fail('UNKNOWN_ACTION');
          closed(event, [...common, 'outcome', 'replyCode'], 'CLOSED_ACTION');
          if (event.outcome !== outcomes[event.code]) fail('OUTCOME_ACTION_MISMATCH');
          if (event.code === 'TWO_READ_LOCAL_SEGMENT_OBSERVED') {
            if (active.pending || active.requests !== 2 || active.responses !== 2 ||
                !active.resumed || active.acknowledgements.length !== 2) fail('TERMINAL_BEFORE_RESPONSES');
            try { profiles.compare(...active.acknowledgements, active.original.profileId); }
            catch { fail('BUSINESS_STATE_CONTINUITY_MISMATCH'); }
          }
          if (event.code === 'FAILED_HTTP_REPLY_404') {
            if (!active.pending || active.pending.implementation !== 'v1' || active.original.profileId !== 'synthetic-999' ||
                active.requests !== 1 || active.responses !== 0 || event.replyCode !== 'UNKNOWN_PROFILE') fail('FAILED_RESPONSE_ORDER');
            active.responses++;
            active.pending = null;
          } else if (event.replyCode !== null) fail('OUTCOME_ACTION_MISMATCH');
          if (active.held) active.pausedMs += event.at - active.pausedAt;
          active.held = false;
          active.pausedAt = null;
          Object.assign(active, { terminal: true, outcome: outcomes[event.code], code: event.code, replyCode: event.replyCode, endedAt: event.at });
        }
      }
      time(event.at);
      if (event.at < lastTime) fail('NON_MONOTONIC_TIME');
      if (event.elapsedMs !== event.at - active.startedAt) fail('ORIGINAL_ELAPSED_MISMATCH');
      active.events.push(event);
      lastTime = event.at;
    }
    if (value.sampledAt < lastTime) fail('STALE_SNAPSHOT_TIME');
    const completed = attempts.filter((attempt) => attempt.terminal);
    if (completed.length !== value.history.length || seen.size !== records.size) fail('MISSING_OR_DUPLICATE_ORIGINAL');
    function checkFields(record, attempt, end, paused) {
      if (record.startedAt !== attempt.startedAt || record.deadline !== attempt.deadline ||
          record.elapsedMs !== end - attempt.startedAt || record.pausedMs !== paused ||
          record.budgetExceeded !== (end >= attempt.deadline)) fail('ORIGINAL_BUDGET_OR_TIMING_MISMATCH');
      if (record.clockValid !== true || record.fullJourneyQualified !== false ||
          record.requests !== attempt.requests || record.responses !== attempt.responses) fail('OBSERVED_COUNT_OR_CLOCK_MISMATCH');
      same(record.original, attempt.original, 'ORIGINAL_CONTEXT_MISMATCH');
      same(record.acknowledgements, attempt.acknowledgements, 'MISSING_OR_DUPLICATE_ACKNOWLEDGEMENT');
    }
    for (const [index, attempt] of completed.entries()) {
      const record = value.history[index];
      if (record.attemptId !== attempt.attemptId || record.endedAt !== attempt.endedAt ||
          record.outcome !== attempt.outcome || record.code !== attempt.code || record.replyCode !== attempt.replyCode) fail('ORIGINAL_OUTCOME_ORDER');
      checkFields(record, attempt, attempt.endedAt, attempt.pausedMs);
    }
    if (value.phase === 'idle') {
      if (active && !active.reset) fail('RESET_ACTION_ORDER');
      for (const field of ['attemptId', 'original', 'startedAt', 'deadline', 'outcome', 'code']) if (value[field] !== null) fail('IDLE_STATE_MISMATCH');
      if (value.elapsedMs !== 0 || value.pausedMs !== 0 || value.requests !== 0 || value.responses !== 0 ||
          value.acknowledgements.length !== 0 || value.budgetExceeded !== false || value.clockValid !== true) fail('IDLE_STATE_MISMATCH');
    } else {
      if (!active || value.attemptId !== active.attemptId) fail('ORIGINAL_CONTEXT_MISMATCH');
      const phase = active.terminal ? (active.outcome === 'observed' ? 'complete' : active.outcome) : (active.held ? 'paused' : 'running');
      if (value.phase !== phase || value.outcome !== (active.outcome || null) || value.code !== (active.code || null)) fail('CURRENT_OUTCOME_MISMATCH');
      const end = active.endedAt ?? value.sampledAt;
      const paused = active.pausedMs + (active.held ? end - active.pausedAt : 0);
      checkFields(value, active, end, paused);
    }
    return freeze({
      valid: true, code: null, sourceAttested: false, liveRunAdopted: false,
      attempts: attempts.map((attempt) => ({
        attemptId: attempt.attemptId, original: attempt.original, startedAt: attempt.startedAt,
        deadline: attempt.deadline, endedAt: attempt.endedAt ?? null,
        elapsedMs: attempt.terminal ? attempt.endedAt - attempt.startedAt : value.sampledAt - attempt.startedAt,
        classification: !attempt.terminal ? 'partial-unknown' : attempt.outcome === 'observed' ?
          (attempt.endedAt >= attempt.deadline ? 'original-budget-exceeded' : 'observed-local-segment') : attempt.outcome,
        requests: attempt.requests, responses: attempt.responses,
        observedVersions: attempt.acknowledgements.map((reply) => ({
          implementation: reply.stamp.implementation, implementationVersion: reply.stamp.implementationVersion,
          apiContract: reply.apiContract, deploymentStamp: reply.stamp.deploymentStamp
        })),
        events: attempt.events
      }))
    });
  }
  function validateSnapshot(value) {
    try { return validate(value); }
    catch (error) { return freeze({ valid: false, code: error.code || 'INVALID_SNAPSHOT', sourceAttested: false, liveRunAdopted: false, attempts: [] }); }
  }
  function getSavedTrace(id) {
    if (typeof id !== 'string' || !ids.includes(id)) fail('UNKNOWN_TRACE_ID');
    const bundle = saved();
    if (!bundle || bundle.bundleVersion !== 1 || bundle.cardId !== 'C034' || !Array.isArray(bundle.traces) ||
        bundle.traces.length !== 2 || bundle.traces.filter((entry) => entry.id === id).length !== 1) fail('SAVED_TRACE_UNAVAILABLE');
    return bundle.traces.find((entry) => entry.id === id);
  }
  function inspectCandidate(text, id) {
    try {
      const expected = getSavedTrace(id);
      const candidate = parseJson(text);
      closed(candidate, ['traceFormat', 'id', 'source', 'context', 'snapshot', 'replacementSummary'], 'CLOSED_TRACE_SCHEMA');
      if (candidate.traceFormat !== 'C034-saved-client-trace/1') fail('TRACE_VERSION');
      if (candidate.id !== id) fail('TRACE_ID_MISMATCH');
      const checked = validateSnapshot(candidate.snapshot);
      if (!checked.valid) fail(checked.code);
      same(candidate.source, expected.source, 'SOURCE_PROVENANCE_MISMATCH');
      same(candidate.context, expected.context, 'CONTEXT_MISMATCH_OR_STALE');
      same(candidate.replacementSummary, expected.replacementSummary, 'REPLACEMENT_SUMMARY_MISMATCH');
      same(candidate.snapshot, expected.snapshot, 'NOT_EXACT_SAVED_OBSERVATION');
      return freeze({
        valid: true, code: null, inspection: 'source-consistent historical copy; not live attestation',
        traceId: id, attempts: checked.attempts, context: expected.context,
        source: expected.source, replacementSummary: expected.replacementSummary,
        liveRunAdopted: false, approvalAdopted: false, identityVerified: false,
        actualRunCorrelation: false, migrationQualified: false, nativeTransportQualified: false,
        productionRuntimeValidated: false, fullJourneyQualified: false
      });
    } catch (error) {
      return freeze({
        valid: false, code: error.code || 'INSPECTION_UNAVAILABLE', attempts: [],
        liveRunAdopted: false, approvalAdopted: false, identityVerified: false,
        actualRunCorrelation: false, migrationQualified: false, nativeTransportQualified: false,
        productionRuntimeValidated: false, fullJourneyQualified: false
      });
    }
  }
  function inspectSaved(id) {
    try { return inspectCandidate(JSON.stringify(getSavedTrace(id)), id); }
    catch (error) { return freeze({ valid: false, code: error.code || 'SAVED_TRACE_UNAVAILABLE', attempts: [], liveRunAdopted: false, approvalAdopted: false, identityVerified: false }); }
  }
  return Object.freeze({ ids, MAX_BYTES, canonical, parseJson, validateSnapshot, getSavedTrace, inspectCandidate, inspectSaved });
}));
