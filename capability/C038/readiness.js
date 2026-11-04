(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('..\\C036\\attribution.js'), require('..\\C034\\trace.js'),
      require('./model.js'), () => require('./sources.cjs').assertInputs());
  } else {
    Object.defineProperty(root, 'C038Readiness', {
      value: factory(root.C036Attribution, root.C034Trace, root.C038Model, async () => ({
        source: 'bundled-historical-browser-inputs-only', currentDiskRead: false
      }))
    });
  }
}(globalThis, function (attribution, trace, model, assertInputs) {
  'use strict';
  const MAX_BYTES = 65536;
  const HISTORY_LIMIT = 10;
  const MAX_TICK = 86400000;
  const flags = Object.freeze({
    actualPoolReady: false, actualInstancesAttested: false, actualCapacityKnown: false,
    nativeFreshnessAttested: false, nativeCorrelationVerified: false,
    authenticatedIdentityVerified: false, leaseAuthority: false,
    capacityScalingVerified: false, originalClientJourneyRepaired: false,
    productionRuntimeValidated: false, liveAzureExecuted: false
  });
  function fail(code) { throw Object.assign(new Error(code), { code }); }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function integer(value) { return Number.isSafeInteger(value) && !Object.is(value, -0) && value >= 0 && value <= MAX_TICK; }
  function subset(value, keys, code) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
        Object.keys(value).some((key) => !keys.includes(key))) fail(code);
  }
  function required(value, keys, prefix, missing) {
    subset(value, keys, 'UNEXPECTED_OR_NONRECORD_FIELD');
    for (const key of keys) if (!Object.hasOwn(value, key) || value[key] === null) missing.push(`${prefix}.${key}`);
  }
  function equal(left, right) { return trace.canonical(left) === trace.canonical(right); }
  function match(value, expected, prefix, missing) {
    if (value === undefined || value === null) { missing.push(prefix); return; }
    if (Array.isArray(expected)) {
      if (!Array.isArray(value) || value.length > expected.length) fail('INVENTORY_OR_SOURCE_COVERAGE_MISMATCH');
      if (value.length < expected.length) missing.push(`${prefix}.complete-coverage`);
      for (const [index, item] of value.entries()) match(item, expected[index], `${prefix}.${index}`, missing);
    } else if (expected && typeof expected === 'object') {
      subset(value, Object.keys(expected), 'UNKNOWN_CONTEXT_SOURCE_OR_INVENTORY_FIELD');
      for (const [key, item] of Object.entries(expected)) match(value[key], item, `${prefix}.${key}`, missing);
    } else {
      if (typeof value !== typeof expected) fail('EXACT_FIELD_TYPE_REQUIRED');
      if (prefix.endsWith('.complete') && value === false) missing.push(prefix);
      else if (value !== expected) fail(
        prefix.includes('version') || prefix.includes('Version') ? 'INCOMPATIBLE_VERSION' :
          prefix.includes('context') ? 'CONTEXT_OR_EPOCH_MISMATCH' :
            prefix.includes('source') ? 'UNTRUSTED_SOURCE' : 'EXPECTED_INVENTORY_OR_VALUE_MISMATCH');
    }
  }
  function contextOf(guard) {
    const context = guard.snapshot().currentExpectedContext;
    if (!context || !['actual-C015-public-restore-read-only', 'bundled-historical-C015-observation-only'].includes(context.contextOrigin) ||
        context.source.nativeCorrelationVerified !== false || context.source.authenticatedIdentityVerified !== false ||
        context.source.leaseAuthority !== false) fail('OWNER_CONTEXT_UNAVAILABLE');
    return freeze(structuredClone(context));
  }
  function parse(text) {
    if (typeof text !== 'string') fail('JSON_TEXT_REQUIRED');
    if (new TextEncoder().encode(text).byteLength > MAX_BYTES) fail('INPUT_TOO_LARGE');
    return trace.parseJson(text);
  }
  function emptyCoverage() {
    return model.inventory.instances.flatMap((instance) => instance.requiredProbes.map((probeId) => ({
      instanceId: instance.id, probeId, status: 'UNKNOWN', ageTicks: null,
      observationId: null, reasons: ['MISSING_REQUIRED_PROBE']
    })));
  }
  function report(decision, code, extra = {}) {
    return freeze({
      decision, action: decision === 'CLOSED_SYNTHETIC_READY' ? 'INSPECT_ONLY' : 'HOLD',
      syntheticPoolReady: decision === 'CLOSED_SYNTHETIC_READY',
      code, ...flags,
      scope: 'CLOSED_SYNTHETIC_NOT_ACTUAL_POOL',
      interpretation: 'Current fictional freshness inspection only; not original client success, capacity, native health or lease authority.',
      ...extra
    });
  }
  function assess(candidate, context, usedRounds) {
    const missing = [];
    const coverage = emptyCoverage();
    required(candidate, ['schemaVersion', 'kind', 'modelId', 'roundId', 'inventory',
      'clock', 'source', 'context', 'observations'], 'candidate', missing);
    match(candidate.schemaVersion, 1, 'candidate.schemaVersion', missing);
    match(candidate.kind, 'C038-closed-synthetic-observations/1', 'candidate.kind', missing);
    match(candidate.modelId, model.modelId, 'candidate.modelId', missing);
    if (Object.hasOwn(candidate, 'roundId') && candidate.roundId !== null) {
      if (typeof candidate.roundId !== 'string' || !model.rounds.includes(candidate.roundId)) fail('UNKNOWN_ORIGINAL_ROUND');
      if (usedRounds.has(candidate.roundId)) fail('REPLAYED_ORIGINAL_ROUND');
    }
    match(candidate.inventory, model.inventory, 'inventory', missing);
    match(candidate.source, model.source, 'source', missing);
    const expectedContext = model.ownerContext(context);
    match(candidate.context, expectedContext, 'context', missing);
    let clockValid = false;
    if (candidate.clock !== undefined && candidate.clock !== null) {
      required(candidate.clock, Object.keys(model.clock), 'clock', missing);
      for (const key of ['nowTick', 'ttlTicks', 'uncertaintyTicks']) {
        if (Object.hasOwn(candidate.clock, key) && candidate.clock[key] !== null && !integer(candidate.clock[key])) fail('FINITE_BOUNDED_CLOCK_REQUIRED');
      }
      if (candidate.clock.kind !== model.clock.kind || candidate.clock.id !== model.clock.id) missing.push('clock.known-single-domain');
      if (candidate.clock.uncertaintyTicks !== 0) missing.push('clock.unambiguous-zero-uncertainty');
      for (const key of ['nowTick', 'ttlTicks', 'freshnessContract']) {
        match(candidate.clock[key], model.clock[key], `clock.${key}`, missing);
      }
      clockValid = equal(candidate.clock, model.clock);
    }
    if (candidate.observations !== undefined && candidate.observations !== null) {
      if (!Array.isArray(candidate.observations) || candidate.observations.length > coverage.length) fail('BOUNDED_REQUIRED_PROBES');
      const seen = new Set();
      for (const [index, observation] of candidate.observations.entries()) {
        const local = [];
        required(observation, ['id', 'originalId', 'instanceId', 'probeId', 'tier', 'version',
          'dependency', 'context', 'source', 'request', 'response'], `observation.${index}`, local);
        for (const key of ['id', 'originalId', 'instanceId', 'probeId', 'tier']) {
          if (observation[key] !== undefined && observation[key] !== null &&
              (typeof observation[key] !== 'string' || observation[key].length > 256)) fail('BOUNDED_ID_STRING_REQUIRED');
        }
        const instance = model.inventory.instances.find((item) => item.id === observation.instanceId);
        if (observation.instanceId !== undefined && observation.instanceId !== null && !instance) fail('UNKNOWN_INSTANCE_ID');
        if (!instance || observation.probeId === undefined || observation.probeId === null) {
          missing.push(...local);
          continue;
        }
        if (!instance.requiredProbes.includes(observation.probeId)) fail('UNKNOWN_REQUIRED_PROBE');
        const key = `${instance.id}:${observation.probeId}`;
        if (seen.has(key)) fail('DUPLICATE_NODE_PROBE');
        seen.add(key);
        const slot = coverage.find((item) => item.instanceId === instance.id && item.probeId === observation.probeId);
        const round = candidate.roundId;
        match(observation.originalId, round, 'observation.originalId', local);
        match(observation.id, model.observationId(round, instance.id, observation.probeId), 'observation.id', local);
        match(observation.tier, instance.tier, 'observation.tier', local);
        match(observation.version, instance.version, 'observation.version', local);
        match(observation.dependency, model.dependency(observation.probeId), 'observation.dependency', local);
        match(observation.context, expectedContext, 'observation.context', local);
        match(observation.source, model.source, 'observation.source', local);
        const request = observation.request;
        const response = observation.response;
        const expectedRequest = model.requestId(round, instance.id, observation.probeId);
        if (request !== undefined && request !== null) {
          required(request, ['id', 'sentTick', 'clockId'], 'request', local);
          match(request.id, expectedRequest, 'request.id', local);
          if (request.clockId !== model.clock.id) local.push('request.known-clock');
          if (request.sentTick !== undefined && request.sentTick !== null && !integer(request.sentTick)) fail('FINITE_BOUNDED_REQUEST_TIME');
        }
        if (response !== undefined && response !== null) {
          required(response, ['requestId', 'observedTick', 'clockId', 'complete', 'httpStatus', 'state'], 'response', local);
          match(response.requestId, expectedRequest, 'response.requestId', local);
          if (response.clockId !== model.clock.id) local.push('response.known-clock');
          if (response.complete !== undefined && response.complete !== null && typeof response.complete !== 'boolean') fail('COMPLETE_BOOLEAN_REQUIRED');
          if (response.complete !== true) local.push('response.complete');
          if (response.observedTick !== undefined && response.observedTick !== null && !integer(response.observedTick)) fail('FINITE_BOUNDED_OBSERVATION_TIME');
          if (response.httpStatus !== undefined && response.httpStatus !== null &&
              (!Number.isSafeInteger(response.httpStatus) || response.httpStatus < 100 || response.httpStatus > 599)) fail('HTTP_STATUS_TYPE_OR_RANGE');
          if (response.state !== undefined && response.state !== null &&
              !['ready', 'failed', 'unknown'].includes(response.state)) fail('CLOSED_STATE_REQUIRED');
          if (clockValid && integer(response.observedTick)) {
            const age = model.clock.nowTick - response.observedTick;
            slot.ageTicks = age;
            if (age < 0) local.push('FUTURE_OBSERVATION');
            if (integer(request?.sentTick) && request.sentTick > response.observedTick) local.push('REQUEST_RESPONSE_ORDER');
          }
        }
        slot.observationId = observation.id ?? null;
        slot.reasons = [...new Set(local)];
        if (local.length || !clockValid) slot.status = 'UNKNOWN';
        else if (response.state === 'failed' || response.httpStatus !== 200) slot.status = 'FAILED';
        else if (slot.ageTicks >= model.clock.ttlTicks) slot.status = 'STALE';
        else if (response.state !== 'ready') slot.status = 'UNKNOWN';
        else slot.status = 'FRESH_READY';
        if (slot.status !== 'FRESH_READY' && !slot.reasons.length) slot.reasons.push(slot.status);
        missing.push(...local);
      }
    }
    for (const item of coverage) if (!item.observationId) missing.push(`${item.instanceId}.${item.probeId}`);
    const failed = coverage.some((item) => item.status === 'FAILED');
    const stale = coverage.some((item) => item.status === 'STALE');
    const ready = missing.length === 0 && clockValid && coverage.every((item) => item.status === 'FRESH_READY');
    const decision = failed ? 'FAILED' : stale ? 'STALE' : ready ? 'CLOSED_SYNTHETIC_READY' : 'UNKNOWN';
    return report(decision, failed ? 'REQUIRED_NODE_OR_DEPENDENCY_FAILED' : stale ? 'REQUIRED_OBSERVATION_STALE' :
      ready ? 'COMPLETE_FRESH_CLOSED_SYNTHETIC_COVERAGE' : 'INCOMPLETE_OR_UNKNOWN_REQUIRED_EVIDENCE',
    { originalId: candidate.roundId ?? null, coverage, missing: [...new Set(missing)],
      expectedProbes: coverage.length, freshReadyProbes: coverage.filter((item) => item.status === 'FRESH_READY').length,
      clock: structuredClone(model.clock), source: structuredClone(model.source) });
  }
  async function open() {
    if (arguments.length) fail('NO_CALLER_EXPECTED_CONTEXT');
    await assertInputs();
    const guard = await attribution.open();
    let context = contextOf(guard);
    let lastResult = null;
    let busy = false;
    const history = [];
    const usedRounds = new Set();
    const saved = new Set();
    async function inspect(input, bytes, count) {
      if (busy) return report('UNKNOWN', 'INSPECTION_BUSY');
      if (history.length >= HISTORY_LIMIT) return report('UNKNOWN', 'HISTORY_LIMIT_REACHED');
      busy = true;
      let candidate;
      let result;
      try {
        if (count !== 1) fail('NO_CALLER_CONTEXT_VERDICT_OR_OVERRIDE');
        let text = input;
        if (bytes) {
          if (!(input instanceof Uint8Array)) fail('UTF8_BYTES_REQUIRED');
          if (input.byteLength > MAX_BYTES) fail('INPUT_TOO_LARGE');
          try { text = new TextDecoder('utf-8', { fatal: true }).decode(input); }
          catch { fail('INVALID_UTF8'); }
        }
        candidate = parse(text);
        await assertInputs();
        const historical = candidate?.kind === 'C038-unlinked-C034-history/1';
        if (historical) {
          required(candidate, ['schemaVersion', 'kind', 'savedId', 'evidence'], 'history', []);
          if (candidate.schemaVersion !== 1 || !['saved-closed-unlinked', 'saved-held-unlinked'].includes(candidate.savedId) ||
              !equal(candidate.evidence, guard.getEvidence(candidate.savedId))) fail('EXACT_UNLINKED_HISTORY_REQUIRED');
          if (saved.has(candidate.savedId)) fail('REPLAYED_HISTORICAL_INSPECTION');
        }
        const diagnostic = await guard.inspectText(JSON.stringify(historical ?
          candidate.evidence : guard.getEvidence('fictional-complete')));
        context = contextOf(guard);
        if (historical) {
          if (diagnostic.outcome !== 'held' || !diagnostic.historical) fail('C036_UNLINKED_GUARD_REQUIRED');
          saved.add(candidate.savedId);
          result = report('UNKNOWN', 'ACTUAL_C034_HISTORY_UNLINKED_NOT_POOL_INVENTORY', {
            originalId: candidate.savedId, coverage: emptyCoverage(),
            missing: ['actual instance inventory', 'per-instance dependency observations', 'current authenticated correlation', 'current clock/freshness'],
            expectedProbes: 6, freshReadyProbes: 0, historical: diagnostic.historical,
            historicalSource: structuredClone(candidate.evidence.savedTrace.source)
          });
        } else {
          if (diagnostic.outcome !== 'fixture-verified' || diagnostic.nativeCorrelationVerified !== false ||
              diagnostic.attributedRecords !== 0) fail('C036_CURRENT_CONTEXT_GUARD_HOLD');
          result = assess(candidate, context, usedRounds);
        }
      } catch (error) {
        result = report('UNKNOWN', error.code || 'INSPECTION_ERROR', {
          rejected: true, originalId: model.rounds.includes(candidate?.roundId) ? candidate.roundId : null,
          coverage: emptyCoverage(), expectedProbes: 6, freshReadyProbes: 0,
          missing: [error.code || 'INSPECTION_ERROR']
        });
      } finally { busy = false; }
      if (model.rounds.includes(candidate?.roundId)) usedRounds.add(candidate.roundId);
      history.push(freeze({
        index: history.length + 1, originalId: result.originalId ?? null,
        decision: result.decision, code: result.code,
        coverage: structuredClone(result.coverage), missing: structuredClone(result.missing),
        currentEpochObserved: context?.epoch ?? null,
        syntheticPoolReady: result.syntheticPoolReady, ...flags
      }));
      lastResult = result;
      return result;
    }
    return Object.freeze({
      getEvidence(id) {
        if (arguments.length !== 1 || typeof id !== 'string' || !model.ids.includes(id)) fail('UNKNOWN_FIXTURE_ID');
        if (id.startsWith('saved-')) return {
          schemaVersion: 1, kind: 'C038-unlinked-C034-history/1', savedId: id,
          evidence: guard.getEvidence(id)
        };
        return model.candidate(id, context);
      },
      inspectText(text) { return inspect(text, false, arguments.length); },
      inspectBytes(bytes) { return inspect(bytes, true, arguments.length); },
      snapshot() {
        return freeze({
          lastResult, history: structuredClone(history), historyLimit: HISTORY_LIMIT,
          usedOriginalRounds: [...usedRounds], expectedInventory: structuredClone(model.inventory),
          declaredFictionalClock: structuredClone(model.clock),
          currentC015Association: model.ownerContext(context),
          ownerContextOrigin: context.contextOrigin,
          c036ScopeIsFictionalNotInstanceInventory: true,
          c034ActualHistoryRemainsUnlinked: true, ...flags
        });
      }
    });
  }
  return Object.freeze({ open, ids: model.ids, MAX_BYTES, HISTORY_LIMIT, flags });
}));
