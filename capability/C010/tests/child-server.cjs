'use strict';

// Test tooling, not production code: a server in a child process. Modes: 'service' (the real C010 server in the config the parent names),
// 'bare' (a reference that only answers 400 with Connection: close and destroys the socket once the answer is flushed: the platform cost of a
// refusal), 'naive' (the same answer but the connection is kept alive and keeps being read: the defect the refusal rule exists to prevent, the
// CONTROL a flood test must fail on). It answers IPC probes: heap, open connections, CPU time, bytes read from every closed socket, and the
// event-loop delay measured INSIDE it (reported, never asserted).
const crypto = require('node:crypto');
const http = require('node:http');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { startLocal } = require('../server.cjs');
const { appOptions } = require('./targets.cjs');

const [configName = 'default', mode = 'service'] = process.argv.slice(2);

async function startReference() {
  const server = http.createServer((request, response) => {
    // oracle-naive: a server whose answer for a FOREIGN lease costs more work than the same answer for an absent one (the timing oracle a naive
    // implementation has: a lookup that finds the lease, a check, a log line). The service must show no such difference.
    if (mode === 'oracle-naive' && request.url.startsWith('/v1/leases/lease-aaaaaaaaaaaaaaaa')) crypto.scryptSync('x', 'y', 16, { N: 1024 });
    const body = Buffer.from('{"error":"refused"}');
    if (mode === 'bare' || mode === 'oracle-naive') response.once('finish', () => request.socket.destroy());
    response.writeHead(mode === 'oracle-naive' ? 404 : 400, { 'Content-Type': 'application/json', 'Content-Length': body.length, ...(mode === 'bare' || mode === 'oracle-naive' ? { Connection: 'close' } : {}) });
    response.end(body);
  });
  server.maxConnections = 1024;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, tokens: {}, stop: async () => { server.close(); server.closeAllConnections(); } };
}

async function startService() {
  // mode 'hold': every mutation waits in the commit hook until the parent sends 'release': the request that stays PENDING while others are pipelined behind it.
  let release = () => {};
  const gate = new Promise((resolve) => { release = resolve; });
  const options = appOptions(configName);
  if (mode === 'hold') options.hooks = { beforeCommit: () => gate };
  const local = await startLocal(options);
  const tokens = { ...local.tokens, expired: local.app.issueToken('conductor-b', { ttlMs: 1 }) };
  await new Promise((resolve) => setTimeout(resolve, 20));
  return { server: local.app.server, tokens, stop: () => local.close(), release };
}

async function main() {
  const { server, tokens, stop, release } = mode === 'service' || mode === 'hold' ? await startService() : await startReference();
  const delay = monitorEventLoopDelay({ resolution: 5 });
  delay.enable();
  let bytesRead = 0;
  server.on('connection', (socket) => socket.once('close', () => { bytesRead += socket.bytesRead; }));
  const connections = () => new Promise((resolve) => server.getConnections((error, count) => resolve(error ? -1 : count)));
  process.on('message', async (message) => {
    if (message.type === 'stats') {
      if (global.gc) global.gc();
      const memory = process.memoryUsage();
      const cpu = process.cpuUsage();
      const reply = { type: 'stats', heapUsed: memory.heapUsed, rss: memory.rss, connections: await connections(), lagMaxMs: delay.max / 1e6, cpuMicros: cpu.user + cpu.system, bytesRead };
      if (message.reset) delay.reset();
      process.send(reply);
    } else if (message.type === 'release') {
      release?.();
      process.send({ type: 'released' });
    } else if (message.type === 'stop') {
      await stop();
      process.send({ type: 'closed' });
      process.disconnect();
    }
  });
  process.send({ type: 'listening', port: server.address().port, tokens });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
