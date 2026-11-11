'use strict';

// Test tooling, not production code. C011_SUBJECT_DIR lets the archived RED replay run these exact tests against the retained naive stub
// (evidence\red\stub) instead of the real implementation. The C009 identities and tokens come from the accepted C009 fixture.
const http = require('node:http');
const path = require('node:path');

const subjectDir = process.env.C011_SUBJECT_DIR ? path.resolve(process.env.C011_SUBJECT_DIR) : path.resolve(__dirname, '..');
const load = (name) => require(path.join(subjectDir, name));
const IDENTITIES = Object.freeze(['visitor', 'conductor-a', 'conductor-b', 'operator']);
const CONDUCTORS = Object.freeze(['conductor-a', 'conductor-b']);

// A small world where every bound is easy to reach: 10 capacity units and 60 cost units in the pool; each lease may hold 6 units and 40 cost units
// (standard costs 4 per unit, burst 8); at most 3 active reservations and 6 retained records per lease.
const SMALL = Object.freeze({
  pool: { units: 10, spend: 60 }, caps: { 'conductor-a': { units: 6, spend: 40 }, 'conductor-b': { units: 6, spend: 40 } }, maxActive: 3, entries: 6
});
const PRICES = Object.freeze({ standard: 4, burst: 8 });

function fakeClock(start = 1000000) {
  const clock = { value: start, now: () => clock.value, advance(ms) { clock.value += ms; } };
  return clock;
}

// Ids that an attacker can guess: one global counter (the id shape of the contract accepts 8 to 32 hex digits).
function sequentialIds() {
  let counter = 0;
  return () => { counter += 1; return `rsv-${counter.toString(16).padStart(8, '0')}`; };
}

async function startApp(options = {}) {
  const { createApp } = load('server.cjs');
  const clock = options.clock || fakeClock();
  const app = createApp({ now: () => clock.now(), config: SMALL, ...options.app });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  const tokens = Object.fromEntries(IDENTITIES.map((name) => [name, app.issueToken(name, { ttlMs: 900000 })]));
  return { app, clock, port, tokens, origin: `http://127.0.0.1:${port}`, async close() { await app.close(); } };
}

async function withApp(options, run) {
  const context = await startApp(options);
  try { return await run(context); } finally { await context.close(); }
}

// One request on its own connection (a refusal closes it anyway); a hard timeout turns a hang into a failed test.
function call(context, token, method, route, body, headers = {}) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    const outgoing = http.request({
      host: '127.0.0.1', port: context.port, method, path: route, agent: false,
      headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        const text = bytes.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        // An answer without an `error` or a `reservation` member exposes an empty, non-enumerable one: a missing typed refusal or reservation then
        // fails the assertion about it (and this is what makes a RED against a naive subject an assertion failure, never a TypeError).
        if (json !== null && typeof json === 'object' && !Array.isArray(json)) {
          for (const name of ['error', 'reservation']) if (!(name in json)) Object.defineProperty(json, name, { value: {}, enumerable: false });
        }
        resolve({ status: response.statusCode, headers: response.headers, rawHeaders: response.rawHeaders, bytes, text, json });
      });
    });
    outgoing.setTimeout(15000, () => outgoing.destroy(new Error('no answer within 15 s')));
    outgoing.on('error', reject);
    outgoing.end(payload);
  });
}

let keyCounter = 0;
const freshKey = () => { keyCounter += 1; return `key-${String(keyCounter).padStart(8, '0')}`; };
const reserve = (context, who, units, { tier = 'standard', key = freshKey() } = {}) => call(context, context.tokens[who], 'POST', '/v1/reservations', { key, tier, units });
const release = (context, who, id) => call(context, context.tokens[who], 'POST', `/v1/reservations/${id}/release`);
const get = (context, who, route) => call(context, context.tokens[who], 'GET', route);
const same = (value) => JSON.parse(JSON.stringify(value));

// The conservation invariant, read through HTTP only (so that it also runs against the naive stub): the pool, the lease books of the operator, each
// conductor's own list and allowance must agree, and no number may be negative, fractional or not finite. Returns the list of problems.
async function bookProblems(context) {
  const problems = [];
  const isCount = (value) => Number.isSafeInteger(value) && value >= 0;
  const operator = (await get(context, 'operator', '/v1/operator/pool')).json;
  const { pool } = operator;
  let units = 0;
  let spend = 0;
  for (const name of CONDUCTORS) {
    const held = operator.leases.find((lease) => lease.subject === name);
    const list = (await get(context, name, '/v1/reservations?limit=50&state=reserved')).json;
    const allowance = (await get(context, name, '/v1/allowance')).json.allowance;
    const sumUnits = list.items.reduce((sum, item) => sum + item.units, 0);
    const sumSpend = list.items.reduce((sum, item) => sum + item.spend, 0);
    for (const item of list.items) if (item.spend !== item.units * PRICES[item.tier] || !isCount(item.units) || !isCount(item.spend)) problems.push(`${name}: reservation ${item.id} has a wrong spend or number`);
    if (held.heldUnits !== sumUnits || held.heldSpend !== sumSpend) problems.push(`${name}: the operator books ${held.heldUnits}/${held.heldSpend} but the reservations sum to ${sumUnits}/${sumSpend}`);
    if (allowance.lease.heldUnits !== sumUnits || allowance.lease.heldSpend !== sumSpend) problems.push(`${name}: the allowance disagrees with the list`);
    if (sumUnits > held.capUnits || sumSpend > held.capSpend) problems.push(`${name}: over the cap of the lease`);
    if (allowance.lease.remainingUnits !== held.capUnits - sumUnits || allowance.lease.remainingSpend !== held.capSpend - sumSpend) problems.push(`${name}: the remaining allowance is wrong`);
    if (list.total !== list.items.length) problems.push(`${name}: the total of the list differs from its items`);
    units += sumUnits;
    spend += sumSpend;
  }
  if (pool.reservedUnits !== units || pool.reservedSpend !== spend) problems.push(`the pool books ${pool.reservedUnits}/${pool.reservedSpend} but the leases hold ${units}/${spend}`);
  if (pool.units !== pool.reservedUnits + pool.freeUnits || pool.spend !== pool.reservedSpend + pool.freeSpend) problems.push('pool total differs from reserved plus free');
  for (const value of [pool.units, pool.spend, pool.reservedUnits, pool.reservedSpend, pool.freeUnits, pool.freeSpend]) if (!isCount(value)) problems.push(`a pool figure is not a count: ${value}`);
  return problems;
}

// Polls a condition until it holds; the bound turns a stuck condition into a failed test, never a hang (no sleep decides anything).
async function until(check, label, turns = 5000) {
  for (let turn = 0; turn < turns; turn += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`never held: ${label}`);
}

// hooks.beforeCommit runs inside the queue, after the decisions that precede the commit and before the repeated decision: a test arms ONE action for a
// route and can change the world (move the clock, expire a token) or hold the request at a gate while others queue behind it.
function planHooks() {
  const armed = new Map();
  return {
    hooks: { beforeCommit: async (info) => { const action = armed.get(info.route); if (action) { armed.delete(info.route); await action(info); } } },
    arm: (route, action) => armed.set(route, action)
  };
}

function gate() {
  let open;
  const closed = new Promise((resolve) => { open = resolve; });
  return { closed, open };
}

module.exports = Object.freeze({
  CONDUCTORS, IDENTITIES, PRICES, SMALL, bookProblems, call, fakeClock, freshKey, gate, get, load, planHooks, release, reserve, same, sequentialIds, startApp, subjectDir, until, withApp
});
