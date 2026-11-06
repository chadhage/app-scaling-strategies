'use strict';

// L-0120 and L-0138 for this fixture, measured the only way that can see a stall AND with no time bound deciding pass or fail (F22 of the second
// independent review, L-0170; the first fix asserted a 3.2 s event-loop lag, a 3.2 s GET latency and a 3.2 s close and failed under load; its bytes
// are retained in evidence\red\prefix-legacy-8e7046e9). The attacker is ANOTHER process (an in-process attacker shares the server's event loop and
// cannot starve it) and the server is the real CLI in a small-heap child. Every row of the shared refusal table (tests\refusals.cjs) is attacked,
// one row at a time, by three sockets of ONE long-lived attacker process (fixtures\push-attacker.cjs: a node process costs seconds to start on a
// loaded machine), and the assertions are COUNTS and FACTS, never seconds:
//   - the polite client gets the status of the row and its connection is closed;
//   - the abusive connections are closed BY THE SERVER: an attacker gives up only after it pushed a byte count, never after a time, so the only
//     clock left is the node:test timeout;
//   - the server READ at most READ_BOUND bytes from each abusive connection (a count the child logs itself when the connection closes: a loaded
//     machine slows everything down but cannot change how many bytes were read before the close);
//   - a NAIVE CONTROL (a plain keep-alive Node server in a second child, attacked by a second attacker process with the same row at the same
//     time) keeps every abusive connection open until its attackers give up, so a test that cannot tell the real server from a naive one is
//     exposed in this very run;
//   - every legitimate GET issued while the attackers are attached is served (status 200, no latency measured) and one more afterwards.
// flood-structural.test.cjs adds the Node-answered shapes and the CPU time of the server per abusive connection.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const s = require('./support.cjs');
const h = require('./http.cjs');
const { startChild } = require('./child.cjs');
const { rows, statusOf } = require('./refusals.cjs');

const fixtures = path.join(__dirname, 'fixtures');
// The server reads a few 64 KB socket reads from a refused connection (its drain limit is 32 KB; at most 134,184 bytes were observed); a server
// that keeps parsing an endless body reads megabytes before any timer of Node cuts it: the bound sits between the two and counts bytes.
const READ_BOUND = 400000;
// What an attacker may push before it gives up: the real server never gets near it (it closes after about 134 KB read plus what the kernel holds
// in flight); the control absorbs the smaller figure and keeps the connection, which is all the comparison needs.
const REAL_MAX_PUSHED = 8 * 1024 * 1024;
const CONTROL_MAX_PUSHED = 256 * 1024;
const SOCKETS = 3;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const lines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.endsWith('}')).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } }) : []);

