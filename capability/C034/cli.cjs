'use strict';

const trace = require('./trace.js');
const historical = require('./historical.cjs');
(async () => {
  const [action, id, ...extra] = process.argv.slice(2);
  if (action !== 'inspect' || !trace.ids.includes(id) || extra.length) {
    throw Object.assign(new Error('Use inspect closed-history or inspect held-snapshot; no paths, targets, headers or approval inputs.'), { code: 'CLOSED_INSPECTION_ARGUMENTS' });
  }
  const original = historical.readHistorical();
  const stored = trace.getSavedTrace(id);
  const source = original.observations.find((entry) => entry.id === id);
  if (trace.canonical(stored.snapshot) !== trace.canonical(source.snapshot)) throw Object.assign(new Error('Saved snapshot no longer matches exact pinned source.'), { code: 'SAVED_SOURCE_MISMATCH' });
  const current = await historical.readContext();
  if (trace.canonical(current.receipt.state) !== trace.canonical(stored.context.receipt.state) ||
      current.receipt.stateSha256 !== stored.context.receipt.stateSha256 ||
      trace.canonical(current.receipt.acknowledgment) !== trace.canonical(stored.context.receipt.acknowledgment)) {
    throw Object.assign(new Error('Actual known C015 context is missing or stale; never adopt imported context.'), { code: 'CONTEXT_MISMATCH_OR_STALE' });
  }
  const inspected = trace.inspectSaved(id);
  if (!inspected.valid) throw Object.assign(new Error(inspected.code), { code: inspected.code });
  console.log(JSON.stringify({
    cardId: 'C034', inspection: inspected.inspection, traceId: id,
    originals: inspected.attempts.map(({ attemptId, classification, requests, responses, observedVersions }) =>
      ({ attemptId, classification, requests, responses, observedVersions })),
    actualReadOnlyC015Context: {
      readerPid: current.receipt.pid, runId: current.receipt.state.runId, epoch: current.receipt.state.epoch,
      record: current.receipt.state.record, writesPerformed: current.receipt.writesPerformed,
      association: current.association
    },
    liveRunAdopted: false, approvalAdopted: false, identityVerified: false,
    actualRunCorrelation: false, migrationQualified: false, fullJourneyQualified: false,
    nativeTransportQualified: false, productionRuntimeValidated: false
  }, null, 2));
})().catch((error) => {
  console.error(JSON.stringify({ cardId: 'C034', valid: false, code: error.code || 'INSPECTION_UNAVAILABLE', liveRunAdopted: false, approvalAdopted: false, identityVerified: false }));
  process.exitCode = 1;
});
