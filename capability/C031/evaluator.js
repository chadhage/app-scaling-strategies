(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C031Evaluator', { value: factory() });
}(globalThis, function () {
  'use strict';

  const banner = 'Training rehearsal - synthetic data - not a live Azure result';
  const OLD = '1.0.0';
  const NEW = '2.0.0';
  const MAX_CLIENTS = 512;
  const MAX_EVENTS = 64;
  const MAX_TIME = 86400000;
  const stamps = Object.freeze({ [OLD]: 'C020-loopback-v1-r1', [NEW]: 'C020-loopback-v2-r1' });
  const classes = Object.freeze(['ACTUAL_TRANSITION', 'UNCHANGED', 'NOT_TRANSITIONED_YET', 'FAILED_OR_UNKNOWN']);
  const qualifications = Object.freeze({
    liveAzureResult: false, productionRuntimeValidated: false, userJourneySuccess: false,
    actualClientMutation: false, migrationAttested: false, approvalAdopted: false, reliabilityCertified: false
  });
  const reasonCodes = freeze({
    TRANSITION_EVIDENCE_COMPLETE: { kind: 'OK', meaning: 'Request at the old version, then a valid server acknowledgment of the new version, then a request or state at the new version.' },
    UNCHANGED_NEW_VERSION_ONLY: { kind: 'OK', meaning: 'All traffic stayed at the new version from the start; the client never needed to transition and is not eligible.' },
    STILL_ON_OLD_VERSION: { kind: 'OK', meaning: 'All traffic is still at the old version at the end; eligible, not transitioned yet.' },
    NEW_VERSION_ACKNOWLEDGED_NOT_USED: { kind: 'OK', meaning: 'The server acknowledged the new version but no later request or state at the new version is saved yet.' },
    FAILED_REPLY: { kind: 'FAILED', meaning: 'The saved trace ends with a failed reply; this client did not transition.' },
    INTERRUPTED_BEFORE_TERMINAL_OUTCOME: { kind: 'UNKNOWN', meaning: 'The saved trace was interrupted before a terminal outcome; unknown, never success.' },
    MALFORMED_TRACE: { kind: 'UNKNOWN', meaning: 'The trace violates the closed saved-trace schema; nothing in it is adopted, including a claimed verdict.' },
    NO_EVENTS: { kind: 'UNKNOWN', meaning: 'The trace has no saved events; nothing was observed.' },
    SUMMARY_ONLY_NO_TRACE: { kind: 'UNKNOWN', meaning: 'Only a later summary names this client; no actions, versions or times were saved.' },
    NO_VERSION_OBSERVED: { kind: 'UNKNOWN', meaning: 'No request, acknowledgment or state carries a version, so the start version is unproven.' },
    OLD_VERSION_REQUEST_MISSING: { kind: 'UNKNOWN', meaning: 'The new version was acknowledged and used, but no request at the old version precedes it in the saved trace.' },
    CONFLICTING_DUPLICATE_TRACES: { kind: 'UNKNOWN', meaning: 'The set holds two or more different traces for one client; none is adopted.' },
    SEQUENCE_GAP: { kind: 'UNKNOWN', meaning: 'A saved sequence number is missing, so events may be missing.' },
    DUPLICATE_EVENT: { kind: 'UNKNOWN', meaning: 'The same sequence number appears twice in one trace.' },
    OUT_OF_ORDER_SEQUENCE: { kind: 'UNKNOWN', meaning: 'Sequence numbers are not in saved order.' },
    NON_MONOTONIC_TIME: { kind: 'UNKNOWN', meaning: 'An event is timed before the previous event.' },
    ACTION_AFTER_TERMINAL: { kind: 'UNKNOWN', meaning: 'An action follows a failed or interrupted terminal event.' },
    DUPLICATE_REQUEST_ID: { kind: 'UNKNOWN', meaning: 'One request identifier was sent twice within one trace (replay).' },
    DUPLICATE_ACK: { kind: 'UNKNOWN', meaning: 'A request received a second acknowledgment or reply.' },
    ACK_BEFORE_REQUEST: { kind: 'UNKNOWN', meaning: 'A reply names a request that was not sent earlier in the trace.' },
    ACK_VERSION_MISMATCH: { kind: 'UNKNOWN', meaning: 'The acknowledgment version differs from its request version.' },
    STAMP_MISMATCH: { kind: 'UNKNOWN', meaning: 'The acknowledgment deployment stamp does not belong to its version.' },
    STALE_ACKNOWLEDGMENT: { kind: 'UNKNOWN', meaning: 'The acknowledgment was issued before the request it claims to answer (a stale cached copy).' },
    ACK_ISSUED_AFTER_RECEIPT: { kind: 'UNKNOWN', meaning: 'The acknowledgment claims to be issued after the client received it.' },
    VERSION_REGRESSION: { kind: 'UNKNOWN', meaning: 'Old-version traffic appears after the client started on, or was acknowledged at, the new version.' },
    STATE_BEFORE_ACKNOWLEDGMENT: { kind: 'UNKNOWN', meaning: 'State at the new version appears before any acknowledgment of the new version.' },
    UNACKNOWLEDGED_NEW_VERSION_REQUEST: { kind: 'UNKNOWN', meaning: 'A new-version request was sent but the server never acknowledged the new version.' },
    DUPLICATE_TRACE_COLLAPSED: { kind: 'INFO', meaning: 'An identical second copy of this trace was collapsed; the client is counted once.' },
    ISSUE_TIME_NOT_SAVED: { kind: 'INFO', meaning: 'The saved source holds no server issue time, so staleness of acknowledgments cannot be assessed.' },
    HELD_AT_BOUNDARY: { kind: 'INFO', meaning: 'The client was held at a boundary when the trace ended.' },
    TERMINAL_AFTER_TRANSITION_EVIDENCE: { kind: 'INFO', meaning: 'A failed or interrupted terminal event follows complete transition evidence; the evidence stands.' },
    ORIGINAL_BUDGET_EXCEEDED_SEPARATE_VERDICT: { kind: 'INFO', meaning: 'The saved original also exceeded its latency budget; that separate C029 verdict is not changed here.' }
  });
  const versions = freeze({
    apiContract: 'getProfile/1',
    old: { label: 'v1', implementationVersion: OLD, deploymentStamp: stamps[OLD] },
    new: { label: 'v2', implementationVersion: NEW, deploymentStamp: stamps[NEW] }
  });
  const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
  const requestPattern = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,79}$/;
  const codePattern = /^[A-Z][A-Z0-9_]{0,63}$/;
  const shapes = Object.freeze({
    REQUEST: ['requestId', 'version'], ACK: ['requestId', 'version', 'deploymentStamp', 'issuedAt'], STATE: ['version'],
    HOLD: [], RESUME: [], FAILED_REPLY: ['requestId', 'replyCode'], INTERRUPTED: ['cause']
  });
  const text = (value, pattern) => typeof value === 'string' && pattern.test(value);
  const time = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= MAX_TIME && !Object.is(value, -0);
  const fields = {
    seq: (value) => Number.isSafeInteger(value) && value >= 1,
    at: time,
    action: (value) => Object.hasOwn(shapes, value),
    requestId: (value) => text(value, requestPattern),
    version: (value) => value === OLD || value === NEW,
    deploymentStamp: (value) => text(value, /^[A-Za-z0-9._-]{1,64}$/),
    replyCode: (value) => text(value, codePattern),
    cause: (value) => text(value, codePattern)
  };

  function fail(code, detail) { throw Object.assign(new Error(code), { code, detail }); }
  function freeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
    return value;
  }
  function plain(value) {
    return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  }
  function canonical(value) {
    if (!value || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  // Copies caller data once: bounded, finite, own data properties only. Later analysis never sees a getter, proxy or shared reference.
  function ownData(input) {
    let remaining = 60000;
    const ancestors = new Set();
    function copy(value, depth) {
      if (--remaining < 0 || depth > 12) fail('BOUNDED_JSON_REQUIRED');
      if (value === null || typeof value === 'boolean') return value;
      if (typeof value === 'string') {
        if (value.length > 512) fail('BOUNDED_JSON_REQUIRED');
        return value;
      }
      if (typeof value === 'number') {
        if (!Number.isFinite(value) || Object.is(value, -0) || Math.abs(value) > Number.MAX_SAFE_INTEGER) fail('FINITE_OWN_JSON_REQUIRED');
        return value;
      }
      if (typeof value !== 'object' || ancestors.has(value)) fail('FINITE_OWN_JSON_REQUIRED');
      const array = Array.isArray(value);
      const prototype = Object.getPrototypeOf(value);
      if (array ? prototype !== Array.prototype : ![Object.prototype, null].includes(prototype)) fail('OWN_DATA_PROTOTYPE');
      const descriptors = Object.getOwnPropertyDescriptors(value);
      const names = Reflect.ownKeys(descriptors);
      if (names.some((name) => typeof name !== 'string' || !Object.hasOwn(descriptors[name], 'value'))) fail('OWN_DATA_FIELDS');
      ancestors.add(value);
      let result;
      if (array) {
        if (value.length > 4096 || names.length !== value.length + 1) fail('DENSE_BOUNDED_ARRAY');
        result = Array.from({ length: value.length }, (_, index) => {
          if (!descriptors[index] || !descriptors[index].enumerable) fail('DENSE_BOUNDED_ARRAY');
          return copy(descriptors[index].value, depth + 1);
        });
      } else {
        if (names.length > 64 || names.some((name) => !descriptors[name].enumerable ||
            ['__proto__', 'constructor', 'prototype'].includes(name))) fail('OWN_DATA_FIELDS');
        result = {};
        for (const name of names) result[name] = copy(descriptors[name].value, depth + 1);
      }
      ancestors.delete(value);
      return result;
    }
    return copy(input, 0);
  }
  function rate(numerator, denominator) {
    const basisPoints = denominator ? Math.round((numerator * 10000) / denominator) : null;
    return {
      numerator, denominator, fraction: `${numerator}/${denominator}`,
      percent: denominator ? `${(basisPoints / 100).toFixed(2)}%` : null,
      statement: denominator ?
        `${numerator} of ${denominator} eligible clients made an actual acknowledged transition. Only ACTUAL_TRANSITION counts in the numerator; only clients that started on the old version, or could not be proven otherwise, count in the denominator.` :
        'No eligible client: there is no success rate. An empty set is never 100 percent.'
    };
  }
  function zeroCounts() {
    return {
      clients: 0, eligible: 0, notEligible: 0, actualTransition: 0, unchanged: 0, notTransitionedYet: 0,
      failedOrUnknown: 0, failed: 0, unknown: 0, duplicateCopiesCollapsed: 0
    };
  }
  function rejected(code, extras = {}) {
    return freeze({
      schema: 'C031-evaluation/1', cardId: 'C031', valid: false, code, trainingBanner: banner,
      scope: 'rejected input: nothing adopted and no success rate', fleetId: null, versions,
      counts: zeroCounts(), successRate: rate(0, 0), clients: [], ...extras, ...qualifications
    });
  }

  function checkTrace(trace, options) {
    const bad = (detail) => fail('MALFORMED_TRACE', detail);
    if (!plain(trace)) bad('trace');
    const keys = Object.keys(trace);
    if (!keys.includes('clientId') || !keys.includes('events') || keys.some((key) => !['clientId', 'events', 'annotations'].includes(key))) bad('trace keys');
    if (!text(trace.clientId, idPattern)) bad('clientId');
    if (!Array.isArray(trace.events) || trace.events.length > MAX_EVENTS) bad('events');
    trace.events.forEach((event, index) => {
      if (!plain(event) || !Object.hasOwn(shapes, event.action)) bad(`events[${index}]`);
      const expected = ['seq', 'at', 'action', ...shapes[event.action]];
      if (Object.keys(event).length !== expected.length || expected.some((key) => !Object.hasOwn(event, key))) bad(`events[${index}] keys`);
      for (const key of expected) {
        const valid = key === 'issuedAt' ? (event.issuedAt === null ? !options.issueTimeSaved : time(event.issuedAt)) : fields[key](event[key]);
        if (!valid) bad(`events[${index}].${key}`);
      }
    });
    if (trace.annotations !== undefined) {
      if (!plain(trace.annotations) || Object.keys(trace.annotations).length !== 1 ||
          ![true, false, null].includes(trace.annotations.originalBudgetExceeded)) bad('annotations');
    }
  }
  function startVersionOf(events) {
    let first = null;
    for (const event of events) if (Object.hasOwn(event, 'version') && (first === null || event.seq < first.seq)) first = event;
    return first ? first.version : null;
  }
  function endVersionOf(events) {
    const versioned = events.filter((event) => Object.hasOwn(event, 'version'));
    return versioned.length ? versioned[versioned.length - 1].version : null;
  }
  // One pass over the saved order. The first violation wins and is reported with its position.
  function walk(events, start) {
    const requests = new Map();
    const state = { held: false, terminal: null, newAck: null, followUp: null, oldRequest: null, issueTimeMissing: false };
    let lastSeq = 0;
    let lastAt = 0;
    const pick = (event) => ({ seq: event.seq, at: event.at, action: event.action, version: event.version });
    events.forEach((event, eventIndex) => {
      const stop = (code) => {
        throw Object.assign(new Error(code), { code, detail: `event ${eventIndex + 1} (seq ${event.seq})`, position: { eventIndex, seq: event.seq } });
      };
      const regress = () => { if (event.version === OLD && (start === NEW || state.newAck)) stop('VERSION_REGRESSION'); };
      const afterAcknowledgment = () => {
        if (start === OLD && state.newAck && event.version === NEW && !state.followUp) state.followUp = pick(event);
      };
      if (event.seq !== lastSeq + 1) {
        stop(event.seq === lastSeq ? 'DUPLICATE_EVENT' :
          event.seq < lastSeq || events.some((later) => later.seq === lastSeq + 1) ? 'OUT_OF_ORDER_SEQUENCE' : 'SEQUENCE_GAP');
      }
      if (event.at < lastAt) stop('NON_MONOTONIC_TIME');
      if (state.terminal) stop('ACTION_AFTER_TERMINAL');
      if (event.action === 'REQUEST') {
        if (requests.has(event.requestId)) stop('DUPLICATE_REQUEST_ID');
        regress();
        requests.set(event.requestId, { version: event.version, at: event.at, acked: false, failed: false });
        if (event.version === OLD && !state.oldRequest) state.oldRequest = { ...pick(event), requestId: event.requestId };
        afterAcknowledgment();
      } else if (event.action === 'ACK') {
        const request = requests.get(event.requestId);
        if (!request) stop('ACK_BEFORE_REQUEST');
        if (request.acked) stop('DUPLICATE_ACK');
        if (event.version !== request.version) stop('ACK_VERSION_MISMATCH');
        if (event.deploymentStamp !== stamps[event.version]) stop('STAMP_MISMATCH');
        if (event.issuedAt === null) state.issueTimeMissing = true;
        else if (event.issuedAt < request.at) stop('STALE_ACKNOWLEDGMENT');
        else if (event.issuedAt > event.at) stop('ACK_ISSUED_AFTER_RECEIPT');
        regress();
        request.acked = true;
        if (event.version === NEW && !state.newAck) {
          state.newAck = { ...pick(event), requestId: event.requestId, deploymentStamp: event.deploymentStamp, issuedAt: event.issuedAt };
        }
      } else if (event.action === 'STATE') {
        if (start === OLD && event.version === NEW && !state.newAck) stop('STATE_BEFORE_ACKNOWLEDGMENT');
        regress();
        afterAcknowledgment();
      } else if (event.action === 'HOLD') state.held = true;
      else if (event.action === 'RESUME') state.held = false;
      else if (event.action === 'FAILED_REPLY') {
        const request = requests.get(event.requestId);
        if (!request) stop('ACK_BEFORE_REQUEST');
        if (request.acked) stop('DUPLICATE_ACK');
        request.failed = true;
        state.terminal = { kind: 'FAILED', code: event.replyCode, seq: event.seq };
      } else state.terminal = { kind: 'UNKNOWN', code: event.cause, seq: event.seq };
      lastSeq = event.seq;
      lastAt = event.at;
    });
    return { requests, ...state };
  }
  function outcomeOf(start, walked) {
    const terminal = walked.terminal;
    const ended = terminal && terminal.kind === 'FAILED' ?
      { classification: 'FAILED_OR_UNKNOWN', failureKind: 'FAILED', code: 'FAILED_REPLY', detail: terminal.code } :
      { classification: 'FAILED_OR_UNKNOWN', failureKind: 'UNKNOWN', code: 'INTERRUPTED_BEFORE_TERMINAL_OUTCOME', detail: terminal && terminal.code };
    if (start === null) return { classification: 'FAILED_OR_UNKNOWN', failureKind: 'UNKNOWN', code: 'NO_VERSION_OBSERVED', detail: terminal && terminal.code };
    if (start === NEW) return terminal ? ended : { classification: 'UNCHANGED', failureKind: null, code: 'UNCHANGED_NEW_VERSION_ONLY' };
    if (walked.newAck && walked.followUp) {
      return walked.oldRequest ? { classification: 'ACTUAL_TRANSITION', failureKind: null, code: 'TRANSITION_EVIDENCE_COMPLETE' } :
        { classification: 'FAILED_OR_UNKNOWN', failureKind: 'UNKNOWN', code: 'OLD_VERSION_REQUEST_MISSING' };
    }
    if (walked.newAck) {
      return terminal ? ended : { classification: 'NOT_TRANSITIONED_YET', failureKind: null, code: 'NEW_VERSION_ACKNOWLEDGED_NOT_USED' };
    }
    if ([...walked.requests.values()].some((request) => request.version === NEW && !request.acked && !request.failed)) {
      return { classification: 'FAILED_OR_UNKNOWN', failureKind: 'UNKNOWN', code: 'UNACKNOWLEDGED_NEW_VERSION_REQUEST' };
    }
    return terminal ? ended : { classification: 'NOT_TRANSITIONED_YET', failureKind: null, code: 'STILL_ON_OLD_VERSION' };
  }
  // Only a trace whose every versioned event is at the new version is provably new-only. Any old-version traffic keeps the client
  // eligible, so a replayed new-version event placed first cannot take a stuck old-version client out of the denominator.
  function makeRow(clientId, start, outcome, extras) {
    const touchedOld = (extras.events || []).some((event) => event.version === OLD);
    const eligibility = start === OLD ? 'STARTED_ON_OLD_VERSION' :
      start === NEW ? (touchedOld ? 'CONTRADICTORY_START_COUNTED_ELIGIBLE' : 'STARTED_ON_NEW_VERSION_NOT_ELIGIBLE') :
        'START_VERSION_UNPROVEN_COUNTED_ELIGIBLE';
    const eligible = start !== NEW || touchedOld;
    return {
      clientId, classification: outcome.classification, failureKind: outcome.failureKind,
      reasonCodes: [outcome.code], reasonMeaning: reasonCodes[outcome.code].meaning,
      detail: outcome.detail || null, position: null, startVersion: start, endVersion: null,
      eligible, eligibility, countsInNumerator: outcome.classification === 'ACTUAL_TRANSITION', countsInDenominator: eligible,
      evidence: null, terminal: null, eventCount: 0, events: [], traceCopies: 1, notes: [], annotations: null, ...extras
    };
  }
  function analyzeTrace(trace, options, displayId) {
    try { checkTrace(trace, options); } catch (error) {
      return makeRow(displayId, null, { classification: 'FAILED_OR_UNKNOWN', failureKind: 'UNKNOWN', code: error.code, detail: error.detail }, {});
    }
    const events = trace.events;
    const start = startVersionOf(events);
    const extras = {
      endVersion: endVersionOf(events), eventCount: events.length, events,
      annotations: trace.annotations === undefined ? null : trace.annotations
    };
    if (!events.length) {
      return makeRow(trace.clientId, null, { classification: 'FAILED_OR_UNKNOWN', failureKind: 'UNKNOWN',
        code: options.summaryOnly.includes(trace.clientId) ? 'SUMMARY_ONLY_NO_TRACE' : 'NO_EVENTS' }, extras);
    }
    let walked;
    try { walked = walk(events, start); } catch (error) {
      return makeRow(trace.clientId, start, { classification: 'FAILED_OR_UNKNOWN', failureKind: 'UNKNOWN', code: error.code, detail: error.detail },
        { ...extras, position: error.position });
    }
    const outcome = outcomeOf(start, walked);
    const notes = [];
    if (walked.issueTimeMissing) notes.push('ISSUE_TIME_NOT_SAVED');
    if (outcome.classification === 'NOT_TRANSITIONED_YET' && walked.held) notes.push('HELD_AT_BOUNDARY');
    if (outcome.classification === 'ACTUAL_TRANSITION' && walked.terminal) notes.push('TERMINAL_AFTER_TRANSITION_EVIDENCE');
    if (outcome.classification === 'ACTUAL_TRANSITION' && extras.annotations && extras.annotations.originalBudgetExceeded === true) {
      notes.push('ORIGINAL_BUDGET_EXCEEDED_SEPARATE_VERDICT');
    }
    return makeRow(trace.clientId, start, outcome, {
      ...extras, notes, terminal: walked.terminal,
      evidence: outcome.classification === 'ACTUAL_TRANSITION' ?
        { requestAtOldVersion: walked.oldRequest, newVersionAcknowledged: walked.newAck, laterRequestOrState: walked.followUp } : null
    });
  }
  function assess(fleet, options, scope, extras = {}) {
    if (!plain(fleet) || Object.keys(fleet).length !== 3 || ['schema', 'id', 'clients'].some((key) => !Object.hasOwn(fleet, key)) ||
        fleet.schema !== 'C031-fleet/1' || !text(fleet.id, idPattern) || !Array.isArray(fleet.clients) || fleet.clients.length > MAX_CLIENTS) {
      fail('FLEET_SCHEMA');
    }
    const groups = new Map();
    fleet.clients.forEach((trace, index) => {
      const known = plain(trace) && text(trace.clientId, idPattern);
      const key = known ? `id:${trace.clientId}` : `invalid:${index}`;
      if (!groups.has(key)) groups.set(key, { display: known ? trace.clientId : `invalid-client-${index + 1}`, copies: [] });
      groups.get(key).copies.push(trace);
    });
    const rows = [...groups.values()].map((group) => {
      const same = group.copies.every((copy) => canonical(copy) === canonical(group.copies[0]));
      if (!same) {
        return makeRow(group.display, null, { classification: 'FAILED_OR_UNKNOWN', failureKind: 'UNKNOWN', code: 'CONFLICTING_DUPLICATE_TRACES' },
          { traceCopies: group.copies.length });
      }
      const row = analyzeTrace(group.copies[0], options, group.display);
      if (group.copies.length > 1) { row.traceCopies = group.copies.length; row.notes = [...row.notes, 'DUPLICATE_TRACE_COLLAPSED']; }
      return row;
    });
    const count = (predicate) => rows.filter(predicate).length;
    const counts = {
      clients: rows.length, eligible: count((row) => row.eligible), notEligible: count((row) => !row.eligible),
      actualTransition: count((row) => row.classification === 'ACTUAL_TRANSITION'), unchanged: count((row) => row.classification === 'UNCHANGED'),
      notTransitionedYet: count((row) => row.classification === 'NOT_TRANSITIONED_YET'),
      failedOrUnknown: count((row) => row.classification === 'FAILED_OR_UNKNOWN'),
      failed: count((row) => row.failureKind === 'FAILED'), unknown: count((row) => row.failureKind === 'UNKNOWN'),
      duplicateCopiesCollapsed: rows.filter((row) => row.notes.includes('DUPLICATE_TRACE_COLLAPSED')).reduce((sum, row) => sum + row.traceCopies - 1, 0)
    };
    return freeze({
      schema: 'C031-evaluation/1', cardId: 'C031', valid: true, code: null, trainingBanner: banner, scope, fleetId: fleet.id, versions,
      counts, successRate: rate(counts.actualTransition, counts.eligible), clients: rows, ...extras, ...qualifications
    });
  }
  function evaluateFleet(input) {
    try {
      if (arguments.length !== 1) fail('NO_EVALUATION_OVERRIDES');
      return assess(ownData(input), { issueTimeSaved: true, summaryOnly: [] }, 'caller-supplied synthetic set; no claimed verdict, eligibility or source is adopted');
    } catch (error) { return rejected(error.code || 'EVALUATION_UNAVAILABLE'); }
  }

  const implementationVersion = Object.freeze({ v1: OLD, v2: NEW });
  const versionOfImplementation = (name) => (Object.hasOwn(implementationVersion, name) ? implementationVersion[name] : null);
  // Maps the unchanged C034 saved shape onto the closed client-trace shape; nothing absent from the saved bytes is invented.
  function fromC034Trace(trace) {
    if (arguments.length !== 1) fail('NO_ADAPTER_OVERRIDES');
    if (!plain(trace) || trace.traceFormat !== 'C034-saved-client-trace/1' || !plain(trace.snapshot) ||
        !Array.isArray(trace.snapshot.events) || !Array.isArray(trace.snapshot.history)) fail('C034_TRACE_SHAPE');
    const { snapshot } = trace;
    const attempts = new Map();
    for (const event of snapshot.events) {
      if (!attempts.has(event.attemptId)) attempts.set(event.attemptId, []);
      attempts.get(event.attemptId).push(event);
    }
    const clients = [...attempts].map(([attemptId, own]) => {
      const record = snapshot.history.find((item) => item.attemptId === attemptId) || (snapshot.attemptId === attemptId ? snapshot : {});
      const replies = Array.isArray(record.acknowledgements) ? record.acknowledgements : [];
      const versionOf = (reply) => (plain(reply) && plain(reply.stamp) ? reply.stamp.implementationVersion : null);
      const events = [];
      let pending = null;
      const add = (event, fields) => events.push({ seq: events.length + 1, at: event.at, ...fields });
      for (const event of own) {
        if (event.code === 'BOUNDARY_HELD') add(event, { action: 'HOLD' });
        else if (event.code === 'RESUME_ORIGINAL_ATTEMPT') add(event, { action: 'RESUME' });
        else if (event.code === 'ACTUAL_READ_STARTED') {
          pending = `${attemptId}/read-${event.ordinal}`;
          add(event, { action: 'REQUEST', requestId: pending, version: versionOfImplementation(event.implementation) });
        } else if (event.code === 'ACTUAL_READ_ACKNOWLEDGED') {
          const reply = replies[event.ordinal - 1];
          add(event, {
            action: 'ACK', requestId: `${attemptId}/read-${event.ordinal}`, version: versionOf(reply),
            deploymentStamp: plain(reply) && plain(reply.stamp) ? reply.stamp.deploymentStamp : null, issuedAt: null
          });
        } else if (event.code === 'FAILED_HTTP_REPLY_404') add(event, { action: 'FAILED_REPLY', requestId: pending, replyCode: event.replyCode });
        else if (event.code === 'TWO_READ_LOCAL_SEGMENT_OBSERVED') add(event, { action: 'STATE', version: versionOf(replies[replies.length - 1]) });
        else if (['INTERRUPTED_BY_STOP', 'INTERRUPTED_BY_RESET'].includes(event.code)) add(event, { action: 'INTERRUPTED', cause: event.code });
      }
      return { clientId: attemptId, events, annotations: { originalBudgetExceeded: typeof record.budgetExceeded === 'boolean' ? record.budgetExceeded : null } };
    });
    const summaryOnly = [];
    const summary = trace.replacementSummary;
    if (trace.id === 'closed-history' && plain(summary) && !attempts.has(summary.replacementId)) {
      clients.push({ clientId: summary.replacementId, events: [], annotations: { originalBudgetExceeded: null } });
      summaryOnly.push(summary.replacementId);
    }
    return { fleet: { schema: 'C031-fleet/1', id: `c034-${trace.id}`, clients }, options: { issueTimeSaved: false, summaryOnly } };
  }

  function create(sources) {
    const entries = new Map();
    const c034 = sources && sources.c034;
    if (plain(c034) && c034.bundleVersion === 1 && c034.cardId === 'C034' && Array.isArray(c034.traces)) {
      for (const trace of c034.traces) {
        entries.set(`c034-${trace.id}`, {
          group: 'historical', label: `Saved C034 trace ${trace.id}, adapted read-only`, baselineId: null,
          build() {
            const adapted = fromC034Trace(trace);
            return {
              ...adapted, scope: 'exact saved C034 per-client trace adapted read-only; not a live migration',
              provenance: {
                kind: 'c034-saved-trace-adapted-read-only', c034TraceId: trace.id, acceptedC033: ownData(trace.source.acceptedC033),
                clock: trace.source.clock, missingObservationFields: ownData(trace.source.missingObservationFields),
                issueTime: 'not saved by C034: stale acknowledgments cannot be assessed here',
                newLiveRunAttested: false, authenticatedIdentityAttested: false, migrationAttested: false
              }
            };
          }
        });
      }
    }
    const saved = sources && sources.saved;
    if (plain(saved) && saved.bundleVersion === 1 && saved.cardId === 'C031' && Array.isArray(saved.fleets)) {
      for (const item of saved.fleets) {
        entries.set(item.id, {
          group: item.role, label: item.label, baselineId: item.negativeOf,
          build: () => ({
            fleet: item.fleet, options: { issueTimeSaved: true, summaryOnly: [] },
            scope: 'saved synthetic fleet; fictional clients, no live migration',
            provenance: { kind: 'saved-synthetic-fleet', fictional: true, role: item.role, negativeOf: item.negativeOf }
          })
        });
      }
    }
    const ids = Object.freeze([...entries.keys()]);
    function describe(id) {
      const entry = typeof id === 'string' ? entries.get(id) : undefined;
      return entry ? Object.freeze({ id, group: entry.group, label: entry.label, baselineId: entry.baselineId }) : null;
    }
    function evaluateSaved(id) {
      try {
        if (arguments.length !== 1) fail('NO_SAVED_OVERRIDES');
        const entry = typeof id === 'string' ? entries.get(id) : undefined;
        if (!entry) fail('UNKNOWN_SAVED_ID');
        const built = entry.build();
        return assess(ownData(built.fleet), built.options, built.scope,
          { savedId: id, group: entry.group, label: entry.label, provenance: built.provenance });
      } catch (error) { return rejected(error.code || 'SAVED_SOURCE_UNAVAILABLE', { savedId: typeof id === 'string' ? id : null }); }
    }
    function compare(id) {
      const refuse = (code) => freeze({
        schema: 'C031-comparison/1', valid: false, code, trainingBanner: banner, savedId: typeof id === 'string' ? id : null,
        decision: 'HOLD', ...qualifications
      });
      try {
        if (arguments.length !== 1) fail('NO_COMPARISON_OVERRIDES');
        const entry = typeof id === 'string' ? entries.get(id) : undefined;
        if (!entry) fail('UNKNOWN_SAVED_ID');
        if (entry.group !== 'negative') fail('COMPARISON_REQUIRES_NEGATIVE_FLEET');
        const before = evaluateSaved(entry.baselineId);
        const after = evaluateSaved(id);
        if (!before.valid || !after.valid) fail('COMPARISON_SOURCE_INVALID');
        const prior = new Map(before.clients.map((row) => [row.clientId, row]));
        const changedClients = after.clients.filter((row) => {
          const earlier = prior.get(row.clientId);
          return !earlier || earlier.classification !== row.classification || earlier.reasonCodes[0] !== row.reasonCodes[0] ||
            earlier.traceCopies !== row.traceCopies;
        }).map((row) => ({
          clientId: row.clientId, change: prior.has(row.clientId) ? 'changed' : 'added', classification: row.classification,
          reasonCodes: row.reasonCodes, traceCopies: row.traceCopies, eligible: row.eligible
        }));
        const side = (report) => ({ savedId: report.savedId, ...report.successRate, counts: report.counts });
        const rateRaised = after.successRate.numerator * before.successRate.denominator > before.successRate.numerator * after.successRate.denominator;
        const numeratorIncreased = after.successRate.numerator > before.successRate.numerator;
        return freeze({
          schema: 'C031-comparison/1', valid: true, code: null, trainingBanner: banner, savedId: id, baselineId: entry.baselineId,
          before: side(before), after: side(after), rateRaised, numeratorIncreased,
          decision: rateRaised || numeratorIncreased ? 'RAISED' : 'NOT_RAISED', changedClients, ...qualifications
        });
      } catch (error) { return refuse(error.code || 'COMPARISON_UNAVAILABLE'); }
    }
    return Object.freeze({ ids, describe, evaluateSaved, compare });
  }

  return Object.freeze({ banner, versions, classes, reasonCodes, evaluateFleet, fromC034Trace, create });
}));
