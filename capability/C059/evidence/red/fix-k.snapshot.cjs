'use strict';

// RED snapshot of tests\lane.test.cjs (second review, N1; the FINAL form of run-7's tests: a connection the server keeps open is an assertion, never a thrown timeout, and the depth bound is
// measured): a Node-own refusal decided at PARSE time (the 417 of checkExpectation) ran outside the per-socket lane, so with two or more legitimate requests pipelined BEFORE it the earlier
// request was dropped, the 417 never came and the connection stayed open. Against the service AS PUBLISHED in dfdace94 (evidence\red\stubs-5\server.cjs, loaded by
// helpers-4\old-server-loader.cjs) every 417 row fails and the rows that were already right (a refused 100-continue, no Host, the service's own refusals, the parse errors, the depth
// bound) pass as controls. Replay: C059_RED_SUBJECT=capability\C059\evidence\red\stubs-5 (old), unset (the final code).
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, startChild, startService } = require('./helpers-6/net.cjs');
const { FRAMINGS, ROWS, SHAPES, exchange, request, runRow, submitBody } = require('./helpers-10/lane-support.cjs');

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
test.after(async () => { for (const pending of hosts.values()) await (await pending).dispose(); });

for (const name of ['in a SEPARATE process', 'in this process']) {
  for (const item of rows) {
    test(`lane [${name}] ${item.name}: ${SHAPES.length} shapes in ${QUICK ? 1 : FRAMINGS.length} framings, one to three legitimate requests before it, nothing behind it runs, the server closes`, OPTIONS, async () => {
      const { port } = await host(name);
      assert.deepEqual(await runRow(port, item, 12, QUICK ? [['1.1', '1.1']] : FRAMINGS), []);
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
