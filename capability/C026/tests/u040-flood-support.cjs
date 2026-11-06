'use strict';

// Test tooling, not production code (U040 fix 2): shared helpers of the flood, budget and Expect suites. A fixture server in this process
// that records every limit event, the same server in a child process (optionally with a capped heap), a pipelining attacker that reads
// nothing while it writes, and a legitimate read. No pass or fail decision uses a clock: the bounds below only end a wait that
// would otherwise hang, and every assertion is about counts and states.
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { createLocalServer, closeServer } = require('./u040-target.cjs');

const repository = path.resolve(__dirname, '..', '..', '..');
const CHILD = path.join(__dirname, 'u040-flood-child.cjs');
const BLOCK_BYTES = 65536;

function cleanEnvironment() {
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
  return env;
}

const producers = (counters) => ({
  none: null,
  ok: () => { counters.transcripts += 1; return Promise.resolve({ ok: true }); },
  fail: () => { counters.transcripts += 1; return Promise.reject(new Error('boom')); },
  hold: () => { counters.transcripts += 1; return new Promise(() => {}); }
});

// The fixture in this process. transcript: none, ok, fail or hold.
async function inProcessFixture(transcript = 'ok') {
  const counters = { transcripts: 0 };
  const server = createLocalServer({ transcript: producers(counters)[transcript] });
  const limitEvents = [];
  server.on('limit', (event) => limitEvents.push(event));
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const port = server.address().port;
  return {
    port, host: `127.0.0.1:${port}`, server,
    state: async () => ({ sessions: server.hub.sessionCount(), transcripts: counters.transcripts, limitEvents: [...limitEvents] }),
    close: () => closeServer(server)
  };
}

// The fixture in a child process (mode: none, real, ok, fail or hold; heapMb 0 keeps the default heap). Every wait is bounded by a
// hang guard only.
async function childFixture(mode, { heapMb = 0, guardMs = 60000 } = {}) {
  const args = [...(heapMb ? [`--max-old-space-size=${heapMb}`] : []), CHILD, mode];
  const child = spawn(process.execPath, args, { cwd: repository, env: cleanEnvironment(), windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const errors = [];
  const waiting = [];
  let pending = '';
  let exited = null;
  child.stderr.on('data', (chunk) => errors.push(chunk));
  child.stdin.on('error', () => {});
  child.stdout.on('data', (chunk) => {
    pending += chunk;
    const lines = pending.split('\n');
    pending = lines.pop();
    for (const line of lines.filter((entry) => entry.trim() !== '')) waiting.shift()?.resolve(JSON.parse(line));
  });
  const exit = new Promise((resolve) => {
    child.once('exit', (code, signal) => {
      exited = { code, signal };
      for (const entry of waiting.splice(0)) entry.reject(new Error(`the server child exited (code ${code}, signal ${signal})`));
      resolve(exited);
    });
  });
  const next = () => new Promise((resolve, reject) => {
    if (exited !== null) { reject(new Error(`the server child exited (code ${exited.code}, signal ${exited.signal})`)); return; }
    const guard = setTimeout(() => reject(new Error('the server child did not answer')), guardMs);
    waiting.push({ resolve: (value) => { clearTimeout(guard); resolve(value); }, reject: (error) => { clearTimeout(guard); reject(error); } });
  });
  const { port } = await next();
  return {
    port, host: `127.0.0.1:${port}`, exit,
    exited: () => exited,
    stderrTail: () => Buffer.concat(errors).toString('utf8').replace(/\s+/g, ' ').trim().slice(0, 300),
    state: async () => { const reply = next(); if (exited === null) child.stdin.write('state\n'); return reply; },
    async close() {
      if (exited === null) child.stdin.end();
      const ended = await Promise.race([exit, new Promise((resolve) => setTimeout(() => resolve(null), 15000))]);
      if (ended === null) child.kill();
      return exit;
    }
  };
}

// One minimal pipelined read; a block is as many of them as fit in 64 KB, so one block is about one TCP read of the server.
function unitFor(port) {
  const one = `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;
  return { one, count: Math.floor(BLOCK_BYTES / one.length), unitBytes: one.length };
}

// One attacker socket: the first request, then blocks of pipelined reads until all blocks are written, the server ends the connection,
// or the server stops reading for stallMs (a hang guard for a server that pauses the socket: the control). It reads nothing while it
// writes. Afterwards drain() reads what the server queued and reports whether the SERVER ended the connection, then destroys the socket.
function attacker(port, first, { blocks = 50, stallMs = 3000 } = {}) {
  const { one, count } = unitFor(port);
  const block = Buffer.from(one.repeat(count));
  const entry = { handed: 0, closed: false, error: null, ending: null };
  const socket = net.connect({ host: '127.0.0.1', port });
  entry.socket = socket;
  socket.on('error', (error) => { entry.error = error.code ?? String(error); });
  entry.closedPromise = new Promise((resolve) => socket.once('close', () => { entry.closed = true; resolve(); }));
  entry.written = new Promise((resolve) => {
    let progress = Date.now();
    const watch = setInterval(() => { if (Date.now() - progress > stallMs) { clearInterval(watch); resolve('stalled'); } }, 250);
    const done = (reason) => { clearInterval(watch); resolve(reason); };
    entry.closedPromise.then(() => done('closed'));
    socket.once('connect', () => {
      let written = 0;
      const pump = () => {
        while (!socket.destroyed && written < blocks) {
          // The first request travels in the same write as the first block, so that the server reads the request and a full read of pipelined
          // reads together: a refusal that is flushed and closed before the next read arrives would otherwise leave nothing to count.
          const chunk = written === 0 ? Buffer.concat([Buffer.from(first), block]) : block;
          written += 1;
          entry.handed += count;
          progress = Date.now();
          if (!socket.write(chunk)) { socket.once('drain', pump); return; }
        }
        done('written');
      };
      pump();
    });
  });
  entry.drain = async ({ waitMs = 15000 } = {}) => {
    if (!entry.closed) {
      socket.resume();
      await Promise.race([entry.closedPromise, new Promise((resolve) => setTimeout(resolve, waitMs))]);
    }
    const endedByServer = entry.closed;
    socket.destroy();
    await entry.closedPromise;
    return endedByServer;
  };
  return entry;
}

// A legitimate read on a new connection with Connection: close; resolves with the status code, or an error text.
function legitimateGet(port, target = '/scope.json', guardMs = 30000) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port });
    let text = '';
    const guard = setTimeout(() => { socket.destroy(); resolve('TIMEOUT'); }, guardMs);
    const finish = (value) => { clearTimeout(guard); socket.destroy(); resolve(value); };
    socket.on('error', (error) => finish(`ERROR ${error.code}`));
    socket.on('data', (chunk) => {
      text += chunk.toString('latin1');
      const match = /^HTTP\/1\.1 (\d{3}) /.exec(text);
      if (match && text.includes('\r\n\r\n')) finish(Number(match[1]));
    });
    socket.on('close', () => finish(text === '' ? 'CLOSED WITHOUT ANSWER' : text.slice(0, 40)));
    socket.write(`GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nConnection: close\r\n\r\n`);
  });
}

module.exports = Object.freeze({ repository, BLOCK_BYTES, cleanEnvironment, inProcessFixture, childFixture, unitFor, attacker, legitimateGet });
