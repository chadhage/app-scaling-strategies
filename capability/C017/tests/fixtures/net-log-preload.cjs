'use strict';

// Test tooling, not production code: node --require preload for the structural flood test (flood-structural.test.cjs). It records, per
// accepted connection, how many bytes the server READ before the connection closed (a count, never a time), and samples the process CPU
// time (process.cpuUsage(), CPU seconds are not inflated by a loaded machine the way latency is) as append-only lines, so a reader never
// sees a half-written file. C017_NET_LOG and C017_CPU_FILE name the two files.
const fs = require('node:fs');
const net = require('node:net');

const connections = process.env.C017_NET_LOG;
const cpu = process.env.C017_CPU_FILE;

if (connections) {
  const emit = net.Server.prototype.emit;
  net.Server.prototype.emit = function logged(event, socket, ...rest) {
    if (event === 'connection' && socket) {
      // Read at accept time: a socket destroyed before any handler ran (CONNECT, upgrade) has lost its peer address by its close event.
      const { remotePort } = socket;
      socket.once('close', () => {
        fs.appendFileSync(connections, `${JSON.stringify({ remotePort, bytesRead: socket.bytesRead, bytesWritten: socket.bytesWritten })}\n`);
      });
    }
    return emit.call(this, event, socket, ...rest);
  };
}

if (cpu) {
  const sample = () => {
    const usage = process.cpuUsage();
    fs.appendFileSync(cpu, `${JSON.stringify({ cpuMs: Math.round((usage.user + usage.system) / 1000) })}\n`);
  };
  sample();
  setInterval(sample, 50).unref();
}
