(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('..\\C036\\attribution.js'), require('..\\C034\\trace.js'));
  } else Object.defineProperty(root, 'C037Routing', { value: factory(root.C036Attribution, root.C034Trace) });
}(globalThis, function (attribution, trace) {
  'use strict';

  const MAX_BYTES = 65536;
  const HISTORY_LIMIT = 16;
  const targets = Object.freeze(['v1', 'v2']);
  const controlIds = ['fictional-match', 'fictional-skew', 'fictional-unknown', 'fictional-in-flight',
    'fictional-missing-destination', 'fictional-duplicates', 'fictional-no-policy', 'fictional-zero',
    'fictional-threshold', 'fictional-errors', 'wrong-run', 'wrong-user', 'wrong-lease', 'wrong-context',
    'old-epoch', 'stale', 'wrong-tier', 'wrong-stamp', 'missing-attribution'];
  const ids = Object.freeze(['historical-closed', 'historical-held', ...controlIds]);
  const topKeys = ['schemaVersion', 'evidenceKind', 'sampleId', 'requested', 'attribution', 'observations', 'savedTrace'];
  const correlationKeys = ['fixtureScope', 'fixtureNamespace', 'contextId', 'leaseId', 'runId', 'userId',
    'epoch', 'epochVersion', 'stateSha256', 'attemptId', 'requestId'];
  const eventKeys = ['eventId', 'originalRequestId', 'ordinal', 'kind', 'observedTick',
    'correlation', 'destination', 'httpStatus', 'stamp'];
  function fail(code) { throw Object.assign(new Error(code), { code }); }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function same(a, b) { return trace.canonical(a) === trace.canonical(b); }
  function exact(value, keys, code) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).length !== keys.length || keys.some((key) => !Object.hasOwn(value, key))) fail(code);
  }
  function subset(value, keys, code) {
    if (!value || typeof value !== 'object' || Array.isArray(value) ||
        Object.keys(value).some((key) => !keys.includes(key))) fail(code);
  }
  function integer(value, low, high) {
    return Number.isSafeInteger(value) && !Object.is(value, -0) && value >= low && value <= high;
  }
  function parse(input, bytes) {
    if (bytes) {
      if (!(input instanceof Uint8Array)) fail('EVIDENCE_BYTES_REQUIRED');
      if (input.byteLength > MAX_BYTES) fail('EVIDENCE_OVERSIZE');
      try { input = new TextDecoder('utf-8', { fatal: true }).decode(input); }
      catch { fail('INVALID_UTF8'); }
    }
    if (typeof input !== 'string') fail('JSON_TEXT_REQUIRED');
    if (new TextEncoder().encode(input).byteLength > MAX_BYTES) fail('EVIDENCE_OVERSIZE');
    return trace.parseJson(input);
  }
  function policy(value) {
    if (value === null) return null;
    exact(value, ['policyId', 'origin', 'targets', 'toleranceBps', 'minimumStarted'], 'CLOSED_POLICY_SCHEMA');
    if (value.policyId !== 'fictional-C037-requested-001' || value.origin !== 'declared-fictional-policy') fail('DECLARED_POLICY_ONLY');
    if (!integer(value.toleranceBps, 0, 10000) || !integer(value.minimumStarted, 1, 64)) fail('POLICY_INTEGER_BOUNDS');
    if (!Array.isArray(value.targets) || value.targets.length !== 2) fail('FINITE_CLOSED_TARGETS');
    for (const [index, target] of value.targets.entries()) {
      exact(target, ['destination', 'weightBps'], 'CLOSED_TARGET_SCHEMA');
      if (target.destination !== targets[index] || !integer(target.weightBps, 0, 10000)) fail('FINITE_CLOSED_TARGETS');
    }
    if (value.targets.reduce((sum, item) => sum + item.weightBps, 0) !== 10000) fail('EXACT_WEIGHT_SUM_REQUIRED');
    return value;
  }
  function summarize(rows, duplicateDeliveries = 0, sourceComplete = true) {
    const started = rows.length;
    const destinations = targets.map((destination) => {
      const count = rows.filter((row) => row.destination === destination).length;
      return { destination, count, share: started ? count / started : null };
    });
    const known = destinations.reduce((sum, item) => sum + item.count, 0);
    const inFlight = rows.filter((row) => row.state === 'in-flight').length;
    const missingDestination = rows.filter((row) => row.state === 'missing-destination').length;
    const interrupted = rows.filter((row) => row.state === 'interrupted').length;
    if (known + inFlight + missingDestination + interrupted !== started) fail('DENOMINATOR_ACCOUNTING');
    return {
      started, known, unknown: started - known, inFlight, missingDestination, interrupted, duplicateDeliveries,
      failedResponses: rows.filter((row) => row.httpStatus >= 400).length,
      http200Responses: rows.filter((row) => row.httpStatus === 200).length,
      denominator: 'all distinct started originals; unknowns, failures and in-flight requests are retained',
      complete: sourceComplete && started > 0 && known === started, destinations
    };
  }
  function comparePolicy(requested, observed) {
    const differences = observed.destinations.map((item, index) => {
      const weight = requested?.targets[index].weightBps ?? null;
      const deltaNumerator = weight === null || !observed.started ? null : item.count * 10000 - weight * observed.started;
      return {
        destination: item.destination, requestedWeightBps: weight,
        declaredExpectedCount: weight === null ? null : observed.started * weight / 10000,
        observedCount: item.count, observedShare: item.share,
        deltaBps: deltaNumerator === null ? null : deltaNumerator / observed.started,
        withinThreshold: deltaNumerator === null ? null :
          BigInt(Math.abs(deltaNumerator)) <= BigInt(requested.toleranceBps) * BigInt(observed.started)
      };
    });
    const holds = [];
    if (!requested) holds.push('REQUESTED_POLICY_UNOBSERVED');
    if (!observed.started) holds.push('ZERO_DENOMINATOR');
    if (requested && observed.started < requested.minimumStarted) holds.push('INSUFFICIENT_STARTED_ORIGINALS');
    if (!observed.complete) holds.push('INCOMPLETE_DESTINATION_OBSERVATIONS');
    return { differences, holds, knownMismatch: Boolean(requested && observed.started &&
      differences.some((item) => item.withinThreshold === false)) };
  }
  function correlation(context) {
    return Object.fromEntries(correlationKeys.map((key) => [key, context[key]]));
  }
  function eventsFor(id, context, destinations) {
    const events = [];
    const link = correlation(context);
    destinations.forEach((destination, index) => {
      const originalRequestId = `fictional-C037-${id}-${index + 1}`;
      const common = { originalRequestId, observedTick: 101 + index, correlation: structuredClone(link) };
      events.push({ ...common, eventId: `${originalRequestId}-start`, ordinal: events.length + 1,
        kind: 'started', destination: null, httpStatus: null, stamp: null });
      if (destination === 'in-flight') return;
      const unknown = destination === 'unknown';
      events.push({ ...common, eventId: `${originalRequestId}-reply`, ordinal: events.length + 1,
        kind: unknown ? 'interrupted' : 'response', destination: targets.includes(destination) ? destination : null,
        httpStatus: unknown ? null : 200,
        stamp: targets.includes(destination) ? structuredClone(context.tiers[targets.indexOf(destination) + 1].stamp) : null });
    });
    return events;
  }
  function controlRows(candidate, context, missing) {
    if (!Array.isArray(candidate.observations) || candidate.observations.length > 128) fail('BOUNDED_OBSERVATIONS_REQUIRED');
    const originals = new Map();
    const deliveries = new Map();
    const link = correlation(context);
    let duplicateDeliveries = 0;
    let lastTick = 100;
    for (const [index, event] of candidate.observations.entries()) {
      subset(event, eventKeys, 'CLOSED_OBSERVATION_SCHEMA');
      for (const key of ['correlation', 'destination', 'httpStatus', 'stamp']) {
        if (!Object.hasOwn(event, key)) event[key] = null;
      }
      if (!integer(event.ordinal, 1, 128) || event.ordinal !== index + 1) fail('OBSERVATION_ORDER');
      for (const key of ['eventId', 'originalRequestId']) {
        if (typeof event[key] !== 'string' || event[key].length > 128 ||
            !event[key].startsWith(`fictional-C037-${candidate.sampleId}-`) ||
            !/^[a-zA-Z0-9-]+$/.test(event[key])) fail('CLOSED_FICTIONAL_REQUEST_ID');
      }
      if (event.correlation === null) missing.push('COMPLETE_ROUTING_CORRELATION_UNOBSERVED');
      else {
        subset(event.correlation, correlationKeys, 'CLOSED_CORRELATION_SCHEMA');
        for (const key of correlationKeys) {
          if (!Object.hasOwn(event.correlation, key) || event.correlation[key] === null) {
            missing.push('COMPLETE_ROUTING_CORRELATION_UNOBSERVED');
          } else if (event.correlation[key] !== link[key]) fail('ROUTING_CORRELATION_MISMATCH');
        }
      }
      if (!integer(event.observedTick, 101, 107)) fail('STALE_OR_FUTURE_ROUTING_OBSERVATION');
      if (event.observedTick < lastTick) fail('OBSERVATION_ORDER');
      lastTick = event.observedTick;
      if (!['started', 'response', 'interrupted'].includes(event.kind)) fail('CLOSED_OBSERVATION_KIND');
      const original = originals.get(event.originalRequestId);
      if (event.kind === 'started') {
        if (event.destination !== null || event.httpStatus !== null || event.stamp !== null) fail('START_IS_NOT_RESPONSE');
        if (original || originals.size >= 64 || deliveries.has(event.eventId)) fail('DUPLICATE_ORIGINAL_START');
        originals.set(event.originalRequestId, {
          originalRequestId: event.originalRequestId, state: 'in-flight', destination: null, httpStatus: null
        });
        deliveries.set(event.eventId, { kind: 'started' });
        continue;
      }
      if (!original) fail('RESPONSE_BEFORE_START');
      const payload = { ...event };
      delete payload.ordinal;
      const previous = deliveries.get(event.eventId);
      if (previous) {
        if (!same(previous, payload)) fail('CONFLICTING_DELIVERY');
        duplicateDeliveries++;
        continue;
      }
      if (event.kind === 'interrupted') {
        if (original.state !== 'in-flight' || event.destination !== null || event.httpStatus !== null || event.stamp !== null) {
          fail('INTERRUPTED_ORIGINAL_REPLACEMENT');
        }
        original.state = 'interrupted';
      } else {
        if (event.httpStatus === null) missing.push('HTTP_STATUS_UNOBSERVED');
        else if (!integer(event.httpStatus, 100, 599)) fail('HTTP_STATUS_TYPE');
        if (event.destination !== null && !targets.includes(event.destination)) fail('CLOSED_OBSERVED_DESTINATION');
        if (event.destination === null) {
          if (event.stamp !== null && !context.tiers.slice(1).some((item) => same(item.stamp, event.stamp))) fail('OBSERVED_STAMP_MISMATCH');
        } else if (event.stamp === null) missing.push('DESTINATION_STAMP_UNOBSERVED');
        else if (!same(event.stamp, context.tiers[targets.indexOf(event.destination) + 1].stamp)) fail('OBSERVED_STAMP_MISMATCH');
        const destination = event.httpStatus !== null && event.stamp !== null ? event.destination : null;
        const next = { originalRequestId: event.originalRequestId, state: destination === null ? 'missing-destination' : 'response',
          destination, httpStatus: event.httpStatus };
        if (original.state !== 'in-flight') {
          if (!same(original, next)) fail('CONFLICTING_ORIGINAL_OUTCOME');
          duplicateDeliveries++;
        } else Object.assign(original, next);
      }
      deliveries.set(event.eventId, payload);
    }
    return { rows: [...originals.values()], duplicateDeliveries };
  }
  function historicalRows(inspected) {
    const rows = [];
    for (const attempt of inspected.attempts) {
      let pending = null;
      let stampIndex = 0;
      for (const event of attempt.events) {
        if (event.code === 'ACTUAL_READ_STARTED') {
          pending = { originalRequestId: `${attempt.attemptId}/read-${event.ordinal}`,
            state: 'in-flight', destination: null, httpStatus: null };
          rows.push(pending);
        } else if (event.code === 'ACTUAL_READ_ACKNOWLEDGED') {
          pending.destination = attempt.observedVersions[stampIndex++].implementation;
          pending.state = 'response';
          pending = null;
        } else if (event.code === 'FAILED_HTTP_REPLY_404') {
          pending.state = 'missing-destination';
          pending.httpStatus = 404;
          pending = null;
        } else if (event.outcome === 'unknown' && pending) {
          pending.state = 'interrupted';
          pending = null;
        }
      }
    }
    return rows;
  }
  async function open() {
    if (arguments.length) fail('NO_CALLER_CONTEXT_OR_GUARD');
    const gate = await attribution.open();
    const ledger = new Map();
    const history = [];
    const failures = [];
    const holds = [];
    let currentKey = null;
    let busy = false;
    let lastResult = null;
    const expected = () => gate.snapshot().currentExpectedContext;
    const keyOf = (context) => context ? trace.canonical(correlation(context)) : null;
    const metrics = () => summarize([...(ledger.get(currentKey)?.values() || [])]);
    function sessionDisposition() {
      return failures.length ? 'FAILURE_RETAINED' : holds.length ? 'HOLD_RETAINED' :
        metrics().started ? 'FICTIONAL_CONTROL_ONLY' : 'UNOBSERVED';
    }
    function result(fields) {
      return freeze({
        ...fields, currentMetrics: metrics(), sessionDisposition: sessionDisposition(),
        actualCurrentAttributedRequests: 0, authenticatedIdentityVerified: false, leaseAuthority: false,
        observedRequestedPolicyVerified: false, nativeTransportQualified: false, migrationQualified: false,
        fullJourneyQualified: false, productionRuntimeValidated: false,
        association: 'explicit declared fictional association only; not authenticated run/user/lease/cohort proof'
      });
    }
    function getFixture(id) {
      if (arguments.length !== 1 || typeof id !== 'string' || !ids.includes(id)) fail('UNKNOWN_SAMPLE_ID');
      const context = expected();
      if (!context) fail('CURRENT_CONTEXT_UNAVAILABLE');
      if (id.startsWith('historical-')) {
        const traceId = id === 'historical-closed' ? 'closed-history' : 'held-snapshot';
        return { schemaVersion: 1, evidenceKind: 'historical-C034-routing/1', sampleId: id,
          requested: null, attribution: gate.getEvidence(id === 'historical-closed' ? 'saved-closed-unlinked' : 'saved-held-unlinked'),
          observations: null, savedTrace: structuredClone(trace.getSavedTrace(traceId)) };
      }
      const input = {
        schemaVersion: 1, evidenceKind: 'closed-fictional-routing/1', sampleId: id,
        requested: { policyId: 'fictional-C037-requested-001', origin: 'declared-fictional-policy',
          targets: [{ destination: 'v1', weightBps: 5000 }, { destination: 'v2', weightBps: 5000 }],
          toleranceBps: 500, minimumStarted: 4 },
        attribution: gate.getEvidence('fictional-complete'), savedTrace: null,
        observations: eventsFor(id, context, id === 'fictional-skew' ? ['v1', 'v1', 'v1', 'v1'] :
          id === 'fictional-unknown' ? ['v1', 'v2', 'v1', 'unknown'] :
          id === 'fictional-in-flight' ? ['v1', 'v2', 'v1', 'in-flight'] :
          id === 'fictional-missing-destination' ? ['v1', 'v2', 'v1', 'missing'] : ['v1', 'v2', 'v1', 'v2'])
      };
      if (id === 'fictional-zero') input.observations = [];
      if (id === 'fictional-no-policy') input.requested = null;
      if (id === 'fictional-threshold') {
        input.requested.targets[0].weightBps = 5500;
        input.requested.targets[1].weightBps = 4500;
      }
      if (id === 'fictional-errors') for (const event of input.observations) if (event.kind === 'response') event.httpStatus = 503;
      if (id === 'fictional-duplicates') {
        input.observations.push({ ...structuredClone(input.observations.at(-1)), ordinal: input.observations.length + 1 });
      }
      if (['wrong-run', 'wrong-user', 'wrong-lease', 'old-epoch', 'stale', 'wrong-tier', 'wrong-stamp'].includes(id)) {
        input.attribution = gate.getEvidence(id);
      }
      if (id === 'wrong-context') input.attribution.observations[0].contextId = 'fictional-C036-context-002';
      if (id === 'missing-attribution') input.attribution = null;
      return input;
    }
    async function transition(operation, input, bytes, argumentCount) {
      if (busy) return result({ outcome: 'rejected', disposition: 'REJECTED', code: 'COMPARISON_BUSY' });
      if (history.length >= HISTORY_LIMIT) return result({ outcome: 'rejected', disposition: 'REJECTED', code: 'HISTORY_LIMIT' });
      busy = true;
      currentKey = null;
      let output;
      try {
        if (argumentCount !== 1) fail('NO_CALLER_CONTEXT_OR_VERDICT');
        const candidate = parse(input, bytes);
        subset(candidate, topKeys, 'CLOSED_COMPARISON_SCHEMA');
        for (const key of ['requested', 'attribution', 'observations']) {
          if (!Object.hasOwn(candidate, key)) candidate[key] = null;
        }
        if (candidate.schemaVersion !== 1 || !ids.includes(candidate.sampleId)) fail('CLOSED_SAMPLE_SCHEMA');
        const historical = candidate.evidenceKind === 'historical-C034-routing/1';
        if ((!historical && candidate.evidenceKind !== 'closed-fictional-routing/1') ||
            historical !== candidate.sampleId.startsWith('historical-')) fail('SOURCE_CLASSIFICATION_MISMATCH');
        const requested = policy(candidate.requested);
        const missing = [];
        if (candidate.attribution === null) missing.push('COMPLETE_ATTRIBUTION_UNOBSERVED');
        let guarded = null;
        guarded = await gate.inspectText(JSON.stringify(candidate.attribution ?? {}));
        currentKey = keyOf(expected());
        if (guarded.outcome === 'rejected') fail(guarded.code);
        if (!historical && guarded.outcome !== 'fixture-verified') missing.push(guarded.code);
        let rows;
        let duplicateDeliveries = 0;
        let sourceComplete = true;
        let originals = null;
        if (historical) {
          if (candidate.observations !== null) fail('NO_CALLER_HISTORICAL_OBSERVATIONS');
          const traceId = candidate.sampleId === 'historical-closed' ? 'closed-history' : 'held-snapshot';
          const inspected = trace.inspectCandidate(JSON.stringify(candidate.savedTrace), traceId);
          if (!inspected.valid) fail(inspected.code);
          if (candidate.attribution !== null && !same(candidate.attribution, gate.getEvidence(
            candidate.sampleId === 'historical-closed' ? 'saved-closed-unlinked' : 'saved-held-unlinked'))) fail('UNLINKED_SOURCE_REPLACEMENT');
          rows = historicalRows(inspected);
          sourceComplete = inspected.attempts.every((attempt) => attempt.classification !== 'partial-unknown');
          originals = inspected.attempts.map(({ attemptId, classification, requests, responses }) =>
            ({ attemptId, classification, requests, responses }));
          missing.push('NO_AUTHENTICATED_CURRENT_POLICY_OR_IDENTITY_ASSOCIATION');
        } else {
          if (candidate.savedTrace !== null) fail('FICTIONAL_CONTROL_CANNOT_CLAIM_ACTUAL_SOURCE');
          if (candidate.observations === null) {
            rows = [];
            sourceComplete = false;
            missing.push('COMPLETE_DESTINATION_OBSERVATIONS_UNOBSERVED');
          } else ({ rows, duplicateDeliveries } = controlRows(candidate, expected(), missing));
        }
        const observed = summarize(rows, duplicateDeliveries, sourceComplete);
        const comparison = comparePolicy(requested, observed);
        missing.push(...comparison.holds);
        const knownMismatch = comparison.knownMismatch;
        let committed = false;
        if (operation === 'compare' && !historical && guarded?.outcome === 'fixture-verified' &&
            !missing.includes('COMPLETE_ROUTING_CORRELATION_UNOBSERVED') && candidate.observations !== null) {
          const entries = ledger.get(currentKey) || new Map();
          for (const row of rows) if (entries.has(row.originalRequestId)) fail('REPLAYED_ORIGINAL_REQUEST');
          // All identity, type, source, order and replay checks precede this sole metric transition.
          for (const row of rows) entries.set(row.originalRequestId, freeze(structuredClone(row)));
          ledger.set(currentKey, entries);
          committed = rows.length > 0;
        }
        if (knownMismatch) failures.push({ code: 'OBSERVED_SHARE_MISMATCH', sampleId: candidate.sampleId });
        if (missing.length) holds.push({ code: missing[0], sampleId: candidate.sampleId });
        const sampleDisposition = missing.length ? 'HOLD' : knownMismatch ? 'MISMATCH' : 'MATCH_CONTROL';
        output = result({
          operation, outcome: missing.length ? 'held' : knownMismatch ? 'mismatched' : 'matched-control',
          disposition: sampleDisposition === 'MATCH_CONTROL' ?
            failures.length ? 'FAILURE_RETAINED' : holds.length ? 'HOLD_RETAINED' : sampleDisposition : sampleDisposition,
          sampleDisposition, code: missing[0] || (knownMismatch ? 'OBSERVED_SHARE_MISMATCH' : 'FICTIONAL_MEASURED_CONTROL_MATCH'),
          sampleId: candidate.sampleId, requested, observed, differences: comparison.differences, missing,
          knownMismatch, sourceClassification: historical ? 'actual-historical-local-HTTP-destination-observations' :
            'explicit-fictional-measured-control-observations',
          policyClassification: requested ? 'declared-modeled-policy; not an observed actual requested policy' : 'UNOBSERVED',
          currentMetricTransition: committed,
          guard: guarded, originals, contextOrigin: expected()?.contextOrigin ?? 'unavailable',
          zeroDenominator: observed.started === 0,
          interpretation: historical ?
            'Pinned actual saved client responses only; unknown starts retained; no policy invented or current run adopted.' :
            'Declared fictional policy versus separately recorded fictional destinations, guarded by unchanged C036; no actual routing proof.'
        });
      } catch (error) {
        failures.push({ code: error.code || 'COMPARISON_ERROR' });
        output = result({ operation, outcome: 'rejected', disposition: 'REJECTED', code: error.code || 'COMPARISON_ERROR',
          currentMetricTransition: false, observed: null, requested: null, differences: [], missing: [] });
      } finally { busy = false; }
      history.push(freeze({ index: history.length + 1, operation, outcome: output.outcome,
        code: output.code, disposition: output.disposition, currentStarted: output.currentMetrics.started }));
      lastResult = output;
      return output;
    }
    return Object.freeze({
      getFixture,
      inspectText(text) { return transition('inspect', text, false, arguments.length); },
      compareText(text) { return transition('compare', text, false, arguments.length); },
      inspectBytes(bytes) { return transition('inspect', bytes, true, arguments.length); },
      compareBytes(bytes) { return transition('compare', bytes, true, arguments.length); },
      snapshot() {
        return freeze({ currentExpectedContext: expected(), currentMetrics: metrics(), history: structuredClone(history),
          retainedFailures: structuredClone(failures), retainedHolds: structuredClone(holds), lastResult,
          sessionDisposition: sessionDisposition(), historyLimit: HISTORY_LIMIT,
          historicalMetricScopes: [...ledger.keys()].filter((key) => key !== currentKey).length,
          actualCurrentAttributedRequests: 0, authenticatedIdentityVerified: false, leaseAuthority: false });
      }
    });
  }
  return Object.freeze({ open, ids, targets, MAX_BYTES, HISTORY_LIMIT });
}));
