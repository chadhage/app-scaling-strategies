'use strict';

// Test tooling, not production code. C009_SUBJECT_DIR lets the archived RED replay run these exact tests
// against the retained trusting-client stub instead of the real implementation.
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');

const subjectDir = process.env.C009_SUBJECT_DIR ? path.resolve(process.env.C009_SUBJECT_DIR) : path.resolve(__dirname, '..');

function load(name) {
  return require(path.join(subjectDir, name));
}

function fakeClock(start = 1000000) {
  const clock = { value: start, now: () => clock.value, advance(ms) { clock.value += ms; } };
  return clock;
}

async function startApp(options = {}) {
  const { createApp } = load('server.cjs');
  const clock = options.clock || fakeClock();
  const app = createApp({ now: () => clock.now(), ...options.app });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  return {
    app, clock, port, origin: `http://127.0.0.1:${port}`,
    async close() {
      app.server.closeAllConnections();
      await new Promise((resolve) => app.server.close(resolve));
    }
  };
}

async function withApp(options, run) {
  const context = await startApp(options);
  try { return await run(context); } finally { await context.close(); }
}

function request(context, { method = 'GET', route = '/', headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const outgoing = http.request({ host: '127.0.0.1', port: context.port, method, path: route, headers, agent: false }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: response.statusCode, headers: response.headers, text, json });
      });
    });
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}

// Writes literal HTTP text so a test can send what http.request refuses to (duplicate headers).
function rawRequest(context, text) {
  return new Promise((resolve, reject) => {
    const socket = net.connect({ host: '127.0.0.1', port: context.port });
    const chunks = [];
    socket.on('data', (chunk) => chunks.push(chunk));
    socket.on('error', reject);
    socket.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      const [head, ...rest] = raw.split('\r\n\r\n');
      const body = rest.join('\r\n\r\n');
      let json = null;
      try { json = JSON.parse(body); } catch { /* not JSON */ }
      resolve({ status: Number(/^HTTP\/1\.1 (\d+)/.exec(head)[1]), head, text: body, json });
    });
    socket.end(text.replaceAll('{PORT}', String(context.port)));
  });
}

const VALID = Object.freeze({
  'run.create': { name: 'alpha', units: 5 },
  'scratch.create': { name: 'scratch-a' },
  'pool.resize': { size: 3 },
  'experiment.approve': { experimentId: 'exp-001' }
});

function send(context, command, token, body = VALID[command], extra = {}) {
  return request(context, {
    method: 'POST', route: `/v1/commands/${command}`,
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra },
    body: typeof body === 'string' ? body : JSON.stringify(body)
  });
}

function preview(context, command, token, extra = {}) {
  return request(context, {
    route: `/v1/authorization/preview?command=${encodeURIComponent(command)}`,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extra }
  });
}

module.exports = Object.freeze({ load, fakeClock, startApp, withApp, request, rawRequest, VALID, send, preview });
