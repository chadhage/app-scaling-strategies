'use strict';

// RED stub, not production code: the NAIVE implementation the card text warns about. Every route scrubs its own answer with a blocklist of field NAMES
// (password, authorization, secret, token), raw records (request headers, error messages, contacts) are stored and served otherwise as they are, and a
// refusal is a plain answer on a connection that stays open. It exports the same startLocal() surface as the real server.cjs.
const http = require('node:http');
const { createHmac, randomBytes } = require('node:crypto');

const ROLE = { visitor: 'visitor', 'conductor-a': 'conductor', 'conductor-b': 'conductor', operator: 'operator' };
const BLOCK = ['password', 'authorization', 'secret', 'token'];
const scrub = (value) => JSON.parse(JSON.stringify(value, (key, inner) => (BLOCK.includes(key.toLowerCase()) ? undefined : inner)));

function startLocal({ config, logSink = () => {} } = {}) {
  const tokens = new Map(Object.entries(config.tokens).map(([name, token]) => [token, { subject: name, role: ROLE[name], expires: Infinity }]));
  const store = { trace: [], runs: [], logs: [], audit: [] };
  const log = (line) => { logSink(line); store.logs.push({ seq: store.logs.length + 1, level: 'info', message: line }); };
  let revision = 0;
  const service = {
    issueToken(name, { ttlMs = 600000 } = {}) {
      const token = `c009_${randomBytes(32).toString('base64url')}`;
      tokens.set(token, { subject: name, role: ROLE[name], expires: Date.now() + ttlMs });
      return token;
    },
    plant(place, value) {
      const record = { seq: store.trace.length + 1, id: `run-${9000 + store.runs.length}`, units: 1, owner: 'operator', revision, status: 'ok', artifacts: 1, kind: 'note', note: value,
        steps: [{ event: 'note', detail: value }], requester: { name: value, email: value }, nested: [[value]], files: [{ file: value }], [value]: value, error: { message: value, stack: value } };
      (place === 'run' ? store.runs : place === 'audit' ? store.audit : place === 'log' ? store.logs : store.trace).push(record);
    }
  };
  const send = (res, status, value, headers = {}) => {
    const body = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
    res.writeHead(status, { 'Content-Type': typeof value === 'string' ? 'text/html' : 'application/json', 'Content-Length': body.length, ...headers });
    res.end(body);
  };
  const listing = (kind) => {
    const items = scrub(store[kind === 'runs' ? 'runs' : kind]);
    return { outcome: 'ok', kind, revision, total: items.length, shown: items.length, limit: 200, items };
  };
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const url = new URL(req.url, 'http://127.0.0.1');
      const raw = Buffer.concat(chunks).toString('utf8');
      const auth = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      const who = auth ? tokens.get(auth[1]) : null;
      store.trace.push({ seq: store.trace.length + 1, method: req.method, url: req.url, headers: req.headers, body: raw, status: 200 });
      log(`${req.method} ${req.url} ${req.headers['user-agent'] || ''}`);
      if (req.method === 'POST' && url.pathname.startsWith('/v1/commands/')) {
        if (!who) return send(res, 401, { outcome: 'AUTHENTICATION_REQUIRED', error: { code: 'AUTHENTICATION_REQUIRED', message: 'A bearer token is required.' } });
        const command = url.pathname.slice('/v1/commands/'.length);
        const allowed = { 'run.create': 'conductor', 'config.check': 'operator' }[command];
        if (!allowed) return send(res, 404, { outcome: 'COMMAND_UNKNOWN', error: { code: 'COMMAND_UNKNOWN', message: `No such command: ${command}` } });
        if (who.role !== allowed) return send(res, 403, { outcome: 'ROLE_FORBIDDEN', error: { code: 'ROLE_FORBIDDEN', message: 'no' } });
        let input;
        try { input = JSON.parse(raw); } catch (error) { return send(res, 400, { outcome: 'BODY_INVALID_JSON', error: { code: 'BODY_INVALID_JSON', message: error.message } }); }
        if (command === 'config.check' && input.mode === 'fail') {
          const error = new Error(`login failed for ${config.connectionString} with ${config.serviceCredential.secret}`);
          store.trace.push({ kind: 'error', error: { message: error.message, stack: error.stack } });
          return send(res, 500, { outcome: 'COMMAND_FAILED', error: { code: 'COMMAND_FAILED', message: error.message } });
        }
        revision += 1;
        if (command === 'run.create') store.runs.push({ id: `run-${String(store.runs.length + 1).padStart(4, '0')}`, name: input.name, units: input.units, owner: who.subject, revision,
          requester: config.contacts[who.subject], upstream: { headers: { authorization: `Bearer ${config.serviceCredential.secret}`, 'x-service': config.serviceCredential.id } }, status: 'ok', artifacts: 0, steps: [] });
        return send(res, 200, { outcome: 'ok', command, revision, actor: { subject: who.subject, role: who.role }, result: { id: `run-${store.runs.length}` }, auditSeq: revision, ignoredClaims: [] });
      }
      if (url.pathname === '/v1/manage/config') {
        if (!who) return send(res, 401, { outcome: 'AUTHENTICATION_REQUIRED', error: { code: 'AUTHENTICATION_REQUIRED', message: 'A bearer token is required.' } });
        if (who.role !== 'operator') return send(res, 403, { outcome: 'ROLE_FORBIDDEN', error: { code: 'ROLE_FORBIDDEN', message: 'no' } });
        return send(res, 200, { outcome: 'ok', configured: { tokens: 4, signingKey: true, connectionString: true, serviceCredential: true, contacts: 4 } }, { 'Cache-Control': 'no-store' });
      }
      const kind = /^\/v1\/evidence\/(trace|runs|audit|logs)$/.exec(url.pathname);
      if (kind) return send(res, 200, listing(kind[1]));
      if (url.pathname === '/v1/evidence/bundle') {
        const unsigned = { schema: 'c014-evidence/1', revision, counts: { trace: store.trace.length, runs: store.runs.length, audit: store.audit.length, logs: store.logs.length },
          trace: scrub(store.trace), runs: scrub(store.runs), audit: scrub(store.audit), logs: scrub(store.logs) };
        const value = createHmac('sha256', config.signingKey).update(JSON.stringify(unsigned)).digest('hex');
        return send(res, 200, JSON.stringify({ ...unsigned, signature: { alg: 'HMAC-SHA256', value } }), { 'Content-Disposition': 'attachment; filename="c014-evidence-bundle.json"', 'Content-Type': 'application/json' });
      }
      if (['/', '/page.js', '/style.css'].includes(url.pathname)) return send(res, 200, '<!doctype html><title>naive</title>');
      if (url.pathname === '/scope.json') return send(res, 200, { outcome: 'ok', scope: { cardId: 'C014' } });
      return send(res, 404, { outcome: 'NOT_FOUND', error: { code: 'NOT_FOUND', message: `No route ${req.url}` } });
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => {
    const { port } = server.address();
    resolve({ server, port, origin: `http://127.0.0.1:${port}`, service, close: () => new Promise((done) => { server.close(() => done()); server.closeAllConnections(); }) });
  }));
}

module.exports = Object.freeze({ startLocal });
