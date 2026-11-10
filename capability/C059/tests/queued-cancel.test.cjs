'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { call, connect, settleTurn, startService, until } = require('./net.cjs');
const { NODE_OWN, TABLE } = require('./refusal-table.cjs');
const { ROWS, parseResponses } = require('./pipelining-support.cjs');

const OPTIONS = { timeout: 900000 };
const A = 'final-a-0001';
const OTHER = 'final-b-0001';
const LEASE = 'synthetic-lease-001';
const body = (key) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId: LEASE, units: 1 });
const get = (port) => `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;
const cancel = (port) => `POST /v1/steps/${A}/cancel HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n\r\n`;
const post = (port, key) => {
  const json = JSON.stringify(body(key));
  return `POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`;
};
const head = (port, line, extra = '') => `${line}\r\nHost: 127.0.0.1:${port}\r\n${extra}\r\n`;
const parser = [
  ...ROWS.filter((row) => row.name.includes('(clientError')).map((row) => ({ ...row, make: (port) => row.make(port, '1.1') })),
  ...[
    ['unknown method', (p) => head(p, 'GAT /scope.json HTTP/1.1')],
    ['lowercase method', (p) => head(p, 'get /scope.json HTTP/1.1')],
    ['space in target', (p) => head(p, 'GET /sc ope.json HTTP/1.1')],
    ['unsupported HTTP/1.2', (p) => head(p, 'GET /scope.json HTTP/1.2')],
    ['nonrequest bytes', () => '\u0001\u0002\u0003\r\n\r\n'],
    ['nonnumeric Content-Length', (p) => head(p, 'GET /scope.json HTTP/1.1', 'Content-Length: abc\r\n')],
    ['conflicting Content-Length', (p) => head(p, 'POST /v1/steps HTTP/1.1', 'Content-Length: 1\r\nContent-Length: 2\r\n')],
    ['space in header name', (p) => head(p, 'GET /scope.json HTTP/1.1', 'Bad Header: x\r\n')],
    ['NUL in header value', (p) => head(p, 'GET /scope.json HTTP/1.1', 'X: a\u0000b\r\n')],
    ['CR without LF', (p) => `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${p}\r\n\rX: y\r\n\r\n`],
    ['bare LF', (p) => `GET /scope.json HTTP/1.1\nHost: 127.0.0.1:${p}\n\n`],
    ['obsolete folded header', (p) => head(p, 'GET /scope.json HTTP/1.1', 'X: a\r\n b\r\n')],
  ].map(([name, make]) => ({ name, make, status: 400, code: 'MALFORMED_REQUEST' })),
  { name: 'oversized request line', make: (p) => head(p, `GET /${'a'.repeat(9000)} HTTP/1.1`), status: 431, code: 'REQUEST_HEADERS_TOO_LARGE' },
].map((row) => ({ ...row, kind: 'parser' }));
const lane = [
  ...TABLE.map(([name, make, status, code]) => ({ name, make, status, code })),
  ...NODE_OWN.filter((row) => row[4] === 'lane').map(([name, make, status, code]) => ({ name, make, status, code })),
  ...ROWS.filter((row) => /after the body was read|refused chunked body|checkContinue|Upgrade/.test(row.name))
    .map((row) => ({ ...row, make: (port) => row.make(port, '1.1') })),
].map((row) => ({ ...row, kind: 'lane' }));
const unparsed = new Set([
  'a declared body that is too large',
  'no transcript configured (bodiless: nothing to leave unread)',
  'a key that is not a key (inspect; bodiless)',
  'a refused request that also asks for an Upgrade',
]);
const shapes = [
  { name: 'same write / completed GET', slow: false, later: false },
  { name: 'same write / gated step', slow: true, later: false },
  { name: 'later write after both earlier requests parsed / gated step', slow: true, later: true },
];

let calibration;
async function perStep() {
  calibration ??= (async () => {
    const service = await startService();
    try {
      const before = (await call(service.port, 'GET', '/v1/leases')).json;
      assert.equal((await call(service.port, 'POST', '/v1/steps', body('final-cal-0001'))).status, 201);
      const after = (await call(service.port, 'GET', '/v1/leases')).json;
      const result = { records: after.journalRecords - before.journalRecords, committed: after.leases[LEASE].committed - before.leases[LEASE].committed };
      assert.ok(result.records > 0 && result.committed > 0);
      return result;
    } finally { await service.stop(); }
  })();
  return calibration;
}

async function scene(row, shape) {
  const unit = await perStep();
  const service = await startService({ hold: true });
  let b;
  const seen = new Map();
  for (const event of ['request', 'checkContinue', 'checkExpectation']) {
    service.server.prependListener(event, (request) => seen.set(request.socket.remotePort, (seen.get(request.socket.remotePort) ?? 0) + 1));
  }
  try {
    const { port, held } = service;
    const answerA = call(port, 'POST', '/v1/steps', body(A));
    answerA.catch(() => {});
    await held.entered(A);
    b = connect(port);
    await new Promise((resolve) => b.socket.once('connect', resolve));
    const peerPort = b.socket.localPort;
    const parsed = () => seen.get(peerPort) ?? 0;
    const first = shape.slow ? post(port, OTHER) : get(port);
    const parts = row.kind === 'parser' ? [first, cancel(port), row.make(port)] : [first, row.make(port), cancel(port)];
    const write = (text) => b.socket.write(Buffer.from(text, 'latin1'));
    if (shape.later) {
      write(parts[0] + parts[1]);
      await until(() => parsed() >= 2, 'both earlier requests parsed before the later write');
      write(parts[2]);
    } else write(parts.join(''));
    const control = row.kind === 'lane' && unparsed.has(row.name);
    const parsedCount = row.kind === 'lane' && !control ? 3 : 2;
    await until(() => parsed() >= parsedCount, 'the queued cancel was parsed, or the named framing control was reached');
    if (shape.slow && row.kind === 'lane') held.release(OTHER);
    await b.closed;
    if (shape.slow && row.kind === 'parser') held.release(OTHER);
    const answers = parseResponses(b.received());
    if (!control) {
      const expected = row.kind === 'parser' ? [...(shape.slow ? [] : [200]), row.status] : [shape.slow ? 201 : 200, row.status];
      assert.deepEqual(answers.map((answer) => answer.status), expected, 'B answers in order and ends with the refusal');
      assert.equal(answers.at(-1).close, true);
      assert.equal(answers.at(-1).code, row.code);
      assert.equal(answers.interim, row.interim ?? 0);
    }
    assert.equal(b.socket.destroyed, true, 'the refused socket is closed before the absence barrier');
    assert.equal(control ? seen.get(peerPort) === 2 : seen.get(peerPort) >= parsedCount, true,
      control ? 'CONTROL: framing stops Node before it can parse the cancel' : 'the bodyless cancel really reached the queue');
    if (shape.slow) await until(async () => (await call(port, 'GET', `/v1/steps/${OTHER}`)).json?.outcome === 'succeeded', 'B first step completed');
    assert.equal((await call(port, 'GET', '/scope.json')).status, 200, 'third-connection barrier');
    for (let turn = 0; turn < 20; turn += 1) await settleTurn();
    const beforeRelease = await call(port, 'GET', `/v1/steps/${A}`);
    assert.deepEqual([beforeRelease.status, beforeRelease.json?.error?.code], [202, 'STEP_IN_FLIGHT'], 'D1: the queued cancel did not run after refusal and destroy');
    held.release(A);
    const completed = await answerA;
    const inspected = await call(port, 'GET', `/v1/steps/${A}`);
    const leases = (await call(port, 'GET', '/v1/leases')).json;
    assert.deepEqual([completed.status, completed.json?.outcome, inspected.status, inspected.json?.outcome], [201, 'succeeded', 200, 'succeeded']);
    const count = shape.slow ? 2 : 1;
    assert.equal(leases.leases[LEASE].committed, count * unit.committed, 'no cancelled commitment');
    assert.equal(leases.journalRecords, count * unit.records, 'no cancellation record after the barrier');
  } finally {
    b?.socket.destroy();
    service.held.release(A);
    service.held.release(OTHER);
    await service.stop();
  }
}

test('D1 FAMILY inventory: all twenty imported refusal rows and all parser rows participate in named shape tests', OPTIONS, () => {
  assert.equal(TABLE.length, 20);
  assert.equal(lane.length >= 29, true);
  assert.equal(parser.length >= 18, true);
  assert.equal(new Set([...parser, ...lane].map((row) => `${row.kind}|${row.name}`)).size, parser.length + lane.length);
  assert.deepEqual([...new Set(TABLE.map((row) => row[2]))].sort(), [400, 403, 404, 405, 413, 414, 415, 421]);
});

for (const row of [...parser, ...lane]) {
  for (const shape of shapes) {
    const control = row.kind === 'lane' && unparsed.has(row.name);
    test(`D1 FAMILY ${control ? 'CONTROL ' : ''}${row.kind}: ${row.name} / ${shape.name}`, OPTIONS, async () => {
      await scene(row, shape);
    });
  }
}
