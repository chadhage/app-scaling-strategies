'use strict';

// Test tooling, not production code: a raw TCP client that sends literal bytes and parses every HTTP answer that comes back (every
// fixture answer carries Content-Length). A test sees how many answers arrived, their exact bytes, and whether the SERVER ended the
// connection. Nothing here sleeps for a fixed time: it waits for the server's close, or for the settle window after the last byte.
const net = require('node:net');

function parseAnswers(buffer) {
  const answers = [];
  let rest = buffer;
  for (;;) {
    const end = rest.indexOf('\r\n\r\n');
    if (end === -1) break;
    const headText = rest.subarray(0, end).toString('latin1');
    const lines = headText.split('\r\n');
    const headers = {};
    for (const line of lines.slice(1)) {
      const at = line.indexOf(':');
      if (at > 0) headers[line.slice(0, at).toLowerCase()] = line.slice(at + 1).trim();
    }
    const status = Number((/^HTTP\/1\.\d (\d+)/.exec(lines[0]) || [])[1]);
    const length = status === 304 || status === 204 ? 0 : Number(headers['content-length'] || 0);
    if (rest.length < end + 4 + length) break;
    const text = rest.subarray(end + 4, end + 4 + length).toString('utf8');
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    answers.push({ status, headers, json, text, headText });
    rest = rest.subarray(end + 4 + length);
  }
  return answers;
}

// The answer as bytes that must not depend on time: every header but Date, in name order, then the body.
function canon(answer) {
  const lines = answer.headText.split('\r\n');
  return [lines[0], ...lines.slice(1).filter((line) => !/^date:/i.test(line)).sort(), '', answer.text].join('\n');
}

// Sends the bytes and keeps the socket open (half-open allowed) until the server ends it, no byte has arrived for settleMs, or waitMs pass.
function exchange(port, bytes, { waitMs = 4000, settleMs = 500 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
    const chunks = [];
    let closedByServer = false;
    let settle = null;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      clearTimeout(settle);
      socket.destroy();
      resolve({ answers: parseAnswers(Buffer.concat(chunks)), closedByServer, bytes: Buffer.concat(chunks).length });
    };
    const timer = setTimeout(finish, waitMs);
    const ended = () => { closedByServer = true; finish(); };
    socket.on('data', (chunk) => {
      chunks.push(chunk);
      clearTimeout(settle);
      settle = setTimeout(finish, settleMs);
    });
    socket.on('error', ended);
    socket.on('end', ended);
    socket.on('close', ended);
    socket.write(bytes);
  });
}

// One request as bytes. headers is a list of 'Name: value' lines; body is a string or Buffer sent with a Content-Length (or chunked).
function request(port, method, target, { version = '1.1', headers = [], body = null, chunked = false, host = true } = {}) {
  const lines = [`${method} ${target} HTTP/${version}`];
  if (host) lines.push(`Host: 127.0.0.1:${port}`);
  lines.push(...headers);
  if (version === '1.0') lines.push('Connection: keep-alive');
  const payload = body === null ? null : Buffer.from(body);
  if (payload && !chunked) lines.push(`Content-Length: ${payload.length}`);
  if (payload && chunked) lines.push('Transfer-Encoding: chunked');
  const head = Buffer.from(`${lines.join('\r\n')}\r\n\r\n`);
  if (!payload) return head;
  if (!chunked) return Buffer.concat([head, payload]);
  return Buffer.concat([head, Buffer.from(`${payload.length.toString(16)}\r\n`), payload, Buffer.from('\r\n0\r\n\r\n')]);
}

// A request whose BODY is withheld until release(): the server has read the head, taken its first decision and waits for the body. The
// result is the first answer. This is how a race between "decided" and "committed" is built without a hook or a sleep.
function inflight(port, method, target, { headers = [], body }) {
  const payload = Buffer.from(JSON.stringify(body));
  const head = Buffer.from(`${[`${method} ${target} HTTP/1.1`, `Host: 127.0.0.1:${port}`, ...headers, 'Content-Type: application/json', `Content-Length: ${payload.length}`].join('\r\n')}\r\n\r\n`);
  const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
  const chunks = [];
  const result = new Promise((resolve) => {
    const check = () => { const [first] = parseAnswers(Buffer.concat(chunks)); if (first) resolve(first); };
    socket.on('data', (chunk) => { chunks.push(chunk); check(); });
    const ended = () => resolve(parseAnswers(Buffer.concat(chunks))[0] || null);
    socket.on('end', ended);
    socket.on('close', ended);
    socket.on('error', ended);
  }).finally(() => socket.destroy());
  socket.write(head);
  return { release: () => socket.write(payload), result };
}

module.exports = Object.freeze({ canon, exchange, inflight, parseAnswers, request });
