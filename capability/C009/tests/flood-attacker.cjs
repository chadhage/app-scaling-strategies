'use strict';

// Test tooling, not production code: the attacker of the flood probes. It runs in its OWN process, so it cannot share an event loop
// with the server it attacks. Usage: node flood-attacker.cjs <port> <JSON {prefix, head}> <sockets> <maxBytes>   (spawned with an IPC channel)
// Each socket writes prefix + head in ONE write (the prefix is empty, or a complete request that the refusal is queued behind) and then
// endless Transfer-Encoding: chunked data made of 1-byte chunks (one parser callback each) until the server closes the socket or
// maxBytes were offered and flushed. It then tells its parent {type:'offered'} and stays connected, so that nothing it offered is lost
// to an early close, until the parent sends 'report': it answers with the statuses every socket read and whether the server closed it,
// and exits. A socket is only ever ended by the SERVER (or by this process ending).
const net = require('node:net');

const [port, spec, socketCount, maxBytes] = process.argv.slice(2);
const { prefix, head } = JSON.parse(spec);
const piece = Buffer.from('1\r\nx\r\n'.repeat(10000));
const results = [];
let pending = Number(socketCount);

const settleOne = () => {
  pending -= 1;
  if (pending === 0) process.send({ type: 'offered', offered: results.reduce((sum, result) => sum + result.socket.bytesWritten, 0) });
};

function attack() {
  const result = { statuses: [], closed: false, socket: net.connect({ host: '127.0.0.1', port: Number(port), allowHalfOpen: true }) };
  const { socket } = result;
  results.push(result);
  let done = false;
  const settle = () => { if (!done) { done = true; settleOne(); } };
  const ended = () => { result.closed = true; settle(); };
  socket.on('data', (chunk) => { for (const match of chunk.toString('latin1').matchAll(/HTTP\/1\.\d (\d+)/g)) result.statuses.push(Number(match[1])); });
  socket.on('error', ended);
  socket.on('end', ended);
  socket.on('close', ended);
  socket.write(`${prefix}${head}`);
  const pump = () => {
    if (done) return;
    if (socket.bytesWritten >= Number(maxBytes)) {
      socket.write('', settle);
      return;
    }
    if (socket.write(piece)) setImmediate(pump); else socket.once('drain', pump);
  };
  pump();
}

process.on('message', (message) => {
  if (message !== 'report') return;
  const sockets = results.map(({ statuses, closed }) => ({ statuses, closed }));
  process.send({ type: 'report', sockets }, () => {
    results.forEach(({ socket }) => socket.destroy());
    process.exit(0);
  });
});
process.on('disconnect', () => process.exit(0));
Array.from({ length: Number(socketCount) }, attack);
