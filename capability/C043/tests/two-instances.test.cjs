'use strict';

// R3 self-review line 1 (TWO INSTANCES): everything that owns, closes, counts or marks per session is tested with TWO live
// instances in one process: two servers (each with its own step service, runner, journals and per-connection marks) and two
// runners. They are used and closed in FIFO and in LIFO order, one of them is closed twice, an unrelated neighbour must stay
// untouched (its answers, its ledger, its journals and the open connection of a client), and a connection of A that is
// refused (marked, destroyed) must not touch the connections B serves.
const net = require('node:net');
const test = require('node:test');
const { closeServer } = require('../server.cjs');
const {
  assert, boot, call, committed, doc, gate, startService,
} = require('./support.cjs');
const { exchange, get, mutation, parseAnswers, presetBody, quiet } = require('./pipe-support.cjs');

const journals = (service) => `${service.stepIo.read()}|${service.runIo.read()}`;
const refused = (port) => call(port, 'GET', '/v1/leases').then(() => 'answered', (error) => error.code);
// No idle timer may close the open connection of the neighbour behind the back of this test (the default keep-alive bound is 1 s).
const QUIET = Object.freeze({ requestMs: 600000, headersMs: 600000, keepAliveMs: 600000, firstRequestMs: 600000, idleMs: 600000 });

async function twoServers(options = {}) {
  const a = await startService(options);
  const b = await startService(options);
  assert.notEqual(a.port, b.port, 'two listeners, two ports');
  for (const service of [a, b]) assert.equal((await call(service.port, 'POST', '/v1/presets', presetBody(1))).status, 201);
  assert.deepEqual([committed(a.real), committed(b.real)], [15, 15], 'each service has its own ledger');
  return { a, b };
}

async function neighbourStillServes(neighbour, expectedCommitted, n) {
  const before = journals(neighbour);
  assert.equal((await call(neighbour.port, 'GET', '/v1/leases')).status, 200, 'the neighbour answers');
  assert.equal(journals(neighbour), before, 'the neighbour journals were not touched');
  assert.equal(committed(neighbour.real), expectedCommitted);
  assert.equal((await call(neighbour.port, 'POST', '/v1/presets', presetBody(n))).status, 201, 'the neighbour still applies a new mutation');
  assert.equal(committed(neighbour.real), expectedCommitted + 15);
}

test('two live servers closed in FIFO order: the neighbour keeps its ledger, its journals and its answers, a repeated close resolves', { timeout: 120000 }, async () => {
  const { a, b } = await twoServers();
  try {
    await a.stop();
    assert.equal(await refused(a.port), 'ECONNREFUSED', 'the closed server accepts no connection');
    await neighbourStillServes(b, 15, 2);
    await a.stop();
    assert.equal(await refused(a.port), 'ECONNREFUSED', 'a repeated close changes nothing');
    await neighbourStillServes(b, 30, 3);
  } finally {
    await b.stop();
    await b.stop();
  }
});

test('two live servers closed in LIFO order: the first one keeps its ledger, its journals and its answers', { timeout: 120000 }, async () => {
  const { a, b } = await twoServers();
  try {
    await b.stop();
    assert.equal(await refused(b.port), 'ECONNREFUSED');
    await neighbourStillServes(a, 15, 2);
  } finally {
    await a.stop();
    await b.stop();
  }
});

test('a keep-alive connection of B survives the close of A, and a connection of A that is refused (marked and destroyed) does not touch the connections B serves', { timeout: 120000 }, async () => {
  const { a, b } = await twoServers({ bounds: QUIET });
  const socket = net.connect({ host: '127.0.0.1', port: b.port });
  const chunks = [];
  socket.on('error', () => {});
  socket.on('data', (chunk) => chunks.push(chunk));
  await new Promise((resolve) => socket.once('connect', resolve));
  const text = () => Buffer.concat(chunks).toString('latin1');
  const answers = async (count) => { for (let turn = 0; turn < 4000 && parseAnswers(text()).length < count; turn += 1) await new Promise((resolve) => setTimeout(resolve, 5)); };
  try {
    socket.write(get(b.port, '/v1/leases'));
    await answers(1);
    const [pending, served] = await Promise.all([
      exchange(a.port, [get(a.port, '/nope'), mutation(a.port, 7)]),
      exchange(b.port, [get(b.port, '/v1/leases'), mutation(b.port, 8), get(b.port, '/v1/leases')], { answers: 3 }),
    ]);
    assert.deepEqual([pending.statuses, pending.closed], [[404], true], 'the refused connection of A answered the refusal and was closed');
    assert.deepEqual(served.statuses, [200, 201, 200], 'B served its own pipeline in order while A refused');
    await quiet(a);
    await quiet(b);
    assert.deepEqual([committed(a.real), committed(b.real)], [15, 30], 'nothing ran behind the refusal of A, B applied its own mutation');
    await a.stop();
    socket.write(get(b.port, '/v1/leases'));
    await answers(2);
    assert.deepEqual(parseAnswers(text()).map((answer) => answer.status), [200, 200], 'the open connection of B was answered again after A closed');
  } finally {
    socket.destroy();
    await a.stop();
    await b.stop();
  }
});

test('two live runners over their own step services and journals: halting one never stops the other, and a repeated halt is harmless', { timeout: 120000 }, async () => {
  const heldA = gate();
  const heldB = gate();
  const a = await boot({ executor: heldA.executor });
  const b = await boot({ executor: heldB.executor });
  try {
    const bytes = (value) => Buffer.from(JSON.stringify(value));
    const runB = b.runner.run(bytes(doc({ idempotencyKey: 'preset-run-0002' })));
    await heldB.entered('preset-a-step-1');
    a.runner.halt();
    a.runner.halt();
    const runA = await a.runner.run(bytes(doc()));
    assert.equal(runA.body.error.code, 'RUN_JOURNAL_UNAVAILABLE', 'the halted runner refuses');
    for (const index of [1, 2, 3]) heldB.release(`preset-a-step-${index}`);
    const finished = await runB;
    assert.equal(finished.status, 201, 'the neighbour runner completed its preset');
    assert.deepEqual([committed(a.real), committed(b.real)], [0, 15]);
    assert.equal(a.runner.inspect('preset-run-0001').status, 503, 'the halted runner answers unavailable, it does not know the neighbour either');
    assert.equal(b.runner.inspect('preset-run-0002').status, 200);
    a.runner.halt();
  } finally {
    a.real.halt();
    b.real.halt();
  }
});

test('closeServer of one server halts only its own runner and step service: the neighbour accepts a new run afterwards', { timeout: 120000 }, async () => {
  const a = await startService();
  const b = await startService();
  try {
    await closeServer(a.server);
    assert.equal((await b.runner.run(Buffer.from(JSON.stringify(doc())))).status, 201);
    assert.equal(committed(b.real), 15);
    assert.equal((await a.runner.run(Buffer.from(JSON.stringify(doc())))).body.error.code, 'RUN_JOURNAL_UNAVAILABLE');
  } finally {
    await a.stop();
    await b.stop();
  }
});
