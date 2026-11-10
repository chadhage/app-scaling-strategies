'use strict';

// What waits behind a refusal never runs, for EVERY kind of refusal (review D1 of the fourth review; lessons L-0226 and L-0211). The service runs the pipelined requests of one connection one
// at a time, and a refusal drops what waits behind it. The VICTIM is a body-less POST /v1/steps/<key>/cancel of a step that is IN FLIGHT on ANOTHER connection (A): if it ever ran, the step of A
// would end cancelled (A would get a 409) and the lease ledger and the journal would change. The family is a table: the kind of refusal (decided at once by Node's parser, or decided in its
// turn by the service), the first request of the connection (one that completes, or a second slow step held by the gate) and the shape of the writes (everything in one write, or the last part
// sent only after Node parsed the earlier requests). Nothing here decides by a duration: the steps are held by a gate that the test releases, a write waits for an observable condition (the
// requests Node has parsed on the connection), and the ABSENCE of the victim is proved after a barrier (the connection of the refusal is closed, the second step finished, a round trip on a
// third connection was answered and event-loop turns passed). A hard watchdog only turns a hang into a failed test. The victim is a named CONTROL where nothing refuses it: then it MUST run.
const assert = require('node:assert/strict');
const test = require('node:test');
const { call, connect, settleTurn, startService, until } = require('./net.cjs');
const { NODE_OWN, TABLE } = require('./refusal-table.cjs');
const { ROWS, parseResponses } = require('./pipelining-support.cjs');

const OPTIONS = { timeout: 300000 };
const LEASE = 'synthetic-lease-001';
const KEY_A = 'vic-a-0001';
const KEY_OTHER = 'vic-o-0001';
const stuck = (ms, label) => new Promise((resolve, reject) => { setTimeout(() => reject(new Error(`hard timeout: ${label}`)), ms).unref(); });
const stepBody = (key) => JSON.stringify({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId: LEASE, units: 1 });
const submit = (port, key) => `POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(stepBody(key))}\r\n\r\n${stepBody(key)}`;
const scope = (port) => `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;
const cancel = (port, key) => `POST /v1/steps/${key}/cancel HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;
const head = (port, line, extra = '') => `${line}\r\nHost: 127.0.0.1:${port}\r\n${extra}\r\n`;

// Rows after which Node parses NOTHING: a declared body (5000 bytes) swallows whatever follows it, and a request that says Connection: close or asks for an Upgrade ends the connection by its own
// header. No victim can be queued behind them, so they are named controls that say so: the victim is never parsed (asserted: exactly two requests are parsed), the step of A is untouched, and the
// answers of B are NOT asserted (the server destroys a socket that still has unread bytes, and a TCP reset may discard an answer that was flushed: tests\server.test.cjs asserts each of these refusals alone).
const UNPARSED = new Set([
  'a declared body that is too large',
  'no transcript configured (bodiless: nothing to leave unread)',
  'a key that is not a key (inspect; bodiless)',
  'a refused request that also asks for an Upgrade',
]);
const LANE_AFTER_AWAIT = /after the body was read|refused chunked body|checkContinue|Upgrade/;
const toRow = (kind) => ([name, make, status, code, more]) => ({ kind, name, make, status, code, ...(typeof more === 'object' ? more : {}) });

// Refusals decided IN THE LANE, in their turn: the whole table of tests\server.test.cjs, the answers Node would give itself that the service decides in its turn (417, a request without Host)
// and the refusals decided after the body was read or for a request that asked for 100-continue (tests\pipelining-support.cjs).
const LANE_ROWS = [
  ...TABLE.map(toRow('lane')),
  ...NODE_OWN.filter((row) => row[4] === 'lane').map(toRow('lane')),
  ...ROWS.filter((row) => LANE_AFTER_AWAIT.test(row.name)).map((row) => ({ kind: 'lane', name: row.name, make: (port) => row.make(port, '1.1'), status: row.status, code: row.code, interim: row.interim ?? 0 })),
];

