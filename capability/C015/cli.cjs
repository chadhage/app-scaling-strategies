'use strict';

const { persist, restore } = require('./store.cjs');
const { makeState, fail } = require('./contract.cjs');
const { demoNamespace } = require('./paths.cjs');

(async () => {
  const [action, runId, epoch, ...extra] = process.argv.slice(2);
  let result;
  if (extra.length || !['write', 'read'].includes(action)) fail('INVALID_ARGUMENTS', 'Use only write RUN_ID EPOCH or read RUN_ID. No paths, approval overrides or cloud operations.');
  if (action === 'write' && /^[123]$/.test(epoch)) {
    result = await persist(demoNamespace, makeState(runId, Number(epoch)));
  } else if (action === 'read' && epoch === undefined) {
    result = await restore(demoNamespace, runId);
  } else {
    fail('INVALID_ARGUMENTS', 'Closed synthetic run IDs and exact integer epochs 1, 2 or 3 are required.');
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
})().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: 1, mode: 'actual-local-filesystem', acknowledged: false,
    restored: false, code: error.code || 'CLI_FAILURE', message: error.message,
    details: error.details || [], pid: process.pid,
  })}\n`);
  process.exitCode = 1;
});
