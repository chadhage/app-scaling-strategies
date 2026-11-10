'use strict';

// Test tooling: the refusal tables of the service, imported by tests\server.test.cjs (every refusal is typed, says Connection: close and destroys the socket) and by tests\victim.test.cjs
// (nothing that waits behind a refusal ever runs). A row is [name, bytes(port), status, code, decided]; `decided` says where the refusal is decided: 'lane' (when its own turn comes in
// the lane of its connection) or 'parse' (at once, by Node's parser: clientError). The rows of TABLE are all decided in the lane.
const request = (port, line, headers = [], body = 'abcd') => `${line} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\n${headers.join('\r\n')}${headers.length ? '\r\n' : ''}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`;

const TABLE = Object.freeze([
  ['a foreign Host', () => 'GET / HTTP/1.1\r\nHost: example.test\r\nContent-Length: 4\r\n\r\nabcd', 421, 'LOCAL_HOST_REQUIRED'],
  ['a cross origin', (port) => request(port, 'GET /scope.json', ['Origin: http://evil.test']), 403, 'CROSS_ORIGIN_DENIED'],
  ['a URL that is too long', (port) => request(port, `GET /${'a'.repeat(2100)}`), 414, 'URL_TOO_LONG'],
  ['another authority in the target', (port) => request(port, 'GET //evil.test/x'), 400, 'INVALID_URL'],
  ['a fragment', (port) => request(port, 'GET /scope.json#x'), 400, 'INVALID_URL'],
  ['a query', (port) => request(port, 'GET /v1/leases?x=1'), 400, 'INVALID_QUERY'],
  ['a GET with a body', (port) => request(port, 'GET /v1/leases', [], 'abcd'), 400, 'UNEXPECTED_BODY'],
  ['PUT on the step route', (port) => request(port, 'PUT /v1/steps', [], 'abcd'), 405, 'METHOD_NOT_ALLOWED'],
  ['DELETE on an asset', (port) => request(port, 'DELETE /scope.json', [], 'abcd'), 405, 'METHOD_NOT_ALLOWED'],
  ['POST on an asset', (port) => request(port, 'POST /scope.json', [], 'abcd'), 405, 'METHOD_NOT_ALLOWED'],
  ['HEAD', (port) => request(port, 'HEAD /'), 405, null],
  ['an unknown route', (port) => request(port, 'POST /admin', [], 'abcd'), 404, 'NOT_FOUND'],
  ['an upper-case action name', (port) => request(port, 'POST /v1/steps/srv-key-0001/Cancel', [], 'abcd'), 404, 'NOT_FOUND'],
  ['no transcript configured (bodiless: nothing to leave unread)', (port) => request(port, 'GET /transcript.json', ['Connection: close'], ''), 404, 'NOT_FOUND'],
  ['a wrong media type', (port) => request(port, 'POST /v1/steps', ['Content-Type: text/plain'], 'abcd'), 415, 'UNSUPPORTED_MEDIA_TYPE'],
  ['a declared body that is too large', (port) => `POST /v1/steps HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nContent-Type: application/json\r\nContent-Length: 5000\r\n\r\nabcd`, 413, 'BODY_TOO_LARGE'],
  ['a key that is not a key (inspect; bodiless)', (port) => request(port, 'GET /v1/steps/bad%20key', ['Connection: close'], ''), 400, 'INVALID_FORMAT'],
  ['a key that is not a key (action)', (port) => request(port, 'POST /v1/steps/not%20a%20key/cancel'), 400, 'INVALID_FORMAT'],
  ['an action with a body', (port) => request(port, 'POST /v1/steps/srv-key-0001/cancel', [], 'abcd'), 400, 'UNEXPECTED_BODY'],
  ['a GET on an action route', (port) => request(port, 'GET /v1/steps/srv-key-0001/cancel'), 405, 'METHOD_NOT_ALLOWED'],
]);

// The answers NODE would give by itself are the service's own typed answers on the same refusal rule (proved in process, with real sockets, so that the listeners are measured by the
// coverage run; tests\pipelining.test.cjs proves them, and that nothing runs behind them, in a separate process).
const NODE_OWN = Object.freeze([
  ['an unknown expectation', (port) => `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nExpect: nonsense\r\n\r\n`, 417, 'EXPECTATION_NOT_SUPPORTED', 'lane'],
  ['a request without Host', () => 'GET /scope.json HTTP/1.1\r\n\r\n', 421, 'LOCAL_HOST_REQUIRED', 'lane'],
  ['a malformed HTTP version', (port) => `GET /scope.json HTTP/9.9\r\nHost: 127.0.0.1:${port}\r\n\r\n`, 400, 'MALFORMED_REQUEST', 'parse'],
  ['a header section that is too large', (port) => `GET /scope.json HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nX-Pad: ${'a'.repeat(9000)}\r\n\r\n`, 431, 'REQUEST_HEADERS_TOO_LARGE', 'parse'],
]);

module.exports = Object.freeze({ NODE_OWN, TABLE, request });
