'use strict';

// Test tooling, not production code: every request shape the server answers WITHOUT reading the body, each with the status it must
// answer (L-0132: apply close-after-refusal in the ONE central send path and test it over the whole table, not only the reported case).
// Shared by the in-process closure test (chunked.test.cjs) and the cross-process stall test (chunked-process.test.cjs).
// `head(host)` is the request head with a chunked body to follow; `small` is a complete small body that gets the same status.
const chunked = 'Transfer-Encoding: chunked\r\n\r\n';
const json = 'Content-Type: application/json\r\n';
const empty = '0\r\n\r\n';

const rows = [
  { name: 'GET state with a body (200)', status: 200, head: (host) => `GET /api/state HTTP/1.1\r\n${host}${chunked}`, small: empty },
  { name: 'GET page with a body (200)', status: 200, head: (host) => `GET / HTTP/1.1\r\n${host}${chunked}`, small: empty },
  { name: 'foreign origin (403)', status: 403, head: (host) => `POST /api/cancel HTTP/1.1\r\n${host}Origin: http://evil.example\r\n${json}${chunked}`, small: empty },
  { name: 'cross-site fetch (403)', status: 403, head: (host) => `GET /api/state HTTP/1.1\r\n${host}Sec-Fetch-Site: cross-site\r\n${chunked}`, small: empty },
  { name: 'forged Host header (403)', status: 403, head: () => `POST /api/cancel HTTP/1.1\r\nHost: evil.example\r\n${json}${chunked}`, small: empty },
  { name: 'unknown route (404)', status: 404, head: (host) => `GET /nowhere HTTP/1.1\r\n${host}${chunked}`, small: empty },
  { name: 'wrong method on a command route (405)', status: 405, head: (host) => `PUT /api/cancel HTTP/1.1\r\n${host}${json}${chunked}`, small: empty },
  { name: 'GET on a command route (405)', status: 405, head: (host) => `GET /api/cancel HTTP/1.1\r\n${host}${chunked}`, small: empty },
  { name: 'POST to an unknown route (405)', status: 405, head: (host) => `POST /nowhere HTTP/1.1\r\n${host}${json}${chunked}`, small: empty },
  { name: 'endless JSON body, over the 2 KB limit (413)', status: 413, head: (host) => `POST /api/cancel HTTP/1.1\r\n${host}${json}${chunked}`, small: `${'1\r\na\r\n'.repeat(2100)}${empty}` },
  { name: 'wrong media type (415)', status: 415, head: (host) => `POST /api/cancel HTTP/1.1\r\n${host}Content-Type: text/plain\r\n${chunked}`, small: empty },
  { name: 'no media type (415)', status: 415, head: (host) => `POST /api/cancel HTTP/1.1\r\n${host}${chunked}`, small: empty },
];

const statusOf = (text) => Number((/^HTTP\/1\.1 (\d{3}) /.exec(text) || [0, 0])[1]);

module.exports = Object.freeze({ rows, statusOf });
