'use strict';

// Loadable ORIGINAL stub, intentionally naive (archived before tables.js existed): a success-first inspector that
// drops what it does not understand, de-duplicates by id, lets a status filter hide failures, counts only the rows it
// holds and calls an empty set a pass. It exists so that the RED run fails on behavior, never on a missing module.
const clean = new Set(['ACTUAL_TRANSITION', 'UNCHANGED', 'NOT_TRANSITIONED_YET', 'ONE_APPLICATION', 'PASS']);
const effectStatus = { ONE_APPLICATION: 'ONE_INTENDED_EFFECT', DUPLICATE_APPLICATION: 'DUPLICATE' };
const columns = (keys) => keys.map((key) => ({ key, label: key }));

function table(tableId, rows) {
  const seen = new Set();
  const kept = rows.filter((row) => row.status && !seen.has(row.id) && seen.add(row.id));
  return { tableId, state: kept.length ? 'COMPLETE' : 'EMPTY', rows: kept.map((row, index) => ({ ...row, position: index + 1 })),
    columns: columns(['position', 'id', 'status']) };
}
function fromCohort(report) {
  return table('cohort', report.clients.map((client) => {
    const status = client.classification === 'FAILED_OR_UNKNOWN' ? client.failureKind : client.classification;
    const known = ['ACTUAL_TRANSITION', 'UNCHANGED', 'NOT_TRANSITIONED_YET', 'FAILED', 'UNKNOWN'].includes(status) ? status : null;
    return { id: client.clientId, status: known, kind: clean.has(known) ? 'success' : 'failed', attention: false, flags: [], text: {}, values: {} };
  }));
}
function fromEffects(report) {
  return table('effect', report.originals.flatMap((original) => original.effects.map((effect) => ({
    id: `${original.originalId} / ${effect.effectKey}`, status: effectStatus[effect.status] || null, kind: 'success', attention: false,
    flags: [], text: { effectKey: effect.effectKey.slice(0, 12) }, values: { lower: effect.confirmedApplicationsLowerBound } }))));
}
function fromLatency(report) {
  return table('latency', report.originals.map((original) => ({
    id: original.attemptId, status: original.verdict === 'PASS' ? 'WITHIN' : null, kind: 'success', attention: false, flags: [],
    text: {}, values: { budget: original.budgetMs } })));
}
function view(current, query = {}) {
  const only = query.filter === 'success' ? current.rows.filter((row) => clean.has(row.status) || row.status === 'WITHIN') : current.rows;
  const counts = {};
  for (const row of only) counts[row.status] = (counts[row.status] || 0) + 1;
  const sorted = query.sort ? [...only].sort((a, b) => String(a[query.sort.column]).localeCompare(String(b[query.sort.column]))) : only;
  return { tableId: current.tableId, state: current.state, rows: sorted, shown: sorted.length, total: sorted.length, statusCounts: counts,
    summary: sorted.length ? `${sorted.length} rows` : 'All passed: 100%', filterNote: '', hidden: { count: 0, statuses: {} },
    keptVisible: { count: 0, statuses: {} }, announcement: `${sorted.length} rows` };
}
module.exports = Object.freeze({ fromCohort, fromEffects, fromLatency, view });
