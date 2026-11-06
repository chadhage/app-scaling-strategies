'use strict';

// F24 of the third independent review, in the shape of the reviewer's reproduction and with COUNTS only. The server is the real CLI in a child
// process with a 48 MB heap and an in-flight step that never finishes (--hold-in-step=3), so a valid cancel stays PENDING; the attacker is ANOTHER
// process (fixtures\pending-attacker.cjs, no clock) that sends one cancel per socket and then pipelines up to REQUESTS_PER_SOCKET tiny GET requests
// (about 2.5 MB) behind it on each of SOCKETS connections. A request behind the first one is never run and never answered, so the second fix had no
// backpressure at all: the parser built about 1.8 KB per request and the child hung or aborted with an out-of-memory error (exit 134).
// Required now, every figure a count or a fact and no clock:
//   - the child is still alive after the attack and a legitimate GET is answered (status 200, no latency measured);
//   - the server closed EVERY attacker connection: no attacker gave up after pushing its whole budget and none is left open;
//   - the server READ at most READ_BOUND bytes from each of them (a count the child logs itself when the connection closes);
//   - the retained heap returns to a fixed margin of its idle size, and the child still stops cleanly.
// The only clock is the node:test timeout of this test; a child that dies fails by assertion (its exit is raced against every wait).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { startChild, pollState, readMem } = require('./child.cjs');

const fixtures = path.join(__dirname, 'fixtures');
const SOCKETS = 4;
const REQUESTS_PER_SOCKET = 50000;
const REQUESTS_PER_BLOCK = 1300;
// The server reads one or two 64 KB socket reads from such a connection before it destroys it; a server that keeps parsing reads the whole 2.5 MB.
const READ_BOUND = 400000;
const HEAP_MARGIN = 24 * 1024 * 1024;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const lines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.endsWith('}')).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } }) : []);

function cancelRequest(port, key, actionId) {
  const body = JSON.stringify(s.cancelCmd(key, actionId, 1, false));
  return `POST /api/cancel HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
}

function attack(t, spec) {
  const child = spawn(process.execPath, [path.join(fixtures, 'pending-attacker.cjs'), JSON.stringify(spec)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  let out = '';
  child.stdout.on('data', (part) => { out += part; });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve(JSON.parse(out.trim())) : reject(new Error(`the attacker process exited with ${code}`))));
  });
}

// Polls to quiescence (never a fixed sleep): every attacker socket must show up in the server's own close log; only the test's own timeout ends the wait.
async function logged(file, ports, signal) {
  for (;;) {
    const seen = lines(file);
    const mine = ports.map((port) => seen.find((line) => line.remotePort === port));
    if (mine.every(Boolean)) return mine;
    if (signal.aborted) throw new Error(`the server never logged the close of every attacker socket (${mine.filter(Boolean).length} of ${mine.length})`);
    await sleep(25);
  }
}

test(`a pending first request with ${REQUESTS_PER_SOCKET} pipelined requests behind it on each of ${SOCKETS} connections keeps a 48 MB-heap child alive, bounded, closing every connection and answering a legitimate GET (counts only)`, { timeout: 600000 }, async (t) => {
  const made = s.scratch('pf');
  t.after(() => made.remove());
  const netLog = path.join(made.dir, 'net.jsonl');
  const memFile = path.join(made.dir, 'mem.json');
  const kid = startChild(t, {
    nodeFlags: ['--max-old-space-size=48', '--expose-gc', '--require', path.join(fixtures, 'net-log-preload.cjs')],
    env: { C017_NET_LOG: netLog, C017_MEM_FILE: memFile },
    args: [`--dir=${made.dir}`, '--step-delay-ms=0', '--hold-in-step=3'],
  });
  const dies = () => kid.exited.then((exit) => assert.fail(`the server child died: exit code ${exit.code}, signal ${exit.signal}: ${(kid.errors().match(/FATAL ERROR[^\r\n]*/) || [kid.errors().slice(0, 200)])[0]}`));
  const origin = await kid.origin();
  const { port } = new URL(origin);
  const started = await h.post(origin, '/api/start', s.startCmd('pending-proc-start-0001'));
  assert.equal(started.status, 202);
  const actionId = started.json.action.actionId;
  await pollState(origin, (state) => state.journal.some((entry) => entry.type === 'step-intent' && entry.step === 3), 'step 3 never began', { signal: t.signal });
  const before = await readMem(memFile, { signal: t.signal });

  const request = `GET /api/state HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;
  const spec = {
    port: Number(port), sockets: SOCKETS, maxRequests: REQUESTS_PER_SOCKET, requestsPerBlock: REQUESTS_PER_BLOCK, request,
    firsts: Array.from({ length: SOCKETS }, (_, index) => cancelRequest(port, `pending-proc-cancel-${index}`, actionId)),
  };
  const report = await Promise.race([attack(t, spec), dies()]);
  const ports = report.ports.filter((value) => value !== null);
  const seen = await Promise.race([logged(netLog, ports, t.signal), dies()]);
  assert.equal(kid.child.exitCode, null, 'the server child is still alive after the attack');
  assert.deepEqual(report.gaveUp, Array.from({ length: SOCKETS }, () => false), `the server closed every attacker connection (requests pushed per socket: ${report.pushed.join(', ')})`);
  assert.equal(seen.length, SOCKETS);
  for (const line of seen) assert.ok(line.bytesRead <= READ_BOUND, `the server read ${line.bytesRead} bytes from an abusive connection (bound ${READ_BOUND})`);
  t.diagnostic(`bytes read per abusive connection: ${seen.map((line) => line.bytesRead).join(', ')}; requests pushed: ${report.pushed.join(', ')}`);

  const answered = await Promise.race([h.get(origin, '/api/state'), dies()]);
  assert.equal(answered.status, 200, 'a legitimate GET after the attack');
  let after = await readMem(memFile, { signal: t.signal });
  while (after.heapUsed >= before.heapUsed + HEAP_MARGIN && !t.signal.aborted) {
    await sleep(100);
    after = await readMem(memFile, { signal: t.signal });
  }
  assert.ok(after.heapUsed < before.heapUsed + HEAP_MARGIN, `heap grew from ${before.heapUsed} to ${after.heapUsed}`);
  const stopped = await kid.stop();
  assert.equal(stopped.code, 0, `the child must exit cleanly: ${kid.errors()}`);
});
