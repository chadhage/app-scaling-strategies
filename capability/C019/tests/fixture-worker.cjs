'use strict';

const { persist, restore } = require('..\\..\\C015\\store.cjs');
const { FixtureError, makeState } = require('..\\..\\C015\\contract.cjs');
const { knownCodes } = require('..\\errors.js');
const epochValues = Object.freeze({ '1': 1, '2': 2, '3': 3 });

(async () => {
  const [action, namespace, runId, epoch, fault, ...extra] = process.argv.slice(2);
  if (extra.length || typeof namespace !== 'string' ||
      !/^test-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(namespace)) {
    throw new TypeError('Exact owned test fixture arguments are required.');
  }
  let result;
  if (action === 'read' && epoch === undefined && fault === undefined) {
    result = await restore(namespace, runId);
  } else if (action === 'setup' && Object.hasOwn(epochValues, epoch) && fault === undefined) {
    result = await persist(namespace, makeState(runId, epochValues[epoch]));
  } else if (action === 'fault' && Object.hasOwn(epochValues, epoch) &&
      ['after-partial-write', 'after-flush', 'after-publish'].includes(fault)) {
    result = await persist(namespace, makeState(runId, epochValues[epoch]), { testFault: fault });
  } else if (action === 'invalid-epoch' && epoch === undefined && fault === undefined) {
    result = await persist(namespace, { ...makeState(runId, 1), epoch: '2' });
  } else if (action === 'invalid-shape' && epoch === undefined && fault === undefined) {
    result = await persist(namespace, { ...makeState(runId, 1), unexpected: true });
  } else {
    throw new TypeError('Closed fixture action arguments are required.');
  }
  process.stdout.write(JSON.stringify(result) + '\n');
})().catch((error) => {
  const code = error instanceof FixtureError && knownCodes.includes(error.code) ? error.code : 'UNRECOGNIZED_ERROR';
  process.stderr.write(JSON.stringify({
    schemaVersion: 1, api: 'unchanged-C015-public-store', pid: process.pid,
    acknowledged: false, restored: false, code,
    errorType: code === 'UNRECOGNIZED_ERROR' ? null : 'C015FixtureError',
    rawExceptionTextRetained: false,
  }) + '\n');
  process.exitCode = 1;
});
