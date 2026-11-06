'use strict';

// Test tooling, not production code: a server in its OWN process (started small by child.cjs), with the management seam of the service over IPC (plant, issue a
// token, statistics), and a NAIVE control server (answers 403 and keeps the connection open without reading the body) to compare against under the same load.
// The console of this process is what the server prints: the redacted log lines on stderr.
const http = require('node:http');
const { startLocal } = require('../server.cjs');
const { seedConfig } = require('./canaries.cjs');

const millis = (usage) => (usage.user + usage.system) / 1000;

async function main() {
  const mode = process.env.C014_CHILD_MODE || 'real';
  const limits = process.env.C014_CHILD_LIMITS ? JSON.parse(process.env.C014_CHILD_LIMITS) : undefined;
  const reads = [];
  const open = new Set();
  let server;
  let local = null;
  if (mode === 'naive') {
    server = http.createServer((request, response) => { response.writeHead(403, { 'Content-Length': 2 }); response.end('no'); });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  } else {
    local = await startLocal({ config: seedConfig(), limits, logSink: (line) => process.stderr.write(`${line}\n`) });
    ({ server } = local);
  }
  server.on('connection', (socket) => { open.add(socket); socket.once('close', () => { open.delete(socket); reads.push(socket.bytesRead); }); });
  const connections = () => new Promise((resolve) => server.getConnections((error, count) => resolve(count)));
  // everything read so far from every connection, closed or still open: a control that has consumed what it was sent has read at least that much
  const readTotal = () => reads.reduce((sum, bytes) => sum + bytes, 0) + [...open].reduce((sum, socket) => sum + socket.bytesRead, 0);
  process.on('message', async (message) => {
    try {
      let result = null;
      if (message.op === 'plant') local.service.plant(message.place, message.value);
      else if (message.op === 'issueToken') result = local.service.issueToken(message.identity, message.options);
      else if (message.op === 'stats') result = { cpuMs: millis(process.cpuUsage()), heapBytes: process.memoryUsage().heapUsed, connections: await connections(), reads: [...reads], readTotal: readTotal() };
      else if (message.op === 'close') {
        if (local) await local.close(); else server.close();
        process.exit(0);
      }
      process.send({ type: 'answer', id: message.id, result });
    } catch (error) {
      process.send({ type: 'answer', id: message.id, error: String(error && error.code || 'ERROR') });
    }
  });
  process.send({ type: 'listening', port: server.address().port });
}

main().catch((error) => { process.stderr.write(`child failed: ${error && error.code}\n`); process.exit(1); });
