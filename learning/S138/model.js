(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'PaginationLesson', { value: factory() });
}(globalThis, function () {
  'use strict';

  function freeze(value) {
    if (value && typeof value === 'object') {
      Object.values(value).forEach(freeze);
      Object.freeze(value);
    }
    return value;
  }

  const BANNER = 'Training rehearsal - synthetic data - not a live Azure result';
  const SAVED_CURSOR = 'teaching-cursor-s138.snapshot-v1.after-profile-03';
  const CONTRACT = freeze({
    datasetId: 'fictional-profiles-s138',
    snapshotId: 's138-pinned-snapshot-v1',
    queryId: 'fictional-profiles-by-ordinal-v1',
    order: 'ordinal ASC, id ASC',
    schema: 'profile-v1',
    cursorFormat: 'teaching-cursor-v1',
    clientVersion: 'v1',
    pageLimit: 4,
    expectedIds: ['profile-01', 'profile-02', 'profile-03', 'profile-04', 'profile-05', 'profile-06'],
    maximumPages: 2,
    maximumHistory: 4,
  });
  const SCENARIOS = freeze([
    { id: 'preserved', label: 'Preserved cursor, snapshot and schema' },
    { id: 'accepted-missing', label: 'Accepted 200, missing profile-05' },
    { id: 'accepted-duplicate', label: 'Accepted 200, duplicate profile-03' },
    { id: 'accepted-reorder', label: 'Accepted 200, wrong result order' },
    { id: 'changed-schema', label: 'Accepted 200, incompatible profile-v2 schema' },
    { id: 'changed-snapshot', label: 'Accepted 200, switched live-v2 snapshot' },
    { id: 'unknown-completion', label: 'Accepted 200, completion observation unknown' },
    { id: 'rejected-cursor', label: 'Rejected old cursor, fictional status 410' },
  ]);
  const PHASES = ['ready', 'paged-v1', 'migrated', 'received', 'checked'];
  const ROWS = freeze([
    { id: 'profile-01', ordinal: 1, schemaVersion: 1, label: 'Synthetic profile 01' },
    { id: 'profile-02', ordinal: 2, schemaVersion: 1, label: 'Synthetic profile 02' },
    { id: 'profile-03', ordinal: 3, schemaVersion: 1, label: 'Synthetic profile 03' },
    { id: 'profile-04', ordinal: 4, schemaVersion: 1, label: 'Synthetic profile 04' },
    { id: 'profile-05', ordinal: 5, schemaVersion: 1, label: 'Synthetic profile 05' },
    { id: 'profile-06', ordinal: 6, schemaVersion: 1, label: 'Synthetic profile 06' },
    { id: 'profile-07', ordinal: 7, schemaVersion: 1, label: 'Synthetic live-v2 addition 07' },
  ]);
  const NEW_SCHEMA_ROWS = freeze([
    { id: 'profile-04', ordinal: 4, schemaVersion: 2, name: 'Synthetic renamed profile 04' },
    { id: 'profile-05', ordinal: 5, schemaVersion: 2, name: 'Synthetic renamed profile 05' },
    { id: 'profile-06', ordinal: 6, schemaVersion: 2, name: 'Synthetic renamed profile 06' },
  ]);

  function scenario(id) {
    if (typeof id !== 'string') throw new TypeError('Migration condition must be an exact string identifier.');
    const found = SCENARIOS.find(item => item.id === id);
    if (!found) throw new RangeError('Choose one of the eight fixed migration conditions.');
    return found;
  }

  function request(version, cursor) {
    return {
      datasetId: CONTRACT.datasetId,
      snapshotId: CONTRACT.snapshotId,
      queryId: CONTRACT.queryId,
      order: CONTRACT.order,
      schema: CONTRACT.schema,
      clientVersion: CONTRACT.clientVersion,
      targetVersion: version,
      pageLimit: CONTRACT.pageLimit,
      cursorFormat: CONTRACT.cursorFormat,
      cursor,
    };
  }

  function receipt(version, cursor, items, extra) {
    return {
      kind: 'fixed-fictional-data',
      request: request(version, cursor),
      response: {
        version,
        status: 200,
        cursorAccepted: cursor === null ? null : true,
        snapshotId: CONTRACT.snapshotId,
        schemaVersion: 1,
        endOfSnapshot: true,
        nextCursor: null,
        items,
        ...extra,
      },
    };
  }

  function firstPage() {
    return receipt('v1', null, ROWS.slice(0, 3), {
      endOfSnapshot: false,
      nextCursor: SAVED_CURSOR,
    });
  }

  function secondPage(id) {
    switch (id) {
      case 'preserved': return receipt('v2', SAVED_CURSOR, ROWS.slice(3, 6));
      case 'accepted-missing': return receipt('v2', SAVED_CURSOR, [ROWS[3], ROWS[5]]);
      case 'accepted-duplicate': return receipt('v2', SAVED_CURSOR, ROWS.slice(2, 6));
      case 'accepted-reorder': return receipt('v2', SAVED_CURSOR, [ROWS[4], ROWS[3], ROWS[5]]);
      case 'changed-schema': return receipt('v2', SAVED_CURSOR, NEW_SCHEMA_ROWS, { schemaVersion: 2 });
      case 'changed-snapshot': return receipt('v2', SAVED_CURSOR, ROWS.slice(3, 7), {
        snapshotId: 's138-live-snapshot-v2',
      });
      case 'unknown-completion': return receipt('v2', SAVED_CURSOR, [ROWS[3]], {
        endOfSnapshot: null,
      });
      case 'rejected-cursor': return receipt('v2', SAVED_CURSOR, [], {
        status: 410, cursorAccepted: false, endOfSnapshot: null,
      });
      default: throw new RangeError('Unknown fixed response fixture.');
    }
  }

  function measurePages(pages) {
    const rows = pages.flatMap(page => page.response.items);
    const ids = rows.map(row => row.id);
    const counts = new Map();
    ids.forEach(id => counts.set(id, (counts.get(id) || 0) + 1));
    const duplicateIds = [...counts].filter(([, count]) => count > 1).map(([id]) => id);
    const duplicateCount = [...counts.values()].reduce((sum, count) => sum + Math.max(0, count - 1), 0);
    const unobservedIds = CONTRACT.expectedIds.filter(id => !counts.has(id));
    const unexpectedIds = [...counts.keys()].filter(id => !CONTRACT.expectedIds.includes(id));
    const orderBreaks = [];
    rows.forEach((row, index) => {
      const previous = rows[index - 1];
      if (previous && (previous.ordinal > row.ordinal
          || (previous.ordinal === row.ordinal && previous.id > row.id))) {
        orderBreaks.push(`${previous.id} before ${row.id}`);
      }
    });
    const schemaErrors = rows.filter(row => row.schemaVersion !== 1 || typeof row.label !== 'string').map(row => row.id);
    const snapshotMatches = pages.every(page => page.response.snapshotId === CONTRACT.snapshotId);
    const last = pages.at(-1);
    const terminalObserved = Boolean(last && last.response.endOfSnapshot === true);
    return {
      expected: CONTRACT.expectedIds.length,
      observed: rows.length,
      uniqueObserved: counts.size,
      observedIds: ids,
      duplicateCount,
      duplicateIds,
      unobservedIds,
      // An absent next token is not a terminal observation.
      missingIds: terminalObserved ? unobservedIds : null,
      unexpectedIds,
      orderBreaks,
      schemaErrors,
      snapshotMatches,
      terminalObserved,
      completion: terminalObserved ? 'terminal observed' : 'unknown',
    };
  }

  function auditPages(pages) {
    const measured = measurePages(pages);
    const last = pages.at(-1).response;
    const reasons = [];
    if (last.status !== 200 || last.cursorAccepted !== true) reasons.push('The old cursor was rejected; the journey was interrupted.');
    if (!measured.snapshotMatches) reasons.push('The response changed the pinned snapshot.');
    if (measured.schemaErrors.length) reasons.push(`Required profile-v1 labels are unavailable: ${measured.schemaErrors.join(', ')}.`);
    if (measured.unexpectedIds.length) reasons.push(`Unexpected results: ${measured.unexpectedIds.join(', ')}.`);
    if (measured.duplicateCount) reasons.push(`Duplicate results: ${measured.duplicateIds.join(', ')}.`);
    if (measured.orderBreaks.length) reasons.push(`Wrong result order: ${measured.orderBreaks.join('; ')}.`);
    if (measured.missingIds && measured.missingIds.length) reasons.push(`Missing results at the observed end: ${measured.missingIds.join(', ')}.`);
    const verdict = reasons.length ? 'interrupted' : measured.terminalObserved ? 'positive' : 'unknown';
    if (verdict === 'unknown') reasons.push('Completion is unknown. Unobserved results are not certified missing; status 200 and no next token do not prove completion.');
    if (verdict === 'positive') reasons.push('All six pinned profiles were observed exactly once, in order and in profile-v1 schema, across fictional v1 and v2 receipts.');
    return { ...measured, verdict, reasons, evidenceLevel: 'local synthetic rehearsal only' };
  }

  function buildState(phase, scenarioId) {
    const step = PHASES.indexOf(phase);
    const pages = step > 0 ? [firstPage()] : [];
    if (step >= 3) pages.push(secondPage(scenarioId));
    const audit = step === 4 ? auditPages(pages) : null;
    const history = [];
    if (step >= 1) history.push({
      step: 1, action: 'open-first-page', version: 'v1',
      note: 'Observed three fixed rows, a nonterminal page, and the saved opaque teaching cursor.',
    });
    if (step >= 2) history.push({
      step: 2, action: 'migrate', version: 'v2', condition: scenarioId,
      note: 'Only the fictional target version changes. No migration or database action occurred.',
    });
    if (step >= 3) history.push({
      step: 3, action: 'reuse-cursor', version: 'v2', cursor: SAVED_CURSOR,
      status: pages[1].response.status,
      note: 'Retained the v1 page and recorded the selected fixed v2 request/response.',
    });
    if (step === 4) history.push({
      step: 4, action: 'check-result', version: 'v2', verdict: audit.verdict,
      note: audit.reasons.join(' '),
    });
    return freeze({
      stateVersion: 1,
      phase,
      scenarioId,
      version: step >= 2 ? 'v2' : 'v1',
      savedCursor: step > 0 ? SAVED_CURSOR : null,
      pages,
      history,
      audit,
    });
  }

  function plainData(value, depth = 0) {
    if (depth > 12) return false;
    if (value === null || typeof value === 'boolean') return true;
    if (typeof value === 'string') return value.length <= 512;
    if (typeof value === 'number') return Number.isSafeInteger(value);
    if (typeof value !== 'object') return false;
    if (Array.isArray(value)) {
      if (Object.getPrototypeOf(value) !== Array.prototype || value.length > 16) return false;
      const keys = Reflect.ownKeys(value);
      if (keys.length !== value.length + 1) return false;
      return keys.every(key => key === 'length' || (/^(0|[1-9]\d*)$/.test(String(key))
        && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')
        && Object.getOwnPropertyDescriptor(value, key).enumerable
        && plainData(value[key], depth + 1)));
    }
    if (Object.getPrototypeOf(value) !== Object.prototype) return false;
    return Reflect.ownKeys(value).every(key => typeof key === 'string'
      && Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')
      && Object.getOwnPropertyDescriptor(value, key).enumerable
      && plainData(value[key], depth + 1));
  }

  function sameData(a, b) {
    if (a === b) return true;
    if (a === null || b === null || typeof a !== 'object' || typeof b !== 'object') return false;
    if (Array.isArray(a) !== Array.isArray(b)) return false;
    const keys = Object.keys(a);
    return keys.length === Object.keys(b).length
      && keys.every(key => Object.hasOwn(b, key) && sameData(a[key], b[key]));
  }

  function validateState(state) {
    if (!plainData(state) || state === null || Array.isArray(state)
        || typeof state.phase !== 'string' || !PHASES.includes(state.phase)) {
      throw new TypeError('State must be an intact, typed fictional lesson record.');
    }
    const step = PHASES.indexOf(state.phase);
    if (step < 2) {
      if (state.scenarioId !== null) throw new TypeError('No migration condition exists before cutover.');
    } else scenario(state.scenarioId);
    if (!sameData(state, buildState(state.phase, state.scenarioId))) {
      throw new TypeError('State, cursor, history, request or result was altered. Use Reset all to start an intact attempt.');
    }
    return state;
  }

  function requirePhase(state, phase, message) {
    validateState(state);
    if (state.phase !== phase) throw new RangeError(message);
  }

  function openFirstPage(state) {
    requirePhase(state, 'ready', 'Open the first page only at the beginning of a fresh attempt.');
    return buildState('paged-v1', null);
  }

  function migrate(state, scenarioId) {
    requirePhase(state, 'paged-v1', 'Open the v1 first page before selecting a migration condition.');
    scenario(scenarioId);
    return buildState('migrated', scenarioId);
  }

  function reuseCursor(state, cursor) {
    requirePhase(state, 'migrated', 'Migrate the fictional target before reusing its saved cursor.');
    if (typeof cursor !== 'string' || cursor !== state.savedCursor) {
      throw new TypeError('Paste the exact saved teaching cursor, without extra spaces. No token is parsed or repaired.');
    }
    return buildState('received', state.scenarioId);
  }

  function check(state) {
    requirePhase(state, 'received', 'Reuse the saved cursor and observe the second receipt before checking results.');
    return buildState('checked', state.scenarioId);
  }

  function measure(state) {
    validateState(state);
    return freeze(measurePages(state.pages));
  }

  return freeze({
    BANNER, SAVED_CURSOR, CONTRACT, SCENARIOS,
    createState: () => buildState('ready', null),
    openFirstPage, migrate, reuseCursor, check, measure, validateState,
  });
}));
