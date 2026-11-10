'use strict';

// Test tooling, not production code: a raw TCP client that sends literal bytes (one write, or several writes gapMs apart) and parses every
// HTTP/1.x answer that comes back (every answer of the fixture carries Content-Length). A test sees how many answers arrived, in what
// order, and whether the SERVER ended the connection. The windows are generous deadlines for a broken server, never an assertion about speed;
// C010_SETTLE_MS shortens them for the mutation run only (a mutant that keeps connections open would make every cell wait).
const net = require('node:net');

const SETTLE_MS = Number(process.env.C010_SETTLE_MS || 5000);

function parseAnswers(buffer) {
  const answers = [];
  let rest = buffer;
  for (;;) {
    const end = rest.indexOf('\r\n\r\n');
    if (end === -1) break;
    const lines = rest.subarray(0, end).toString('latin1').split('\r\n');
    const headers = {};
    for (const line of lines.slice(1)) {
      const at = line.indexOf(':');
      if (at > 0) headers[line.slice(0, at).toLowerCase()] = line.slice(at + 1).trim();
    }
    const status = Number((/^HTTP\/1\.\d (\d+)/.exec(lines[0]) || [])[1]);
    const length = status === 100 ? 0 : Number(headers['content-length'] || 0);
    if (rest.length < end + 4 + length) break;
    const text = rest.subarray(end + 4, end + 4 + length).toString('utf8');
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    answers.push({ status, headers, json, text });
    rest = rest.subarray(end + 4 + length);
  }
  return answers;
}

function exchange(port, writes, { gapMs = 25, waitMs = 20000, settleMs = SETTLE_MS, half = true } = {}) {
  const parts = Array.isArray(writes) ? writes : [writes];
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: half });
    const chunks = [];
    let closedByServer = false;
    let settle = null;
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(settle);
      socket.destroy();
      resolve({ answers: parseAnswers(Buffer.concat(chunks)), closedByServer, received: Buffer.concat(chunks) });
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
    socket.write(parts[0]);
    parts.slice(1).forEach((bytes, index) => setTimeout(() => { if (!socket.destroyed) socket.write(bytes); }, gapMs * (index + 1)));
  });
}

function head(port, method, target, headers = [], version = 'HTTP/1.1') {
  return [`${method} ${target} ${version}`, `Host: 127.0.0.1:${port}`, ...headers].join('\r\n');
}

// A request with a Content-Length body; headers is a list of 'Name: value' lines.
function withBody(port, method, target, headers, body, version) {
  const payload = Buffer.from(body);
  return Buffer.concat([Buffer.from(`${head(port, method, target, [...headers, `Content-Length: ${payload.length}`], version)}\r\n\r\n`), payload]);
}

const bare = (port, method, target, headers = [], version) => Buffer.from(`${head(port, method, target, headers, version)}\r\n\r\n`);
const bearer = (token) => `Authorization: Bearer ${token}`;
const JSON_TYPE = 'Content-Type: application/json';

module.exports = Object.freeze({ JSON_TYPE, bare, bearer, exchange, head, parseAnswers, withBody });
