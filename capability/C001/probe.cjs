'use strict';

const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { guardOperation } = require('./contract-guard.js');

const sourcePath = resolve(__dirname, '..', '..', '.docs', 'wiki', 'flow-state.json');

async function evaluateCurrentApproval(action, readSource = () => readFileSync(sourcePath, 'utf8')) {
  let state;
  try {
    state = JSON.parse(readSource());
  } catch (error) {
    const decision = await guardOperation(action, undefined);
    const reason = Object.freeze({
      code: error instanceof SyntaxError ? 'SOURCE_INVALID_JSON' : 'SOURCE_UNAVAILABLE',
      message: 'Cannot read current approvals.C001 from .docs\\wiki\\flow-state.json; all operations are denied.'
    });
    return Object.freeze({ ...decision, reasons: Object.freeze([reason, ...decision.reasons]) });
  }
  return guardOperation(action, state && state.approvals && state.approvals.C001);
}

if (require.main === module) {
  (async () => {
    let decision;
    if (process.argv.length !== 3) {
      const denied = await guardOperation(undefined, undefined);
      decision = {
        ...denied,
        reasons: [{
          code: 'INVALID_ARGUMENTS',
          message: 'Supply exactly one action; approval overrides and target arguments are not accepted.'
        }, ...denied.reasons]
      };
    } else {
      decision = await evaluateCurrentApproval(process.argv[2]);
    }
    console.log(JSON.stringify(decision, null, 2));
    process.exitCode = decision.allowed ? 0 : 1;
  })().catch(() => {
    console.error(JSON.stringify({ allowed: false, executed: false, reasons: [{ code: 'PROBE_FAILURE', message: 'Local probe failed closed.' }] }));
    process.exitCode = 1;
  });
}

module.exports = Object.freeze({ evaluateCurrentApproval });
