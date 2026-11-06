'use strict';

// Test tooling, not production code: a raw TCP client that sends literal bytes and parses every HTTP/1.1 answer that comes back
// (every fixture answer carries Content-Length). A test sees how many answers arrived and whether the SERVER ended the connection.
const net = require('node:net');

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
    const length = Number(headers['content-length'] || 0);
    if (rest.length < end + 4 + length) break;
    const text = rest.subarray(end + 4, end + 4 + length).toString('utf8');
    let json = null;
    try { json = JSON.parse(text); } catch { /* not JSON */ }
    answers.push({ status: Number((/^HTTP\/1\.\d (\d+)/.exec(lines[0]) || [])[1]), headers, json, text });
    rest = rest.subarray(end + 4 + length);
  }
  return answers;
}

// Sends the bytes and keeps the socket open (half-open allowed) until the server ends it, no byte has arrived for settleMs
// (after the first answer: the server keeps the connection), or waitMs pass.
function exchange(port, bytes, { waitMs = 4000, settleMs = 700 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ host: '127.0.0.1', port, allowHalfOpen: true });
    const chunks = [];
    const started = Date.now();
    let closedByServer = false;
    let settle = null;
    const finish = () => {
      clearTimeout(timer);
      clearTimeout(settle);
      socket.destroy();
      resolve({ answers: parseAnswers(Buffer.concat(chunks)), closedByServer, ms: Date.now() - started });
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

function head(port, method, target, headers = []) {
  return [`${method} ${target} HTTP/1.1`, `Host: 127.0.0.1:${port}`, ...headers].join('\r\n');
}

// A request with a Content-Length body; headers is a list of 'Name: value' lines.
function withBody(port, method, target, headers, body) {
  const payload = Buffer.from(body);
  return Buffer.concat([Buffer.from(`${head(port, method, target, [...headers, `Content-Length: ${payload.length}`])}\r\n\r\n`), payload]);
}

const bare = (port, method, target, headers = []) => Buffer.from(`${head(port, method, target, headers)}\r\n\r\n`);

module.exports = Object.freeze({ parseAnswers, exchange, head, withBody, bare });
