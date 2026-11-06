'use strict';

// A request PIPELINED BEHIND A REFUSAL must never run (orders\_PIPELINING.md; rev-C009 F1b, rev-C043 F1). Node parses every pipelined request of one
// TCP read and emits each 'request' before the first answer exists. Raw sockets against the service in a SEPARATE process, ONE write per case unless
// stated. Every case uses its own idempotency key, and the lease ledger, the journal record count and that key's step are compared with the state before.
const assert = require('node:assert/strict');
const net = require('node:net');
const test = require('node:test');
const { call, settleTurn, startChild } = require('./helpers-4/net.cjs');

const OPTIONS = { timeout: 60000 };
const hardTimeout = (ms, label) => new Promise((resolve, reject) => { setTimeout(() => reject(new Error(`hard timeout: ${label}`)), ms).unref(); });
const withBody = (port, line, body, headers = []) => `${line} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${headers.map((header) => `${header}\r\n`).join('')}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
const bare = (port, target, extra = '') => `GET ${target} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${extra}\r\n`;
const JSON_TYPE = ['Content-Type: application/json'];

function chunkedBody(text) {
  const bytes = Buffer.from(text);
  let out = '';
  for (let at = 0; at < bytes.length; at += 7) out += `${Math.min(7, bytes.length - at).toString(16)}\r\n${bytes.subarray(at, at + 7).toString('latin1')}\r\n`;
  return `${out}0\r\n\r\n`;
}

function parseResponses(text) {
  const out = [];
  for (let rest = text; rest.startsWith('HTTP/1.1 ');) {
    const split = rest.indexOf('\r\n\r\n');
    if (split < 0) break;
    const head = rest.slice(0, split);
    const length = Number(/content-length: (\d+)/i.exec(head)?.[1] ?? 0);
    let json = null;
    try { json = JSON.parse(rest.slice(split + 4, split + 4 + length)); } catch { json = null; }
    const status = Number(/^HTTP\/1\.1 (\d+)/.exec(head)[1]);
    if (status !== 100) out.push({ status, code: json?.error?.code ?? null, close: /connection: close/i.test(head) });
    rest = rest.slice(split + 4 + length);
  }
  return out;
}

// Writes the parts (one write, or one after the other), then waits for the SERVER to close the connection: a connection that stays open fails the case.
async function exchange(port, parts, { oneWrite = true } = {}) {
  const socket = net.connect({ host: '127.0.0.1', port });
  const chunks = [];
  socket.on('error', () => {});
  socket.on('data', (chunk) => chunks.push(chunk));
  const closed = new Promise((resolve) => socket.once('close', resolve));
  try {
    if (oneWrite) socket.write(Buffer.from(parts.join(''), 'latin1'));
    else for (const part of parts) { await new Promise((resolve) => socket.write(Buffer.from(part, 'latin1'), resolve)); await settleTurn(); }
    await Promise.race([closed, hardTimeout(20000, 'the server kept the connection open after a refusal')]);
    return parseResponses(Buffer.concat(chunks).toString('latin1'));
  } finally {
    socket.destroy();
  }
}

let shared = null;
let counter = 0;
test.after(() => { shared?.dispose(); });

// One service child for the whole file; every case gets a fresh key, so the cases do not depend on each other.
async function scenario(run, { fresh = false } = {}) {
  const child = fresh ? await startChild() : (shared ??= await startChild());
  try {
    counter += 1;
    const key = `pipe-key-${String(counter).padStart(4, '0')}`;
    const port = child.port;
    const input = (over = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId: 'synthetic-lease-001', units: 1, ...over });
    const submit = (over, headers = JSON_TYPE) => withBody(port, 'POST /v1/steps', JSON.stringify(input(over)), headers);
    const observe = async () => {
      const leases = (await call(port, 'GET', '/v1/leases')).json;
      return { committed: leases.leases['synthetic-lease-001'].committed, records: leases.journalRecords, stepStatus: (await call(port, 'GET', `/v1/steps/${key}`)).status };
    };
    const before = await observe();
    assert.equal(before.stepStatus, 404);
    return await run({ port, key, input, submit, observe, before });
  } finally {
    if (fresh) child.dispose();
  }
}

// Every refusal the service can emit, complete on the wire (a declared-too-large body swallows what follows it: proved in server.test.cjs).
const REFUSALS = [
  ['a foreign Host', () => 'GET / HTTP/1.1\r\nHost: example.test\r\n\r\n', 421],
  ['a cross origin', (p) => bare(p, '/scope.json', 'Origin: http://evil.test\r\n'), 403],
  ['a URL that is too long', (p) => bare(p, `/${'a'.repeat(2100)}`), 414],
  ['another authority in the target', (p) => bare(p, '//evil.test/x'), 400],
  ['a query', (p) => bare(p, '/v1/leases?x=1'), 400],
  ['a GET with a body', (p) => withBody(p, 'GET /v1/leases', 'abcd'), 400],
  ['PUT on the step route', (p) => withBody(p, 'PUT /v1/steps', 'abcd'), 405],
  ['POST on an asset', (p) => withBody(p, 'POST /scope.json', 'abcd'), 405],
  ['an unknown route with a body', (p) => withBody(p, 'POST /admin', 'abcd'), 404],
  ['a wrong media type', (p) => withBody(p, 'POST /v1/steps', 'abcd', ['Content-Type: text/plain']), 415],
  ['a key that is not a key', (p) => withBody(p, 'POST /v1/steps/not%20a%20key/cancel', ''), 400],
  ['an action with a body', (p) => withBody(p, 'POST /v1/steps/pipe-key-9999/cancel', 'abcd'), 400],
  ['a GET on an action route', (p) => bare(p, '/v1/steps/pipe-key-9999/cancel'), 405],
  ['an unknown expectation', (p) => bare(p, '/scope.json', 'Expect: nonsense\r\n'), 417],
  ['an invalid JSON body (refused after the body was read)', (p) => withBody(p, 'POST /v1/steps', '{"units":', JSON_TYPE), 400],
  ['a missing field (after the body was read)', (p) => withBody(p, 'POST /v1/steps', '{}', JSON_TYPE), 400],
  ['an unknown field (after the body was read)', (p) => withBody(p, 'POST /v1/steps', JSON.stringify({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'pipe-other-0001', leaseId: 'synthetic-lease-001', units: 1, extra: 1 }), JSON_TYPE), 400],
  ['an unsupported schema version (after the body was read)', (p) => withBody(p, 'POST /v1/steps', JSON.stringify({ schemaVersion: 2, step: 'reserve-capacity', idempotencyKey: 'pipe-other-0001', leaseId: 'synthetic-lease-001', units: 1 }), JSON_TYPE), 422],
  ['a refused chunked body (complete)', (p) => `POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${p}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n${chunkedBody('{}')}`, 400],
];

for (const [name, make, status] of REFUSALS) {
  test(`pipelined: [${name}][valid submit] in ONE write: only the refusal ${status} is answered, the connection closes and the submit never runs`, OPTIONS, async () => {
    await scenario(async ({ port, submit, observe, before }) => {
      const answers = await exchange(port, [make(port), submit()]);
      assert.deepEqual(answers.map((item) => item.status), [status]);
      assert.equal(answers[0].close, true, 'the refusal says Connection: close');
      assert.deepEqual(await observe(), before, 'the ledger, the journal and the step are unchanged');
    });
  });

  test(`pipelined: [valid GET][${name}][valid submit] in ONE write: the GET and the refusal are answered, the submit never runs`, OPTIONS, async () => {
    await scenario(async ({ port, submit, observe, before }) => {
      const answers = await exchange(port, [bare(port, '/scope.json'), make(port), submit()]);
      assert.deepEqual(answers.map((item) => item.status), [200, status]);
      assert.deepEqual(await observe(), before);
    });
  });
}

for (const [name, make, status] of REFUSALS.filter((item) => [415, 417, 405, 400].includes(item[2]) && !/chunked/.test(item[0])).filter((item, index) => index % 2 === 0)) {
  test(`pipelined in TWO writes: [${name}] then [valid submit] written after it: the submit never runs`, OPTIONS, async () => {
    await scenario(async ({ port, submit, observe, before }) => {
      const answers = await exchange(port, [make(port), submit()], { oneWrite: false });
      assert.deepEqual(answers.map((item) => item.status), [status]);
      assert.deepEqual(await observe(), before);
    });
  });
}

test('pipelined: [valid submit][refusal]: the first submit applies and is answered, then the refusal, then the connection closes', OPTIONS, async () => {
  await scenario(async ({ port, submit, observe, before }) => {
    const answers = await exchange(port, [submit(), bare(port, '/nope')]);
    assert.deepEqual(answers.map((item) => item.status), [201, 404]);
    assert.deepEqual(await observe(), { committed: before.committed + 1, records: before.records + 2, stepStatus: 200 });
  });
});

test('pipelined: a submit with chunked framing or Expect: 100-continue behind a refusal never runs; the same submit before a refusal applies', OPTIONS, async () => {
  await scenario(async ({ port, input, submit, observe, before }) => {
    const chunkedSubmit = () => `POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n${chunkedBody(JSON.stringify(input()))}`;
    for (const make of [chunkedSubmit, () => submit({}, [...JSON_TYPE, 'Expect: 100-continue'])]) {
      const answers = await exchange(port, [bare(port, '/nope'), make()]);
      assert.deepEqual(answers.map((item) => item.status), [404]);
      assert.deepEqual(await observe(), before);
    }
    const first = await exchange(port, [chunkedSubmit(), bare(port, '/nope')]);
    assert.deepEqual(first.map((item) => item.status), [201, 404]);
    assert.equal((await observe()).committed, before.committed + 1);
  });
});

test('pipelined: an engine rejection (quota full) is a refusal too: the submit behind it never runs', OPTIONS, async () => {
  await scenario(async ({ port, input, submit, observe, before }) => {
    assert.equal((await call(port, 'POST', '/v1/steps', input({ idempotencyKey: 'pipe-fill-0001', leaseId: 'synthetic-lease-002', units: 10 }))).status, 201);
    const filled = await observe();
    const answers = await exchange(port, [submit({ idempotencyKey: 'pipe-over-0001', leaseId: 'synthetic-lease-002', units: 1 }), submit()]);
    assert.deepEqual(answers.map((item) => [item.status, item.code]), [[409, 'CAPACITY_EXHAUSTED']]);
    assert.deepEqual(await observe(), { ...filled, committed: before.committed });
  }, { fresh: true });
});

test('pipelined: honest requests are still answered in order, one at a time; more pipelined requests than the bound close the connection', OPTIONS, async () => {
  await scenario(async ({ port, submit, observe, before }) => {
    const answers = await exchange(port, [bare(port, '/scope.json'), submit(), bare(port, '/v1/leases', 'Connection: close\r\n')]);
    assert.deepEqual(answers.map((item) => item.status), [200, 201, 200]);
    assert.equal((await observe()).committed, before.committed + 1);
    const many = await exchange(port, Array.from({ length: 12 }, () => bare(port, '/scope.json')));
    assert.ok(many.length <= 5 && many.every((item) => item.status === 200), `${many.length} answers before the bound closed the connection`);
  });
});
