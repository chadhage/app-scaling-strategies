'use strict';

// Test tooling, not production code (U039): the refusal table of the C042 server. Every status the server can emit with
// a refusal (including the answers NODE gives itself: an unknown Expect, a request without Host, a parse error, CONNECT)
// is one row. `kind`: sync (bodiless, decided at once), unread (a body the server does not read), async (decided after an
// await), node (Node's own answer, routed through the same refusal by a listener). `behind: false` marks rows after
// which the parser cannot deliver another request (a parse error, CONNECT): a request written behind them never runs anyway.
const { asVersion, chunked, expecting, req } = require('./u039-lib.cjs');

const JSON_TYPE = { 'Content-Type': 'application/json' };
const step = (overrides = {}) => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'probe-key-0001', leaseId: 'synthetic-lease-001', units: 3, ...overrides });
const mutation = (host) => req('POST', '/v1/steps', { host, headers: JSON_TYPE, body: step() });
const reading = (host) => req('GET', '/v1/leases', { host });
const post = (host, body, extra = {}) => req('POST', '/v1/steps', { host, headers: { ...JSON_TYPE, ...extra }, body });

const ROWS = [
  { id: 'R404', kind: 'sync', status: 404, code: 'NOT_FOUND', raw: (host) => req('GET', '/nope', { host }) },
  { id: 'R405', kind: 'sync', status: 405, code: 'METHOD_NOT_ALLOWED', raw: (host) => req('PUT', '/v1/steps', { host }) },
  { id: 'R421', kind: 'sync', status: 421, code: 'LOCAL_HOST_REQUIRED', raw: () => req('GET', '/v1/leases', { host: 'evil.example:1' }) },
  { id: 'R403', kind: 'sync', status: 403, code: 'CROSS_ORIGIN_DENIED', raw: (host) => req('GET', '/v1/leases', { host, headers: { Origin: 'http://evil.example' } }) },
  { id: 'R400key', kind: 'sync', status: 400, code: 'INVALID_FORMAT', raw: (host) => req('GET', '/v1/steps/x', { host }) },
  { id: 'R400query', kind: 'sync', status: 400, code: 'INVALID_QUERY', raw: (host) => req('GET', '/v1/leases?x=1', { host }) },
  { id: 'R414', kind: 'sync', status: 414, code: 'URL_TOO_LONG', raw: (host) => req('GET', `/${'a'.repeat(2100)}`, { host }) },
  { id: 'R400url', kind: 'sync', status: 400, code: 'INVALID_URL', raw: (host) => req('GET', '/v1/leases#x', { host }) },
  { id: 'R404step', kind: 'sync', status: 404, code: 'STEP_NOT_FOUND', raw: (host) => req('GET', '/v1/steps/unknown-key-0001', { host }) },
  { id: 'R422', kind: 'sync', status: 422, code: 'UNSUPPORTED_ACTION', raw: (host) => req('POST', '/v1/steps/unknown-key-0001/undo', { host, headers: { 'Content-Length': '0' } }) },
  { id: 'R404transcript', kind: 'sync', status: 404, code: 'NOT_FOUND', raw: (host) => req('GET', '/transcript.json', { host }) },
  { id: 'R415', kind: 'unread', status: 415, code: 'UNSUPPORTED_MEDIA_TYPE', raw: (host) => req('POST', '/v1/steps', { host, headers: { 'Content-Type': 'text/plain' }, body: 'x' }) },
  { id: 'R413declared', kind: 'unread', status: 413, code: 'BODY_TOO_LARGE', raw: (host) => post(host, Buffer.alloc(3000, 0x20)) },
  { id: 'R400body', kind: 'unread', status: 400, code: 'UNEXPECTED_BODY', raw: (host) => req('GET', '/v1/leases', { host, body: '{}' }) },
  { id: 'R405body', kind: 'unread', status: 405, code: 'METHOD_NOT_ALLOWED', raw: (host) => req('PUT', '/v1/steps', { host, body: '{}' }) },
  { id: 'R400json', kind: 'async', status: 400, code: 'INVALID_JSON', raw: (host) => post(host, '{bad') },
  { id: 'R400field', kind: 'async', status: 400, code: 'UNKNOWN_FIELD', raw: (host) => post(host, step({ extra: 1, idempotencyKey: 'probe-key-0002' })) },
  { id: 'R400missing', kind: 'async', status: 400, code: 'REQUIRED_FIELD', raw: (host) => post(host, { schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: 'probe-key-0003', leaseId: 'synthetic-lease-001' }) },
  { id: 'R413chunked', kind: 'async', status: 413, code: 'BODY_TOO_LARGE', raw: (host) => req('POST', '/v1/steps', { host, headers: { ...JSON_TYPE, 'Transfer-Encoding': 'chunked' }, body: '1\r\nx\r\n'.repeat(2300) + '0\r\n\r\n' }) },
  { id: 'R409conflict', kind: 'async', status: 409, code: 'IDEMPOTENCY_KEY_CONFLICT', setup: [step({ idempotencyKey: 'conflict-key-0001', units: 5 })], raw: (host) => post(host, step({ idempotencyKey: 'conflict-key-0001', units: 6 })) },
  { id: 'R409capacity', kind: 'async', status: 409, code: 'CAPACITY_EXHAUSTED', setup: [step({ idempotencyKey: 'fill-key-0001', leaseId: 'synthetic-lease-002', units: 10 })], raw: (host) => post(host, step({ idempotencyKey: 'fill-key-0002', leaseId: 'synthetic-lease-002', units: 1 })) },
  { id: 'R503steps', kind: 'async', status: 503, code: 'STEP_LIMIT_REACHED', options: { prefill: 256 }, mutationStatus: 200, mutation: (host) => req('POST', '/v1/steps/key-open-0001/cancel', { host, headers: { 'Content-Length': '0' } }), raw: (host) => post(host, step({ idempotencyKey: 'over-key-0001', units: 1 })) },
  { id: 'R500transcript', kind: 'async', status: 500, code: 'TRANSCRIPT_UNAVAILABLE', options: { transcript: 'fail' }, raw: (host) => req('GET', '/transcript.json', { host }) },
  { id: 'N417expect', kind: 'node', status: 417, code: 'INVALID_FORMAT', http11: true, raw: (host) => post(host, step({ idempotencyKey: 'probe-key-0004' }), { Expect: 'x-unknown' }) },
  { id: 'N421nohost', kind: 'node', status: 421, code: 'LOCAL_HOST_REQUIRED', raw: () => req('GET', '/v1/leases', { host: null }) },
  { id: 'N405connect', kind: 'node', status: 405, code: 'METHOD_NOT_ALLOWED', behind: false, raw: (host) => req('CONNECT', '127.0.0.1:1', { host }) },
  { id: 'N400garbage', kind: 'node', status: 400, code: 'INVALID_FORMAT', behind: false, raw: () => Buffer.from('GARBAGE LINE\r\n\r\n', 'latin1') },
  { id: 'N431header', kind: 'node', status: 431, code: 'INVALID_FORMAT', behind: false, raw: (host) => req('GET', '/v1/leases', { host, headers: { 'X-Big': 'a'.repeat(9000) } }) },
];

