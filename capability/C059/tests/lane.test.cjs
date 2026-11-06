'use strict';

// Second review, N1: a Node-own refusal decided at parse time (the 417 of checkExpectation) ran OUTSIDE the per-socket lane: with two or more legitimate
// requests pipelined BEFORE it, the refusal cleared the queue, the earlier request was dropped, Node could not flush the 417 queued behind it and the
// connection stayed open. Every Node-own answer now goes through the same lane as the service's own refusals: the earlier requests are answered IN ORDER,
// then the typed refusal, then the connection closes. The matrix puts one to three legitimate requests BEFORE every Node-own refusal (and a mutation
// behind it) in HTTP/1.1 and HTTP/1.0 framing, with and without a body, against the service in THIS process and in a SEPARATE process (tests\lane-support.cjs).
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, startChild, startService } = require('./net.cjs');
const { c042 } = require('./harness.cjs');
const { FRAMINGS, ROWS, SHAPES, exchange, request, runRow, submitBody } = require('./lane-support.cjs');

const OPTIONS = { timeout: 180000 };
// C059_MATRIX=quick (the mutation runs only): a mutant that keeps connections open makes every case wait for the hard bound, so one framing pair and
// the shapes that carry the guards are enough to kill it by name; the full matrix runs in the green run and in every RED replay.
const QUICK = process.env.C059_MATRIX === 'quick';
const rows = QUICK ? ROWS.filter((item) => /expectation|100-continue|service itself/.test(item.name)) : ROWS;
const hosts = new Map();
const host = async (name) => {
  if (!hosts.has(name)) hosts.set(name, name === 'in this process' ? startService().then((service) => ({ port: service.port, dispose: () => service.stop() })) : startChild({ watchdogMs: 900000 }).then((child) => ({ port: child.port, dispose: () => child.dispose() })));
  return hosts.get(name);
};
// Every ROW gets its own service: the rows commit steps against the finite capacity of the synthetic leases (every shape with a valid submit before the refusal consumes units), so one shared
// service would run out of capacity as rows are added (a legitimate submit then answers 409 CAPACITY_EXHAUSTED and the row fails for a reason that has nothing to do with the lane).
const fresh = (name) => (name === 'in this process' ? startService().then((service) => ({ port: service.port, dispose: () => service.stop() })) : startChild({ watchdogMs: 900000 }).then((child) => ({ port: child.port, dispose: () => child.dispose() })));
test.after(async () => { for (const pending of hosts.values()) await (await pending).dispose(); });

for (const name of ['in a SEPARATE process', 'in this process']) {
  for (const item of rows) {
    test(`lane [${name}] ${item.name}: ${SHAPES.length} shapes in ${QUICK ? 1 : FRAMINGS.length} framings, one to three legitimate requests before it, nothing behind it runs, the server closes`, OPTIONS, async () => {
      const { port, dispose } = await fresh(name);
      try {
        assert.deepEqual(await runRow(port, item, 12, QUICK ? [['1.1', '1.1']] : FRAMINGS), []);
      } finally {
        await dispose();
      }
    });
  }
}

test('the reviewer shapes in the open: [G][G][X] gets 200, 200, then the typed 417 with Connection: close, and the server closes (separate process)', OPTIONS, async () => {
  const { port } = await host('in a SEPARATE process');
  const get = request(port, 'GET', '/scope.json', '1.1');
  const x = request(port, 'GET', '/scope.json', '1.1', ['Expect: nonsense']);
  for (const [label, bytes, statuses] of [['[G][X]', get + x, [200, 417]], ['[G][G][X]', get + get + x, [200, 200, 417]], ['[G][G][G][X]', get + get + get + x, [200, 200, 200, 417]], ['[G][G][X][G]', get + get + x + get, [200, 200, 417]]]) {
    const answers = await exchange(port, bytes);
    assert.deepEqual(answers.map((answer) => answer.status), statuses, label);
    assert.deepEqual([answers.at(-1).code, answers.at(-1).close], ['EXPECTATION_NOT_SUPPORTED', true], label);
  }
});

test('Q1: the refused request ITSELF applies nothing: for every refusal that carries a valid step body the lease ledger and the journal record count are exactly as before, and the same step sent plainly is applied (the control)', OPTIONS, async () => {
  const io = c042('journal.cjs').createMemoryIo();
  const service = await startService({ io });
  try {
    const { port } = service;
    const records = () => io.read().split('\n').filter((line) => line !== '').length;
    const state = async () => ({ leases: (await call(port, 'GET', '/v1/leases')).json, records: records() });
    const before = await state();
    const items = ROWS.filter((item) => item.valid);
    assert.ok(items.length >= 3, 'the unknown expectation, the chunked one and the refused 100-continue carry a valid step');
    for (const item of items) {
      const refused = [];
      const answers = await exchange(port, item.make(port, '1.1', refused));
      assert.deepEqual(answers.map((answer) => [answer.status, answer.code, answer.close]), [[item.status, item.code, true]], item.name);
      for (const key of refused) assert.equal((await call(port, 'GET', `/v1/steps/${key}`)).status, 404, `${item.name}: ${key} was never recorded`);
      assert.deepEqual(await state(), before, `${item.name}: the ledger and the journal are as before the refused request`);
    }
    const control = await call(port, 'POST', '/v1/steps', submitBody('lane-ctrl-0001'));
    assert.equal(control.status, 201, 'the same valid step sent plainly is applied');
    const after = await state();
    assert.equal(after.leases.leases['synthetic-lease-001'].committed, before.leases.leases['synthetic-lease-001'].committed + 1, 'the control changed the ledger by its one unit');
    assert.ok(after.records > before.records, 'and the journal');
  } finally {
    await service.stop();
  }
});

test('a mutation pipelined BEFORE a Node-own 417 runs exactly once and is answered, the one behind it never runs ([M][M][X][M])', OPTIONS, async () => {
  const { port } = await host('in a SEPARATE process');
  const submit = (key) => request(port, 'POST', '/v1/steps', '1.1', ['Content-Type: application/json'], submitBody(key));
  const x = request(port, 'GET', '/scope.json', '1.1', ['Expect: nonsense']);
  const answers = await exchange(port, submit('lane-open-0001') + submit('lane-open-0002') + x + submit('lane-open-0003'));
  assert.deepEqual(answers.map((answer) => answer.status), [201, 201, 417]);
  for (const key of ['lane-open-0001', 'lane-open-0002']) assert.equal((await call(port, 'GET', `/v1/steps/${key}`)).json.attempts, 1, `${key} ran exactly once`);
  assert.equal((await call(port, 'GET', '/v1/steps/lane-open-0003')).status, 404, 'the mutation behind the refusal never ran');
});

test('the depth bound of the lane as the README states it: one running and four waiting requests (5 GETs) are answered in order; a longer pipeline is cut and the server closes (the answers still unsent are lost)', OPTIONS, async () => {
  const { port } = await host('in a SEPARATE process');
  const get = request(port, 'GET', '/scope.json', '1.1');
  assert.deepEqual((await exchange(port, get.repeat(5))).map((answer) => answer.status), [200, 200, 200, 200, 200]);
  for (const count of [6, 8, 12]) {
    const answers = await exchange(port, get.repeat(count));
    assert.ok(answers.length < count && answers.every((answer) => answer.status === 200), `${count} GETs in one write: ${JSON.stringify(answers.map((answer) => answer.status))} (cut at the bound, the connection is closed)`);
  }
});
