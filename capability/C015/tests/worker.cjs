'use strict';

const { persist, restore } = require('..\\store.cjs');
const { makeState } = require('..\\contract.cjs');

(async () => {
  const [action, namespace, runId, epoch, fault] = process.argv.slice(2);
  let result;
  if (action === 'write' && epoch !== undefined && fault === undefined) {
    result = await persist(namespace, makeState(runId, Number(epoch)));
  } else if (action === 'read' && epoch === undefined) {
    result = await restore(namespace, runId);
  } else if (action === 'fail' && epoch !== undefined && fault !== undefined) {
    result = await persist(namespace, makeState(runId, Number(epoch)), { testFault: fault });
  } else {
    throw Object.assign(new Error('Closed worker arguments required.'), { code: 'INVALID_ARGUMENTS' });
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
})().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    schemaVersion: 1, acknowledged: false, restored: false, pid: process.pid,
    code: error.code || 'WORKER_FAILURE', message: error.message, details: error.details || [],
  })}\n`);
  process.exitCode = 1;
});