// The framing of the refused request and of the request pipelined behind it. HTTP/1.0 asks to keep alive, because without
// it Node stops parsing after the first request and nothing could run behind it.
const FRAMINGS = [
  { id: 'h11', r: '1.1', m: '1.1' },
  { id: 'h10-m', r: '1.1', m: '1.0' },
  { id: 'h10-r', r: '1.0', m: '1.1' },
  { id: 'h10', r: '1.0', m: '1.0' },
];

const cat = (...parts) => Buffer.concat(parts);

// The forms of one pair. `applied`: the pipelined mutation M may run (it came first). `answers(R, M)`: what the client must get.
const FORMS = [
  { id: 'RM', name: '[R][M] one write', applied: false, answers: (r) => [r], writes: (p) => [{ data: cat(p.r, p.m) }] },
  { id: 'GRM', name: '[G][R][M] one write', applied: false, answers: (r) => [200, r], writes: (p) => [{ data: cat(p.g, p.r, p.m) }] },
  { id: 'TWO', name: '[R] 5 ms [M] two writes', applied: false, answers: (r) => [r], tolerant: true, writes: (p) => [{ data: p.r }, { data: p.m, delay: 5 }] },
  { id: 'MR', name: '[M][R] one write', applied: true, answers: (r, m) => [m, r], writes: (p) => [{ data: cat(p.m, p.r) }] },
  { id: 'RMchunked', name: '[R][M chunked] one write', applied: false, answers: (r) => [r], extra: true, writes: (p) => [{ data: cat(p.r, chunked(p.m)) }] },
  { id: 'RMexpect', name: '[R][M Expect: 100-continue] one write', applied: false, answers: (r) => [r], extra: true, writes: (p) => [{ data: cat(p.r, expecting(p.m)) }] },
];

