(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else Object.defineProperty(root, 'C040Tables', { value: factory() });
}(globalThis, function () {
  'use strict';

  // Builds three inspection tables from the SAVED outputs of the accepted producers: the C031 cohort evaluation, the C030 effect
  // detection and the C029 latency evaluation. Rule of the card: a failed or unknown row can never disappear, not by sort, filter,
  // search, paging, truncation, an empty state, a summary or an aggregate. Counts are always derived from the rows.
  const banner = 'Training rehearsal - synthetic data - not a live Azure result';
  const NOT_SAVED = 'NOT_SAVED';
  const tableIds = Object.freeze(['cohort', 'effect', 'latency']);
  const titles = Object.freeze({ cohort: 'Cohort', effect: 'Effect', latency: 'Latency' });
  const schemas = Object.freeze({ cohort: 'C031-evaluation/1', effect: 'C030-detection/1', latency: 'C029-evaluation/1' });
  const listKeys = Object.freeze({ cohort: 'clients', effect: 'originals', latency: 'originals' });
  const vocabularies = deepFreeze({
    cohort: [['ACTUAL_TRANSITION', 'success'], ['UNCHANGED', 'neutral'], ['NOT_TRANSITIONED_YET', 'neutral'], ['FAILED', 'failed'], ['UNKNOWN', 'unknown']],
    effect: [['ONE_INTENDED_EFFECT', 'success'], ['DUPLICATE', 'failed'], ['MISSING', 'failed'], ['MISSING_OBSERVATION', 'unknown'], ['UNKNOWN', 'unknown']],
    latency: [['WITHIN', 'success'], ['EXCEEDED', 'failed'], ['FAILED', 'failed'], ['UNKNOWN', 'unknown']]
  });
  const columns = deepFreeze({
    cohort: [{ key: 'position', label: '#' }, { key: 'id', label: 'Client' }, { key: 'status', label: 'Status' },
      { key: 'reason', label: 'Reason code' }, { key: 'versions', label: 'Versions start to end' }, { key: 'eligible', label: 'Eligible' },
      { key: 'counting', label: 'Counted in numerator / denominator' }, { key: 'notes', label: 'Notes and flags' }],
    effect: [{ key: 'position', label: '#' }, { key: 'original', label: 'Original' }, { key: 'effectKey', label: 'Intended effect key' },
      { key: 'lower', label: 'Applications, lower bound' }, { key: 'upper', label: 'Applications, upper bound' },
      { key: 'deliveries', label: 'Delivery count' }, { key: 'status', label: 'Verdict' }, { key: 'reason', label: 'Producer status' },
      { key: 'notes', label: 'Notes and flags' }],
    latency: [{ key: 'position', label: '#' }, { key: 'id', label: 'Journey' }, { key: 'budget', label: 'Original budget (ms)' },
      { key: 'observed', label: 'Observed (ms)' }, { key: 'status', label: 'Verdict' },
      { key: 'retry', label: 'Original kept in the producer denominator (a retry cannot hide it)' },
      { key: 'reason', label: 'Reason codes' }, { key: 'notes', label: 'Notes and flags' }]
  });
  const kinds = Object.fromEntries(tableIds.map((id) => [id, Object.fromEntries(vocabularies[id])]));
  const states = Object.freeze(['COMPLETE', 'INCOMPLETE', 'INCONSISTENT', 'EMPTY', 'REJECTED']);

  function deepFreeze(value) {
    if (value && typeof value === 'object') { Object.values(value).forEach(deepFreeze); Object.freeze(value); }
    return value;
  }
  const isPlain = (value) => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
  const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
  const number = (value) => (typeof value === 'number' && Number.isFinite(value) ? value : null);
  const word = (value, fallback) => (typeof value === 'string' && value ? value : fallback);
  const yesNo = (value) => (value ? 'yes' : 'no');
  const statusesOf = (tableId) => [...vocabularies[tableId].map(([status]) => status), NOT_SAVED];
  const kindOf = (tableId, status) => (status === NOT_SAVED ? 'unknown' : kinds[tableId][status]);
  const sentence = (counts) => Object.entries(counts).map(([status, count]) => `${status} ${count}`).join(', ');
  const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
  const nonZero = (counts) => Object.fromEntries(Object.entries(counts).filter(([, count]) => count > 0));
  const andList = (counts) => Object.entries(nonZero(counts)).map(([status, count]) => `${count} ${status}`).join(' and ');
  const unrecognised = (producerStatus) => ({ status: 'UNKNOWN', producerStatus, flags: ['UNRECOGNISED_STATUS'] });
  const contradictory = (producerStatus) => ({ status: 'UNKNOWN', producerStatus, flags: ['CONTRADICTORY_PRODUCER_STATUS'] });
  const pair = (name, derived, produced) => ({ name, derived, producer: produced, equal: derived === produced });

  // ---- cohort (C031): one row per client ------------------------------------------------------------------------------------------
  const cohortClasses = ['ACTUAL_TRANSITION', 'UNCHANGED', 'NOT_TRANSITIONED_YET'];
  function cohortStatus(client) {
    const raw = client.classification;
    if (raw === 'FAILED_OR_UNKNOWN') {
      return client.failureKind === 'FAILED' || client.failureKind === 'UNKNOWN' ?
        { status: client.failureKind, producerStatus: `${raw}:${client.failureKind}`, flags: [] } : unrecognised(`${raw}:${String(client.failureKind)}`);
    }
    if (!cohortClasses.includes(raw)) return unrecognised(String(raw));
    const claimsFailure = client.failureKind !== null && client.failureKind !== undefined;
    if (claimsFailure || (raw === 'ACTUAL_TRANSITION' && client.countsInNumerator !== true)) return contradictory(raw);
    return { status: raw, producerStatus: raw, flags: [] };
  }
  function cohortPart(raw, index) {
    const client = isPlain(raw) ? raw : {};
    const verdict = cohortStatus(client);
    const codes = Array.isArray(client.reasonCodes) ? client.reasonCodes.filter((code) => typeof code === 'string') : [];
    const copies = Number.isSafeInteger(client.traceCopies) && client.traceCopies > 1 ? [`${client.traceCopies} saved copies collapsed by the producer`] : [];
    const own = Array.isArray(client.notes) ? client.notes.filter((note) => typeof note === 'string') : [];
    return {
      id: word(client.clientId, `row-${index + 1}-without-client-id`), ...verdict,
      flags: isPlain(raw) ? verdict.flags : [...verdict.flags, 'MALFORMED_ROW'], notes: [...own, ...copies],
      values: { reason: codes[0] ?? null, versions: `${client.startVersion || 'unproven'} to ${client.endVersion || 'none'}`,
        eligible: client.eligible === true, counting: `${yesNo(client.countsInNumerator === true)}/${yesNo(client.countsInDenominator === true)}` },
      text: {
        reason: codes.length ? `${codes[0]}${typeof client.reasonMeaning === 'string' ? `: ${client.reasonMeaning}` : ''}` : 'no reason code saved',
        versions: `${client.startVersion || 'unproven'} to ${client.endVersion || 'none'}`,
        eligible: `${yesNo(client.eligible === true)}: ${word(client.eligibility, 'eligibility not saved')}`,
        counting: `numerator ${yesNo(client.countsInNumerator === true)}, denominator ${yesNo(client.countsInDenominator === true)}`
      },
      raw: { eligible: client.eligible === true }
    };
  }
  function cohortFacts(report, parts, rows) {
    const counts = isPlain(report.counts) ? report.counts : {};
    const rate = isPlain(report.successRate) ? report.successRate : {};
    const total = counts.clients;
    const by = (status) => rows.filter((row) => row.status === status).length;
    const eligible = parts.filter((part) => part.raw.eligible).length;
    return {
      producerTotal: isCount(total) ? total : null, missing: isCount(total) ? Math.max(0, total - rows.length) : 0,
      extra: isCount(total) ? Math.max(0, rows.length - total) : 0,
      producer: { schema: schemas.cohort, id: word(report.fleetId, null), eligible: number(counts.eligible), actualTransitions: number(counts.actualTransition),
        numerator: number(rate.numerator), denominator: number(rate.denominator), percent: typeof rate.percent === 'string' ? rate.percent : null },
      checks: [pair('actual transitions', by('ACTUAL_TRANSITION'), counts.actualTransition), pair('rate numerator', by('ACTUAL_TRANSITION'), rate.numerator),
        pair('eligible clients', eligible, counts.eligible), pair('rate denominator', eligible, rate.denominator), pair('failed', by('FAILED'), counts.failed),
        pair('unknown', by('UNKNOWN'), counts.unknown), pair('unchanged', by('UNCHANGED'), counts.unchanged),
        pair('not transitioned yet', by('NOT_TRANSITIONED_YET'), counts.notTransitionedYet)]
    };
  }

  // ---- effect (C030): one row per intended effect of each original ------------------------------------------------------------------
  const effectStatuses = { DUPLICATE_APPLICATION: 'DUPLICATE', CONFIRMED_ABSENCE: 'MISSING', MISSING_OBSERVATION: 'MISSING_OBSERVATION', UNKNOWN_ACK: 'UNKNOWN', UNSUPPORTED: 'UNKNOWN' };
  // One intended effect needs exactly one confirmed application and an exact upper bound, as the producer itself requires for PASS;
  // a lower bound of one with an open upper bound is UNKNOWN here, never shaped like a success.
  function effectStatus(effect) {
    const raw = effect.status;
    if (raw === 'ONE_APPLICATION') {
      if (effect.confirmedApplicationsLowerBound !== 1) return contradictory(raw);
      return effect.confirmedApplicationsUpperBound === 1 ? { status: 'ONE_INTENDED_EFFECT', producerStatus: raw, flags: [] } :
        { status: 'UNKNOWN', producerStatus: raw, flags: ['UPPER_BOUND_NOT_EXACT'] };
    }
    return Object.hasOwn(effectStatuses, raw) ? { status: effectStatuses[raw], producerStatus: raw, flags: [] } : unrecognised(String(raw));
  }
  const bound = (value, none) => (number(value) === null ? { value: null, text: none } : { value, text: String(value) });
  function effectPart(originalId, raw, index) {
    const effect = isPlain(raw) ? raw : {};
    const verdict = effectStatus(effect);
    const lower = bound(effect.confirmedApplicationsLowerBound, 'not saved');
    const upper = bound(effect.confirmedApplicationsUpperBound, 'unknown (no upper bound)');
    const deliveries = bound(effect.deliveryAttempts, 'not saved');
    const effectKey = word(effect.effectKey, `effect-${index + 1}-without-key`);
    return {
      id: `${originalId} / ${effectKey}`, ...verdict, flags: isPlain(raw) ? verdict.flags : [...verdict.flags, 'MALFORMED_ROW'], notes: [],
      values: { original: originalId, effectKey, lower: lower.value, upper: upper.value, deliveries: deliveries.value, reason: verdict.producerStatus },
      text: { original: originalId, effectKey, lower: lower.text, upper: upper.text, deliveries: deliveries.text, reason: verdict.producerStatus }
    };
  }
  function effectPlaceholder(original, originalId) {
    const codes = Array.isArray(original.reasonCodes) ? original.reasonCodes.filter((code) => typeof code === 'string') : [];
    const reason = codes[0] || 'NO_EFFECT_ROWS_SAVED';
    return {
      id: `${originalId} / (no effect rows saved)`, status: 'UNKNOWN', producerStatus: reason, flags: ['NO_EFFECT_ROWS_SAVED'], notes: [],
      values: { original: originalId, effectKey: '(no effect rows saved)', lower: null, upper: null, deliveries: null, reason },
      text: { original: originalId, effectKey: '(no effect rows saved: effects unobserved, not zero)', lower: 'not saved', upper: 'unknown (no upper bound)',
        deliveries: 'not saved', reason }
    };
  }
  function effectParts(report) {
    const parts = [];
    const expected = [];
    Array.from(report.originals).forEach((raw, index) => {
      const original = isPlain(raw) ? raw : {};
      const originalId = word(original.originalId, `original-${index + 1}-without-id`);
      const effects = Array.isArray(original.effects) ? original.effects : [];
      const intended = isPlain(original.effectCounts) && isCount(original.effectCounts.intendedEffects) && original.effectCounts.intendedEffects > 0 ?
        original.effectCounts.intendedEffects : 1;
      const own = effects.length ? Array.from(effects, (effect, at) => effectPart(originalId, effect, at)) : [effectPlaceholder(original, originalId)];
      parts.push(...own);
      expected.push({ intended, rows: own.length, original });
    });
    return { parts, expected };
  }
  function effectFacts(report, built) {
    const counts = isPlain(report.counts) ? report.counts : {};
    const present = built.expected;
    const known = isCount(counts.originals);
    const perOriginal = present.length ? present[0].intended : 1;
    const absentOriginals = known ? Math.max(0, counts.originals - present.length) : 0;
    const numbered = present.filter((item) => isPlain(item.original.effectCounts) && Array.isArray(item.original.effects) && item.original.effects.length &&
      isCount(item.original.effectCounts.confirmedApplications) && isCount(item.original.effectCounts.deliveryAttempts));
    const derive = (source) => numbered.reduce((sum, item) => sum + item.original.effects.reduce((inner, effect) => inner + (number(effect[source]) ?? 0), 0), 0);
    const claimed = (key) => numbered.reduce((sum, item) => sum + item.original.effectCounts[key], 0);
    return {
      producerTotal: known ? present.reduce((sum, item) => sum + item.intended, 0) + absentOriginals * perOriginal : null,
      missing: present.reduce((sum, item) => sum + Math.max(0, item.intended - item.rows), 0) + absentOriginals * perOriginal,
      extra: present.reduce((sum, item) => sum + Math.max(0, item.rows - item.intended), 0),
      producer: { schema: schemas.effect, id: word(report.sourceId, null), decision: word(report.decision, null),
        originals: number(counts.originals), pass: number(counts.pass), fail: number(counts.fail), unknown: number(counts.unknown), unsupported: number(counts.unsupported) },
      checks: [pair('originals', present.length, counts.originals), pair('confirmed applications', derive('confirmedApplicationsLowerBound'), claimed('confirmedApplications')),
        pair('delivery attempts', derive('deliveryAttempts'), claimed('deliveryAttempts'))]
    };
  }

  // ---- latency (C029): one row per journey (original) -------------------------------------------------------------------------------
  function latencyStatus(original) {
    const { verdict, latencyVerdict: latency } = original;
    if (verdict === 'PASS') {
      return latency === 'PASS' && original.stateVerdict === 'PASS' ? { status: 'WITHIN', producerStatus: verdict, flags: [] } : contradictory(verdict);
    }
    if (verdict === 'FAIL') return { status: latency === 'FAIL' ? 'EXCEEDED' : 'FAILED', producerStatus: verdict, flags: [] };
    return verdict === 'UNKNOWN' ? { status: 'UNKNOWN', producerStatus: verdict, flags: [] } : unrecognised(String(verdict));
  }
  function latencyPart(raw, index) {
    const original = isPlain(raw) ? raw : {};
    const verdict = latencyStatus(original);
    const budget = bound(original.budgetMs, 'not saved - UNKNOWN');
    const observed = bound(original.elapsedMs, 'not saved - UNKNOWN');
    const kept = original.includedInDenominator === true;
    const codes = Array.isArray(original.reasonCodes) ? original.reasonCodes.filter((code) => typeof code === 'string') : [];
    const flags = [...verdict.flags, ...(isPlain(raw) ? [] : ['MALFORMED_ROW']), ...(kept ? [] : ['DENOMINATOR_FLAG_NOT_TRUE']),
      ...(original.summaryOnly === true ? ['SUMMARY_ONLY'] : [])];
    return {
      id: word(original.attemptId, `journey-${index + 1}-without-id`), ...verdict, flags, notes: [],
      values: { budget: budget.value, observed: observed.value, retry: kept, reason: codes.join(' / ') },
      text: { budget: budget.text === 'not saved - UNKNOWN' ? budget.text : `${budget.text} ms`,
        observed: observed.text === 'not saved - UNKNOWN' ? observed.text : `${observed.text} ms`,
        retry: kept ? 'yes: kept in the producer denominator, a retry cannot hide it' : 'NO: the producer did not keep it in its denominator',
        reason: codes.join(' / ') || 'none' }
    };
  }
  function latencyFacts(report, rows) {
    const counts = isPlain(report.counts) ? report.counts : {};
    const by = (...statuses) => rows.filter((row) => statuses.includes(row.status)).length;
    const total = counts.originals;
    return {
      producerTotal: isCount(total) ? total : null, missing: isCount(total) ? Math.max(0, total - rows.length) : 0,
      extra: isCount(total) ? Math.max(0, rows.length - total) : 0,
      producer: { schema: schemas.latency, id: word(report.savedId ?? report.controlId, null), decision: word(report.decision, null),
        originals: number(total), pass: number(counts.pass), fail: number(counts.fail), unknown: number(counts.unknown) },
      checks: [pair('within budget', by('WITHIN'), counts.pass), pair('failed or exceeded', by('EXCEEDED', 'FAILED'), counts.fail),
        pair('unknown', by('UNKNOWN'), counts.unknown)]
    };
  }

  // ---- table construction -----------------------------------------------------------------------------------------------------------
  function rowCode(report, tableId) {
    if (!isPlain(report)) return 'PRODUCER_REPORT_REQUIRED';
    if (report.valid !== true) return word(report.code, 'PRODUCER_REPORT_NOT_VALID');
    if (report.schema !== schemas[tableId]) return 'PRODUCER_SCHEMA_MISMATCH';
    if (!Array.isArray(report[listKeys[tableId]])) return 'PRODUCER_ROWS_MISSING';
    return isPlain(report.counts) ? null : 'PRODUCER_COUNTS_MISSING';
  }
  function makeRow(tableId, position, part, copies) {
    const kind = kindOf(tableId, part.status);
    const flags = copies > 1 ? [...part.flags, 'DUPLICATE_ROW'] : part.flags;
    const notes = [...part.notes, ...flags].join('; ') || 'none';
    const attention = kind === 'failed' || kind === 'unknown';
    const text = { position: String(position), id: part.id, status: attention ? `${part.status} (needs attention)` : part.status, ...part.text, notes };
    const values = { position, id: part.id, status: part.status, ...part.values, notes };
    return Object.freeze({
      id: part.id, position, status: part.status, kind, attention, producerStatus: part.producerStatus, flags: Object.freeze(flags),
      values: Object.freeze(values), text: Object.freeze(text), search: Object.values(text).join(' ').toLowerCase()
    });
  }
  function construct(tableId, report) {
    const code = rowCode(report, tableId);
    const listed = isPlain(report) && Array.isArray(report[listKeys[tableId]]);
    const list = listed ? report : { [listKeys[tableId]]: [], counts: {} };
    // Array.from visits the holes of a sparse list as malformed rows; map would skip them silently.
    const built = tableId === 'effect' ? effectParts(list) : { parts: Array.from(list[listKeys[tableId]], tableId === 'cohort' ? cohortPart : latencyPart) };
    const copies = new Map();
    for (const part of built.parts) copies.set(part.id, (copies.get(part.id) || 0) + 1);
    const rows = built.parts.map((part, index) => makeRow(tableId, index + 1, part, copies.get(part.id)));
    const facts = tableId === 'effect' ? effectFacts(list, built) : tableId === 'cohort' ? cohortFacts(list, built.parts, rows) : latencyFacts(list, rows);
    const usable = code === null && facts.producerTotal !== null;
    const missing = usable ? facts.missing : 0;
    const comparable = usable && missing === 0;
    const checks = comparable ? facts.checks : [];
    const disagree = checks.filter((check) => !check.equal);
    const state = !usable ? 'REJECTED' : missing > 0 ? 'INCOMPLETE' : facts.extra > 0 || disagree.length ? 'INCONSISTENT' :
      rows.length === 0 ? 'EMPTY' : 'COMPLETE';
    return deepFreeze({
      tableId, state, code: usable ? null : code || 'PRODUCER_TOTAL_MISSING', rows, columns: columns[tableId], producer: facts.producer,
      producerTotal: facts.producerTotal, rowCount: rows.length, missingRows: missing, extraRows: usable ? facts.extra : 0,
      total: rows.length + missing, checks, disagreements: disagree.length
    });
  }
  // A report that cannot even be read (a throwing getter, a revoked proxy) fails closed: REJECTED with a code, never an empty success.
  function build(tableId, report) {
    try { return construct(tableId, report); } catch (error) {
      return deepFreeze({ ...construct(tableId, undefined), code: 'PRODUCER_REPORT_UNREADABLE' });
    }
  }
  const fromCohort = (report) => build('cohort', report);
  const fromEffects = (report) => build('effect', report);
  const fromLatency = (report) => build('latency', report);
  function fromReport(tableId, report) {
    if (!tableIds.includes(tableId)) throw Object.assign(new Error('UNKNOWN_TABLE'), { code: 'UNKNOWN_TABLE' });
    return build(tableId, report);
  }

  // ---- views ------------------------------------------------------------------------------------------------------------------------
  const filterNames = Object.freeze({ all: 'All statuses', attention: 'Failed and unknown only', success: 'success' });
  function filterOptions(tableId) {
    return Object.freeze([
      { value: 'all', label: 'All statuses (default)' }, { value: 'attention', label: 'Failed and unknown only' },
      { value: 'success', label: 'Success only (failed and unknown rows always stay visible)' },
      ...vocabularies[tableId].map(([status]) => ({ value: status, label: `Only ${status} (failed and unknown rows always stay visible)` }))
    ].map(Object.freeze));
  }
  function normalize(table, query) {
    const given = isPlain(query) ? query : {};
    const corrected = [];
    const keys = table.columns.map((column) => column.key);
    let sort = { column: 'position', direction: 'asc' };
    if (given.sort !== undefined) {
      if (isPlain(given.sort) && keys.includes(given.sort.column) && ['asc', 'desc'].includes(given.sort.direction)) sort = { column: given.sort.column, direction: given.sort.direction };
      else corrected.push('sort');
    }
    const known = filterOptions(table.tableId).map((option) => option.value);
    let filter = 'all';
    if (given.filter !== undefined) {
      if (known.includes(given.filter)) filter = given.filter;
      else corrected.push('filter');
    }
    let search = '';
    if (given.search !== undefined) {
      if (typeof given.search === 'string' && given.search.length <= 200) search = given.search.trim();
      else corrected.push('search');
    }
    let pageSize = null;
    let page = 1;
    if (given.pageSize !== undefined) {
      if (Number.isSafeInteger(given.pageSize) && given.pageSize >= 1) pageSize = given.pageSize;
      else corrected.push('pageSize');
    }
    if (given.page !== undefined) {
      if (Number.isSafeInteger(given.page) && given.page >= 1) page = given.page;
      else corrected.push('page');
    }
    return { sort, filter, search, pageSize, page, corrected };
  }
  function compare(left, right, direction) {
    const empty = (value) => value === null || value === undefined;
    if (empty(left) || empty(right)) return empty(left) && empty(right) ? 0 : empty(left) ? 1 : -1;
    const a = typeof left === 'boolean' ? Number(left) : left;
    const b = typeof right === 'boolean' ? Number(right) : right;
    const order = typeof a === 'number' && typeof b === 'number' ? a - b : String(a) < String(b) ? -1 : String(a) > String(b) ? 1 : 0;
    return direction === 'desc' ? -order : order;
  }
  function statusCounts(table) {
    const counts = Object.fromEntries(statusesOf(table.tableId).map((status) => [status, 0]));
    for (const row of table.rows) counts[row.status] = (counts[row.status] || 0) + 1;
    counts[NOT_SAVED] += table.missingRows;
    return counts;
  }
  function checkView(table, view) {
    const problems = [];
    const sum = Object.values(view.statusCounts).reduce((total, count) => total + count, 0);
    if (sum !== view.total) problems.push(`status counts add up to ${sum}, not to the total ${view.total}`);
    const shown = new Set(view.rows.map((row) => row.position));
    const missing = table.rows.filter((row) => row.attention && !shown.has(row.position));
    if (missing.length) problems.push(`${missing.length} failed or unknown rows are not shown`);
    if (view.shown !== view.rows.length) problems.push(`shown says ${view.shown} but ${view.rows.length} rows are listed`);
    if (view.shown + view.hidden.count !== table.rowCount) problems.push('shown rows and hidden rows do not add up to the saved rows');
    return Object.freeze({ ok: problems.length === 0, problems: Object.freeze(problems) });
  }
  function describe(table, counts, shown) {
    const title = `${titles[table.tableId]} table`;
    const tally = `Status counts: ${sentence(counts)}; together ${table.total} of ${table.total} rows.`;
    const showing = `showing ${shown} of ${table.total} rows`;
    if (table.state === 'REJECTED') {
      return `${title}: REJECTED (${table.code}), ${showing}. The producer output was rejected or is unusable. Nothing is shown as success and there is no success rate. ${tally}`;
    }
    if (table.state === 'EMPTY') return `${title}: no attempts recorded (${showing}). Nothing succeeded and nothing failed here, and there is no success rate. ${tally}`;
    if (table.state === 'INCOMPLETE') {
      return `${title}: INCOMPLETE, ${showing}. The producer counted ${table.producerTotal} rows but this saved set holds ${table.rowCount}: ${table.missingRows} are NOT_SAVED and their status is unknown. ${tally}`;
    }
    if (table.state === 'INCONSISTENT') {
      const named = table.checks.filter((check) => !check.equal).map((check) => `${check.name} ${check.derived} from the rows but ${check.producer} from the producer`);
      const extra = table.extraRows ? [`${plural(table.extraRows, 'extra row')} beyond the producer total ${table.producerTotal}, kept and flagged`] : [];
      return `${title}: INCONSISTENT, ${showing}. This saved set disagrees with its producer: ${[...extra, ...named].join('; ')}. ${tally}`;
    }
    return `${title}: ${showing}, COMPLETE. ${tally}`;
  }
  function producerLine(table) {
    const producer = table.producer;
    if (table.tableId === 'cohort') {
      const rate = producer.denominator ? `${producer.numerator} of ${producer.denominator} eligible clients = ${producer.percent}` : 'no success rate (0 eligible clients)';
      return `Producer C031 says: ${rate}; eligible ${producer.eligible}, actual transitions ${producer.actualTransitions}, clients ${table.producerTotal}.`;
    }
    if (table.tableId === 'effect') {
      return `Producer C030 says: decision ${producer.decision}; originals ${producer.originals}: pass ${producer.pass}, fail ${producer.fail}, unknown ${producer.unknown}, unsupported ${producer.unsupported}.`;
    }
    return `Producer C029 says: decision ${producer.decision}; originals ${producer.originals}: pass ${producer.pass}, fail ${producer.fail}, unknown ${producer.unknown}.`;
  }
  function filterNote(table, query, hidden, kept, pages) {
    const active = [];
    if (query.filter !== 'all') active.push(`filter "${filterNames[query.filter] || query.filter}"`);
    if (query.search) active.push(`search "${query.search}"`);
    if (query.pageSize) active.push(`page ${query.page} of ${pages}`);
    if (!active.length) return '';
    const subject = `The ${active.join(' and ')}`;
    const parts = [];
    if (hidden.count) parts.push(`${subject} hides ${plural(hidden.count, 'row')}: ${sentence(hidden.statuses)}.`);
    if (kept.count) {
      parts.push(`${hidden.count ? 'It would also have' : `${subject} alone would have`} hidden ${andList(kept.statuses)} rows: failed and unknown rows are never hidden, so they stay visible.`);
    }
    if (parts.length) parts.push('Choose "All statuses", clear the search and use all pages to show every row.');
    return parts.join(' ');
  }
  function view(table, query) {
    const q = normalize(table, query);
    const matchesFilter = (row) => q.filter === 'all' || (q.filter === 'attention' ? row.attention : q.filter === 'success' ? row.kind === 'success' : row.status === q.filter);
    const needle = q.search.toLowerCase();
    const matches = (row) => matchesFilter(row) && row.search.includes(needle);
    const eligible = table.rows.filter((row) => !row.attention && matches(row));
    const pages = q.pageSize ? Math.max(1, Math.ceil(eligible.length / q.pageSize)) : 1;
    q.page = Math.min(q.page, pages);
    const onPage = q.pageSize ? eligible.slice((q.page - 1) * q.pageSize, q.page * q.pageSize) : eligible;
    const visible = new Set([...onPage, ...table.rows.filter((row) => row.attention)]);
    const ordered = table.rows.filter((row) => visible.has(row))
      .sort((a, b) => compare(a.values[q.sort.column], b.values[q.sort.column], q.sort.direction) || a.position - b.position);
    const tally = (rows) => Object.fromEntries(statusesOf(table.tableId).map((status) => [status, rows.filter((row) => row.status === status).length]).filter(([, count]) => count > 0));
    const hidden = { statuses: tally(table.rows.filter((row) => !visible.has(row))) };
    hidden.count = table.rows.filter((row) => !visible.has(row)).length;
    const wouldHide = table.rows.filter((row) => row.attention && !matches(row));
    const kept = { count: wouldHide.length, statuses: tally(wouldHide) };
    const counts = statusCounts(table);
    const result = {
      tableId: table.tableId, state: table.state, code: table.code, query: { sort: q.sort, filter: q.filter, search: q.search, page: q.page, pageSize: q.pageSize,
        pages, corrected: q.corrected }, rows: ordered, shown: ordered.length, total: table.total, statusCounts: counts, hidden, keptVisible: kept,
      filterNote: filterNote(table, q, hidden, kept, pages), producerLine: producerLine(table), summary: describe(table, counts, ordered.length)
    };
    result.check = checkView(table, result);
    result.announcement = `${result.check.ok ? '' : `INCONSISTENT VIEW: ${result.check.problems.join('; ')}. `}${result.summary} ${result.filterNote}`.trim();
    return deepFreeze(result);
  }

  // ---- the saved bundle: sets of saved producer outputs -----------------------------------------------------------------------------
  function catalog(bundle) {
    const valid = isPlain(bundle) && bundle.bundleVersion === 1 && bundle.cardId === 'C040' && Array.isArray(bundle.sets);
    const entries = new Map((valid ? bundle.sets : []).filter((set) => isPlain(set) && typeof set.id === 'string').map((set) => [set.id, set]));
    const find = (id) => {
      const set = typeof id === 'string' ? entries.get(id) : undefined;
      if (!set) throw Object.assign(new Error('UNKNOWN_SAVED_SET'), { code: 'UNKNOWN_SAVED_SET' });
      return set;
    };
    return Object.freeze({
      ids: Object.freeze([...entries.keys()]),
      describe(id) {
        const set = find(id);
        const reports = isPlain(set.reports) ? set.reports : {};
        return Object.freeze({ id, role: word(set.role, 'unclassified'), label: word(set.label, id), note: word(set.note, ''),
          origins: Object.freeze(Object.fromEntries(tableIds.map((tableId) => [tableId, isPlain(reports[tableId]) ? reports[tableId].origin ?? null : null]))) });
      },
      // A saved set without a producer output for a table yields a REJECTED table (never an empty one that looks like a pass).
      tables(id) {
        const reports = isPlain(find(id).reports) ? find(id).reports : {};
        return Object.freeze(Object.fromEntries(tableIds.map((tableId) => [tableId, build(tableId, isPlain(reports[tableId]) ? reports[tableId].output : undefined)])));
      }
    });
  }

  return Object.freeze({ banner, NOT_SAVED, tableIds, titles, states, vocabularies, columns, filterOptions, fromCohort, fromEffects, fromLatency, fromReport, view, checkView, catalog });
}));
