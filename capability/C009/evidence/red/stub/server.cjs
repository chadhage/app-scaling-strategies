'use strict';
// Naive RED subject: a loopback server that trusts the client's claimed role (default operator) and accepts every command.
const http = require('node:http');

function createApp() {
  let revision = 0;
  const runs = [];
  const view = () => ({ revision, state: { pool: { size: 2 }, runs: runs.map((run) => ({ ...run })), scratches: [], approvals: [] } });
  const server = http.createServer((request, response) => {
    const claimed = request.headers['x-role'] || 'operator';
    const url = new URL(request.url, 'http://127.0.0.1');
    const chunks = [];
    request.on('data', (chunk) => chunks.push(chunk));
    request.on('end', () => {
      let body = {};
      try { body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); } catch { body = {}; }
      if (body === null || typeof body !== 'object') body = {};
      const send = (status, value) => {
        const text = JSON.stringify(value);
        response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(text) });
        response.end(text);
      };
      if (url.pathname.startsWith('/v1/commands/')) {
        revision += 1;
        runs.push({ owner: body.owner || claimed, ...body });
        return send(200, { outcome: 'ok', revision, actor: { subject: body.owner || claimed, role: claimed } });
      }
      if (url.pathname === '/v1/state') return send(200, { outcome: 'ok', ...view() });
      if (url.pathname === '/v1/authorization/preview') return send(200, { outcome: 'ok', preview: { allowed: true, code: 'ok', status: 200, role: claimed } });
      return send(404, { outcome: 'NOT_FOUND', error: { code: 'NOT_FOUND' } });
    });
  });
  return { server, issueToken: (name) => name, auditLog: () => [], snapshot: view, queued: () => 0 };
}

module.exports = { createApp, defaultHandlers: {} };
