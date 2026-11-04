(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('..\\C034\\trace.js'), () => require('./current.cjs').readCurrent());
  } else {
    const captured = root.C036Captured;
    Object.defineProperty(root, 'C036Attribution', {
      value: factory(root.C034Trace, () => Promise.resolve(captured?.context))
    });
  }
}(globalThis, function (trace, readOwnerContext) {
  'use strict';

  const MAX_BYTES = 65536;
  const HISTORY_LIMIT = 16;
  const scope = 'C036-closed-fictional-attribution/1';
  const attemptId = 'fictional-C036-attempt-001';
  const requestId = 'fictional-C036-request-001';
  const ids = Object.freeze(['fictional-complete', 'saved-closed-unlinked', 'saved-held-unlinked',
    'wrong-run', 'wrong-user', 'wrong-lease', 'old-epoch', 'wrong-tier', 'wrong-stamp',
    'stale', 'newer-attempt', 'partial', 'missing-correlation']);
  const topKeys = ['schemaVersion', 'evidenceKind', 'fixtureScope', 'originalAttempt', 'source', 'observations'];
  const observationKeys = ['evidenceId', 'fixtureScope', 'fixtureNamespace', 'contextId', 'leaseId',
    'runId', 'userId', 'epoch', 'epochVersion', 'stateSha256', 'attemptId', 'requestId',
    'ordinal', 'tier', 'observedTick', 'complete', 'actions', 'stamp'];
  const strings = ['evidenceId', 'fixtureScope', 'fixtureNamespace', 'contextId', 'leaseId',
    'runId', 'userId', 'stateSha256', 'attemptId', 'requestId', 'tier'];
  const integers = ['epoch', 'epochVersion', 'ordinal', 'observedTick'];
  const recordStates = [
    { status: 'prepared', completedStep: 'prepare', pendingStep: 'advance', acknowledgedUnits: 1 },
    { status: 'running', completedStep: 'advance', pendingStep: 'finish', acknowledgedUnits: 2 },
    { status: 'completed', completedStep: 'finish', pendingStep: 'none', acknowledgedUnits: 3 }
  ];
  function fail(code) { throw Object.assign(new Error(code), { code }); }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function data(value) { trace.canonical(value); }
  function equal(a, b) { return trace.canonical(a) === trace.canonical(b); }
  function plain(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value) &&
      [Object.prototype, null].includes(Object.getPrototypeOf(value)));
  }
  function subset(value, keys, code) {
    if (!plain(value) || Object.keys(value).some((key) => !keys.includes(key))) fail(code);
  }
  function exact(value, keys, code) {
    subset(value, keys, code);
    if (Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail(code);
  }
  function integer(value) { return Number.isSafeInteger(value) && !Object.is(value, -0); }
  function parse(text) {
    if (typeof text !== 'string') fail('JSON_TEXT_REQUIRED');
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) fail('EVIDENCE_OVERSIZE');
    return trace.parseJson(text);
  }
  function decode(bytes) {
    if (!(bytes instanceof Uint8Array)) fail('EVIDENCE_BYTES_REQUIRED');
    if (bytes.byteLength > MAX_BYTES) fail('EVIDENCE_OVERSIZE');
    try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes); }
    catch { fail('INVALID_UTF8'); }
  }
  function contextFrom(read) {
    if (!read || !['actual-C015-public-restore-read-only', 'bundled-historical-C015-observation-only'].includes(read.contextOrigin)) fail('OWNER_CONTEXT_UNAVAILABLE');
    const receipt = read.receipt;
    data(receipt);
    exact(receipt, ['schemaVersion', 'mode', 'restored', 'namespace', 'pid', 'state',
      'acknowledgment', 'stateSha256', 'history', 'source', 'writesPerformed',
      'directoryDurability', 'powerLossGuarantee'], 'C015_RESTORE_SCHEMA');
    const state = receipt.state;
    exact(state, ['schemaVersion', 'cardId', 'dataKind', 'runId', 'epoch', 'envelope', 'limits', 'record'], 'C015_STATE_SCHEMA');
    if (receipt.schemaVersion !== 1 || receipt.mode !== 'actual-local-filesystem' || receipt.restored !== true ||
        receipt.writesPerformed !== 0 || receipt.source !== 'read-and-verified-immutable-files' ||
        receipt.directoryDurability !== 'not-guaranteed' || receipt.powerLossGuarantee !== false ||
        !integer(receipt.pid) || receipt.pid < 1 || typeof receipt.namespace !== 'string' ||
        state.schemaVersion !== 1 || state.cardId !== 'C015' || state.dataKind !== 'closed-synthetic-fixture' ||
        state.runId !== 'synthetic-run-001' || !integer(state.epoch) || state.epoch < 1 || state.epoch > 3 ||
        !equal(state.record, recordStates[state.epoch - 1]) ||
        !/^[0-9a-f]{64}$/.test(receipt.stateSha256)) fail('C015_CURRENT_RECORD_REQUIRED');
    const acknowledgment = receipt.acknowledgment;
    exact(acknowledgment, ['schemaVersion', 'kind', 'runId', 'epoch', 'stateSha256',
      'regularFileFlushed', 'published'], 'C015_ACK_SCHEMA');
    if (acknowledgment.schemaVersion !== 1 || acknowledgment.kind !== 'local-file-write-receipt' ||
        acknowledgment.runId !== state.runId || acknowledgment.epoch !== state.epoch ||
        acknowledgment.stateSha256 !== receipt.stateSha256 || acknowledgment.regularFileFlushed !== true ||
        acknowledgment.published !== true || !Array.isArray(receipt.history) ||
        receipt.history.length !== state.epoch) fail('C015_ACK_HISTORY_REQUIRED');
    for (const [index, item] of receipt.history.entries()) {
      exact(item, ['epoch', 'stateSha256'], 'C015_HISTORY_SCHEMA');
      if (item.epoch !== index + 1 || typeof item.stateSha256 !== 'string' ||
          !/^[0-9a-f]{64}$/.test(item.stateSha256)) fail('C015_HISTORY_REQUIRED');
    }
    if (receipt.history.at(-1).stateSha256 !== receipt.stateSha256) fail('C015_HISTORY_REQUIRED');
    const inspected = trace.inspectSaved('closed-history');
    if (!inspected.valid || inspected.actualRunCorrelation !== false || inspected.identityVerified !== false) fail('C034_UNLINKED_SOURCE_REQUIRED');
    const first = inspected.attempts[0];
    if (first.classification !== 'observed-local-segment' || first.observedVersions.length !== 2) fail('C034_SOURCE_STAMPS_REQUIRED');
    const context = {
      fixtureScope: scope, fixtureNamespace: receipt.namespace, contextId: 'fictional-C036-context-001',
      leaseId: 'fictional-C036-lease-001', userId: 'fictional-C036-user-001',
      runId: state.runId, epoch: state.epoch, epochVersion: state.schemaVersion,
      stateSha256: receipt.stateSha256, attemptId, requestId,
      record: structuredClone(state.record), contextOrigin: read.contextOrigin,
      readStartedAtUtc: read.readStartedAtUtc, readCompletedAtUtc: read.readCompletedAtUtc,
      association: 'explicit fictional scope; declared C015 association, not authenticated/native correlation',
      fictionalObservationClock: { earliestTick: 101, currentTick: 107 },
      tiers: [
        { tier: 'frontend', stamp: { implementation: 'fictional-frontend', implementationVersion: '1.0.0', apiContract: 'C036-fictional/1', deploymentStamp: 'fictional-C036-static-r1' } },
        { tier: 'getProfile-v1', stamp: structuredClone(first.observedVersions[0]) },
        { tier: 'getProfile-v2', stamp: structuredClone(first.observedVersions[1]) }
      ],
      source: {
        kind: 'explicit-C036-closed-fictional-control',
        association: 'declared-C015-fixture-association-only',
        c034HistoricalSavedDomSha256: trace.getSavedTrace('closed-history').source.savedDom.rawSha256,
        nativeCorrelationVerified: false, authenticatedIdentityVerified: false, leaseAuthority: false
      }
    };
    return freeze(context);
  }
  function positive(context) {
    return {
      schemaVersion: 1, evidenceKind: 'closed-fictional-correlation/1',
      fixtureScope: scope, originalAttempt: attemptId, source: structuredClone(context.source),
      observations: context.tiers.map(({ tier, stamp }, index) => ({
        evidenceId: `fictional-C036-evidence-00${index + 1}`, fixtureScope: scope,
        fixtureNamespace: context.fixtureNamespace, contextId: context.contextId, leaseId: context.leaseId,
        runId: context.runId, userId: context.userId, epoch: context.epoch, epochVersion: context.epochVersion,
        stateSha256: context.stateSha256, attemptId, requestId, ordinal: index + 1, tier,
        observedTick: 102 + index * 2, complete: true,
        actions: [
          { kind: 'request', requestId, tick: 101 + index * 2 },
          { kind: 'response', requestId, tick: 102 + index * 2, httpStatus: 200 }
        ],
        stamp: structuredClone(stamp)
      }))
    };
  }
  function assess(candidate, context, used) {
    data(candidate);
    if (!plain(candidate)) fail('EVIDENCE_OBJECT_REQUIRED');
    if (candidate.evidenceKind === 'unlinked-C034-historical/1') {
      exact(candidate, ['schemaVersion', 'evidenceKind', 'traceId', 'savedTrace'], 'CLOSED_HISTORICAL_SCHEMA');
      if (candidate.schemaVersion !== 1) fail('EVIDENCE_VERSION');
      const checked = trace.inspectCandidate(JSON.stringify(candidate.savedTrace), candidate.traceId);
      if (!checked.valid) fail(checked.code);
      const declared = checked.context.receipt;
      if (declared.namespace !== context.fixtureNamespace || declared.state.runId !== context.runId ||
          declared.state.epoch !== context.epoch || declared.state.schemaVersion !== context.epochVersion ||
          declared.stateSha256 !== context.stateSha256) fail('STALE_DECLARED_FIXTURE_ASSOCIATION');
      return {
        outcome: 'held', code: 'REQUIRED_CORRELATION_UNOBSERVED',
        missing: ['leaseId', 'userId', 'client runId', 'client epoch', 'contextId', 'cross-tier requestId'],
        historical: {
          traceId: checked.traceId, source: checked.source,
          association: checked.context.association,
          attempts: checked.attempts.map((a) => ({
            attemptId: a.attemptId, classification: a.classification, requests: a.requests, responses: a.responses
          })),
          replacement: 'summary-only replacement 7; no complete observation, no current attribution',
          originalRecordsAttributed: 0
        }
      };
    }
    subset(candidate, topKeys, 'CLOSED_EVIDENCE_SCHEMA');
    const missing = [];
    for (const key of topKeys) {
      if (!Object.hasOwn(candidate, key) || candidate[key] === null) {
        missing.push(key);
        continue;
      }
      if ((key === 'schemaVersion' && candidate[key] !== 1) ||
          (key === 'evidenceKind' && candidate[key] !== 'closed-fictional-correlation/1')) fail('EVIDENCE_VERSION');
      if (key === 'fixtureScope' && candidate[key] !== scope) fail('FIXTURE_SCOPE_MISMATCH');
      if (key === 'originalAttempt' && candidate[key] !== attemptId) fail('ORIGINAL_ATTEMPT_MISMATCH');
      if (key === 'source' && !equal(candidate[key], context.source)) fail('CALLER_PROVENANCE_NOT_TRUSTED');
    }
    if (!Object.hasOwn(candidate, 'observations') || candidate.observations === null) {
      return { outcome: 'held', code: 'INCOMPLETE_REQUIRED_OBSERVATION', missing };
    }
    if (!Array.isArray(candidate.observations) || candidate.observations.length > 3) fail('BOUNDED_TIER_OBSERVATIONS_REQUIRED');
    if (candidate.observations.length !== 3) missing.push('three complete tier observations');
    const expected = positive(context).observations;
    const seen = new Set();
    let lastTick = context.fictionalObservationClock.earliestTick - 1;
    for (const [index, observation] of candidate.observations.entries()) {
      subset(observation, observationKeys, 'UNEXPECTED_OBSERVATION_FIELD');
      const target = expected[index];
      for (const key of observationKeys) {
        if (!Object.hasOwn(observation, key) || observation[key] === null) {
          missing.push(`${index + 1}.${key}`);
          continue;
        }
        const value = observation[key];
        if ((strings.includes(key) && (typeof value !== 'string' || value.length > 160)) ||
            (integers.includes(key) && !integer(value)) ||
            (key === 'complete' && typeof value !== 'boolean')) fail('EVIDENCE_FIELD_TYPE');
        if (key === 'complete') {
          if (value !== true) missing.push(`${index + 1}.complete`);
        } else if (key === 'observedTick') {
          if (value < context.fictionalObservationClock.earliestTick) fail('STALE_OBSERVATION');
          if (value > context.fictionalObservationClock.currentTick) fail('FUTURE_OBSERVATION');
          if (value <= lastTick || value !== target.observedTick) fail('OBSERVATION_ORDER');
          lastTick = value;
        } else if (key === 'actions') {
          if (!Array.isArray(value) || value.length > 2) fail('CLOSED_ACTION_OBSERVATION');
          if (value.length < 2) missing.push(`${index + 1}.request-and-response`);
          for (const [actionIndex, action] of value.entries()) {
            const keys = actionIndex === 0 ? ['kind', 'requestId', 'tick'] : ['kind', 'requestId', 'tick', 'httpStatus'];
            subset(action, keys, 'CLOSED_ACTION_SCHEMA');
            for (const field of keys) {
              if (!Object.hasOwn(action, field) || action[field] === null) missing.push(`${index + 1}.actions.${actionIndex}.${field}`);
              else if ((['kind', 'requestId'].includes(field) && typeof action[field] !== 'string') ||
                  (['tick', 'httpStatus'].includes(field) && !integer(action[field]))) fail('ACTION_FIELD_TYPE');
              else if (action[field] !== target.actions[actionIndex][field]) fail('REQUEST_RESPONSE_ORDER_OR_CONTEXT');
            }
          }
        } else if (key === 'stamp') {
          subset(value, ['implementation', 'implementationVersion', 'apiContract', 'deploymentStamp'], 'CLOSED_TIER_STAMP');
          for (const field of ['implementation', 'implementationVersion', 'apiContract', 'deploymentStamp']) {
            if (!Object.hasOwn(value, field) || value[field] === null) missing.push(`${index + 1}.stamp.${field}`);
            else if (typeof value[field] !== 'string') fail('STAMP_FIELD_TYPE');
            else if (value[field] !== target.stamp[field]) fail('TIER_STAMP_MISMATCH');
          }
        } else if (value !== target[key]) {
          const code = {
            evidenceId: 'EVIDENCE_ID_MISMATCH', fixtureScope: 'FIXTURE_SCOPE_MISMATCH',
            fixtureNamespace: 'FIXTURE_NAMESPACE_MISMATCH', contextId: 'CONTEXT_MISMATCH',
            leaseId: 'LEASE_MISMATCH', runId: 'RUN_MISMATCH', userId: 'USER_MISMATCH',
            epoch: 'EPOCH_MISMATCH_OR_STALE', epochVersion: 'EPOCH_VERSION_MISMATCH',
            stateSha256: 'STATE_STAMP_MISMATCH', attemptId: 'ORIGINAL_ATTEMPT_MISMATCH',
            requestId: 'REQUEST_CONTEXT_MISMATCH', ordinal: 'TIER_ORDER', tier: 'TIER_MISMATCH'
          }[key];
          fail(code || 'OBSERVATION_MISMATCH');
        }
      }
      if (Object.hasOwn(observation, 'evidenceId') && observation.evidenceId !== null) {
        if (seen.has(observation.evidenceId) || used.has(observation.evidenceId)) fail('REPLAYED_EVIDENCE');
        seen.add(observation.evidenceId);
      }
    }
    if (missing.length) return { outcome: 'held', code: 'INCOMPLETE_REQUIRED_OBSERVATION', missing };
    return { outcome: 'fixture-verified', code: 'CLOSED_FICTIONAL_SCOPE_VERIFIED', observations: expected };
  }
  async function open() {
    if (arguments.length) fail('NO_CALLER_EXPECTED_CONTEXT');
    let context = contextFrom(await readOwnerContext());
    const attached = new Map();
    const used = new Set();
    const history = [];
    let busy = false;
    let lastResult = null;
    const contextKey = () => context ? `${context.fixtureNamespace}|${context.runId}|${context.epochVersion}|${context.epoch}|${context.stateSha256}` : null;
    const currentRecords = () => attached.get(contextKey()) || [];
    function result(outcome, code, extra = {}) {
      return freeze({
        outcome, code, fixtureScopeVerified: ['fixture-verified', 'attached'].includes(outcome),
        nativeCorrelationVerified: false, authenticatedIdentityVerified: false, leaseAuthority: false,
        liveRunAdopted: false, productionRuntimeValidated: false, attributedRecords: currentRecords().length,
        interpretation: 'local closed fictional attribution only; no native/authenticated identity or lease authority',
        ...extra
      });
    }
    async function transition(operation, input, bytes, argumentCount) {
      if (busy) return result('rejected', 'INSPECTION_BUSY');
      if (history.length >= HISTORY_LIMIT) return result('rejected', 'HISTORY_LIMIT');
      busy = true;
      let outcome;
      try {
        if (argumentCount !== 1) fail('NO_CALLER_CONTEXT_OR_VERDICT');
        try { context = contextFrom(await readOwnerContext()); }
        catch (error) { context = null; fail(error.code || 'CURRENT_CONTEXT_UNREADABLE'); }
        const candidate = parse(bytes ? decode(input) : input);
        const checked = assess(candidate, context, used);
        if (operation === 'attach' && checked.outcome === 'fixture-verified') {
          // The only attachment/metric transition is after every owner-context guard.
          const records = structuredClone(checked.observations);
          attached.set(contextKey(), freeze(records));
          for (const item of records) used.add(item.evidenceId);
          outcome = result('attached', 'FICTIONAL_RECORDS_ATTACHED', { blockedTransition: false });
        } else {
          const extra = {};
          if (checked.missing) extra.missing = checked.missing;
          if (checked.historical) extra.historical = checked.historical;
          outcome = result(checked.outcome, checked.code, { blockedTransition: true, ...extra });
        }
      } catch (error) {
        outcome = result('rejected', error.code || 'INSPECTION_ERROR', { blockedTransition: true });
      } finally { busy = false; }
      history.push(freeze({
        index: history.length + 1, operation, outcome: outcome.outcome, code: outcome.code,
        currentEpoch: context?.epoch ?? null, attributedRecords: outcome.attributedRecords
      }));
      lastResult = outcome;
      return outcome;
    }
    function getEvidence(id) {
      if (arguments.length !== 1 || typeof id !== 'string' || !ids.includes(id)) fail('UNKNOWN_EVIDENCE_ID');
      if (!context) fail('CURRENT_CONTEXT_UNAVAILABLE');
      if (id.startsWith('saved-')) {
        const traceId = id === 'saved-closed-unlinked' ? 'closed-history' : 'held-snapshot';
        return { schemaVersion: 1, evidenceKind: 'unlinked-C034-historical/1', traceId, savedTrace: structuredClone(trace.getSavedTrace(traceId)) };
      }
      const candidate = positive(context);
      const first = candidate.observations[0];
      if (id === 'wrong-run') first.runId = 'synthetic-run-002';
      if (id === 'wrong-user') first.userId = 'fictional-C036-user-002';
      if (id === 'wrong-lease') first.leaseId = 'fictional-C036-lease-002';
      if (id === 'old-epoch') first.epoch = context.epoch === 1 ? 2 : context.epoch - 1;
      if (id === 'wrong-tier') first.tier = 'getProfile-v2';
      if (id === 'wrong-stamp') first.stamp.deploymentStamp = 'fictional-wrong-r9';
      if (id === 'stale') first.observedTick = 99;
      if (id === 'newer-attempt') first.attemptId = 'fictional-C036-attempt-002';
      if (id === 'partial') candidate.observations.at(-1).actions.pop();
      if (id === 'missing-correlation') {
        for (const item of candidate.observations) for (const key of ['leaseId', 'userId', 'runId', 'epoch', 'contextId', 'requestId']) delete item[key];
      }
      return candidate;
    }
    return Object.freeze({
      getEvidence,
      inspectText(text) { return transition('inspect', text, false, arguments.length); },
      attachText(text) { return transition('attach', text, false, arguments.length); },
      inspectBytes(bytes) { return transition('inspect', bytes, true, arguments.length); },
      attachBytes(bytes) { return transition('attach', bytes, true, arguments.length); },
      snapshot() {
        return freeze({
          currentExpectedContext: context ? structuredClone(context) : null,
          attachedRecords: currentRecords().length,
          metrics: { currentAttributedTierRecords: currentRecords().length, nativeAuthenticatedRecords: 0 },
          historicalAttachedContexts: [...attached.keys()].filter((key) => key !== contextKey()).length,
          history: structuredClone(history), lastResult,
          historyLimit: HISTORY_LIMIT, fixtureOnly: true,
          nativeCorrelationVerified: false, authenticatedIdentityVerified: false, leaseAuthority: false
        });
      }
    });
  }
  return Object.freeze({ open, ids, MAX_BYTES, HISTORY_LIMIT });
}));
