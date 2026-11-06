'use strict';

// L-0120, L-0132 and L-0138 for EVERY answer the server can produce, measured with STRUCTURAL facts only (second independent review, F11 and
// F17; the shared quality item 6 forbids an absolute latency or event-loop bound on a shared machine). The attacker is ANOTHER process, the
// server is the real CLI in a small-heap child, and for every row of both refusal tables (refusals.cjs: shapes our handler answers;
// refusals-node.cjs: shapes Node would answer itself):
//   - the polite client gets the typed answer of the closed table (never Node's prose) and its connection is closed;
//   - the abusive connections are closed BY THE SERVER, and the server READ at most READ_BOUND bytes from each (a count the child logs
//     itself at close: a loaded machine slows everything down but cannot change how many bytes were read before the close);
//   - a NAIVE CONTROL (a plain keep-alive Node server in a second child, same attack, same run) keeps every such connection open, so a
//     test that cannot tell the real server from a naive one is exposed in this very run;
//   - the child's CPU time (process.cpuUsage(): CPU seconds are not inflated by a loaded machine the way latency is) per abusive connection is
//     bounded (the naive control's CPU of the same run is reported next to it);
//   - a legitimate request afterwards is still served.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const s = require('./support.cjs');
const h = require('./http.cjs');
const C = require('../contract.js');
const { startChild } = require('./child.cjs');
const older = require('./refusals.cjs');
const own = require('./refusals-node.cjs');

const fixtures = path.join(__dirname, 'fixtures');
// The server reads a few 64 KB socket reads from a refused connection (the drain limit is 32 KB; at most 134,184 bytes were observed), a
// server that keeps reading an endless body reads megabytes: the bound sits between the two and counts bytes, never seconds.
const READ_BOUND = 400000;
const CPU_BOUND_MS = 500;
const FIXED_CAP_MS = 12000;
const CONTROL_CAP_MS = 1000;
const rows = [...older.rows.map((row) => ({ ...row, endless: true, control: true })), ...own.rows];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const lines = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.endsWith('}')).flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } }) : []);
const cpuNow = (file) => { const all = lines(file); return all.length ? all[all.length - 1].cpuMs : 0; };

function attack(t, port, head, capMs, sockets = 3) {
  const child = spawn(process.execPath, [path.join(fixtures, 'flood-attacker.cjs'), JSON.stringify({ port, head, sockets, capMs })], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  let out = '';
  child.stdout.on('data', (part) => { out += part; });
  return new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => (code === 0 ? resolve(JSON.parse(out.trim())) : reject(new Error(`the attacker process exited with ${code}`))));
  });
}

// Polls to quiescence (never a fixed sleep): every attacker socket must show up in the server's own close log.
async function logged(file, ports) {
  const end = Date.now() + 30000;
  for (;;) {
    const seen = lines(file);
    const mine = ports.filter((port) => port !== null).map((port) => seen.find((line) => line.remotePort === port));
    if (mine.every(Boolean)) return mine;
    if (Date.now() > end) throw new Error(`the server never logged the close of every attacker socket (${mine.filter(Boolean).length} of ${mine.length})`);
    await sleep(25);
  }
}

function startNaive(t, env) {
  const clean = { ...process.env, ...env, NODE_V8_COVERAGE: '' };
  delete clean.NODE_TEST_CONTEXT;
  const child = spawn(process.execPath, ['--require', path.join(fixtures, 'net-log-preload.cjs'), path.join(fixtures, 'naive-server.cjs')], { stdio: ['pipe', 'pipe', 'pipe'], env: clean, windowsHide: true });
  t.after(() => { if (child.exitCode === null && child.signalCode === null) child.kill(); });
  const origin = new Promise((resolve, reject) => {
    let buffer = '';
    child.stdout.on('data', (part) => { buffer += part; const hit = /"origin":"([^"]+)"/.exec(buffer); if (hit) resolve(hit[1]); });
    child.once('exit', () => reject(new Error('the naive control exited early')));
  });
  const exited = new Promise((resolve) => child.once('exit', resolve));
  child.stdin.on('error', () => {});
  return { origin: () => s.withTimeout(origin, 'the naive control never listened', 20000), stop: () => { child.stdin.write('stop\n'); return s.withTimeout(exited, 'the naive control did not stop', 8000); } };
}

