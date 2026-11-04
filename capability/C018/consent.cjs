'use strict';

const { requireCurrentConsent } = require('..\\C015\\consent.cjs');
const { evaluateCurrentApproval } = require('..\\C001\\probe.cjs');
const { ReaderError } = require('./process-reader.cjs');

async function probeBeforeListener() {
  const current = await requireCurrentConsent();
  const probe = await evaluateCurrentApproval('local.probe',
    () => JSON.stringify({ approvals: { C001: current.C001 } }));
  if (probe.allowed !== true || probe.executed !== false) {
    throw new ReaderError('C001_LOCAL_PROBE_DENIED', 'Current mutex-read C001 local.probe denied listener startup.', probe.reasons);
  }
  return probe;
}

module.exports = Object.freeze({ probeBeforeListener });
