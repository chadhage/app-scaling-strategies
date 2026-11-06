'use strict';

// Test tooling, not production code: a disposable server process for the resource-bound probes. Start it with a small heap and
// --expose-gc. It runs the real CLI startLocal (consent fixture injected) and answers 'stats' (retained heap after a forced GC)
// and 'close' (the very shutdown the CLI signal handlers run). Its exit by itself proves that nothing kept the process alive.
const approved = require('../../C001/approved-contract.js').approval;
const { load } = require('./helpers.cjs');

const { startLocal } = load('cli.cjs');

startLocal({ readApproval: () => approved, lifetimeMs: 120000 }).then((local) => {
  let accepted = 0;
  local.server.on('connection', () => { accepted += 1; });
  process.on('message', (message) => {
    if (message === 'stats') {
      global.gc();
      process.send({ type: 'stats', heapUsed: process.memoryUsage().heapUsed, accepted });
    } else if (message === 'retain') {
      // The negative control of the settled reading: memory the server really keeps must still be seen.
      global.retained = [];
      while (process.memoryUsage().heapUsed < 33 * 1024 * 1024) {
        for (let index = 0; index < 2000; index += 1) global.retained.push({ index, pad: 'x'.repeat(24) });
      }
      process.send({ type: 'retained' });
    } else if (message === 'close') {
      local.close().then(() => process.send({ type: 'closed' }, () => process.disconnect()));
    }
  });
  process.send({ type: 'listening', port: local.server.address().port, tokens: local.tokens });
});
