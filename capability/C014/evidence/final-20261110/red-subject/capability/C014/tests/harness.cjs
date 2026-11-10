'use strict';

// Test tooling, not production code: raw loopback sockets (so a test sees every byte the server sent and can pipeline several requests in one
// write), the subject resolver (the RED snapshots run against stubs, the replay and the suite against the real files), and a transcript that
// remembers every byte that left the server so one scan can cover them all.
const net = require('node:net');
const path = require('node:path');

// C014_SUBJECT names the directory that holds server.cjs: evidence\red\stubs for the RED, the namespace root for everything else.
const subjectDir = () => process.env.C014_SUBJECT || path.resolve(__dirname, '..');
const loadSubject = () => require(path.join(subjectDir(), 'server.cjs'));

function build(method, target, { headers = {}, body, port, version = '1.1', host } = {}) {
  const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
  const lines = [`${method} ${target} HTTP/${version}`];
  const all = { Host: host === undefined ? `127.0.0.1:${port}` : host, ...headers };
  if (payload && !Object.keys(all).some((name) => /^content-length$|^transfer-encoding$/i.test(name))) all['Content-Length'] = String(payload.length);
  for (const [name, value] of Object.entries(all)) if (value !== null) lines.push(`${name}: ${value}`);
  return Buffer.concat([Buffer.from(`${lines.join('\r\n')}\r\n\r\n`), payload || Buffer.alloc(0)]);
}

// Writes the pieces (one write each, `gapMs` apart) and collects everything until the server closes or `settleMs` of silence follows.
function exchange(port, pieces, { settleMs = 400, gapMs = 0, limit = 4 << 20 } = {}) {
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: '127.0.0.1' });
    const chunks = [];
    let total = 0;
    let closed = false;
    let timer = null;
    const done = () => { clearTimeout(timer); socket.destroy(); resolve({ bytes: Buffer.concat(chunks), closed, chunks }); };
    const rearm = () => { clearTimeout(timer); timer = setTimeout(done, settleMs); };
    socket.on('data', (chunk) => { chunks.push(chunk); total += chunk.length; if (total > limit) done(); else rearm(); });
    socket.on('close', () => { closed = true; done(); });
    socket.on('error', () => { closed = true; done(); });
    socket.on('connect', async () => {
      for (const piece of [].concat(pieces)) { socket.write(piece); if (gapMs) await new Promise((r) => setTimeout(r, gapMs)); }
      rearm();
    });
  });
}

// Splits the bytes of a connection into answers (Content-Length framing only: this server never chunks its answers).
function parseAnswers(bytes) {
  const answers = [];
  let rest = bytes;
  while (rest.length > 0) {
    const end = rest.indexOf('\r\n\r\n');
    if (end < 0) break;
    const head = rest.subarray(0, end).toString('latin1');
    const [statusLine, ...lines] = head.split('\r\n');
    const headers = {};
    for (const line of lines) { const at = line.indexOf(':'); headers[line.slice(0, at).toLowerCase()] = line.slice(at + 1).trim(); }
    const status = Number(statusLine.split(' ')[1]);
    if (status === 100) { rest = rest.subarray(end + 4); continue; }
    const length = Number(headers['content-length'] || 0);
    answers.push({ status, headers, head, body: rest.subarray(end + 4, end + 4 + length) });
    rest = rest.subarray(end + 4 + length);
  }
  return answers;
}

async function call(port, method, target, options = {}) {
  const { token, headers = {}, ...rest } = options;
  const all = { Connection: 'close', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers };
  if (rest.body !== undefined && !Object.keys(all).some((name) => /^content-type$/i.test(name))) all['Content-Type'] = 'application/json';
  // Connection: close makes the server end the exchange, so the end is a fact (the close event); the silence limit is only a hard cap for a server that never ends it
  const result = await exchange(port, build(method, target, { ...rest, headers: all, port }), { settleMs: 30000, ...options.exchange });
  const [answer] = parseAnswers(result.bytes);
  return { ...result, answer, status: answer ? answer.status : 0, json: () => JSON.parse(answer.body.toString('utf8')) };
}

class Transcript {
  constructor() { this.parts = []; }
  add(label, bytes) { this.parts.push({ label, bytes: Buffer.isBuffer(bytes) ? bytes : Buffer.from(String(bytes)) }); }
  all() { return Buffer.concat(this.parts.map((part) => Buffer.concat([Buffer.from(`\n#${part.label}\n`), part.bytes]))); }
  size() { return this.parts.reduce((sum, part) => sum + part.bytes.length, 0); }
}

module.exports = Object.freeze({ subjectDir, loadSubject, build, exchange, parseAnswers, call, Transcript });
