'use strict';

// Test tooling, not production code: one row per typed refusal the server can answer with (every key of codes.cjs), each with the request that
// provokes it, plus the two extra shapes of what Node answers itself (an unknown Expect on a POST with a body, CONNECT). matrix.cjs sends every
// row in every shape and framing; refusal-table.test.cjs demands the same ending for every one: the server's answer once, Connection: close, the
// server ends the connection, nothing was changed. A code without a row fails the coverage check there.
const { bare, bearer, JSON_TYPE, withBody } = require('./raw-http.cjs');

const asB = (ctx) => bearer(ctx.tokens['conductor-b']);
const post = (ctx, route, body, headers = [asB(ctx), JSON_TYPE]) => withBody(ctx.port, 'POST', route, headers, body);
const scratches = (ctx) => `/v1/leases/${ctx.lease}/scratches`;
const GOOD = '{"name":"x"}';
const CHUNKED = 'Transfer-Encoding: chunked';

// config names the server a row needs: default, quota (ownerEntries 3), timeout (header timeout 300 ms), closed (the role table lacks lease.read),
// ids (the id generator fails for scratches). setup may add resources to the cell's lease; skips lists the framings where the row means nothing.
const ROWS = [
  { code: 'AUTHENTICATION_REQUIRED', status: 401, request: (c) => post(c, scratches(c), GOOD, [JSON_TYPE]) },
  { code: 'TOKEN_MALFORMED', status: 401, request: (c) => post(c, scratches(c), GOOD, [bearer('abc'), JSON_TYPE]) },
  { code: 'TOKEN_UNKNOWN', status: 401, request: (c) => post(c, scratches(c), GOOD, [bearer(`c009_${'A'.repeat(43)}`), JSON_TYPE]) },
  { code: 'TOKEN_EXPIRED', status: 401, request: (c) => post(c, scratches(c), GOOD, [bearer(c.tokens.expired), JSON_TYPE]) },
  { code: 'COMMAND_UNKNOWN', config: 'closed', status: 404, request: (c) => bare(c.port, 'GET', `/v1/leases/${c.lease}`, [asB(c)]) },
  { code: 'ROLE_FORBIDDEN', status: 403, request: (c) => post(c, scratches(c), GOOD, [bearer(c.tokens.visitor), JSON_TYPE]) },
  { code: 'QUERY_NOT_ALLOWED', status: 400, request: (c) => bare(c.port, 'GET', '/v1/me?x=1', [asB(c)]) },
  { code: 'MEDIA_TYPE_UNSUPPORTED', status: 415, request: (c) => post(c, scratches(c), GOOD, [asB(c), 'Content-Type: text/plain']) },
  { code: 'BODY_TOO_LARGE', status: 413, request: (c) => post(c, scratches(c), JSON.stringify({ name: 'x', pad: 'x'.repeat(5000) })) },
  { code: 'BODY_INVALID_JSON', status: 400, request: (c) => post(c, scratches(c), '{bad') },
  { code: 'BODY_NOT_OBJECT', status: 400, request: (c) => post(c, scratches(c), '[]') },
  { code: 'IDENTITY_CLAIM_REJECTED', status: 400, request: (c) => post(c, scratches(c), '{"name":"x","owner":"conductor-a"}') },
  { code: 'SERVER_FIELD_REJECTED', status: 400, request: (c) => post(c, scratches(c), '{"name":"x","id":"y"}') },
  { code: 'INPUT_UNKNOWN_FIELD', status: 400, request: (c) => post(c, scratches(c), '{"name":"x","extra":1}') },
  { code: 'INPUT_MISSING_FIELD', status: 400, request: (c) => post(c, scratches(c), '{}') },
  { code: 'INPUT_INVALID', status: 400, request: (c) => post(c, scratches(c), '{"name":"Not Valid"}') },
  { code: 'QUERY_REJECTED', status: 400, request: (c) => bare(c.port, 'GET', '/v1/leases?x=1', [asB(c)]) },
  { code: 'TARGET_NOT_FOUND', status: 404, request: (c) => bare(c.port, 'GET', `/v1/leases/${c.foreign}`, [asB(c)]) },
  { code: 'STATE_CONFLICT', status: 409, setup: 'cancelled', request: (c) => withBody(c.port, 'POST', `/v1/leases/${c.lease}/runs/${c.run2}/cancel`, [asB(c)], '') },
  { code: 'OWNER_QUOTA_FULL', config: 'quota', status: 409, setup: 'fill', request: (c) => post(c, scratches(c), GOOD) },
  { code: 'METHOD_NOT_ALLOWED', status: 405, request: (c) => bare(c.port, 'PUT', `/v1/leases/${c.lease}`, [asB(c)]) },
  { code: 'UNEXPECTED_BODY', status: 400, skips: ['HTTP/1.0 keep-alive'], request: (c) => Buffer.from(`GET /v1/me HTTP/1.1\r\nHost: 127.0.0.1:${c.port}\r\n${asB(c)}\r\n${CHUNKED}\r\n\r\n3\r\nabc\r\n0\r\n\r\n`) },
  { code: 'URL_TOO_LONG', status: 414, request: (c) => bare(c.port, 'GET', `/${'a'.repeat(2100)}`) },
  { code: 'INVALID_URL', status: 400, request: (c) => bare(c.port, 'GET', '/v1/me#x', [asB(c)]) },
  { code: 'NOT_FOUND', status: 404, request: (c) => bare(c.port, 'GET', '/nope') },
  { code: 'LOCAL_HOST_REQUIRED', status: 421, request: () => Buffer.from('GET /v1/me HTTP/1.1\r\nHost: evil.example\r\n\r\n') },
  { code: 'CROSS_ORIGIN_DENIED', status: 403, request: (c) => bare(c.port, 'GET', '/v1/me', [asB(c), 'Origin: http://evil.example']) },
  { code: 'INTERNAL_ERROR', config: 'ids', status: 500, request: (c) => post(c, scratches(c), GOOD) },
  // What Node answers by ITSELF (rev-C017 F11, rev-C059 N1): an unknown Expect (also on a POST that sends a body), a parse error, an oversized
  // header, a timeout and CONNECT. Node ignores Expect in HTTP/1.0, so those two rows skip the 1.0 framings.
  { code: 'EXPECTATION_FAILED', status: 417, skips: ['HTTP/1.0 keep-alive'], request: (c) => bare(c.port, 'GET', '/v1/me', [asB(c), 'Expect: nonsense']) },
  { code: 'EXPECTATION_FAILED', variant: 'a POST with a body', status: 417, skips: ['HTTP/1.0 keep-alive'], request: (c) => post(c, scratches(c), GOOD, [asB(c), JSON_TYPE, 'Expect: nonsense']) },
  { code: 'REQUEST_MALFORMED', status: 400, request: () => Buffer.from('GET\r\n\r\n') },
  { code: 'HEADERS_TOO_LARGE', status: 431, resets: true, request: (c) => bare(c.port, 'GET', '/v1/me', [asB(c), `X-Pad: ${'a'.repeat(20000)}`]) },
  { code: 'REQUEST_TIMEOUT', config: 'timeout', status: 408, resets: true, request: (c) => Buffer.from(`POST ${scratches(c)} HTTP/1.1\r\nHost: 127.0.0.1:${c.port}\r\n${asB(c)}\r\n${JSON_TYPE}\r\nContent-Length: 100000\r\n\r\n{"name":"`) },
  { code: 'METHOD_NOT_ALLOWED', variant: 'CONNECT', status: 405, skips: ['HTTP/1.0 keep-alive', 'refusal then HTTP/1.0'], request: (c) => Buffer.from(`CONNECT 127.0.0.1:${c.port} HTTP/1.1\r\nHost: 127.0.0.1:${c.port}\r\n\r\n`) }
];
const label = (row) => (row.variant ? `${row.code} (${row.variant})` : row.code);

module.exports = Object.freeze({ ROWS, label });
