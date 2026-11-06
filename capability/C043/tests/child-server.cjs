'use strict';

// Test tooling, not production code: runs the real service in a child process that the test starts with a small heap
// and a hard external timeout, measures its own event-loop delay and answers IPC probes (memory, open connections,
// event-loop lag, graceful stop).
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { closeServer, composeService, createLocalServer } = require('../server.cjs');
const { createMemoryIo } = require('../../C042/journal.cjs');
const { produceTranscript } = require('../transcript.cjs');

async function main() {
  const bounds = JSON.parse(process.argv[2] ?? '{}');
  const { engine, runner } = await composeService({ stepIo: createMemoryIo(), runIo: createMemoryIo(), clock: () => 0 });
  const server = createLocalServer({ engine, runner, transcript: produceTranscript, bounds });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const lag = monitorEventLoopDelay({ resolution: 10 });
  lag.enable();
  const connections = () => new Promise((resolve) => server.getConnections((error, count) => resolve(error ? -1 : count)));
  process.on('message', async (message) => {
    if (message.type === 'stats') {
      const memory = process.memoryUsage();
      process.send({ type: 'stats', heapUsed: memory.heapUsed, rss: memory.rss, connections: await connections(), lagMaxMs: lag.max / 1e6 });
    } else if (message.type === 'reset') {
      lag.reset();
      process.send({ type: 'reset' });
    } else if (message.type === 'stop') {
      await closeServer(server);
      process.send({ type: 'closed' });
      process.disconnect();
    }
  });
  process.send({ type: 'listening', port: server.address().port });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
