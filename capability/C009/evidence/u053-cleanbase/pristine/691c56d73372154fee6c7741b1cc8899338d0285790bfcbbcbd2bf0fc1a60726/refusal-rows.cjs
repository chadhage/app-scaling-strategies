'use strict';

// Test tooling, not production code: one row per typed refusal the server can answer with (the keys of codes.cjs), each with the
// request that provokes it. refusal-close.test.cjs sends every row and demands the same ending: answered once, Connection: close,
// the server ends the connection, nothing was changed. A code without a row fails the coverage check there.
const { bare, withBody } = require('./raw-http.cjs');

const JSON_HEADERS = ['Content-Type: application/json'];
const auth = (token) => `Authorization: Bearer ${token}`;
const post = (port, command, headers, body) => withBody(port, 'POST', `/v1/commands/${command}`, headers, body);
const asConductor = (port, tokens, body, extra = []) => post(port, 'run.create', [auth(tokens['conductor-a']), ...JSON_HEADERS, ...extra], body);
const RUN = '{"name":"alpha","units":5}';
const CHUNKED = 'Transfer-Encoding: chunked';

const ROWS = [
  { code: 'AUTHENTICATION_REQUIRED', status: 401, request: ({ port }) => post(port, 'run.create', JSON_HEADERS, RUN) },
  { code: 'TOKEN_MALFORMED', status: 401, request: ({ port }) => post(port, 'run.create', [auth('abc'), ...JSON_HEADERS], RUN) },
  { code: 'TOKEN_UNKNOWN', status: 401, request: ({ port }) => post(port, 'run.create', [auth(`c009_${'A'.repeat(43)}`), ...JSON_HEADERS], RUN) },
  {
    code: 'TOKEN_EXPIRED', status: 401,
    setup: ({ context }) => { const token = context.app.issueToken('visitor', { ttlMs: 1 }); context.clock.advance(10); return { stale: token }; },
    request: ({ port, extra }) => post(port, 'run.create', [auth(extra.stale), ...JSON_HEADERS], RUN)
  },
  { code: 'COMMAND_NAME_INVALID', status: 400, request: ({ port, tokens }) => post(port, 'Bad_Name', [auth(tokens['conductor-a']), ...JSON_HEADERS], RUN) },
  { code: 'COMMAND_UNKNOWN', status: 404, request: ({ port, tokens }) => post(port, 'no.such', [auth(tokens.operator), ...JSON_HEADERS], '{}') },
  { code: 'ROLE_FORBIDDEN', status: 403, request: ({ port, tokens }) => post(port, 'run.create', [auth(tokens.visitor), ...JSON_HEADERS], RUN) },
  { code: 'QUERY_NOT_ALLOWED', status: 400, request: ({ port }) => bare(port, 'GET', '/v1/state?x=1') },
  { code: 'QUERY_INVALID', status: 400, request: ({ port, tokens }) => bare(port, 'GET', '/v1/authorization/preview?foo=bar', [auth(tokens.visitor)]) },
  { code: 'MEDIA_TYPE_UNSUPPORTED', status: 415, request: ({ port, tokens }) => post(port, 'run.create', [auth(tokens['conductor-a']), 'Content-Type: text/plain'], RUN) },
  { code: 'BODY_TOO_LARGE', status: 413, request: ({ port, tokens }) => asConductor(port, tokens, JSON.stringify({ name: 'a', units: 1, pad: 'x'.repeat(5000) })) },
  { code: 'BODY_INVALID_JSON', status: 400, request: ({ port, tokens }) => asConductor(port, tokens, '{bad') },
  { code: 'BODY_NOT_OBJECT', status: 400, request: ({ port, tokens }) => asConductor(port, tokens, '[]') },
  { code: 'IDENTITY_CLAIM_REJECTED', status: 400, request: ({ port, tokens }) => asConductor(port, tokens, '{"name":"a","units":1,"role":"operator"}') },
  { code: 'INPUT_UNKNOWN_FIELD', status: 400, request: ({ port, tokens }) => asConductor(port, tokens, '{"name":"a","units":1,"extra":1}') },
  { code: 'INPUT_MISSING_FIELD', status: 400, request: ({ port, tokens }) => asConductor(port, tokens, '{"name":"a"}') },
  { code: 'INPUT_INVALID', status: 400, request: ({ port, tokens }) => asConductor(port, tokens, '{"name":"a","units":0}') },
  {
    code: 'ALREADY_APPROVED', status: 409,
    setup: async ({ context, tokens, send }) => { await send(context, 'experiment.approve', tokens.operator); },
    request: ({ port, tokens }) => post(port, 'experiment.approve', [auth(tokens.operator), ...JSON_HEADERS], '{"experimentId":"exp-001"}')
  },
  {
    code: 'STATE_FULL', status: 409, app: { limits: { entries: 1 } },
    setup: async ({ context, tokens, send }) => { await send(context, 'scratch.create', tokens['conductor-a']); },
    request: ({ port, tokens }) => post(port, 'scratch.create', [auth(tokens['conductor-b']), ...JSON_HEADERS], '{"name":"b"}')
  },
  {
    code: 'OWNER_QUOTA_FULL', status: 409, app: { limits: { ownerEntries: 1 } },
    setup: async ({ context, tokens, send }) => { await send(context, 'scratch.create', tokens['conductor-a']); },
    request: ({ port, tokens }) => post(port, 'scratch.create', [auth(tokens['conductor-a']), ...JSON_HEADERS], '{"name":"b"}')
  },
  { code: 'COMMAND_NOT_IMPLEMENTED', status: 501, app: { handlers: {} }, request: ({ port, tokens }) => asConductor(port, tokens, RUN) },
  {
    code: 'COMMAND_FAILED', status: 500, app: { handlers: { 'run.create': () => { throw new Error('synthetic failure'); } } },
    request: ({ port, tokens }) => asConductor(port, tokens, RUN)
  },
  { code: 'METHOD_NOT_ALLOWED', status: 405, request: ({ port }) => bare(port, 'GET', '/v1/commands/run.create') },
  { code: 'UNEXPECTED_BODY', status: 400, request: ({ port }) => withBodyChunked(port) },
  { code: 'URL_TOO_LONG', status: 414, request: ({ port }) => bare(port, 'GET', `/${'a'.repeat(2100)}`) },
  { code: 'INVALID_URL', status: 400, request: ({ port }) => bare(port, 'GET', '/v1/state#fragment') },
  { code: 'NOT_FOUND', status: 404, request: ({ port }) => bare(port, 'GET', '/nope') },
  { code: 'LOCAL_HOST_REQUIRED', status: 421, request: () => Buffer.from('GET /v1/state HTTP/1.1\r\nHost: evil.example\r\n\r\n') },
  { code: 'CROSS_ORIGIN_DENIED', status: 403, request: ({ port }) => bare(port, 'GET', '/v1/state', ['Origin: http://evil.example']) },
  {
    code: 'INTERNAL_ERROR', status: 500, app: { validateInput: () => { throw new Error('synthetic failure'); } },
    request: ({ port, tokens }) => asConductor(port, tokens, RUN)
  },
  { code: 'EXPECTATION_FAILED', status: 417, request: ({ port }) => bare(port, 'GET', '/v1/state', ['Expect: nonsense']) },
  // The three answers Node would write ITSELF through its default clientError path (rev-C017 F11): a typed answer, then the same ending.
  { code: 'REQUEST_MALFORMED', status: 400, request: () => Buffer.from('GET\r\n\r\n') },
  { code: 'HEADERS_TOO_LARGE', status: 431, request: ({ port }) => bare(port, 'GET', '/v1/state', [`X-Pad: ${'a'.repeat(20000)}`]) },
  {
    code: 'REQUEST_TIMEOUT', status: 408, app: { limits: { headerMs: 300, checkMs: 50 } },
    request: ({ port, tokens }) => Buffer.from(`POST /v1/commands/run.create HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${auth(tokens['conductor-a'])}\r\nContent-Type: application/json\r\nContent-Length: 100000\r\n\r\n{"name":"`)
  }
];

function withBodyChunked(port) {
  return Buffer.from(`GET /v1/state HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${CHUNKED}\r\n\r\n3\r\nabc\r\n0\r\n\r\n`);
}

module.exports = Object.freeze({ ROWS, auth, post, JSON_HEADERS, RUN, CHUNKED });
