'use strict';

// Test tooling, not production code: the helpers and the refusal rows of the pipelining matrix (orders\_PIPELINING.md). Raw sockets against the service in
// a SEPARATE process; every row is built in BOTH HTTP framings (1.1 and 1.0) because maxRequestsPerSocket, which a server could be tempted to rely
// on, is not applied to HTTP/1.0 requests and not advanced by Node's own answers. `status` is the typed refusal the client must receive (null: Node
// closes the connection without any answer), `code` its typed code, `only11` a row that has no HTTP/1.0 form, `fixedVersion` a row whose bytes do not
// depend on the framing, `interim` the 100 Continue the request legitimately gets before its refusal.
const assert = require('node:assert/strict');
const net = require('node:net');
const { call, settleTurn, startChild } = require('./net.cjs');

const JSON_TYPE = ['Content-Type: application/json'];
const hardTimeout = (ms, label) => new Promise((resolve, reject) => { setTimeout(() => reject(new Error(`hard timeout: ${label}`)), ms).unref(); });
const withBody = (port, method, target, body, headers = [], v = '1.1') => `${method} ${target} HTTP/${v}\r\nHost: 127.0.0.1:${port}\r\n${headers.map((header) => `${header}\r\n`).join('')}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;
const bare = (port, target, extra = '', v = '1.1') => `GET ${target} HTTP/${v}\r\nHost: 127.0.0.1:${port}\r\n${extra}\r\n`;
const chunkedHead = (port, target, v = '1.1') => `POST ${target} HTTP/${v}\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nTransfer-Encoding: chunked\r\n\r\n`;
const other = { schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'pipe-other-0001', leaseId: 'synthetic-lease-001', units: 1 };

function chunkedBody(text) {
  const bytes = Buffer.from(text);
  let out = '';
  for (let at = 0; at < bytes.length; at += 7) out += `${Math.min(7, bytes.length - at).toString(16)}\r\n${bytes.subarray(at, at + 7).toString('latin1')}\r\n`;
  return `${out}0\r\n\r\n`;
}

// Every answer in the stream; the interim 100 Continue answers are counted on the array (answers.interim) and are not answers.
function parseResponses(text) {
  const out = [];
  out.interim = 0;
  for (let rest = text; rest.startsWith('HTTP/1.1 ');) {
    const split = rest.indexOf('\r\n\r\n');
    if (split < 0) break;
    const head = rest.slice(0, split);
    const length = Number(/content-length: (\d+)/i.exec(head)?.[1] ?? 0);
    let json = null;
    try { json = JSON.parse(rest.slice(split + 4, split + 4 + length)); } catch { json = null; }
    const status = Number(/^HTTP\/1\.1 (\d+)/.exec(head)[1]);
    if (status === 100) out.interim += 1;
    else out.push({ status, code: json?.error?.code ?? null, close: /connection: close/i.test(head) });
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
const disposeShared = () => { shared?.dispose(); shared = null; };

// One service child for a whole file; every case gets a fresh key, so the cases do not depend on each other.
async function scenario(run, { fresh = false } = {}) {
  const child = fresh ? await startChild() : (shared ??= await startChild());
  try {
    counter += 1;
    const key = `pipe-key-${String(counter).padStart(4, '0')}`;
    const port = child.port;
    const input = (over = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId: 'synthetic-lease-001', units: 1, ...over });
    const submit = (over, headers = JSON_TYPE, v = '1.1') => withBody(port, 'POST', '/v1/steps', JSON.stringify(input(over)), headers, v);
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

const row = (name, make, status, code, extra = {}) => ({ name, make, status, code, ...extra });
const ROWS = [
  row('a foreign Host', (p, v) => `GET / HTTP/${v}\r\nHost: example.test\r\n\r\n`, 421, 'LOCAL_HOST_REQUIRED'),
  row('a cross origin', (p, v) => bare(p, '/scope.json', 'Origin: http://evil.test\r\n', v), 403, 'CROSS_ORIGIN_DENIED'),
  row('a URL that is too long', (p, v) => bare(p, `/${'a'.repeat(2100)}`, '', v), 414, 'URL_TOO_LONG'),
  row('another authority in the target', (p, v) => bare(p, '//evil.test/x', '', v), 400, 'INVALID_URL'),
  row('a query', (p, v) => bare(p, '/v1/leases?x=1', '', v), 400, 'INVALID_QUERY'),
  row('a GET with a body', (p, v) => withBody(p, 'GET', '/v1/leases', 'abcd', [], v), 400, 'UNEXPECTED_BODY'),
  row('PUT on the step route', (p, v) => withBody(p, 'PUT', '/v1/steps', 'abcd', [], v), 405, 'METHOD_NOT_ALLOWED'),
  row('POST on an asset', (p, v) => withBody(p, 'POST', '/scope.json', 'abcd', [], v), 405, 'METHOD_NOT_ALLOWED'),
  row('an unknown route with a body', (p, v) => withBody(p, 'POST', '/admin', 'abcd', [], v), 404, 'NOT_FOUND'),
  row('a wrong media type', (p, v) => withBody(p, 'POST', '/v1/steps', 'abcd', ['Content-Type: text/plain'], v), 415, 'UNSUPPORTED_MEDIA_TYPE'),
  row('a key that is not a key', (p, v) => withBody(p, 'POST', '/v1/steps/not%20a%20key/cancel', '', [], v), 400, 'INVALID_FORMAT'),
  row('an action with a body', (p, v) => withBody(p, 'POST', '/v1/steps/pipe-key-9999/cancel', 'abcd', [], v), 400, 'UNEXPECTED_BODY'),
  row('a GET on an action route', (p, v) => bare(p, '/v1/steps/pipe-key-9999/cancel', '', v), 405, 'METHOD_NOT_ALLOWED'),
  row('an invalid JSON body (refused after the body was read)', (p, v) => withBody(p, 'POST', '/v1/steps', '{"units":', JSON_TYPE, v), 400, 'INVALID_JSON'),
  row('a missing field (after the body was read)', (p, v) => withBody(p, 'POST', '/v1/steps', '{}', JSON_TYPE, v), 400, 'REQUIRED_FIELD'),
  row('an unknown field (after the body was read)', (p, v) => withBody(p, 'POST', '/v1/steps', JSON.stringify({ ...other, extra: 1 }), JSON_TYPE, v), 400, 'UNKNOWN_FIELD'),
  row('an unsupported schema version (after the body was read)', (p, v) => withBody(p, 'POST', '/v1/steps', JSON.stringify({ ...other, schemaVersion: 2 }), JSON_TYPE, v), 422, 'UNSUPPORTED_SCHEMA_VERSION'),
  row('a refused chunked body (complete)', (p, v) => `${chunkedHead(p, '/v1/steps', v)}${chunkedBody('{}')}`, 400, 'REQUIRED_FIELD', { only11: true }),
  // The answers NODE would give itself (each needs its own listener or option; the typed code proves the service answered, not Node).
  row('an unknown expectation (Node would answer 417 and keep the socket)', (p, v) => bare(p, '/scope.json', 'Expect: nonsense\r\n', v), 417, 'EXPECTATION_NOT_SUPPORTED', { only11: true }),
  row('a request without Host (Node would answer 400)', (p, v) => `GET /scope.json HTTP/${v}\r\n\r\n`, 421, 'LOCAL_HOST_REQUIRED'),
  row('a malformed HTTP version (clientError)', (p) => `GET /scope.json HTTP/9.9\r\nHost: 127.0.0.1:${p}\r\n\r\n`, 400, 'MALFORMED_REQUEST', { fixedVersion: true }),
  row('an invalid header line (clientError)', (p, v) => `GET /scope.json HTTP/${v}\r\nHost: 127.0.0.1:${p}\r\nBad Header Line\r\n\r\n`, 400, 'MALFORMED_REQUEST'),
  row('a header section that is too large (clientError 431)', (p, v) => bare(p, '/scope.json', `X-Pad: ${'a'.repeat(9000)}\r\n`, v), 431, 'REQUEST_HEADERS_TOO_LARGE'),
  row('an invalid chunk size (clientError after the handler started)', (p, v) => `${chunkedHead(p, '/v1/steps', v)}ZZ\r\nx\r\n0\r\n\r\n`, 400, 'MALFORMED_REQUEST', { only11: true }),
  row('Content-Length together with Transfer-Encoding (clientError)', (p, v) => `POST /v1/steps HTTP/${v}\r\nHost: 127.0.0.1:${p}\r\nContent-Length: 4\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n`, 400, 'MALFORMED_REQUEST', { only11: true }),
  row('a refused request that carries Expect: 100-continue (checkContinue)', (p, v) => withBody(p, 'POST', '/v1/steps', 'abcd', ['Content-Type: text/plain', 'Expect: 100-continue'], v), 415, 'UNSUPPORTED_MEDIA_TYPE', { interim: 1, only11: true }),
  row('a refused request that also asks for an Upgrade', (p, v) => bare(p, '/nope', 'Connection: Upgrade\r\nUpgrade: websocket\r\n', v), 404, 'NOT_FOUND'),
  row('CONNECT (Node destroys the socket without an answer)', (p, v) => `CONNECT 127.0.0.1:80 HTTP/${v}\r\nHost: 127.0.0.1:80\r\n\r\n`, null, null, { lenient: true }),
];

module.exports = { JSON_TYPE, ROWS, bare, chunkedBody, chunkedHead, disposeShared, exchange, scenario, withBody };