// Refusals decided AT ONCE by Node's parser (clientError): every Node-own client error that can be reached, on the wire exactly as Node reports it (typed 400, 431 and 408).
const PARSE_EXTRA = [
  ['an unknown method token', (p) => head(p, 'GAT /scope.json HTTP/1.1'), 400, 'MALFORMED_REQUEST'],
  ['a lower-case method', (p) => head(p, 'get /scope.json HTTP/1.1'), 400, 'MALFORMED_REQUEST'],
  ['a space in the target', (p) => head(p, 'GET /sc ope.json HTTP/1.1'), 400, 'MALFORMED_REQUEST'],
  ['an HTTP version that does not exist (1.2)', (p) => head(p, 'GET /scope.json HTTP/1.2'), 400, 'MALFORMED_REQUEST'],
  ['bytes that are no request line', () => '\u0001\u0002\u0003\r\n\r\n', 400, 'MALFORMED_REQUEST'],
  ['a Content-Length that is not a number', (p) => head(p, 'GET /scope.json HTTP/1.1', 'Content-Length: abc\r\n'), 400, 'MALFORMED_REQUEST'],
  ['two different Content-Length headers', (p) => head(p, 'POST /v1/steps HTTP/1.1', 'Content-Length: 1\r\nContent-Length: 2\r\n'), 400, 'MALFORMED_REQUEST'],
  ['a header name with a space', (p) => head(p, 'GET /scope.json HTTP/1.1', 'Bad Header: x\r\n'), 400, 'MALFORMED_REQUEST'],
  ['a NUL byte in a header value', (p) => head(p, 'GET /scope.json HTTP/1.1', 'X: a\u0000b\r\n'), 400, 'MALFORMED_REQUEST'],
  ['a CR that is not followed by LF', (p) => `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${p}\r\n\rX: y\r\n\r\n`, 400, 'MALFORMED_REQUEST'],
  ['bare LF line ends', (p) => `GET /scope.json HTTP/1.1\nHost: 127.0.0.1:${p}\n\n`, 400, 'MALFORMED_REQUEST'],
  ['an obsolete folded header', (p) => head(p, 'GET /scope.json HTTP/1.1', 'X: a\r\n b\r\n'), 400, 'MALFORMED_REQUEST'],
  ['a request line that is too long (431)', (p) => head(p, `GET /${'a'.repeat(9000)} HTTP/1.1`), 431, 'REQUEST_HEADERS_TOO_LARGE'],
  ['a request that is never completed (408, the timers are relaxed for this row)', (p) => `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${p}\r\n`, 408, 'REQUEST_TIMEOUT', { bounds: { headersMs: 300, requestMs: 300, checkMs: 50 }, onlySlow: true }],
];
const PARSE_ROWS = [
  ...ROWS.filter((row) => /\(clientError/.test(row.name)).map((row) => ({ kind: 'parse', name: row.name, make: (port) => row.make(port, '1.1'), status: row.status, code: row.code })),
  ...PARSE_EXTRA.map(toRow('parse')),
];

const SHAPES = [
  { id: 'one write, the first request completes', first: 'get', later: false },
  { id: 'one write, the first request is a slow step', first: 'slow', later: false },
  { id: 'the last part in a later write, the first request is a slow step', first: 'slow', later: true },
];
const shapesOf = (row) => SHAPES.filter((shape) => !row.onlySlow || shape.first === 'slow');

// What one completed step leaves in the ledger and in the journal, measured on this service rather than written down.
let calibrated = null;
const calibrate = () => (calibrated ??= (async () => {
  const service = await startService();
  try {
    const before = (await call(service.port, 'GET', '/v1/leases')).json;
    assert.equal((await call(service.port, 'POST', '/v1/steps', JSON.parse(stepBody('vic-c-0001')))).status, 201);
    const after = (await call(service.port, 'GET', '/v1/leases')).json;
    const measured = { records: after.journalRecords - before.journalRecords, committed: after.leases[LEASE].committed - before.leases[LEASE].committed };
    assert.ok(measured.records > 0 && measured.committed > 0, 'a completed step leaves a record and a commitment');
    return measured;
  } finally {
    await service.stop();
  }
})());

// The scene: A holds a step in flight on its own connection (the executor waits on the gate); B is a raw connection whose parsed requests are counted.
async function inScene(row, label, body) {
  const perStep = await calibrate();
  const service = await startService({ hold: true, ...(row.bounds ? { bounds: row.bounds } : {}) });
  const parsed = new Map();
  for (const event of ['request', 'checkContinue', 'checkExpectation']) {
    service.server.prependListener(event, (request) => parsed.set(request.socket.remotePort, (parsed.get(request.socket.remotePort) ?? 0) + 1));
  }
  try {
    const { port, held } = service;
    const answerA = call(port, 'POST', '/v1/steps', JSON.parse(stepBody(KEY_A)));
    answerA.catch(() => {});
    await held.entered(KEY_A);
    const b = connect(port);
    await new Promise((resolve) => b.socket.once('connect', resolve));
    const bPort = b.socket.localPort;
    const seen = () => parsed.get(bPort) ?? 0;
    return await body({ port, held, b, seen, answerA, perStep, label });
  } finally {
    await service.stop();
  }
}

// The barrier: the second step (if any) finished, then a round trip on a third connection and a few event-loop turns, so that a victim that was NOT dropped has run by now.
async function barrier({ port }, label, slow) {
  if (slow) await until(async () => (await call(port, 'GET', `/v1/steps/${KEY_OTHER}`)).json?.outcome === 'succeeded', `${label}: the second step finished`);
  assert.equal((await call(port, 'GET', '/scope.json')).status, 200, `${label}: the barrier round trip`);
  for (let turn = 0; turn < 20; turn += 1) await settleTurn();
}

const write = (b, text) => b.socket.write(Buffer.from(text, 'latin1'));

// One case of the family. Returns after EVERY assertion ran: there is no early return.
async function runCase(row, shape) {
  const label = `${row.name} / ${shape.id}`;
  await inScene(row, label, async (scene) => {
    const { port, held, b, seen, answerA, perStep } = scene;
    const unparsed = row.kind === 'lane' && UNPARSED.has(row.name);
    const first = shape.first === 'get' ? scope(port) : submit(port, KEY_OTHER);
    // A parse error is decided when Node parses it, with the victim still waiting behind the first request: [first][victim][refusal]. A refusal of the lane is decided in its turn, so the
    // victim is put BEHIND it: [first][refusal][victim].
    const order = row.kind === 'parse' ? [first, cancel(port, KEY_A), row.make(port)] : [first, row.make(port), cancel(port, KEY_A)];
    if (shape.later) {
      write(b, order[0] + order[1]);
      await until(() => seen() >= 2, `${label}: Node parsed the first two requests`);
      write(b, order[2]);
    } else {
      write(b, order.join(''));
    }
    // The victim must have been parsed and queued, or the row proves nothing; the rows after which Node parses nothing are named controls (see UNPARSED).
    const expectedParsed = row.kind === 'lane' && !unparsed ? 3 : 2;
    await until(() => seen() >= expectedParsed, `${label}: Node parsed the victim (${expectedParsed} requests)`);
    const slow = shape.first === 'slow';
    // The lane of a slow first step goes on only when the gate is released; a parse error ends the connection at once.
    if (slow && row.kind === 'lane') held.release(KEY_OTHER);
    await Promise.race([b.closed, stuck(120000, `${label}: the server closed the connection of B`)]);
    if (slow && row.kind === 'parse') held.release(KEY_OTHER);
    const answers = parseResponses(b.received());
    if (!unparsed) {
      const expected = row.kind === 'parse' ? (shape.first === 'get' ? [200, row.status] : [row.status]) : [shape.first === 'get' ? 200 : 201, row.status];
      assert.deepEqual(answers.map((answer) => answer.status), expected, `${label}: the answers of B end with the refusal`);
      assert.equal(answers.at(-1).close, true, `${label}: the refusal says Connection: close`);
      assert.equal(answers.at(-1).code, row.code, `${label}: the typed code of the refusal`);
      assert.equal(answers.interim, row.interim ?? 0, `${label}: the interim answers of B`);
    }
    assert.equal(unparsed ? seen() === 2 : seen() >= expectedParsed, true, `${label}: the victim was ${unparsed ? 'never parsed by Node (a named control)' : 'parsed and queued'} (${seen()} requests parsed)`);
    await barrier(scene, label, slow);
    const inspected = await call(port, 'GET', `/v1/steps/${KEY_A}`);
    assert.deepEqual([inspected.status, inspected.json?.error?.code], [202, 'STEP_IN_FLIGHT'], `${label}: the step of A is still in flight, so the queued cancel did not run`);
    held.release(KEY_A);
    const answered = await Promise.race([answerA, stuck(120000, `${label}: the answer of A`)]);
    const finalState = await call(port, 'GET', `/v1/steps/${KEY_A}`);
    const leases = (await call(port, 'GET', '/v1/leases')).json;
    const steps = slow ? 2 : 1;
    assert.deepEqual([answered.status, answered.json?.outcome, finalState.status, finalState.json?.outcome], [201, 'succeeded', 200, 'succeeded'], `${label}: A answers 201 and its step succeeded, never cancelled`);
    assert.equal(leases.leases[LEASE].committed, steps * perStep.committed, `${label}: the lease ledger is exactly the committed steps`);
    assert.equal(leases.journalRecords, steps * perStep.records, `${label}: the journal holds exactly the records of the completed steps (no cancel record)`);
  });
}

// The control: nothing refuses the victim, so it MUST run and end the step of A. It proves that every assertion above would notice a victim that ran.
async function runControl(shape) {
  const label = `no refusal / ${shape.id}`;
  await inScene({ name: 'no refusal' }, label, async (scene) => {
    const { port, held, b, seen, answerA, perStep } = scene;
    const slow = shape.first === 'slow';
    write(b, (slow ? submit(port, KEY_OTHER) : scope(port)) + cancel(port, KEY_A));
    await until(() => seen() >= 2, `${label}: Node parsed both requests`);
    if (slow) held.release(KEY_OTHER);
    await until(() => parseResponses(b.received()).length >= 2, `${label}: B was answered twice`);
    assert.deepEqual(parseResponses(b.received()).map((answer) => answer.status), [slow ? 201 : 200, 200], `${label}: the answers of B`);
    await barrier(scene, label, slow);
    const inspected = await call(port, 'GET', `/v1/steps/${KEY_A}`);
    assert.deepEqual([inspected.status, inspected.json?.error?.code], [200, 'STEP_CANCELLED'], `${label}: the victim cancelled the step of A`);
    held.release(KEY_A);
    const answered = await Promise.race([answerA, stuck(120000, `${label}: the answer of A`)]);
    const leases = (await call(port, 'GET', '/v1/leases')).json;
    assert.deepEqual([answered.status, answered.json?.outcome], [409, 'cancelled'], `${label}: A answers 409 cancelled`);
    assert.equal(leases.leases[LEASE].committed, slow ? perStep.committed : 0, `${label}: the cancelled step holds no unit`);
    b.socket.destroy();
  });
}

const executed = new Set();
const rows = [...PARSE_ROWS, ...LANE_ROWS];
const expectedCases = rows.reduce((sum, row) => sum + shapesOf(row).length, 0);

test('the table of the family: no duplicate row, every row has a typed answer to expect, the named controls are rows of the table', OPTIONS, () => {
  assert.equal(new Set(rows.map((row) => `${row.kind}|${row.name}`)).size, rows.length, 'every row once');
  assert.ok(PARSE_ROWS.length >= 18 && LANE_ROWS.length >= 29, `the family holds ${PARSE_ROWS.length} parse rows and ${LANE_ROWS.length} lane rows`);
  for (const row of rows) assert.ok(Number.isInteger(row.status) && typeof row.make === 'function', row.name);
  for (const name of UNPARSED) assert.ok(LANE_ROWS.some((row) => row.name === name), `${name} is a row of the table`);
});

for (const shape of SHAPES.slice(0, 2)) {
  test(`CONTROL: the victim DOES run when nothing refuses it (${shape.id}): the step of A ends cancelled, A gets 409`, OPTIONS, async () => {
    await runControl(shape);
  });
}

for (const row of PARSE_ROWS) {
  test(`parse error: ${row.name}: a request queued behind it never runs (${shapesOf(row).length} shapes)`, OPTIONS, async () => {
    for (const shape of shapesOf(row)) {
      await runCase(row, shape);
      executed.add(`${row.kind}|${row.name}|${shape.id}`);
    }
  });
}

for (const row of LANE_ROWS) {
  test(`refusal in the lane: ${row.name}: a request queued behind it never runs (${shapesOf(row).length} shapes)`, OPTIONS, async () => {
    for (const shape of shapesOf(row)) {
      await runCase(row, shape);
      executed.add(`${row.kind}|${row.name}|${shape.id}`);
    }
  });
}

test('every row of the family ran in every shape: nothing was skipped', OPTIONS, () => {
  assert.equal(executed.size, expectedCases, `${executed.size} of ${expectedCases} cases ran`);
});
