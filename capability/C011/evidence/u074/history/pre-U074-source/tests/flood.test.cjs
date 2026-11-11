'use strict';

// The flood part of "Every refusal closes the connection" (rev-C009 F1, F9c, L-0170, L-0204): a refusal flood is judged by STRUCTURE and by CONTROLS
// measured in the SAME run, never by seconds. The attacker runs in another process; the service, a bare 400-and-close reference and a NAIVE keep-alive
// server each run in a small-heap child, all three floods at once under the same load. The facts asserted: every attacker socket is closed by the
// server, no connection remains, a legitimate request is answered afterwards AND on a kept-alive connection during the flood, the bytes the server read
// stay close to the reference (a refused socket is not read on), the child's CPU time per socket stays within a ratio of the reference, the heap is
// bounded. The naive keep-alive control fails the structure BY NAME. Event-loop lag is only reported.
const assert = require('node:assert/strict');
const http = require('node:http');
const {randomBytes}=require('node:crypto');
const test = require('node:test');
const { startChildTarget } = require('./targets.cjs');
const { call } = require('./helpers.cjs');
const {runAttack}=require('./u073-attack.cjs');
const {problems:typedProblems,facts:typedFacts}=require('./u073-flood-oracle.cjs');
const {expected}=require('./u073-flood-workload.cjs');

const SOCKETS = 30;
const MB = 1024 * 1024;

async function until(check, label) {
  for (let turn = 0; turn < 20000; turn += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert.fail(`never held: ${label}`);
}

// A legitimate request on ONE kept-alive connection: it must keep being served while the flood runs and after it.
function neighbour(child) {
  const agent = new http.Agent({ keepAlive: true, maxSockets: 1 });
  const once = () => new Promise((resolve, reject) => {
    const request = http.request({ host: '127.0.0.1', port: child.port, path: '/v1/me', agent, headers: { Authorization: `Bearer ${child.tokens['conductor-a']}` } }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end();
  });
  return { once, close: () => agent.destroy() };
}

async function flood(mode, limitMs) {
  const cohort='u073-'+randomBytes(12).toString('hex');
  const child = await startChildTarget('default', { mode, watchdogMs: limitMs + 90000 });
  const kept = mode === 'service' ? neighbour(child) : null;
  try {
    const probe = () => (mode === 'service' ? call(child, child.tokens['conductor-b'], 'GET', '/v1/me') : call(child, null, 'GET', '/'));
    const expected = mode === 'service' ? 200 : 400;
    assert.equal((await probe()).status, expected, `${mode} answers before the flood`);
    if (kept) assert.equal(await kept.once(), 200);
    await child.stats({flood:{cohort,sockets:SOCKETS}});
    const before = await child.stats();
    const flooding = runAttack(child.port,SOCKETS,limitMs,cohort);
    const during = [];
    if (kept) for (let index = 0; index < 3; index += 1) during.push(await kept.once());
    const report = await flooding;
    await until(async () => (await child.stats()).connections === 0, `${mode} holds no connection after the attacker is gone`);
    const afterKept = kept ? await kept.once() : null;
    // The neighbour's last request opened a connection of its own that the client closes right after the answer: the final observation is the
    // very reading in which the child no longer counts it (rev-C010 M2: read at once, a child that is behind still counted it and the run failed under load).
    let settled = null;
    await until(async () => { settled = await child.stats(); return settled.connections === 0; }, `${mode} holds no connection after the neighbour's last request`);
    return { mode, cohort,report, stats: settled, before, status: (await probe()).status, expected, during, afterKept };
  } finally {
    kept?.close();
    await child.close();
  }
}

function violations(run, reference) {
  const found = [];
  if (run.report.timedOut || run.report.closed !== SOCKETS) found.push('SOCKETS_NOT_CLOSED_BY_THE_SERVER');
  if (run.stats.connections !== 0) found.push('CONNECTIONS_REMAIN');
  if (run.status !== run.expected) found.push('NO_ANSWER_AFTER_THE_FLOOD');
  if (run.stats.bytesRead > 2 * reference.stats.bytesRead + SOCKETS * 64 * 1024) found.push('BYTES_PARSED_AFTER_REFUSAL_UNBOUNDED');
  const cpu = (item) => (item.stats.cpuMicros - item.before.cpuMicros) / SOCKETS;
  if (cpu(run) > 10 * cpu(reference) + 20000) found.push('CPU_PER_SOCKET_UNBOUNDED');
  if (run.stats.heapUsed >= 32 * MB) found.push('HEAP_UNBOUNDED');
  return found;
}
const describe = (run) => ({ mode: run.mode, closed: run.report.closed, answered: run.report.answered, bytesRead: run.stats.bytesRead, cpuMsPerSocket: Number(((run.stats.cpuMicros - run.before.cpuMicros) / SOCKETS / 1000).toFixed(2)), lagMaxMs: Math.round(run.stats.lagMaxMs) });

test(`a refusal flood from ANOTHER process (${SOCKETS} sockets, endless chunked bodies, half of them queued behind a GET): the service is closed, bounded and answering (also a neighbour on a kept-alive connection), a NAIVE keep-alive control fails by name`, { timeout: 170000 }, async (t) => {
  const [reference, service, naive] = await Promise.all([flood('bare', 60000), flood('service', 60000), flood('naive', 2000)]);
  t.diagnostic(JSON.stringify({ reference: describe(reference), service: describe(service), naive: describe(naive) }));
  assert.deepEqual(violations(reference, reference), [], 'the bare reference satisfies the structure by construction');
  assert.deepEqual(violations(service, reference), []);
  assert.deepEqual([...service.during, service.afterKept], [200, 200, 200, 200], 'the neighbour on a kept-alive connection is served during and after the flood');
  assert.deepEqual(typedProblems(service.stats.floodObservation,{cohort:service.cohort,sockets:SOCKETS}),[],
    'U073 the same-flood actual server cohort writes every required typed response, independently of lossy client receipt');
  const writes=typedFacts(service.stats.floodObservation);
  assert.deepEqual(writes,{actualServerFrames:45,actualTypedTerminalWrites:30,
    statuses:{200:15,401:15,404:4,405:4,414:4,421:3}},'exact counts come from thirty observed terminal requests and fifteen observed preceding GETs');
  assert.deepEqual(service.stats.floodObservation.booksAfter,service.stats.floodObservation.booksBefore,'the actual same-flood books have no effect');
  assert.equal(service.report.submitted,SOCKETS,'the attacker submitted or observed closure of every intended socket before its complete report');
  for(const socket of service.report.sockets){
    const plan=expected(socket.slot),allowed=plan.precedingPublicGet?[200,plan.status]:[plan.status];
    assert.deepEqual(socket.retainedStatuses,allowed.slice(0,socket.retainedStatuses.length),'any retained client status is consistent; none is inferred from server closure');
  }
  t.diagnostic('U073_CAUSAL_SERVER_WRITES '+JSON.stringify({cohort:service.cohort,writes,clientRetainedTerminalReplies:service.report.answered,
    serverBarrier:service.stats.floodObservation.barrier,oldClientMinimumPredicateUsed:false}));
  const found = violations(naive, reference);
  assert.ok(found.includes('SOCKETS_NOT_CLOSED_BY_THE_SERVER'), `the naive server was not detected: ${found}`);
  assert.equal(naive.report.timedOut, true);
  assert.ok(naive.report.burstsAfterAnswer > 0, 'the attacker kept sending after the answer: nothing stopped it');
});
