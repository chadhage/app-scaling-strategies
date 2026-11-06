'use strict';

// U039 probe (controller note after rev-C017 F24; not part of the whole suite, archived with the shared recorder as probe-01-pending-flood): the OPPOSITE failure of the pipelining fixes. A handler that returns at once
// for a later pipelined request, without answering and without pausing or destroying the socket, leaves the parser queueing a request object and a response object per request (about 1.8 KB each) while the
// first request is still PENDING, with no backpressure: 23.6k pipelined requests hung a 48 MB-heap child and 45.9k aborted it. The C042 handler counts the requests of a connection and destroys the socket at the fifth.
// This probe runs the service in a SEPARATE process with --max-old-space-size=48, makes one request per socket stay PENDING (a submit that the delay executor of the engine holds for ten minutes), writes 64 KB blocks of
// `GET /x HTTP/1.1` on three sockets (up to 50 000 requests per socket) and counts requests and sockets (never a time bound; the 90 s bound is a liveness guard for a broken server): the child is still alive, the
// server closed every socket, it holds no connection, a legitimate GET is answered. A CONTROL run with the depth limit of the handler removed (the naive design) must fail the same checks.
// Usage (repository root): node capability\C042\evidence\u039-pipelining\probe-pending-flood.cjs   (exit 0 when the real server is healthy and the control is not)
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const lib = require('../../tests/u039-lib.cjs');
const { step } = require('../../tests/u039-rows.cjs');

const SOCKETS = 3;
const MAX_REQUESTS = 50000;
const BLOCK_BYTES = 64 * 1024;
const BOUND_MS = 90000;
const root = path.resolve(__dirname, '..', '..');

async function until(check, label) {
  const deadline = Date.now() + BOUND_MS;
  while (!(await check())) {
    if (Date.now() > deadline) throw new Error(`never held: ${label}`);
    await lib.sleep(20);
  }
}

async function phase(name, subject) {
  const report = { phase: name, childAlive: false, socketsClosed: 0, requestsWritten: [], connectionsAfter: null, answeredAfter: null, maxBytesRead: null, failure: null };
  const child = await lib.startChild({ heapMb: 48, subject });
  try {
    const instance = await child.start({ settleMs: 600000 });
    const host = `127.0.0.1:${instance.port}`;
    const request = Buffer.from(`GET /x HTTP/1.1\r\nHost: ${host}\r\n\r\n`, 'latin1');
    const perBlock = Math.floor(BLOCK_BYTES / request.length);
    const block = Buffer.concat(Array.from({ length: perBlock }, () => request));
    const peers = [];
    for (let index = 0; index < SOCKETS; index += 1) {
      const socket = net.connect({ port: instance.port, host: '127.0.0.1' });
      const peer = { socket, closed: false, requests: 0 };
      socket.on('error', () => {});
      socket.on('data', () => {});
      socket.on('close', () => { peer.closed = true; });
      await new Promise((resolve) => socket.once('connect', resolve));
      socket.write(lib.req('POST', '/v1/steps', { host, headers: { 'Content-Type': 'application/json' }, body: step({ idempotencyKey: `pending-key-${String(index).padStart(4, '0')}`, units: 1 }) }));
      peers.push(peer);
    }
    await until(async () => (await instance.state()).snapshot.journalRecords >= SOCKETS, 'the three first requests are in flight (pending)');
    await Promise.all(peers.map((peer) => new Promise((resolve) => {
      const pump = () => {
        while (!peer.closed && peer.requests < MAX_REQUESTS) {
          peer.requests += perBlock;
          if (!peer.socket.write(block)) { peer.socket.once('drain', pump); return; }
        }
        resolve();
      };
      peer.socket.once('close', resolve);
      pump();
    })));
    await until(() => peers.every((peer) => peer.closed), 'every flooded socket is closed');
    report.requestsWritten = peers.map((peer) => peer.requests);
    report.socketsClosed = peers.filter((peer) => peer.closed).length;
    try { process.kill(child.pid, 0); report.childAlive = true; } catch { report.childAlive = false; }
    if (report.childAlive) {
      report.connectionsAfter = await instance.connections();
      report.maxBytesRead = Math.max(0, ...(await child.socketStats()).map((item) => item.bytesRead));
      const answer = await lib.exchange(instance.port, [{ data: lib.req('GET', '/scope.json', { host }) }], { answers: 1, closeMs: 10000 });
      report.answeredAfter = answer.responses[0]?.status ?? null;
    }
  } catch (error) {
    report.failure = String(error?.message ?? error).slice(0, 300);
    try { process.kill(child.pid, 0); report.childAlive = true; } catch { report.childAlive = false; }
  } finally {
    await child.stop().catch(() => {});
  }
  report.healthy = report.failure === null && report.childAlive && report.socketsClosed === SOCKETS && report.connectionsAfter === 0 && report.answeredAfter === 200;
  console.log(JSON.stringify(report));
  return report;
}

async function main() {
  const source = fs.readFileSync(path.join(root, 'server.cjs'), 'utf8').replace(/\r\n/g, '\n');
  const find = '    if (depth > limits.pipelineDepth) {';
  if (source.split(find).length !== 2) throw new Error('the depth limit line was not found exactly once');
  const dir = path.join(root, 'tests', 'scratch', 'pending-control');
  fs.mkdirSync(dir, { recursive: true });
  const control = path.join(dir, 'server-control.cjs');
  fs.writeFileSync(control, source.replace(find, () => '    if (false) {'));
  try {
    const naive = await phase('control: the depth limit removed (naive design)', `file:${path.relative(path.resolve(root, '..', '..'), control).split(path.sep).join('/')}`);
    const real = await phase('real server.cjs', 'real');
    const ok = real.healthy && !naive.healthy;
    console.log(JSON.stringify({ summary: true, realHealthy: real.healthy, controlHealthy: naive.healthy, ok }));
    process.exitCode = ok ? 0 : 1;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

main().then(() => process.exit(process.exitCode ?? 0), (error) => { console.error(String(error?.stack ?? error)); process.exit(2); });
