'use strict';

// Test tooling, not production code. One place for: which implementation is under test (C022_SUBJECT_DIR points the SAME tests at the
// retained naive stub for the RED replay), the fictional world the fixture ships with, a manual clock, a seeded byte source, and a
// started app on 127.0.0.1 port 0 with small request helpers.
const crypto = require('node:crypto');
const http = require('node:http');
const path = require('node:path');
const raw = require('./raw.cjs');

const ROOT = path.resolve(__dirname, '..');
const SUBJECT = process.env.C022_SUBJECT_DIR ? path.resolve(process.env.C022_SUBJECT_DIR) : ROOT;
const load = (name) => require(path.join(SUBJECT, name));

const TENANTS = ['tenant-alder', 'tenant-birch', 'tenant-cedar'];
const MEMBERS = {
  'tenant-alder': { ada: 'admin', alf: 'member', ana: 'viewer', dana: 'member' },
  'tenant-birch': { bea: 'admin', ben: 'member', bo: 'viewer', dana: 'viewer' },
  'tenant-cedar': { cai: 'admin', cy: 'member' }
};
const HOME = { ada: 'tenant-alder', alf: 'tenant-alder', ana: 'tenant-alder', dana: 'tenant-alder', bea: 'tenant-birch', ben: 'tenant-birch', bo: 'tenant-birch', cai: 'tenant-cedar', cy: 'tenant-cedar', nomad: 'tenant-alder' };
const SEED = {
  'tenant-alder': [['alder-orchard', 3, 'ada'], ['alder-river', 5, 'alf'], ['alder-meadow', 2, 'ada']],
  'tenant-birch': [['birch-harbor', 7, 'bea'], ['birch-quarry', 4, 'ben']],
  'tenant-cedar': []
};
const PROFILES = { 'tenant-alder': ['synthetic-001'], 'tenant-birch': ['synthetic-002'], 'tenant-cedar': [] };
const LIMITS = { sessionsPerTenant: 8, projectsPerTenant: 12, pageDefault: 5, pageMax: 10, bodyBytes: 4096 };

function manualClock(start = 1000000) {
  let current = start;
  return { now: () => current, advance(ms) { current += ms; return current; } };
}

// Deterministic, collision-free bytes so that a run is reproducible; the default (crypto) source is tested separately.
function seededBytes(seed = 'c022') {
  let counter = 0;
  return (size) => {
    const out = [];
    while (out.length < size) out.push(...crypto.createHash('sha256').update(`${seed}:${counter++}`).digest());
    return Buffer.from(out.slice(0, size));
  };
}

function call(port, method, target, { token, headers = {}, body, rawBody } = {}) {
  return new Promise((resolve, reject) => {
    const sent = { ...headers };
    if (token) sent.Authorization = `Bearer ${token}`;
    let payload = null;
    if (body !== undefined || rawBody !== undefined) {
      payload = Buffer.from(rawBody !== undefined ? rawBody : JSON.stringify(body));
      sent['Content-Type'] = sent['Content-Type'] || 'application/json';
      sent['Content-Length'] = payload.length;
    }
    const req = http.request({ host: '127.0.0.1', port, method, path: target, headers: sent, agent: false, timeout: 20000 }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: res.statusCode, headers: res.headers, text, json });
      });
    });
    req.on('error', reject);
    req.on('timeout', () => req.destroy(new Error('request timed out')));
    if (payload) req.write(payload);
    req.end();
  });
}

async function startApp(options = {}) {
  const clock = options.clock || manualClock();
  const { createApp } = load('server.cjs');
  // Shared test apps raise the per-tenant session bound so that a long test never meets it by accident; the tests of the quota itself
  // pass the real bound explicitly.
  const limits = { sessionsPerTenant: 64, recordsPerTenant: 128, ...(options.app && options.app.limits) };
  const app = createApp({ now: clock.now, randomBytes: seededBytes(options.seed || 'c022'), ...options.app, limits });
  await new Promise((resolve, reject) => { app.server.once('error', reject); app.server.listen(0, '127.0.0.1', resolve); });
  const { port } = app.server.address();
  const ctx = {
    app, clock, port, origin: `http://127.0.0.1:${port}`,
    call: (method, target, opts) => call(port, method, target, opts),
    // One raw exchange: the first answer with its exact bytes (head text, body), used where byte identity matters.
    bytes: async (method, target, opts = {}) => {
      const headers = [...(opts.token ? [`Authorization: Bearer ${opts.token}`] : []), ...(opts.headers || [])];
      const sent = opts.body !== undefined ? { body: JSON.stringify(opts.body), headers: [...headers, 'Content-Type: application/json'] } : { headers };
      const result = await raw.exchange(port, raw.request(port, method, target, sent), { waitMs: 8000, settleMs: 400 });
      return { ...result.answers[0], closedByServer: result.closedByServer, count: result.answers.length };
    },
    login: (user, tenant = HOME[user], extra = {}) => ctx.call('POST', '/v1/session/login', { token: extra.anonymous, body: { ticket: app.issueTicket({ user, tenant }) } }),
    // A fresh session; fails the test loudly when the login itself is refused.
    session: async (user, tenant = HOME[user]) => {
      const res = await ctx.login(user, tenant);
      if (res.status !== 201) throw new Error(`login of ${user} in ${tenant} answered ${res.status} ${res.text}`);
      return { token: res.json.token, sid: res.json.session.sid, user, tenant, res };
    },
    world: () => JSON.stringify(app.snapshot().world),
    close: () => app.close()
  };
  return ctx;
}

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');

module.exports = Object.freeze({ HOME, LIMITS, MEMBERS, PROFILES, ROOT, SEED, SUBJECT, TENANTS, call, load, manualClock, raw, seededBytes, sha256, startApp });
