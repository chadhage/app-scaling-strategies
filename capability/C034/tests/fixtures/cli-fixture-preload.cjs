'use strict';

// Preload for k-c034-cli.test.cjs. The real command line runs with hermetic collaborators: gates and the C015 receipt come from
// fixtures built from the saved trace (no live ledger, consent or C015 storage), and C034_K_MODE selects one fault to inject.
const path = require('node:path');
const Module = require('node:module');
const childProcess = require('node:child_process');

const root = path.resolve(__dirname, '..', '..');
const keyOf = (...parts) => path.join(root, ...parts);
const mode = process.env.C034_K_MODE;
const id = process.argv[3];
const replace = (file, exports) => {
  const stub = new Module(file);
  stub.filename = file;
  stub.loaded = true;
  stub.exports = exports;
  require.cache[file] = stub;
};

const trace = require(keyOf('trace.js'));
const pinsApi = require(keyOf('pins.cjs'));
const { makeState } = require(path.resolve(root, '..', 'C015', 'contract.cjs'));
const realExecFileSync = childProcess.execFileSync;
const gates = {
  observedAtUtc: '2026-11-04T00:00:00.000Z', readerPid: 1, ledgerRevision: 1,
  cards: ['C020', 'C015', 'C033'].map((card) => ({
    id: card, state: 'Done', publication: structuredClone(pinsApi.pins.accepted[card]),
    reviewCommit: pinsApi.pins.accepted[card].commit, reviewTag: pinsApi.pins.accepted[card].tag,
    accepted: true, focusedTestsPassed: true, browserObserved: true, remoteVerified: true
  }))
};
childProcess.execFileSync = (command, args, options) => (command === 'pwsh.exe' ? Buffer.from(JSON.stringify(gates)) : realExecFileSync(command, args, options));

const receipt = structuredClone(trace.getSavedTrace(id).context.receipt);
if (mode === 'stale-state') receipt.state = makeState(receipt.state.runId, receipt.state.epoch === 2 ? 1 : 2);
if (mode === 'stale-sha') receipt.stateSha256 = 'f'.repeat(64);
if (mode === 'stale-ack') receipt.acknowledgment = { ...receipt.acknowledgment, published: false };
replace(path.resolve(root, '..', 'C015', 'store.cjs'), Object.freeze({
  persist: async () => { throw new Error('The command line is read-only.'); },
  restore: async () => receipt
}));

const historical = require(keyOf('historical.cjs'));
if (mode === 'source-mismatch') {
  replace(keyOf('historical.cjs'), Object.freeze({
    ...historical,
    readHistorical: () => {
      const real = historical.readHistorical();
      return { ...real, observations: real.observations.map((entry) => (entry.id === id ? { ...entry, snapshot: { ...entry.snapshot, changedByFixture: true } } : entry)) };
    }
  }));
}
if (mode === 'plain-error') {
  replace(keyOf('historical.cjs'), Object.freeze({ ...historical, readContext: async () => { throw new Error('plain failure'); } }));
}
if (mode === 'invalid-inspection') {
  replace(keyOf('trace.js'), Object.freeze({ ...trace, inspectSaved: () => ({ valid: false, code: 'FIXTURE_INVALID_INSPECTION' }) }));
}
