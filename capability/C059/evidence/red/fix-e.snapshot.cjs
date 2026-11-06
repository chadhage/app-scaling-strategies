'use strict';

// Review F2 and F4 (C059): a refusal flood is judged by STRUCTURE and by CONTROLS measured in the SAME run, never by seconds. The attacker runs in
// another process; the service, a bare 400-and-close reference and a NAIVE keep-alive server each run in a small-heap child. The facts asserted:
// every attacker socket is closed by the server, no connection remains, a GET is answered afterwards, the bytes the server read from the sockets
// stay close to the reference (a refused socket is not read on), the child's CPU time per socket stays within a ratio of the reference, and the
// heap is bounded. The naive keep-alive server fails the same assertions BY NAME. Event-loop lag is only reported (a diagnostic): the platform and
// the scheduler dominate it (a bare reference showed 490 ms, 11 s and 37 s for 10, 60 and 200 sockets on a loaded machine).
// C059_FLOOD_SUBJECT=naive replays the RED: the naive server takes the place of the service and the first test fails by name.
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const test = require('node:test');
const { MB, call, startChild, until } = require('./helpers-5/net.cjs');

const SOCKETS = 60;
const SUBJECT = process.env.C059_FLOOD_SUBJECT === 'naive' ? 'naive' : 'service';
// Timers that would end an upload or an idle connection anyway are set to ten minutes, so only the rule under test can close it.
const QUIET = Object.freeze({ requestMs: 600000, headersMs: 600000, keepAliveMs: 600000, idleMs: 600000, firstRequestMs: 600000 });

function attack(port, connections, limitMs) {
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.NODE_V8_COVERAGE;
  const child = spawn(process.execPath, [path.join(__dirname, 'helpers-5', 'attacker.cjs'), String(port), String(connections), String(limitMs)], { env, windowsHide: true });
  const chunks = [];
  child.stdout.on('data', (chunk) => chunks.push(chunk));
  const watchdog = setTimeout(() => child.kill(), limitMs + 15000);
  return new Promise((resolve, reject) => child.once('close', (code) => {
    clearTimeout(watchdog);
    try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(new Error(`the attacker printed no report (exit ${code})`)); }
  }));
}

// One flood against one kind of server; the limit is a watchdog for a server that never closes, not an assertion about speed.
async function flood(mode, limitMs) {
  const child = await startChild({ mode, bounds: QUIET, watchdogMs: limitMs + 90000 });
  try {
    assert.equal((await call(child.port, 'GET', mode === 'service' ? '/scope.json' : '/')).status, mode === 'service' ? 200 : 400, `${mode} answers before the flood`);
    await child.stats(true);
    const before = await child.stats();
    const report = await attack(child.port, SOCKETS, limitMs);
    await until(async () => (await child.stats()).connections === 0, `${mode} holds no connection after the attacker is gone`);
    const stats = await child.stats();
    const status = (await call(child.port, 'GET', mode === 'service' ? '/scope.json' : '/')).status;
    return { mode, report, stats, before, status, expected: mode === 'service' ? 200 : 400 };
  } finally {
    child.dispose();
  }
}

// The structural facts; each violated one is named. The reference is a bare 400-and-close server measured in the same run.
function violations(run, reference) {
  const found = [];
  const { report, stats, before } = run;
  if (report.timedOut || report.closed !== SOCKETS) found.push('SOCKETS_NOT_CLOSED_BY_THE_SERVER');
  if (stats.connections !== 0) found.push('CONNECTIONS_REMAIN');
  if (run.status !== run.expected) found.push('NO_ANSWER_AFTER_THE_FLOOD');
  if (stats.bytesRead > 2 * reference.stats.bytesRead + SOCKETS * 64 * 1024) found.push('BYTES_PARSED_AFTER_REFUSAL_UNBOUNDED');
  const cpu = (item) => (item.stats.cpuMicros - item.before.cpuMicros) / SOCKETS;
  if (cpu(run) > 10 * cpu(reference) + 20000) found.push('CPU_PER_SOCKET_UNBOUNDED');
  if (stats.heapUsed >= 32 * MB) found.push('HEAP_UNBOUNDED');
  return found;
}

const describe = (run) => ({ mode: run.mode, closed: run.report.closed, answered: run.report.answered, bytesRead: run.stats.bytesRead, cpuMsPerSocket: Number(((run.stats.cpuMicros - run.before.cpuMicros) / SOCKETS / 1000).toFixed(2)), lagMaxMs: Math.round(run.stats.lagMaxMs) });

test(`a refusal flood from ANOTHER process (${SOCKETS} sockets, endless chunked bodies) against the ${SUBJECT === 'service' ? 'service' : 'NAIVE server (RED replay)'}: closed, bounded, answering, compared with a bare reference of the same run`, { timeout: 300000 }, async (t) => {
  const reference = await flood('bare', 120000);
  const subject = await flood(SUBJECT, SUBJECT === 'naive' ? 4000 : 120000);
  t.diagnostic(JSON.stringify({ reference: describe(reference), subject: describe(subject) }));
  assert.deepEqual(violations(reference, reference), [], 'the bare reference satisfies the structure by construction');
  assert.deepEqual(violations(subject, reference), []);
  assert.ok(subject.report.answered >= 1, 'some attackers saw a typed answer (a reset may discard the rest; the typed answers are proved without a race in server.test.cjs and pipelining.test.cjs)');
});

test('control: a NAIVE keep-alive server fails the structure by name (its sockets are never closed), a bare 400-and-close server passes', { timeout: 300000 }, async (t) => {
  const reference = await flood('bare', 120000);
  const naive = await flood('naive', 4000);
  t.diagnostic(JSON.stringify({ reference: describe(reference), naive: describe(naive) }));
  assert.deepEqual(violations(reference, reference), []);
  const found = violations(naive, reference);
  assert.ok(found.includes('SOCKETS_NOT_CLOSED_BY_THE_SERVER'), `the naive server was not detected: ${found}`);
  assert.equal(naive.report.timedOut, true);
  assert.ok(naive.report.burstsAfterAnswer > 0, 'the attacker kept sending after the answer, nothing stopped it');
});
