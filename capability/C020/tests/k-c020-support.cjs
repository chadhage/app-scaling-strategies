'use strict';

const net = require('node:net');
const path = require('node:path');

// K_C020_NAMESPACE_ROOT is read only by the mutation check, which aims these tests at a private copy of the namespace.
const namespaceRoot = process.env.K_C020_NAMESPACE_ROOT || path.resolve(__dirname, '..');
const serverFile = path.join(namespaceRoot, 'server.cjs');
const ledgerFile = path.join(namespaceRoot, '..', '..', '.docs', 'wiki', 'flow-state.json');
const { createLocalServer, startLocal } = require(serverFile);
const approvedContract = require(path.join(namespaceRoot, '..', 'C001', 'approved-contract.js'));

function parseResponse(raw) {
  const split = raw.indexOf('\r\n\r\n');
  if (split < 0) throw new Error('The server closed the socket before it finished a response head.');
  const lines = raw.subarray(0, split).toString('latin1').split('\r\n');
  const [, status, reason] = /^HTTP\/1\.[01] (\d{3}) ?(.*)$/.exec(lines[0]);
  const headers = {};
  for (const line of lines.slice(1)) headers[line.slice(0, line.indexOf(':')).toLowerCase()] = line.slice(line.indexOf(':') + 1).trim();
  const body = raw.subarray(split + 4);
  return { status: Number(status), reason, headers, body, text: body.toString('utf8') };
}

// One raw exchange: write the exact bytes, read until the server closes (requests carry Connection: close), never hang.
function exchange(port, bytes, timeoutMs = 4000) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const chunks = [];
    const timer = setTimeout(() => socket.destroy(new Error('The exchange was not closed by the server in time.')), timeoutMs);
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', (error) => { clearTimeout(timer); reject(error); });
    socket.on('close', () => {
      clearTimeout(timer);
      try { resolve(parseResponse(Buffer.concat(chunks))); } catch (error) { reject(error); }
    });
    socket.write(bytes);
  });
}

function request(host, method, target, headers = {}, body = '') {
  const lines = [`${method} ${target} HTTP/1.1`, `Host: ${host}`, 'Connection: close',
    ...Object.entries(headers).map(([name, value]) => `${name}: ${value}`)];
  return `${lines.join('\r\n')}\r\n\r\n${body}`;
}

async function startServer() {
  const server = createLocalServer();
  const sockets = new Set();
  server.on('connection', (socket) => { sockets.add(socket); socket.on('close', () => sockets.delete(socket)); });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  return {
    server, port, host: `127.0.0.1:${port}`, origin: `http://127.0.0.1:${port}`,
    async close() {
      for (const socket of sockets) socket.destroy();
      server.closeAllConnections();
      if (server.listening) await new Promise((resolve) => server.close(resolve));
    }
  };
}

// A private ledger built from the bundled, sealed C001 approval; tests never read or write the live ledger.
function privateLedger(change) {
  const approval = structuredClone(approvedContract.approval);
  if (change) change(approval);
  return JSON.stringify({ approvals: { C001: approval } });
}

module.exports = Object.freeze({
  namespaceRoot, serverFile, ledgerFile, createLocalServer, startLocal, exchange, request, startServer, privateLedger
});
