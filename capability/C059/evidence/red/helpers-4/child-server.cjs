'use strict';

// Test tooling, not production code: the real service in a child process that the test starts with a small heap and a hard
// external watchdog. It answers IPC probes: memory, open connections, and the event-loop delay measured INSIDE the child.
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { startLocal, closeServer } = process.env.C059_RED_SUBJECT ? require('./old-server-loader.cjs') : require('../../../server.cjs');

async function main() {
  const bounds = JSON.parse(process.argv[2] ?? '{}');
  const server = await startLocal({ bounds });
  const delay = monitorEventLoopDelay({ resolution: 5 });
  delay.enable();
  const connections = () => new Promise((resolve) => server.getConnections((error, count) => resolve(error ? -1 : count)));
  process.on('message', async (message) => {
    if (message.type === 'stats') {
      const memory = process.memoryUsage();
      const reply = { type: 'stats', heapUsed: memory.heapUsed, rss: memory.rss, connections: await connections(), lagMaxMs: delay.max / 1e6 };
      if (message.reset) delay.reset();
      process.send(reply);
    } else if (message.type === 'stop') {
      await closeServer(server);
      process.send({ type: 'closed' });
      process.disconnect();
    }
  });
  process.send({ type: 'listening', port: server.address().port });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
