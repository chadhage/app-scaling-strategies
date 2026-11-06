'use strict';

// Test tooling, not production code: runs the real service in a child process that the test starts with a small heap
// and a hard external timeout, and answers IPC probes (memory, open connections, graceful stop).
const { delayExecutor, openEngine } = require('../engine.cjs');
const { createMemoryIo } = require('../journal.cjs');
const { closeServer, createLocalServer } = require('../server.cjs');
const { produceTranscript } = require('../transcript.cjs');

async function main() {
  const settleMs = Number(process.argv[2] ?? 0);
  const bounds = JSON.parse(process.argv[3] ?? '{}');
  const engine = await openEngine({ io: createMemoryIo(), executor: settleMs > 0 ? delayExecutor(settleMs) : undefined });
  const server = createLocalServer({ engine, transcript: produceTranscript, bounds });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const connections = () => new Promise((resolve) => server.getConnections((error, count) => resolve(error ? -1 : count)));
  process.on('message', async (message) => {
    if (message.type === 'stats') {
      const memory = process.memoryUsage();
      process.send({ type: 'stats', heapUsed: memory.heapUsed, rss: memory.rss, connections: await connections() });
    } else if (message.type === 'stop') {
      await closeServer(server);
      process.send({ type: 'closed' });
      process.disconnect();
    }
  });
  process.send({ type: 'listening', port: server.address().port });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
