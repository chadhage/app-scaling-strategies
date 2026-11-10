'use strict';

// Test tooling, not production code: one row per typed refusal the server can answer with (every key of codes.cjs), each with the request that
// provokes it, plus the extra shapes of what Node answers itself (an unknown Expect on a POST with a body, CONNECT). matrix.cjs sends every row in every
// shape and framing; pipeline-*.test.cjs demands the same ending for every one: the server's answer once, Connection: close, the server ends the
// connection, and nothing behind the refusal ran (what ANOTHER connection observes: the reservation that a queued release would have ended is still held,
// the key that a queued reserve would have used is still unused). A code without a row fails the coverage check there.
const { bare, bearer, JSON_TYPE, withBody } = require('./raw-http.cjs');

const asB = (ctx) => bearer(ctx.tokens['conductor-b']);
const body = (key, units = 1, tier = 'standard') => JSON.stringify({ key, tier, units });
const post = (ctx, text, headers = [asB(ctx), JSON_TYPE]) => withBody(ctx.port, 'POST', '/v1/reservations', headers, text);
const GOOD = body('key-row-0001');
const CHUNKED = 'Transfer-Encoding: chunked';

// prepare says what a row needs around its cells (see matrix.cjs): 'foreign' (a reservation of the other lease exists), 'fill' (the lease already holds
// two others, so that every cell's own reservation is its third and last), 'a5' (the other lease holds 5 units), 'a3burst' (it holds 3 units of burst),
// 'key' (each cell first uses the key that its refusal will clash with). bound marks a refusal decided by the books: nothing may change the books
// before it, so the shapes with a mutation BEFORE the refusal are not sent. skips lists the framings where the row means nothing.
const ROWS = [
  { code: 'AUTHENTICATION_REQUIRED', status: 401, request: (c) => post(c, GOOD, [JSON_TYPE]) },
  { code: 'TOKEN_MALFORMED', status: 401, request: (c) => post(c, GOOD, [bearer('abc'), JSON_TYPE]) },
  { code: 'TOKEN_UNKNOWN', status: 401, request: (c) => post(c, GOOD, [bearer(`c009_${'A'.repeat(43)}`), JSON_TYPE]) },
  { code: 'TOKEN_EXPIRED', status: 401, request: (c) => post(c, GOOD, [bearer(c.tokens.expired), JSON_TYPE]) },
  { code: 'COMMAND_UNKNOWN', config: 'closed', status: 404, request: (c) => bare(c.port, 'GET', '/v1/allowance', [asB(c)]) },
  { code: 'ROLE_FORBIDDEN', status: 403, request: (c) => post(c, GOOD, [bearer(c.tokens.visitor), JSON_TYPE]) },
  { code: 'QUERY_NOT_ALLOWED', status: 400, request: (c) => bare(c.port, 'GET', '/v1/me?x=1', [asB(c)]) },
  { code: 'MEDIA_TYPE_UNSUPPORTED', status: 415, request: (c) => post(c, GOOD, [asB(c), 'Content-Type: text/plain']) },
  { code: 'BODY_TOO_LARGE', status: 413, request: (c) => post(c, JSON.stringify({ key: 'key-row-0001', tier: 'standard', units: 1, pad: 'x'.repeat(5000) })) },
  { code: 'BODY_INVALID_JSON', status: 400, request: (c) => post(c, '{bad') },
  { code: 'BODY_NOT_OBJECT', status: 400, request: (c) => post(c, '[]') },
  { code: 'IDENTITY_CLAIM_REJECTED', status: 400, request: (c) => post(c, '{"key":"key-row-0001","tier":"standard","units":1,"owner":"conductor-a"}') },
  { code: 'SERVER_FIELD_REJECTED', status: 400, request: (c) => post(c, '{"key":"key-row-0001","tier":"standard","units":1,"spend":0}') },
  { code: 'INPUT_UNKNOWN_FIELD', status: 400, request: (c) => post(c, '{"key":"key-row-0001","tier":"standard","units":1,"extra":1}') },
  { code: 'INPUT_MISSING_FIELD', status: 400, request: (c) => post(c, '{}') },
  { code: 'INPUT_INVALID', status: 400, request: (c) => post(c, '{"key":"key-row-0001","tier":"standard","units":0}') },
  { code: 'QUERY_REJECTED', status: 400, request: (c) => bare(c.port, 'GET', '/v1/reservations?x=1', [asB(c)]) },
  { code: 'RESERVATION_NOT_FOUND', prepare: 'foreign', status: 404, request: (c) => bare(c.port, 'GET', `/v1/reservations/${c.foreign}`, [asB(c)]) },
  { code: 'IDEMPOTENCY_CONFLICT', prepare: 'key', bound: true, status: 409, request: (c) => post(c, body(`key-cell-${c.n}-k`, 2)) },
  { code: 'RESERVATION_LIMIT_REACHED', config: 'bounds', prepare: 'fill', bound: true, status: 409, request: (c) => post(c, body(`key-cell-${c.n}-r`)) },
  { code: 'LEASE_CAP_EXCEEDED', config: 'bounds', bound: true, status: 409, request: (c) => post(c, body(`key-cell-${c.n}-r`, 7)) },
  { code: 'LEASE_SPEND_CAP_EXCEEDED', config: 'bounds', bound: true, status: 409, request: (c) => post(c, body(`key-cell-${c.n}-r`, 4, 'burst')) },
  { code: 'CAPACITY_EXCEEDED', config: 'bounds', prepare: 'a5', bound: true, status: 409, request: (c) => post(c, body(`key-cell-${c.n}-r`, 4)) },
  { code: 'SPEND_EXCEEDED', config: 'bounds', prepare: 'a3burst', bound: true, status: 409, request: (c) => post(c, body(`key-cell-${c.n}-r`, 2, 'burst')) },
  { code: 'METHOD_NOT_ALLOWED', status: 405, request: (c) => bare(c.port, 'PUT', '/v1/reservations', [asB(c)]) },
  { code: 'UNEXPECTED_BODY', status: 400, skips: ['HTTP/1.0 keep-alive'], request: (c) => Buffer.from(`GET /v1/me HTTP/1.1\r\nHost: 127.0.0.1:${c.port}\r\n${asB(c)}\r\n${CHUNKED}\r\n\r\n3\r\nabc\r\n0\r\n\r\n`) },
  { code: 'URL_TOO_LONG', status: 414, request: (c) => bare(c.port, 'GET', `/${'a'.repeat(2100)}`) },
  { code: 'INVALID_URL', status: 400, request: (c) => bare(c.port, 'GET', '/v1/me#x', [asB(c)]) },
  { code: 'NOT_FOUND', status: 404, request: (c) => bare(c.port, 'GET', '/nope') },
  { code: 'LOCAL_HOST_REQUIRED', status: 421, request: () => Buffer.from('GET /v1/me HTTP/1.1\r\nHost: evil.example\r\n\r\n') },
  { code: 'CROSS_ORIGIN_DENIED', status: 403, request: (c) => bare(c.port, 'GET', '/v1/me', [asB(c), 'Origin: http://evil.example']) },
  { code: 'INTERNAL_ERROR', config: 'ids', ids: true, bound: true, status: 500, request: (c) => post(c, body(`key-cell-${c.n}-r`)) },
  // What Node answers by ITSELF (rev-C017 F11, rev-C059 N1): an unknown Expect (also on a POST that sends a body), a parse error, an oversized
  // header, a timeout and CONNECT. Node ignores Expect in HTTP/1.0, so those two rows skip the 1.0 framings.
  { code: 'EXPECTATION_FAILED', status: 417, skips: ['HTTP/1.0 keep-alive'], request: (c) => bare(c.port, 'GET', '/v1/me', [asB(c), 'Expect: nonsense']) },
  { code: 'EXPECTATION_FAILED', variant: 'a POST with a body', status: 417, skips: ['HTTP/1.0 keep-alive'], request: (c) => post(c, GOOD, [asB(c), JSON_TYPE, 'Expect: nonsense']) },
  { code: 'REQUEST_MALFORMED', status: 400, request: () => Buffer.from('GET\r\n\r\n') },
  { code: 'REQUEST_MALFORMED', variant: 'a bad chunk size', status: 400, resets: true, skips: ['HTTP/1.0 keep-alive'], request: (c) => Buffer.from(`POST /v1/reservations HTTP/1.1\r\nHost: 127.0.0.1:${c.port}\r\n${asB(c)}\r\n${JSON_TYPE}\r\n${CHUNKED}\r\n\r\nzz\r\nxx\r\n0\r\n\r\n`) },
  { code: 'LOCAL_HOST_REQUIRED', variant: 'no Host header', status: 421, request: () => Buffer.from('GET /v1/me HTTP/1.1\r\n\r\n') },
  { code: 'ROLE_FORBIDDEN', variant: 'Expect: 100-continue', status: 403, skips: ['HTTP/1.0 keep-alive'], request: (c) => post(c, GOOD, [bearer(c.tokens.visitor), JSON_TYPE, 'Expect: 100-continue']) },
  { code: 'HEADERS_TOO_LARGE', status: 431, resets: true, request: (c) => bare(c.port, 'GET', '/v1/me', [asB(c), `X-Pad: ${'a'.repeat(20000)}`]) },
  { code: 'REQUEST_TIMEOUT', config: 'timeout', status: 408, resets: true, request: (c) => Buffer.from(`POST /v1/reservations HTTP/1.1\r\nHost: 127.0.0.1:${c.port}\r\n${asB(c)}\r\n${JSON_TYPE}\r\nContent-Length: 100000\r\n\r\n{"key":"`) },
  { code: 'METHOD_NOT_ALLOWED', variant: 'CONNECT', status: 405, skips: ['HTTP/1.0 keep-alive', 'refusal then HTTP/1.0'], request: (c) => Buffer.from(`CONNECT 127.0.0.1:${c.port} HTTP/1.1\r\nHost: 127.0.0.1:${c.port}\r\n\r\n`) }
];
const label = (row) => (row.variant ? `${row.code} (${row.variant})` : row.code);

module.exports = Object.freeze({ ROWS, label });
