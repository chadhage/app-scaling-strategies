'use strict';

// Test tooling, not production code: a real server process for the restart tests (fixture consent and context, real timers).
// node fixture-server.cjs <persistDir> [epoch]
const { makePersisted, makeState } = require('../../C015/contract.cjs');
const { createRun } = require('../run.cjs');
const { createLocalServer } = require('../server.cjs');

const persistDir = process.argv[2];
const epoch = Number(process.argv[3] || 3);
const persisted = makePersisted(makeState('synthetic-run-001', epoch), null);
const context = { origin: 'injected-fixture', runId: 'synthetic-run-001', epoch, stateSha256: persisted.stateSha256 };

try {
  const run = createRun({ context, persistDir, intervalMs: 8, totalSteps: 400, replayWindow: 64 });
  const server = createLocalServer({ run, heartbeatMs: 1000 });
  server.listen(0, '127.0.0.1', () => {
    console.log(JSON.stringify({ event: 'listening', pid: process.pid, origin: `http://127.0.0.1:${server.address().port}` }));
  });
} catch (error) {
  console.error(`${error.code || 'ERROR'}: ${error.message}`);
  process.exitCode = 1;
}
