'use strict';

const { persist } = require('..\\..\\C015\\store.cjs');
const { makeState } = require('..\\..\\C015\\contract.cjs');

(async () => {
  const [namespace, runId, epoch, fault, ...extra] = process.argv.slice(2);
  if (extra.length || !/^[123]$/.test(epoch)) throw new Error('Explicit closed fixture setup arguments required.');
  const receipt = await persist(namespace, makeState(runId, Number(epoch)),
    fault === undefined ? {} : { testFault: fault });
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
})().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    acknowledged: false, code: error.code || 'FIXTURE_SETUP_FAILURE',
    message: error.message, details: error.details || [], pid: process.pid,
  })}\n`);
  process.exitCode = 1;
});
