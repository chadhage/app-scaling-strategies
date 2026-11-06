'use strict';

// Test tooling, not production code: raw one-write HTTP/1.x pipelining probes for U040. A request is built as exact bytes so
// that one TCP write can carry a refusal and whatever is pipelined behind it, in HTTP/1.1 or HTTP/1.0 framing.
const net = require('node:net');
const framing = require('../framing.cjs');

const KEY = 'dGhlIHNhbXBsZSBub25jZQ==';
const HELLO = framing.encodeFrame({
  opcode: framing.OPCODES.text, payload: Buffer.from(JSON.stringify({ type: 'hello' })), maskKey: Buffer.from([1, 2, 3, 4])
});

// host === null sends no Host header. Framing '1.0k' is HTTP/1.0 with Connection: keep-alive (plain 1.0 closes after one answer).
function wire({ method = 'GET', target = '/', host, framing: version = '1.1', headers = [], body = null }) {
  const protocol = version === '1.1' ? '1.1' : '1.0';
  const lines = [`${method} ${target} HTTP/${protocol}`];
  if (host !== null) lines.push(`Host: ${host}`);
  if (version === '1.0k') lines.push('Connection: keep-alive');
  lines.push(...headers);
  const head = Buffer.from(`${lines.join('\r\n')}\r\n\r\n`, 'latin1');
  return body === null ? head : Buffer.concat([head, Buffer.from(body, 'latin1')]);
}

// The "mutation": a valid WebSocket upgrade immediately followed by a masked hello frame, which creates a hub session.
function upgradeWithHello(host, version = '1.1') {
  const headers = ['Upgrade: websocket', 'Connection: Upgrade', `Sec-WebSocket-Key: ${KEY}`, 'Sec-WebSocket-Version: 13'];
  return Buffer.concat([wire({ target: '/stream', host, framing: version, headers }), HELLO]);
}

function parseResponses(bytes) {
  const responses = [];
  let at = 0;
  while (at < bytes.length) {
    const end = bytes.indexOf('\r\n\r\n', at);
    if (end === -1) { responses.push({ status: null, partial: bytes.length - at }); break; }
    const lines = bytes.subarray(at, end).toString('latin1').split('\r\n');
    const match = /^HTTP\/1\.[01] (\d{3})/.exec(lines[0]);
    if (!match) { responses.push({ status: null, garbage: lines[0].slice(0, 60) }); break; }
    const headers = Object.fromEntries(lines.slice(1).map((line) => [line.slice(0, line.indexOf(':')).toLowerCase(), line.slice(line.indexOf(':') + 1).trim()]));
    const status = Number(match[1]);
    at = end + 4;
    if (status === 100 || status === 101) {
      responses.push({ status, headers, body: '' });
      if (status === 101) break;
      continue;
    }
    const length = Number(headers['content-length'] ?? 0);
    responses.push({ status, headers, body: bytes.subarray(at, at + length).toString('utf8') });
    at += length;
  }
  return responses;
}

// writes: [{ data, after }]; after is a delay in ms, or 'answer' to wait for the first response head. Event driven: it ends when the
// server closes the connection, or when a connection that stays open (a WebSocket, or an answer that does not say Connection: close)
// has been quiet for quietMs after an answer; boundMs is only a hang guard.
function exchange(port, writes, { boundMs = 6000, quietMs = 400 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
    const chunks = [];
    const seen = { heads: 0, finished: false, reason: null, error: null };
    let quiet = null;
    const finish = (reason) => {
      if (seen.finished) return;
      seen.finished = true;
      clearTimeout(quiet);
      clearTimeout(bound);
      seen.reason = reason;
      const bytes = Buffer.concat(chunks);
      socket.destroy();
      const responses = parseResponses(bytes);
      resolve({
        responses, statuses: responses.map((response) => response.status), saw101: responses.some((response) => response.status === 101),
        closedByServer: ['end', 'close'].includes(reason), reason, error: seen.error, text: bytes.toString('latin1').slice(0, 400)
      });
    };
    const bound = setTimeout(() => finish('timeout'), boundMs);
    // An answer that says Connection: close promises that the server ends the connection, so the quiet window must not end the exchange
    // before the server has: a starved server may flush an answer and close the socket far later than quietMs, and that is not a defect.
    // Only boundMs, a hang guard, ends the exchange then. A 101 starts a stream that stays open and keeps the quiet window.
    const promisesClose = () => {
      const last = parseResponses(Buffer.concat(chunks)).filter((response) => response.status !== null).pop();
      return last !== undefined && last.status !== 101 && last.headers.connection === 'close';
    };
    const arm = () => { clearTimeout(quiet); if (seen.heads > 0 && !promisesClose()) quiet = setTimeout(() => finish('quiet'), quietMs); };
    const firstHead = () => new Promise((ready) => {
      const check = () => (seen.heads > 0 || seen.finished || socket.destroyed ? ready() : setTimeout(check, 5));
      check();
    });
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      seen.heads = (Buffer.concat(chunks).toString('latin1').match(/\r\n\r\n/g) ?? []).length;
      arm();
    });
    socket.on('end', () => finish('end'));
    socket.on('close', () => finish('close'));
    socket.on('error', (error) => { seen.error = error.code ?? String(error); });
    socket.once('connect', async () => {
      for (const write of writes) {
        if (write.after === 'answer') await firstHead();
        else if (write.after) await new Promise((ready) => setTimeout(ready, write.after));
        if (seen.finished || socket.destroyed) break;
        socket.write(write.data);
      }
      arm();
    });
  });
}

module.exports = Object.freeze({ KEY, HELLO, wire, upgradeWithHello, parseResponses, exchange });
