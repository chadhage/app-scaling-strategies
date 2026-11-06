'use strict';

const c015 = require('../C015/store.cjs');
const { canonical, makeState } = require('../C015/contract.cjs');

const known = Object.freeze({ namespace: 'synthetic-restart-v1', runId: 'synthetic-run-001' });

// The attribution context of the stream is the run and epoch that C015's public restore actually reads back:
// read-only, verified immutable files, no write. Nothing here is supplied by a caller or a browser.
async function readContext() {
  const receipt = await c015.restore(known.namespace, known.runId);
  const state = receipt && receipt.state;
  const valid = receipt && receipt.restored === true && receipt.writesPerformed === 0 && state && state.runId === known.runId
    && /^[0-9a-f]{64}$/.test(receipt.stateSha256) && canonical(state) === canonical(makeState(state.runId, state.epoch));
  if (!valid) throw Object.assign(new Error('ACTUAL_KNOWN_C015_CONTEXT_REQUIRED'), { code: 'ACTUAL_KNOWN_C015_CONTEXT_REQUIRED' });
  return { origin: 'actual-C015-public-restore-read-only', runId: state.runId, epoch: state.epoch, stateSha256: receipt.stateSha256 };
}

module.exports = Object.freeze({ readContext, known });
