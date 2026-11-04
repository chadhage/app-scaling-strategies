'use strict';

const { reopen } = require('./reader.cjs');

(async () => {
  if (process.argv.length !== 4) {
    const error = new Error('Supply exactly an explicit namespace and run ID.');
    error.code = 'INVALID_ARGUMENTS';
    throw error;
  }
  const receipt = await reopen(process.argv[2], process.argv[3]);
  process.stdout.write(`${JSON.stringify(receipt)}\n`);
})().catch((error) => {
  process.stderr.write(`${JSON.stringify({
    restored: false, code: error.code || 'READER_FAILURE',
    message: error.message, details: error.details || [], pid: process.pid,
  })}\n`);
  process.exitCode = 1;
});