// One attacker process; ask() sends one attack and resolves with its report when every socket of it is closed.
function startAttacker(t) {
  const child = spawn(process.execPath, [path.join(fixtures, 'push-attacker.cjs')], { stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  const waiting = new Map();
  let buffer = '';
  let last = 0;
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (part) => {
    buffer += part;
    const complete = buffer.split('\n');
    buffer = complete.pop();
    for (const line of complete.filter(Boolean)) {
      const reply = JSON.parse(line);
      waiting.get(reply.id).resolve(reply);
      waiting.delete(reply.id);
    }
  });
  child.stdin.on('error', () => {});
  const exited = new Promise((resolve) => child.once('close', resolve));
  child.once('close', (code) => { for (const entry of waiting.values()) entry.reject(new Error(`the attacker process exited with ${code}`)); waiting.clear(); });
  return {
    ask: (spec) => new Promise((resolve, reject) => { last += 1; waiting.set(last, { resolve, reject }); child.stdin.write(`${JSON.stringify({ ...spec, id: last })}\n`); }),
    stop: () => { child.stdin.end(); return exited; },
  };
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

function startNaive(t) {
  const clean = { ...process.env, NODE_V8_COVERAGE: '' };
  delete clean.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, [path.join(fixtures, 'naive-server.cjs')], { stdio: ['pipe', 'pipe', 'pipe'], env: clean, windowsHide: true });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  const origin = new Promise((resolve, reject) => {
    let buffer = '';
    child.stdout.on('data', (part) => { buffer += part; const hit = /"origin":"([^"]+)"/.exec(buffer); if (hit) resolve(hit[1]); });
    child.once('exit', () => reject(new Error('the naive control exited early')));
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.stdin.on('error', () => {});
  return { origin: () => origin, stop: () => { child.stdin.write('stop\n'); return exited; } };
}

test('every refusal of the shared table closes an abusive connection and reads a bounded number of bytes while the server keeps serving, and a naive control does none of that (attacker in another process, no time bound)', { timeout: 1800000 }, async (t) => {
  const made = s.scratch('cp');
  t.after(() => made.remove());
  const netLog = path.join(made.dir, 'net.jsonl');
  const kid = startChild(t, { nodeFlags: ['--max-old-space-size=48', '--require', path.join(fixtures, 'net-log-preload.cjs')], env: { C017_NET_LOG: netLog }, args: [`--dir=${made.dir}`, '--step-delay-ms=0'] });
  const naive = startNaive(t);
  const attackers = { real: startAttacker(t), control: startAttacker(t) };
  const origin = await kid.origin();
  const controlOrigin = await naive.origin();
  const { port } = new URL(origin);
  const controlPort = new URL(controlOrigin).port;
  const host = `Host: 127.0.0.1:${port}\r\n`;
  const controlHost = `Host: 127.0.0.1:${controlPort}\r\n`;
  assert.equal((await h.get(origin, '/api/state')).status, 200, 'the idle child must answer a GET');

  for (const row of rows) {
    await t.test(row.name, { timeout: 1200000 }, async (sub) => {
      const polite = h.raw(origin, row.head(host) + row.small);
      await polite.closed;
      assert.equal(statusOf(polite.text()), row.status, 'the table row must elicit its status from a well-behaved client');

      const progress = { finished: false };
      const real = attackers.real.ask({ port, head: row.head(host), sockets: SOCKETS, maxBytes: REAL_MAX_PUSHED });
      real.then(() => { progress.finished = true; }, () => { progress.finished = true; });
      const control = attackers.control.ask({ port: controlPort, head: row.head(controlHost), sockets: SOCKETS, maxBytes: CONTROL_MAX_PUSHED });
      control.catch(() => {});
      const statuses = [];
      do {
        statuses.push((await h.get(origin, '/api/state')).status);
        await sleep(25);
      } while (!progress.finished);
      const [report, kept] = await Promise.all([real, control]);

      assert.ok(report.ports.every((value) => value !== null), 'every attacker socket must have connected');
      assert.deepEqual(report.gaveUp, [false, false, false], `an abusive connection stayed open until its attacker gave up: bytes pushed ${JSON.stringify(report.pushedBytes)}`);
      const seen = await logged(netLog, report.ports, sub.signal);
      for (const line of seen) assert.ok(line.bytesRead <= READ_BOUND, `the server read ${line.bytesRead} bytes from a refused connection (bound ${READ_BOUND})`);
      sub.diagnostic(`bytes the server read per abusive connection: ${seen.map((line) => line.bytesRead).join(', ')}; bytes the attackers pushed: ${report.pushedBytes.join(', ')}`);
      assert.deepEqual(kept.gaveUp, [true, true, true], 'the naive control must keep every abusive connection open, or this test cannot tell a naive server from the real one');
      assert.ok(statuses.length >= 1 && statuses.every((status) => status === 200), `a legitimate GET issued during the attack was not served: ${JSON.stringify(statuses)}`);
      assert.equal((await h.get(origin, '/api/state')).status, 200, 'a legitimate request must still be served after the attack');
    });
  }
  await Promise.all([attackers.real.stop(), attackers.control.stop()]);
  assert.equal(await naive.stop(), 0);
  const stopped = await kid.stop();
  assert.equal(stopped.code, 0, kid.errors());
});
