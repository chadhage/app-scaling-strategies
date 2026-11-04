'use strict';

const source = require('./source.cjs');
async function readCurrent() {
  if (arguments.length) throw Object.assign(new Error('NO_CURRENT_CONTEXT_OVERRIDES'), { code: 'NO_CURRENT_CONTEXT_OVERRIDES' });
  const dependencies = source.checkImports();
  const gates = source.readGates();
  source.checkGates(gates);
  const { restore } = require('..\\C015\\store.cjs');
  const { makeState, canonical, digest } = require('..\\C015\\contract.cjs');
  const readStartedAtUtc = new Date().toISOString();
  const receipt = await restore('synthetic-restart-v1', 'synthetic-run-001');
  if (receipt.restored !== true || receipt.writesPerformed !== 0 ||
      canonical(receipt.state) !== canonical(makeState('synthetic-run-001', receipt.state.epoch)) ||
      digest(receipt.state) !== receipt.stateSha256 || receipt.acknowledgment.stateSha256 !== receipt.stateSha256 ||
      receipt.acknowledgment.kind !== 'local-file-write-receipt') {
    throw Object.assign(new Error('ACTUAL_C015_CLOSED_RESTORE_REQUIRED'), { code: 'ACTUAL_C015_CLOSED_RESTORE_REQUIRED' });
  }
  return {
    origin: 'ACTUAL_CURRENT_NODE_C015_PUBLIC_RESTORE_READ_ONLY', readStartedAtUtc,
    readCompletedAtUtc: new Date().toISOString(), receipt,
    closedRecordStatuses: [1, 2, 3].map((epoch) => makeState('synthetic-run-001', epoch).record.status),
    C015Cancellation: 'UNSUPPORTED: no cancelled record, cancel command or cancel terminal acknowledgment',
    C017Cancellation: 'NOT DONE; no native/auth/lease/worker-queue authority',
    sourceAssociation: 'Current C015 fixture context only; not association to historical C029 client originals or MODELED controls',
    directDependenciesVerified: dependencies.direct.length,
    underlyingC029PinsVerified: dependencies.unchangedC029Underlying.length,
    currentGateObservation: { ledgerRevision: gates.ledgerRevision, observedAtUtc: gates.observedAtUtc, readerPid: gates.readerPid },
    actualCancellationPerformed: false, actualCleanupPerformed: false, externalUndoVerified: false,
    authenticatedCurrentAssociation: false, sourceWrites: 0
  };
}
module.exports = Object.freeze({ readCurrent });
