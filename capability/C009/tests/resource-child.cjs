'use strict';

// Test tooling, not production code: a disposable server process for the resource-bound probes. Start it with a small heap and
// --expose-gc. It runs the real CLI startLocal (consent fixture injected) and answers 'stats' (retained heap after a forced GC)
// and 'close' (the very shutdown the CLI signal handlers run). Its exit by itself proves that nothing kept the process alive.
const approved = require('../../C001/approved-contract.js').approval;
const { load } = require('./helpers.cjs');

const { startLocal } = load('cli.cjs');

startLocal({ readApproval: () => approved, lifetimeMs: 120000 }).then((local) => {
  process.on('message', (message) => {
    if (message === 'stats') {
      global.gc();
      process.send({ type: 'stats', heapUsed: process.memoryUsage().heapUsed });
    } else if (message === 'close') {
      local.close().then(() => process.send({ type: 'closed' }, () => process.disconnect()));
    }
  });
  process.send({ type: 'listening', port: local.server.address().port, tokens: local.tokens });
});
