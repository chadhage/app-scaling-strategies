'use strict';

// Test tooling, not production code. C010_SUBJECT_DIR lets the archived RED replay run these exact tests against the retained naive
// stub (evidence\red\stub) instead of the real implementation. The C009 identities and tokens come from the accepted C009 fixture.
const http = require('node:http');
const path = require('node:path');

const subjectDir = process.env.C010_SUBJECT_DIR ? path.resolve(process.env.C010_SUBJECT_DIR) : path.resolve(__dirname, '..');
const load = (name) => require(path.join(subjectDir, name));
const IDENTITIES = Object.freeze(['visitor', 'conductor-a', 'conductor-b', 'operator']);

function fakeClock(start = 1000000) {
  const clock = { value: start, now: () => clock.value, advance(ms) { clock.value += ms; } };
  return clock;
}

// Ids that an attacker can guess: one global counter, eight hex digits (the id shape of the contract accepts 8 to 32).
function sequentialIds() {
  let counter = 0;
  return (kind) => { counter += 1; return `${kind}-${counter.toString(16).padStart(8, '0')}`; };
}

async function startApp(options = {}) {
  const { createApp } = load('server.cjs');
  const clock = options.clock || fakeClock();
  const app = createApp({ now: () => clock.now(), ...options.app });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  const port = app.server.address().port;
  return {
    app, clock, port, origin: `http://127.0.0.1:${port}`,
    async close() { await app.close(); }
  };
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
      host: '127.0.0.1', port: context.port, method, path: route, agent: context.agent ?? false,
      headers: { ...(payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }
    }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const bytes = Buffer.concat(chunks);
        const text = bytes.toString('utf8');
        let json = null;
        try { json = JSON.parse(text); } catch { /* not JSON */ }
        resolve({ status: response.statusCode, headers: response.headers, rawHeaders: response.rawHeaders, bytes, text, json });
      });
    });
    outgoing.setTimeout(15000, () => outgoing.destroy(new Error('no answer within 15 s')));
    outgoing.on('error', reject);
    outgoing.end(payload);
  });
}

const RESOURCE_BODIES = Object.freeze({
  runs: (suffix) => ({ name: `run-${suffix}`, units: 5 }),
  scratches: (suffix) => ({ name: `scratch-${suffix}` })
});

// The standard world: both conductors hold one lease with a run, a scratch resource and an export of that run (the Background of C010.feature).
async function seed(context) {
  const tokens = Object.fromEntries(IDENTITIES.map((name) => [name, context.app.issueToken(name)]));
  const ids = {};
  for (const [name, key] of [['conductor-a', 'a'], ['conductor-b', 'b']]) {
    const lease = (await call(context, tokens[name], 'POST', '/v1/leases', { name: `lease-${key}`, ttlMs: 600000 })).json.lease;
    const base = `/v1/leases/${lease.id}`;
    const run = (await call(context, tokens[name], 'POST', `${base}/runs`, RESOURCE_BODIES.runs(key))).json.resource;
    const scratch = (await call(context, tokens[name], 'POST', `${base}/scratches`, RESOURCE_BODIES.scratches(key))).json.resource;
    const exported = (await call(context, tokens[name], 'POST', `${base}/exports`, { name: `export-${key}`, runId: run.id })).json.resource;
    ids[key] = { lease: lease.id, run: run.id, scratch: scratch.id, export: exported.id };
  }
  return { tokens, ids };
}

const KINDS = Object.freeze({ run: 'runs', scratch: 'scratches', export: 'exports' });
const target = (ids, kind) => (kind === 'lease' ? `/v1/leases/${ids.lease}` : `/v1/leases/${ids.lease}/${KINDS[kind]}/${ids[kind]}`);
const same = (value) => JSON.parse(JSON.stringify(value));

// Polls a condition until it holds; the bound turns a stuck condition into a failed test, never a hang (no sleep decides anything).
async function until(check, label, turns = 5000) {
  for (let turn = 0; turn < turns; turn += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 2));
  }
  throw new Error(`never held: ${label}`);
}

// hooks.beforeCommit runs inside the queue, after the decision and before the repeated decision: a test arms ONE action for a route and
// can change the world (end, expire or move a lease, expire a token) or hold the request at a gate while others queue behind it.
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

module.exports = Object.freeze({ IDENTITIES, KINDS, call, fakeClock, gate, load, planHooks, same, seed, sequentialIds, startApp, subjectDir, target, until, withApp });
