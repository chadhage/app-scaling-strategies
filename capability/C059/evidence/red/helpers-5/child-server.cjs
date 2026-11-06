'use strict';

// Test tooling, not production code: a server in a child process that the test starts with a small heap and a hard external watchdog.
// mode 'service' (default): the real C059 service. mode 'bare': a reference that only answers 400, says Connection: close and destroys the
// socket once the answer is flushed (the platform cost of a refusal, none of C059's logic). mode 'naive': the same answer but the connection is
// kept alive and keeps being read (the defect the refusal rule exists to prevent: the CONTROL a flood test must fail on).
// It answers IPC probes: memory, open connections, CPU time, the bytes read from every closed socket, and the event-loop delay measured INSIDE it.
const http = require('node:http');
const { monitorEventLoopDelay } = require('node:perf_hooks');
const { startLocal, closeServer } = require('../../../server.cjs');

const mode = process.argv[3] ?? 'service';

async function startReference() {
  const server = http.createServer((request, response) => {
    const body = Buffer.from('{"error":"refused"}');
    if (mode === 'bare') response.once('finish', () => request.socket.destroy());
    response.writeHead(400, { 'Content-Type': 'application/json', 'Content-Length': body.length, ...(mode === 'bare' ? { Connection: 'close' } : {}) });
    response.end(body);
  });
  server.maxConnections = 1024;
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return server;
}

async function main() {
  const bounds = JSON.parse(process.argv[2] ?? '{}');
  const server = mode === 'service' ? await startLocal({ bounds }) : await startReference();
  const delay = monitorEventLoopDelay({ resolution: 5 });
  delay.enable();
  let bytesRead = 0;
  server.on('connection', (socket) => socket.once('close', () => { bytesRead += socket.bytesRead; }));
  const connections = () => new Promise((resolve) => server.getConnections((error, count) => resolve(error ? -1 : count)));
  process.on('message', async (message) => {
    if (message.type === 'stats') {
      const memory = process.memoryUsage();
      const cpu = process.cpuUsage();
      const reply = { type: 'stats', heapUsed: memory.heapUsed, rss: memory.rss, connections: await connections(), lagMaxMs: delay.max / 1e6, cpuMicros: cpu.user + cpu.system, bytesRead };
      if (message.reset) delay.reset();
      process.send(reply);
    } else if (message.type === 'stop') {
      if (mode === 'service') await closeServer(server);
      else { server.close(); server.closeAllConnections(); }
      process.send({ type: 'closed' });
      process.disconnect();
    }
  });
  process.send({ type: 'listening', port: server.address().port });
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
