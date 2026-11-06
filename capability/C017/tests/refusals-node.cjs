'use strict';

// Test tooling, not production code: the requests that Node itself would answer (or drop) BEFORE any handler of ours runs, each with the
// status the ONE central refusal path must give (F11 of the second independent review: Node's own 417 for an unknown Expect header kept the
// connection and the endless body flowing, so the close-after-refusal rule held for every shape of tests/refusals.cjs except this one).
// Same shape as refusals.cjs, plus: `endless` (the attack streams an endless body behind the head), `control` (the NAIVE control server of
// flood-structural.test.cjs keeps such a connection open: it does not for a request Node answers and closes by itself), and `status` 0 for
// a request that is dropped with no answer at all. refusals.cjs stays byte-identical: older retained REDs pin it.
const chunked = 'Transfer-Encoding: chunked\r\n\r\n';
const json = 'Content-Type: application/json\r\n';
const empty = '0\r\n\r\n';

const rows = [
  { name: 'unknown Expect header on a GET (417)', status: 417, endless: true, control: true, head: (host) => `GET /api/state HTTP/1.1\r\n${host}Expect: foo\r\n${chunked}`, small: empty },
  { name: 'unknown Expect header on a command route (417)', status: 417, endless: true, control: true, head: (host) => `POST /api/cancel HTTP/1.1\r\n${host}Expect: foo\r\n${json}${chunked}`, small: empty },
  { name: 'Expect: 100-continue with an unsupported media type (415, refused before any 100)', status: 415, endless: true, control: true, head: (host) => `POST /api/cancel HTTP/1.1\r\n${host}Expect: 100-continue\r\nContent-Type: text/plain\r\n${chunked}`, small: empty },
  { name: 'Expect: 100-continue with a body over the limit (413)', status: 413, endless: true, control: true, head: (host) => `POST /api/cancel HTTP/1.1\r\n${host}Expect: 100-continue\r\n${json}${chunked}`, small: `${'1\r\na\r\n'.repeat(2100)}${empty}` },
  { name: 'HTTP/1.1 request without a Host header (403)', status: 403, endless: true, control: false, head: () => `GET /api/state HTTP/1.1\r\n${chunked}`, small: empty },
  { name: 'HTTP/1.0 request with an endless declared length (413)', status: 413, endless: true, control: true, head: (host) => `POST /api/cancel HTTP/1.0\r\n${host}Connection: keep-alive\r\n${json}Content-Length: 999999999\r\n\r\n`, small: '' },
  { name: 'malformed request line (400)', status: 400, endless: false, control: false, head: () => 'G@T /api/state HTTP/1.1\r\n\r\n', small: '' },
  { name: 'oversize header (431)', status: 431, endless: false, control: false, head: (host) => `GET /api/state HTTP/1.1\r\n${host}X-Big: ${'z'.repeat(12000)}\r\n\r\n`, small: '' },
  { name: 'upgrade attempt (Node ignores it without a listener: an ordinary request, 200)', status: 200, endless: false, control: false, head: (host) => `GET /api/state HTTP/1.1\r\n${host}Connection: Upgrade\r\nUpgrade: websocket\r\n\r\n`, small: '' },
  { name: 'CONNECT (dropped, no answer)', status: 0, endless: false, control: false, head: (host) => `CONNECT 127.0.0.1:1 HTTP/1.1\r\n${host}\r\n`, small: '' },
];

// The LAST status line: an interim 100 Continue may come first, the final answer is the one that counts.
const finalStatusOf = (text) => { const all = [...text.matchAll(/^HTTP\/1\.[01] (\d{3}) /gm)]; return all.length ? Number(all[all.length - 1][1]) : 0; };
const bodyOf = (text) => { const at = text.lastIndexOf('\r\n\r\n'); return at < 0 ? '' : text.slice(at + 4); };

module.exports = Object.freeze({ rows, finalStatusOf, bodyOf });