test('every refusal of both tables, the Node-answered shapes included, closes an abusive connection at once and reads a bounded number of bytes; the naive control keeps it open (attacker in another process)', { timeout: 420000 }, async (t) => {
  const made = s.scratch('fs');
  t.after(() => made.remove());
  const file = (name) => path.join(made.dir, name);
  const kid = startChild(t, { nodeFlags: ['--max-old-space-size=48', '--require', path.join(fixtures, 'net-log-preload.cjs')], env: { C017_NET_LOG: file('fixed-net.jsonl'), C017_CPU_FILE: file('fixed-cpu.jsonl') }, args: [`--dir=${made.dir}`, '--step-delay-ms=0'] });
  const naive = startNaive(t, { C017_NET_LOG: file('control-net.jsonl'), C017_CPU_FILE: file('control-cpu.jsonl') });
  const origin = await kid.origin();
  const controlOrigin = await naive.origin();
  const host = `Host: 127.0.0.1:${new URL(origin).port}\r\n`;
  const controlHost = `Host: 127.0.0.1:${new URL(controlOrigin).port}\r\n`;

  for (const row of rows) {
    await t.test(row.name, { timeout: 120000 }, async (sub) => {
      const polite = h.raw(origin, row.head(host) + row.small);
      await s.withTimeout(polite.closed, 'the polite request was never closed', 20000);
      const answered = own.finalStatusOf(polite.text());
      assert.equal(answered, row.status, 'the row must elicit its status from a well-behaved client');
      if (row.status >= 400) {
        const typed = JSON.parse(own.bodyOf(polite.text()));
        assert.deepEqual(C.failureCheck(typed).problems, [], 'the answer must be a typed failure of the closed table, never prose of Node');
        assert.equal(C.failures[typed.error.code].status, row.status);
      }

      const cpuBefore = cpuNow(file('fixed-cpu.jsonl'));
      const controlBefore = cpuNow(file('control-cpu.jsonl'));
      // The same attack against the real server and, concurrently, against the naive control: the same load for both.
      const [report, open] = await Promise.all([
        attack(sub, new URL(origin).port, row.head(host), FIXED_CAP_MS),
        row.control ? attack(sub, new URL(controlOrigin).port, row.head(controlHost), CONTROL_CAP_MS) : Promise.resolve(null),
      ]);
      assert.ok(report.closedAfterMs.every((ms) => ms !== null), `an abusive connection stayed open until the cap of ${FIXED_CAP_MS} ms: ${JSON.stringify(report.closedAfterMs)}`);
      const seen = await logged(file('fixed-net.jsonl'), report.ports);
      for (const line of seen) assert.ok(line.bytesRead <= READ_BOUND, `the server read ${line.bytesRead} bytes from a refused connection (bound ${READ_BOUND})`);
      sub.diagnostic(`bytes read per abusive connection: ${seen.map((line) => line.bytesRead).join(', ')}`);
      const fixedCpu = cpuNow(file('fixed-cpu.jsonl')) - cpuBefore;

      if (row.control) {
        assert.deepEqual(open.closedAfterMs, [null, null, null], 'the naive control must keep every abusive connection open, or this test cannot tell a naive server from the real one');
        await sleep(100);
        const controlCpu = cpuNow(file('control-cpu.jsonl')) - controlBefore;
        sub.diagnostic(`cpu ms: refusing server ${fixedCpu} for ${seen.map((line) => line.bytesRead).reduce((a, b) => a + b, 0)} bytes read, naive control ${controlCpu}`);
      }
      // CPU seconds (process.cpuUsage()) are not inflated by a loaded machine the way latency is: the refusing server may burn this much per
      // abusive connection, a server that keeps parsing an endless body burns seconds (the control above reads tens of MB in the same second).
      assert.ok(fixedCpu <= CPU_BOUND_MS * report.ports.length, `the refusing server burnt ${fixedCpu} ms of CPU for ${report.ports.length} abusive connections (bound ${CPU_BOUND_MS} ms each)`);
      const served = await s.withTimeout(h.get(origin, '/api/state'), 'a legitimate request was not served after the attack', 20000);
      assert.equal(served.status, 200);
    });
  }
  assert.equal((await naive.stop()), 0);
  const stopped = await kid.stop();
  assert.equal(stopped.code, 0, kid.errors());
});
