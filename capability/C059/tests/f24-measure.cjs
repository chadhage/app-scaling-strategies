'use strict';

// Test tooling (a MEASUREMENT TOOL, not a suite: it is not in the GREEN command and no test runs it): what does a pending first request cost per socket, and what does the cap of the service
// (BOUNDS.connections) bound? Usage: node capability\C059\tests\f24-measure.cjs <heapMb> <sockets> [requestsPerSocket] [hold|free]. Each socket first sends a valid POST /v1/steps (held in the child
// by its executor when 'hold'), then 64 KB blocks of the cheapest request until the server closes the socket or the request target is reached. It prints ONE JSON line: did the child survive, how
// many request events Node parsed (seen), the live heap after a forced GC while the first requests are still pending, the connections left, the sockets accepted, the cap read back from the
// server, a legitimate GET answered, and the heap after the held steps were released. A hard watchdog (120 s) turns a hang into a failed measurement. Adapted from the independent reviewer's
// probe (f24.cjs); the child is tests\f24-child.cjs (the real service, a capped heap, --expose-gc).
const { fork } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const HEAP_MB = Number(process.argv[2] ?? 48);
const SOCKETS = Number(process.argv[3] ?? 3);
const REQUESTS = Number(process.argv[4] ?? 50000);
const MODE = process.argv[5] === 'free' ? 'free' : 'hold';
const UNIT = 'GET /x HTTP/1.1\r\n\r\n';
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_V8_COVERAGE;
const child = fork(path.join(__dirname, 'f24-child.cjs'), [MODE], { execArgv: [`--max-old-space-size=${HEAP_MB}`, '--expose-gc'], silent: true, env });
const errors = [];
child.stderr.on('data', (chunk) => errors.push(chunk));
let exit = null;
let finished = false;
child.once('exit', (code, signal) => {
  exit = { code, signal };
  if (!finished) { console.log(JSON.stringify({ verdict: 'CHILD DIED', heapMb: HEAP_MB, sockets: SOCKETS, mode: MODE, exit, stderr: Buffer.concat(errors).toString('utf8').slice(0, 200).replace(/\s+/g, ' ') })); process.exit(1); }
});
const waiting = new Map();
child.on('message', (message) => { waiting.get(message.type)?.(message); waiting.delete(message.type); });
const next = (type) => new Promise((resolve) => waiting.set(type, resolve));
const ask = (type) => { const reply = next(type === 'stats' ? 'stats' : type === 'release' ? 'released' : 'closed'); child.send({ type }); return reply; };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const watchdog = setTimeout(() => { console.log(JSON.stringify({ verdict: 'WATCHDOG', exit })); child.kill(); process.exit(2); }, 120000);
const mb = (bytes) => Math.round((bytes / 1048576) * 10) / 10;

async function main() {
  const { port } = await next('listening');
  const base = await ask('stats');
  const perBlock = Math.floor(65536 / UNIT.length);
  const block = UNIT.repeat(perBlock);
  const clients = Array.from({ length: SOCKETS }, (_, index) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    const entry = { socket, sent: 0, closed: false };
    socket.on('error', () => {});
    socket.on('data', () => {});
    entry.done = new Promise((resolve) => socket.once('close', () => { entry.closed = true; resolve(); }));
    const body = JSON.stringify({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: `f24-${String(index).padStart(5, '0')}`, leaseId: 'synthetic-lease-001', units: 1 });
    socket.write(`POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
    return entry;
  });
  const accepted = () => ask('stats');
  // Wait until every socket the cap accepts has its first request in the executor: min(sockets, cap).
  for (let turn = 0; turn < 400 && MODE === 'hold'; turn += 1) {
    const stats = await accepted();
    if (stats.entered >= Math.min(SOCKETS, stats.maxConnections)) break;
    await sleep(50);
  }
  const flood = async (entry) => {
    while (entry.sent < REQUESTS && !entry.closed) {
      const written = await Promise.race([new Promise((resolve) => entry.socket.write(block, (error) => resolve(!error))), entry.done.then(() => false)]);
      if (!written) break;
      entry.sent += perBlock;
    }
  };
  await Promise.all(clients.map(flood));
  await Promise.race([Promise.all(clients.map((entry) => entry.done)), sleep(20000)]);
  const afterFlood = await ask('stats');
  const legit = await new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let text = '';
    socket.on('error', (error) => resolve(`ERROR ${error.code}`));
    socket.on('data', (chunk) => { text += chunk.toString('latin1'); if (/\r\n\r\n/.test(text)) { resolve(text.split('\r\n')[0]); socket.destroy(); } });
    socket.write(`GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
    setTimeout(() => resolve('TIMEOUT'), 20000);
  });
  await ask('release');
  await sleep(500);
  const afterRelease = await ask('stats');
  finished = true;
  await ask('stop');
  const finalExit = await Promise.race([new Promise((resolve) => { if (exit) resolve(exit); else child.once('exit', (code, signal) => resolve({ code, signal })); }), sleep(20000).then(() => 'STILL RUNNING')]);
  const live = Math.min(SOCKETS, afterFlood.maxConnections);
  console.log(JSON.stringify({
    heapMb: HEAP_MB, sockets: SOCKETS, mode: MODE, maxConnections: afterFlood.maxConnections, accepted: afterFlood.accepted, droppedAtAccept: SOCKETS - afterFlood.accepted,
    baselineLiveHeapMb: mb(base.heapUsed), seen: afterFlood.seen, seenPerSocket: Math.round(afterFlood.seen / live), clientsClosed: clients.filter((entry) => entry.closed).length,
    liveHeapAfterFloodMb: mb(afterFlood.heapUsed), perSocketMb: mb((afterFlood.heapUsed - base.heapUsed) / live), rssMb: mb(afterFlood.rss), connectionsLeft: afterFlood.connections,
    legitimateGet: legit, liveHeapAfterReleaseMb: mb(afterRelease.heapUsed), childExit: finalExit,
  }));
  clearTimeout(watchdog);
  process.exit(0);
}

main().catch((error) => { console.log(`MEASUREMENT ERROR ${error.stack}`); child.kill(); process.exit(3); });
