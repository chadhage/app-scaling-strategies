(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShadowProfile = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const profiles = Object.freeze({
    'synthetic-rowan': {
      profileId: 'synthetic-rowan', displayName: 'Synthetic Rowan',
      membershipTier: 'standard', loyaltyPoints: 120
    },
    'synthetic-sage': {
      profileId: 'synthetic-sage', displayName: 'Synthetic Sage',
      membershipTier: 'standard', loyaltyPoints: 80
    }
  });
  const scenarios = ['safe', 'discrepant', 'unsafe-duplicate', 'unknown'];
  const inputKeys = ['productionVersion', 'profileId', 'scenario', 'requestCount'];
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const record = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

  function createState() {
    return {
      schemaVersion: 1,
      mode: 'synthetic-only',
      nativeProof: false,
      batches: [],
      lastResult: { kind: 'ready', verdict: 'NOT RUN', message: 'No synthetic requests have run.' }
    };
  }

  function normalizeInput(input) {
    if (!record(input) || Object.keys(input).length !== inputKeys.length
      || !inputKeys.every((key) => Object.hasOwn(input, key))) {
      return { error: 'Use only the four labeled fixture inputs. No request was replayed.' };
    }
    if (!['v1', 'v2'].includes(input.productionVersion)) {
      return { error: 'Choose an intended production version: v1 or v2. No request was replayed.' };
    }
    if (typeof input.profileId !== 'string' || !Object.hasOwn(profiles, input.profileId)) {
      return { error: 'Choose one of the two synthetic profiles. Unknown profiles are rejected before replay.' };
    }
    if (!scenarios.includes(input.scenario)) {
      return { error: 'Choose a known synthetic scenario. Unknown scenarios cannot authorize replay.' };
    }
    const count = typeof input.requestCount === 'string' && /^[1-3]$/.test(input.requestCount)
      ? Number(input.requestCount) : input.requestCount;
    if (typeof count !== 'number' || !Number.isInteger(count) || count < 1 || count > 3) {
      return { error: 'Request count must be an integer from 1 to 3, without whitespace or exponent notation.' };
    }
    return { value: { ...input, requestCount: count } };
  }

  function compareResponses(production, candidate) {
    const valid = (value) => record(value) && Number.isInteger(value.status)
      && value.status >= 100 && value.status <= 599 && record(value.body);
    if (!valid(production) || !valid(candidate)) {
      return {
        status: 'UNKNOWN', differences: [],
        reason: 'A response is unavailable or missing required status/body evidence; this is not a match.'
      };
    }
    const differences = [];
    if (production.status !== candidate.status) {
      differences.push({ field: 'status', production: production.status, candidate: candidate.status });
    }
    function compareFields(left, right, path) {
      if (Object.is(left, right)) return;
      if (record(left) && record(right)) {
        for (const key of [...new Set([...Object.keys(left), ...Object.keys(right)])].sort()) {
          if (!Object.hasOwn(left, key) || !Object.hasOwn(right, key)) {
            differences.push({
              field: `${path}.${key}`,
              production: Object.hasOwn(left, key) ? clone(left[key]) : '(missing)',
              candidate: Object.hasOwn(right, key) ? clone(right[key]) : '(missing)'
            });
          } else compareFields(left[key], right[key], `${path}.${key}`);
        }
      } else if (!same(left, right)) {
        differences.push({ field: path, production: clone(left), candidate: clone(right) });
      }
    }
    compareFields(production.body, candidate.body, 'body');
    return {
      status: differences.length ? 'DISCREPANT' : 'MATCH', differences,
      reason: differences.length ? 'Business response fields differ.' : 'Status and business body match; handler-version metadata is excluded.'
    };
  }

  function buildBatch(number, input, priorRequests) {
    const unsafe = input.scenario === 'unsafe-duplicate';
    const candidateVersion = input.productionVersion === 'v1' ? 'v2' : 'v1';
    const records = [];
    for (let index = 0; index < input.requestCount; index++) {
      const productionResponse = { status: 200, body: clone(profiles[input.profileId]) };
      let candidateResponse = clone(productionResponse);
      if (input.scenario === 'discrepant') {
        candidateResponse.body.membershipTier = 'premium';
        candidateResponse.body.loyaltyPoints = 0;
      } else if (input.scenario === 'unknown') candidateResponse = null;
      records.push({
        id: `synthetic-${String(priorRequests + index + 1).padStart(3, '0')}`,
        production: {
          version: input.productionVersion, response: productionResponse,
          effects: { writes: 1, notifications: 1 }
        },
        candidate: {
          version: candidateVersion, response: candidateResponse,
          effects: {
            attemptedWrites: 1, attemptedNotifications: 1,
            writes: unsafe ? 1 : 0, notifications: unsafe ? 1 : 0,
            suppressedWrites: unsafe ? 0 : 1, suppressedNotifications: unsafe ? 0 : 1
          }
        },
        comparison: compareResponses(productionResponse, candidateResponse)
      });
    }
    const responseComparison = records[0].comparison.status;
    const verdict = unsafe ? 'UNSAFE' : responseComparison === 'MATCH' ? 'SAFE' : responseComparison;
    const messages = {
      SAFE: 'SAFE synthetic shadow: caller responses stayed on the intended version; candidate writes and notifications were suppressed.',
      DISCREPANT: 'DISCREPANT synthetic response: inspect the changed fields. Production still answered; candidate writes and notifications were suppressed.',
      UNSAFE: 'UNSAFE synthetic failure: matching responses duplicated profile-view writes and notifications. No real external effect occurred.',
      UNKNOWN: 'UNKNOWN candidate response: production still answered, but missing comparison evidence is not a match. Candidate effects were suppressed.'
    };
    return {
      number, input: clone(input), records, responseComparison,
      effectSafety: unsafe ? 'DUPLICATED' : 'SUPPRESSED',
      verdict, message: messages[verdict]
    };
  }

  function resultFor(batch) {
    return { kind: 'run', batchNumber: batch.number, verdict: batch.verdict, message: batch.message };
  }

  function assertState(state) {
    const fail = () => { throw new TypeError('Invalid rehearsal state. Reset before drawing any safety conclusion.'); };
    if (!record(state) || state.schemaVersion !== 1 || state.mode !== 'synthetic-only'
      || state.nativeProof !== false || !Array.isArray(state.batches)
      || state.batches.length > 30 || !record(state.lastResult)) fail();
    let requests = 0;
    for (const [index, batch] of state.batches.entries()) {
      if (!record(batch)) fail();
      const normalized = normalizeInput(batch.input);
      if (normalized.error || !same(batch, buildBatch(index + 1, normalized.value, requests))) fail();
      requests += normalized.value.requestCount;
      if (requests > 30) fail();
    }
    const last = state.lastResult;
    if (last.kind === 'ready') {
      if (state.batches.length || !same(last, createState().lastResult)) fail();
    } else if (last.kind === 'run') {
      if (!state.batches.length || !same(last, resultFor(state.batches.at(-1)))) fail();
    } else if (last.kind === 'invalid') {
      if (last.verdict !== 'INVALID' || typeof last.message !== 'string'
        || last.message.length < 1 || last.message.length > 240) fail();
    } else fail();
  }

  function summarize(state) {
    assertState(state);
    const totals = {
      requests: 0, productionWrites: 0, productionNotifications: 0,
      shadowWrites: 0, shadowNotifications: 0,
      suppressedWrites: 0, suppressedNotifications: 0,
      totalWrites: 0, totalNotifications: 0,
      duplicateWrites: 0, duplicateNotifications: 0,
      matchedResponses: 0, discrepantResponses: 0, unknownResponses: 0
    };
    for (const batch of state.batches) {
      for (const item of batch.records) {
        totals.requests++;
        totals.productionWrites += item.production.effects.writes;
        totals.productionNotifications += item.production.effects.notifications;
        totals.shadowWrites += item.candidate.effects.writes;
        totals.shadowNotifications += item.candidate.effects.notifications;
        totals.suppressedWrites += item.candidate.effects.suppressedWrites;
        totals.suppressedNotifications += item.candidate.effects.suppressedNotifications;
        if (item.comparison.status === 'MATCH') totals.matchedResponses++;
        if (item.comparison.status === 'DISCREPANT') totals.discrepantResponses++;
        if (item.comparison.status === 'UNKNOWN') totals.unknownResponses++;
      }
    }
    totals.totalWrites = totals.productionWrites + totals.shadowWrites;
    totals.totalNotifications = totals.productionNotifications + totals.shadowNotifications;
    totals.duplicateWrites = totals.totalWrites - totals.requests;
    totals.duplicateNotifications = totals.totalNotifications - totals.requests;
    return totals;
  }

  function run(state, input) {
    assertState(state);
    const next = clone(state);
    const normalized = normalizeInput(input);
    const priorRequests = state.batches.reduce((total, batch) => total + batch.records.length, 0);
    const error = normalized.error || (priorRequests + normalized.value.requestCount > 30
      ? 'The 30-request synthetic budget would be exceeded. Existing evidence is retained; Reset to start again.' : null);
    if (error) {
      next.lastResult = { kind: 'invalid', verdict: 'INVALID', message: error };
      return next;
    }
    const batch = buildBatch(next.batches.length + 1, normalized.value, priorRequests);
    next.batches.push(batch);
    next.lastResult = resultFor(batch);
    return next;
  }

  return Object.freeze({ createState, run, summarize, compareResponses });
}));
