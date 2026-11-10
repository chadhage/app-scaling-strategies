'use strict';

// Test tooling (a MEASUREMENT TOOL, not a suite: it is not in the GREEN command and no test runs it): the real service in a child process with a capped heap, for the cost of a pending first request
// (review Q2 and D4). argv[2] = 'hold' keeps every step pending (a request that stays in flight), 'free' lets them complete. Adapted from the independent reviewer's probe (f24-child.cjs).
// It reports to its parent through IPC: 'stats' (live heap after a forced GC, resident set, connections, requests Node parsed, the cap read back, the sockets accepted and dropped at accept).
const path = require('node:path');
const { closeServer, startLocal } = require('./subject.cjs').load('server.cjs');

const hold = process.argv[2] === 'hold';

(async () => {
  let release;
  const held = new Promise((resolve) => { release = resolve; });
  let entered = 0;
  let seen = 0;
  let accepted = 0;
  const server = await startLocal({ executor: async () => { entered += 1; if (hold) await held; } });
  server.prependListener('request', () => { seen += 1; });
  server.on('connection', () => { accepted += 1; });
  process.on('message', async (message) => {
    if (message.type === 'stats') {
      if (global.gc) global.gc();
      const memory = process.memoryUsage();
      server.getConnections((error, count) => process.send({ type: 'stats', heapUsed: memory.heapUsed, rss: memory.rss, connections: error ? -1 : count, entered, seen, accepted, maxConnections: server.maxConnections }));
    } else if (message.type === 'release') {
      release();
      process.send({ type: 'released' });
    } else if (message.type === 'stop') {
      release();
      await closeServer(server);
      process.send({ type: 'closed' });
      process.disconnect();
    }
  });
  process.send({ type: 'listening', port: server.address().port, file: path.basename(__filename) });
})().catch((error) => { console.error(error); process.exitCode = 1; });
