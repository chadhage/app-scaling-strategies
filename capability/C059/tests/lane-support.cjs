'use strict';

// Test tooling, not production code: the shapes and the rows of the lane matrix (second review, N1; orders\_PIPELINING.md, "A THIRD HOLE"). One TCP write
// carries a pipeline of requests: G = a legitimate GET, M = a valid submit that must be answered and applied exactly once when it comes BEFORE the refusal,
// R = the refusal under test, L = a valid submit AFTER the refusal that must never run. Rows of kind 'lane' are decided in lane order (the service answers
// the earlier requests, then the typed refusal); rows of kind 'parse' are errors Node finds while parsing (clientError: the typed answer ends the connection
// at once and an earlier answer may be lost: README, "Resource bounds and the refusal rule").
const assert = require('node:assert/strict');
const net = require('node:net');
const { call } = require('./net.cjs');

const JSON_TYPE = 'Content-Type: application/json';
const request = (port, method, target, version, lines = [], body = null) => `${method} ${target} HTTP/${version}\r\nHost: 127.0.0.1:${port}\r\n${lines.map((line) => `${line}\r\n`).join('')}${body === null ? '' : `Content-Length: ${Buffer.byteLength(body)}\r\n`}\r\n${body ?? ''}`;
const submitBody = (key) => JSON.stringify({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId: 'synthetic-lease-001', units: 1 });
const chunked = (port, version, rest) => `POST /v1/steps HTTP/${version}\r\nHost: 127.0.0.1:${port}\r\n${JSON_TYPE}\r\n${rest}`;

const row = (name, make, status, code, extra = {}) => ({ name, make, status, code, kind: 'lane', ...extra });
const ROWS = [
  row('an unknown expectation: Node would answer 417 itself and keep the socket (checkExpectation, decided at parse time)', (p) => request(p, 'GET', '/scope.json', '1.1', ['Expect: nonsense']), 417, 'EXPECTATION_NOT_SUPPORTED', { only11: true }),
  row('an unknown expectation on a POST that carries a VALID step body (review Q1: a handler that wrongly ran for the refused request would APPLY it)', (p, v, refused) => { const key = freshKey(); refused.push(key); return request(p, 'POST', '/v1/steps', '1.1', [JSON_TYPE, 'Expect: nonsense'], submitBody(key)); }, 417, 'EXPECTATION_NOT_SUPPORTED', { only11: true, valid: true }),
  row('an unknown expectation on a CHUNKED POST that carries a VALID step body (review Q1)', (p, v, refused) => { const key = freshKey(); refused.push(key); const body = submitBody(key); return chunked(p, '1.1', `Expect: nonsense\r\nTransfer-Encoding: chunked\r\n\r\n${Buffer.byteLength(body).toString(16)}\r\n${body}\r\n0\r\n\r\n`); }, 417, 'EXPECTATION_NOT_SUPPORTED', { only11: true, valid: true }),
  row('a refused request that asks for 100-continue (checkContinue)', (p) => request(p, 'POST', '/v1/steps', '1.1', ['Content-Type: text/plain', 'Expect: 100-continue'], 'abcd'), 415, 'UNSUPPORTED_MEDIA_TYPE', { only11: true, interim: 1 }),
  row('a refused request that asks for 100-continue and carries a VALID step body (cross-origin: refused before its body is read; review Q1)', (p, v, refused) => { const key = freshKey(); refused.push(key); return request(p, 'POST', '/v1/steps', '1.1', [JSON_TYPE, 'Origin: http://evil.example', 'Expect: 100-continue'], submitBody(key)); }, 403, 'CROSS_ORIGIN_DENIED', { only11: true, interim: 1, valid: true }),
  row('a request without Host: Node would answer 400, the service answers 421', (p, v) => `GET /scope.json HTTP/${v}\r\n\r\n`, 421, 'LOCAL_HOST_REQUIRED'),
  row('a refusal of the service itself (404 on an unknown route with a body)', (p, v) => request(p, 'POST', '/admin', v, [], 'abcd'), 404, 'NOT_FOUND'),
  row('a malformed HTTP version (clientError)', (p) => `GET /scope.json HTTP/9.9\r\nHost: 127.0.0.1:${p}\r\n\r\n`, 400, 'MALFORMED_REQUEST', { kind: 'parse', only11: true }),
  row('an invalid header line (clientError)', (p, v) => `GET /scope.json HTTP/${v}\r\nHost: 127.0.0.1:${p}\r\nBad Header Line\r\n\r\n`, 400, 'MALFORMED_REQUEST', { kind: 'parse' }),
  row('a header section that is too large (clientError 431)', (p, v) => request(p, 'GET', '/scope.json', v, [`X-Pad: ${'a'.repeat(9000)}`]), 431, 'REQUEST_HEADERS_TOO_LARGE', { kind: 'parse' }),
  row('an invalid chunk size (clientError)', (p) => chunked(p, '1.1', 'Transfer-Encoding: chunked\r\n\r\nZZ\r\nx\r\n0\r\n\r\n'), 400, 'MALFORMED_REQUEST', { kind: 'parse', only11: true }),
  row('Content-Length together with Transfer-Encoding (clientError)', (p) => chunked(p, '1.1', 'Content-Length: 4\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n'), 400, 'MALFORMED_REQUEST', { kind: 'parse', only11: true }),
];
const SHAPES = ['GR', 'GGR', 'GGGR', 'GGRG', 'GGRL', 'MGR', 'MMRL', 'MGRL'];
// [version of the earlier requests, version of the refusal and of the requests behind it]
const FRAMINGS = [['1.1', '1.1'], ['1.0', '1.0'], ['1.0', '1.1'], ['1.1', '1.0']];

