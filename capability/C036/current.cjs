'use strict';

const { restore } = require('..\\C015\\store.cjs');
const { canonical, makeState } = require('..\\C015\\contract.cjs');
const historical = require('..\\C034\\historical.cjs');
const trace = require('..\\C034\\trace.js');
const { checkImports, readGates } = require('./pins.cjs');

async function readCurrent() {
  if (arguments.length) throw Object.assign(new Error('NO_CURRENT_CONTEXT_OVERRIDES'), { code: 'NO_CURRENT_CONTEXT_OVERRIDES' });
  const dependencies = checkImports();
  const gates = readGates();
  const source = historical.readHistorical().source;
  for (const id of trace.ids) {
    const inspected = trace.inspectSaved(id);
    if (!inspected.valid || inspected.identityVerified !== false || inspected.actualRunCorrelation !== false) {
      throw Object.assign(new Error('UNCHANGED_UNLINKED_C034_REQUIRED'), { code: 'UNCHANGED_UNLINKED_C034_REQUIRED' });
    }
  }
  const readStartedAtUtc = new Date().toISOString();
  const receipt = await restore('synthetic-restart-v1', 'synthetic-run-001');
  if (receipt.restored !== true || receipt.writesPerformed !== 0 || receipt.state.runId !== 'synthetic-run-001' ||
      canonical(receipt.state) !== canonical(makeState(receipt.state.runId, receipt.state.epoch))) {
    throw Object.assign(new Error('ACTUAL_KNOWN_C015_CONTEXT_REQUIRED'), { code: 'ACTUAL_KNOWN_C015_CONTEXT_REQUIRED' });
  }
  return {
    contextOrigin: 'actual-C015-public-restore-read-only', readStartedAtUtc,
    readCompletedAtUtc: new Date().toISOString(), receipt, gates,
    source, directDependenciesVerified: dependencies.direct.length,
    underlyingC034DependenciesVerified: dependencies.unchangedC034Underlying.length,
    association: 'C015 fixture association only; no authenticated C034 client/run/user/lease/epoch link',
    nativeCorrelationVerified: false, authenticatedIdentityVerified: false, leaseAuthority: false
  };
}
module.exports = Object.freeze({ readCurrent });
