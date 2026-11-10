'use strict';

// The NAIVE subject of the archived RED (retained, never edited after the RED was archived): the reservation service as a first implementation would
// write it, with the mistakes the card warns about. It speaks the same HTTP API and the same typed codes as the real fixture, so every RED failure is an
// assertion about BEHAVIOR. Its mistakes: the pool check and the commit are separated by an await (concurrent over-admission), a full pool is made room
// for by evicting the oldest reservation of ANOTHER lease, the lease and the spend are taken from the body when it names them, the spend ceiling and
// the spend caps are not enforced, any identity reads and releases any reservation, a release can be repeated and refunds again, a retry with the same
// key reserves again, nothing expires, numbers are coerced, and an error answer keeps the connection open.
const http = require('node:http');
const { createTokenRegistry, parseBearer } = require('../../../../C009/authz.cjs');

const PRICES = { standard: 4, burst: 8 };
const DEFAULT = { pool: { units: 100, spend: 600 }, caps: { 'conductor-a': { units: 60 }, 'conductor-b': { units: 60 } }, maxActive: 20 };

function createApp(options = {}) {
  const config = { ...DEFAULT, ...(options.config || {}) };
  const registry = createTokenRegistry({ now: options.now });
  const records = [];
  let reservedUnits = 0;
  let counter = 0;
  const send = (response, status, value) => {
    const body = Buffer.from(JSON.stringify(value));
    response.writeHead(status, { 'Content-Type': 'application/json', 'Content-Length': body.length });
    response.end(body);
  };
  const fail = (response, status, code) => send(response, status, { outcome: code, error: { code } });
  const mine = (identity) => records.filter((record) => record.lease === identity.subject);
  const view = (record) => ({ id: record.id, tier: record.tier, units: record.units, spend: record.spend, state: record.state, deadlineMs: record.deadlineMs });
  const heldBy = (subject) => records.filter((record) => record.lease === subject && record.state === 'reserved');
  const sum = (list, field) => list.reduce((total, record) => total + record[field], 0);

  async function handle(request, response) {
    let identity = null;
    try { const token = parseBearer(request.rawHeaders); identity = token === null ? null : registry.verify(token); } catch { return fail(response, 401, 'TOKEN_UNKNOWN'); }
    if (identity === null) return fail(response, 401, 'AUTHENTICATION_REQUIRED');
    const url = new URL(request.url, 'http://x');
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    let body = {};
    try { body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : {}; } catch { return fail(response, 400, 'BODY_INVALID_JSON'); }
    const parts = url.pathname.split('/').filter(Boolean);
    if (request.method === 'GET' && url.pathname === '/v1/me') return send(response, 200, { outcome: 'ok', subject: identity.subject, role: identity.role });
    if (request.method === 'GET' && url.pathname === '/v1/operator/pool') {
      const leases = Object.keys(config.caps).map((subject) => ({ subject, capUnits: config.caps[subject].units, capSpend: 40, heldUnits: sum(heldBy(subject), 'units'), heldSpend: sum(heldBy(subject), 'spend') }));
      const reservedSpend = leases.reduce((total, lease) => total + lease.heldSpend, 0);
      return send(response, 200, { outcome: 'ok', pool: { units: config.pool.units, spend: config.pool.spend, reservedUnits, reservedSpend, freeUnits: config.pool.units - reservedUnits, freeSpend: config.pool.spend - reservedSpend }, leases });
    }
    if (request.method === 'GET' && url.pathname === '/v1/allowance') {
      const cap = config.caps[identity.subject] || { units: 0 };
      const heldUnits = sum(heldBy(identity.subject), 'units');
      const heldSpend = sum(heldBy(identity.subject), 'spend');
      return send(response, 200, { outcome: 'ok', allowance: { pool: { units: config.pool.units, free: config.pool.units - reservedUnits }, lease: { capUnits: cap.units, capSpend: 40, heldUnits, heldSpend, remainingUnits: cap.units - heldUnits, remainingSpend: 40 - heldSpend } } });
    }
    if (request.method === 'GET' && url.pathname === '/v1/reservations') {
      const state = url.searchParams.get('state');
      const items = mine(identity).filter((record) => !state || record.state === state).map(view);
      return send(response, 200, { outcome: 'ok', total: items.length, items });
    }
    if (request.method === 'GET' && parts[1] === 'reservations' && parts.length === 3) {
      const record = records.find((entry) => entry.id === parts[2]);
      return record ? send(response, 200, { outcome: 'ok', reservation: view(record) }) : fail(response, 404, 'RESERVATION_NOT_FOUND');
    }
    if (request.method === 'POST' && parts[1] === 'reservations' && parts[3] === 'release') {
      const record = records.find((entry) => entry.id === parts[2]);
      if (!record) return fail(response, 404, 'RESERVATION_NOT_FOUND');
      reservedUnits -= record.units;
      record.state = 'released';
      return send(response, 200, { outcome: 'ok', reservation: view(record), replayed: false });
    }
    if (request.method === 'POST' && url.pathname === '/v1/reservations') {
      const made = await admit(identity, body);
      return made.ok ? send(response, 200, { outcome: 'ok', reservation: view(made.record), replayed: false }) : fail(response, 409, made.code);
    }
    if (request.method === 'GET' && (url.pathname === '/v1/audit' || url.pathname === '/v1/operator/audit')) return send(response, 200, { outcome: 'ok', total: 0, offset: 0, limit: 20, items: [] });
    if (request.method === 'POST' && url.pathname === '/v1/batch') {
      const results = [];
      for (const [index, op] of (body.ops || []).entries()) {
        if (op.op === 'release') {
          const record = records.find((entry) => entry.id === op.id);
          if (!record) return send(response, 404, { outcome: 'RESERVATION_NOT_FOUND', error: { code: 'RESERVATION_NOT_FOUND' }, opIndex: index });
          reservedUnits -= record.units;
          record.state = 'released';
          results.push({ op: 'release', reservation: view(record), replayed: false });
        } else {
          const made = await admit(identity, op);
          if (!made.ok) return send(response, 409, { outcome: made.code, error: { code: made.code }, opIndex: index });
          results.push({ op: 'reserve', reservation: view(made.record), replayed: false });
        }
      }
      return send(response, 200, { outcome: 'ok', results });
    }
    return fail(response, 404, 'NOT_FOUND');
  }

  async function admit(identity, body) {
    const lease = body.lease || identity.subject;
    const units = Number(body.units);
    const spend = body.spend !== undefined ? Number(body.spend) : units * (PRICES[body.tier] || 4);
    const cap = (config.caps[lease] || { units: 0 }).units;
    if (sum(heldBy(lease), 'units') + units > cap) return { ok: false, code: 'LEASE_CAP_EXCEEDED' };
    if (reservedUnits + units > config.pool.units) {
      const victim = records.find((record) => record.state === 'reserved' && record.lease !== lease);
      if (!victim) return { ok: false, code: 'CAPACITY_EXCEEDED' };
      victim.state = 'released';
      reservedUnits -= victim.units;
    }
    await new Promise((resolve) => setImmediate(resolve));
    counter += 1;
    const record = { id: `rsv-${counter.toString(16).padStart(8, '0')}`, lease, tier: body.tier, units, spend, state: 'reserved', deadlineMs: (options.now ? options.now() : Date.now()) + 300000 };
    records.push(record);
    reservedUnits += units;
    return { ok: true, record };
  }

  const server = http.createServer((request, response) => { handle(request, response).catch(() => fail(response, 500, 'INTERNAL_ERROR')); });
  return { server, close: () => new Promise((resolve) => { server.close(() => resolve()); server.closeAllConnections(); }), issueToken: (name, tokenOptions) => registry.issue(name, tokenOptions) };
}

module.exports = Object.freeze({ createApp });