function parts(row, host, framing) {
  return { r: asVersion(row.raw(host), framing.r, true), m: asVersion((row.mutation ?? mutation)(host), framing.m, true), g: reading(host) };
}

// The lane tests (u039-lane.test.cjs): a refusal that Node decides itself (an unknown Expect with and without a body, a request without Host, a parse
// error, CONNECT) behind zero to three legitimate requests. Node applies Expect only to HTTP/1.1 requests (`onlyHttp11`).
const LANE_REFUSALS = {
  'expect-get': { onlyHttp11: true, status: 417, make: (host) => req('GET', '/v1/leases', { host, headers: { Expect: 'nonsense' } }) },
  'expect-post-with-body': { onlyHttp11: true, status: 417, make: (host) => req('POST', '/v1/steps', { host, headers: { ...JSON_TYPE, Expect: 'nonsense' }, body: step({ idempotencyKey: 'probe-key-0009' }) }) },
  'no-host': { onlyHttp11: false, status: 421, make: () => req('GET', '/v1/leases', { host: null }) },
  'parse-error': { onlyHttp11: false, status: 400, make: () => Buffer.from('GARBAGE LINE\r\n\r\n', 'latin1') },
  connect: { onlyHttp11: false, status: 405, make: (host) => Buffer.from(`CONNECT ${host} HTTP/1.1\r\nHost: ${host}\r\n\r\n`, 'latin1') },
};
// G = a legitimate read, P = a legitimate mutation, X = the refusal; what follows X never runs.
const LANE_SHAPES = {
  GX: { before: ['G'], after: [] }, GGX: { before: ['G', 'G'], after: [] }, GGGX: { before: ['G', 'G', 'G'], after: [] },
  GGXG: { before: ['G', 'G'], after: ['G'] }, PGX: { before: ['P', 'G'], after: [] },
};
// h11: everything HTTP/1.1. h10m: the legitimate requests in HTTP/1.0 framing (asking to keep alive), the refusal in 1.1. h10: all of them in HTTP/1.0.
const LANE_FRAMINGS = [{ id: 'h11', legit: '1.1', refused: '1.1' }, { id: 'h10m', legit: '1.0', refused: '1.1' }, { id: 'h10', legit: '1.0', refused: '1.0' }];
const laneApplies = (refusal, framing) => !(refusal.onlyHttp11 && framing.refused === '1.0');
const laneName = (target, framing, shape, refusal) => `lane ${target} ${framing} [${shape}] ${refusal}: the earlier requests are answered in order, then the typed refusal, then the connection is closed`;

module.exports = { FORMS, FRAMINGS, LANE_FRAMINGS, LANE_REFUSALS, LANE_SHAPES, ROWS, laneApplies, laneName, mutation, parts, reading, step };