function parseResponses(text) {
  const answers = [];
  answers.interim = 0;
  for (let rest = text; rest.startsWith('HTTP/1.1 ');) {
    const split = rest.indexOf('\r\n\r\n');
    if (split < 0) break;
    const head = rest.slice(0, split);
    const length = Number(/content-length: (\d+)/i.exec(head)?.[1] ?? 0);
    let json = null;
    try { json = JSON.parse(rest.slice(split + 4, split + 4 + length)); } catch { json = null; }
    const status = Number(/^HTTP\/1\.1 (\d+)/.exec(head)[1]);
    if (status === 100) answers.interim += 1; else answers.push({ status, code: json?.error?.code ?? null, close: /connection: close/i.test(head) });
    rest = rest.slice(split + 4 + length);
  }
  return answers;
}

// One write, then wait for the SERVER to close the connection: a connection that stays open after the refusal is the defect (an assertion, not a thrown timeout).
async function exchange(port, bytes) {
  const socket = net.connect({ host: '127.0.0.1', port });
  const chunks = [];
  socket.on('error', () => {});
  socket.on('data', (chunk) => chunks.push(chunk));
  const closed = new Promise((resolve) => socket.once('close', () => resolve(true)));
  const watchdog = new Promise((resolve) => { setTimeout(() => resolve(false), 20000).unref(); });
  try {
    socket.write(Buffer.from(bytes, 'latin1'));
    const closedByServer = await Promise.race([closed, watchdog]);
    const answers = parseResponses(Buffer.concat(chunks).toString('latin1'));
    assert.equal(closedByServer, true, `the server kept the connection open; answers received: ${JSON.stringify(answers.map((answer) => answer.status))}`);
    return answers;
  } finally {
    socket.destroy();
  }
}

let counter = 0;
const freshKey = () => `lane-${String(counter += 1).padStart(6, '0')}`;
// A step exists (it ran) or not; attempts counts how often it began, so a request that ran twice would show 2.
const ranTimes = async (port, key) => { const answer = await call(port, 'GET', `/v1/steps/${key}`); return answer.status === 404 ? 0 : answer.json.attempts; };

