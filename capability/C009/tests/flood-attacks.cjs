'use strict';

// Test tooling, not production code: the attacker of the flood probes, one PERSISTENT process for a whole test file (it runs in its OWN
// process, so it cannot share an event loop with the server it attacks). Usage: node flood-attacks.cjs <sockets> <maxBytes>
// (spawned with an IPC channel). The parent sends {type:'attack', spec:{port, prefix, head}}: each of <sockets> sockets connects to the
// port, writes prefix + head in ONE write (the prefix is empty, or a complete request that the refusal is queued behind) and then
// endless Transfer-Encoding: chunked data made of 1-byte chunks (one parser callback each) until the server closes the socket or
// maxBytes were offered and flushed. The attacker answers {type:'offered', offered} and keeps every socket connected (nothing it
// offered is lost to an early close) until {type:'report', index} (what the sockets of attack <index> read and whether the server
// closed them) or {type:'bye'}. A socket is only ever ended by the SERVER or by this process ending.
const net = require('node:net');

const [socketCount, maxBytes] = process.argv.slice(2);
const piece = Buffer.from('1\r\nx\r\n'.repeat(10000));
const attacks = [];

function attack({ port, prefix, head }) {
  const results = [];
  let pending = Number(socketCount);
  const settleOne = () => {
    pending -= 1;
    if (pending === 0) process.send({ type: 'offered', offered: results.reduce((sum, result) => sum + result.socket.bytesWritten, 0) });
  };
  for (let index = 0; index < Number(socketCount); index += 1) {
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
  attacks.push(results);
}

const leave = () => {
  for (const results of attacks) results.forEach(({ socket }) => socket.destroy());
  process.exit(0);
};

process.on('message', (message) => {
  if (message.type === 'attack') attack(message.spec);
  else if (message.type === 'report') process.send({ type: 'report', sockets: attacks[message.index].map(({ statuses, closed }) => ({ statuses, closed })) });
  else if (message.type === 'bye') leave();
});
process.on('disconnect', leave);