function describeCase(shape, item, [earlier, behind]) {
  const keys = { before: [], after: [], refused: [] };
  const build = (port) => {
    let seen = false;
    return [...shape].map((token) => {
      if (token === 'R') { seen = true; return item.make(port, behind, keys.refused); }
      if (token === 'G') return request(port, 'GET', '/scope.json', seen ? behind : earlier);
      const key = freshKey();
      (seen ? keys.after : keys.before).push(key);
      return request(port, 'POST', '/v1/steps', seen ? behind : earlier, [JSON_TYPE], submitBody(key));
    }).join('');
  };
  const lead = [...shape.slice(0, shape.indexOf('R'))].map((token) => (token === 'G' ? 200 : 201));
  const strict = item.kind === 'lane' && earlier === '1.1' && behind === '1.1';
  return { build, keys, lead, strict, label: `${shape} earlier=HTTP/${earlier} refusal=HTTP/${behind}` };
}

// The earlier requests are answered IN ORDER and then the typed refusal; the loose form (HTTP/1.0 framing, a parse error) allows the documented loss of an
// earlier answer but never a later effect, an answer out of order, an untyped refusal or an open connection.
async function runCase(port, shape, item, framing) {
  const kase = describeCase(shape, item, framing);
  const answers = await exchange(port, kase.build(port));
  await call(port, 'GET', '/scope.json');
  const where = `${kase.label}: ${JSON.stringify(answers)}`;
  const tail = answers.at(-1);
  if (kase.strict) {
    assert.deepEqual(answers.map((answer) => answer.status), [...kase.lead, item.status], where);
    assert.equal(tail.code, item.code, `${where}: the refusal is typed by the service, not answered by Node`);
    assert.equal(tail.close, true, `${where}: the refusal says Connection: close`);
    assert.equal(answers.interim, item.interim ?? 0, `${where}: the interim 100 Continue is sent for a request that started`);
  } else {
    const ordinary = answers.filter((answer) => answer.status < 400);
    const refusals = answers.slice(ordinary.length);
    assert.ok(answers.length >= 1 && refusals.length <= 2 && refusals.every((answer) => answer.status >= 400 && [item.status, 400, 431].includes(answer.status)), where);
    assert.deepEqual(ordinary.map((answer) => answer.status), kase.lead.slice(0, ordinary.length), `${where}: the answers of the earlier requests keep their order, and no answer comes after a refusal`);
    assert.ok(refusals.every((answer) => answer.close === true), `${where}: a refusal says Connection: close`);
  }
  for (const key of kase.keys.before) assert.ok((await ranTimes(port, key)) <= 1, `${where}: ${key} ran at most once`);
  if (kase.strict) for (const key of kase.keys.before) assert.equal(await ranTimes(port, key), 1, `${where}: ${key} (before the refusal) ran exactly once`);
  for (const key of kase.keys.after) assert.equal(await ranTimes(port, key), 0, `${where}: ${key} (behind the refusal) never ran`);
  for (const key of kase.keys.refused) assert.equal(await ranTimes(port, key), 0, `${where}: ${key} (the refused request ITSELF carried a valid step) never ran`);
}

// Runs the cases of one row with a bounded pool; every failed case is reported with its label.
async function runRow(port, item, concurrency = 12, framings = FRAMINGS) {
  const queue = [];
  for (const shape of SHAPES) for (const framing of framings) if (!(item.only11 && framing[1] === '1.0')) queue.push([shape, framing]);
  const failures = [];
  await Promise.all(Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const [shape, framing] = queue.shift();
      try { await runCase(port, shape, item, framing); } catch (error) { failures.push(`${shape} ${framing.join('/')}: ${error.message.split('\n')[0]}`); }
    }
  }));
  return failures.sort();
}

module.exports = { FRAMINGS, ROWS, SHAPES, exchange, freshKey, request, runCase, runRow, submitBody };
