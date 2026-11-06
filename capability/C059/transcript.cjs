'use strict';

// The server-produced transcript: the service drives ITS OWN POST journey over real loopback sockets against private instances
// (a valid step, a replay, a conflict, a refused capacity, typed refusals, a step in flight that is cancelled explicitly, a client
// that disappears, a restart, an explicit resume) and returns what it recorded. The isolated browser helper allows only GET, so
// this is how the POST actions are observed in a browser; verifyTranscript() re-checks every envelope with the page's own rules.
const http = require('node:http');
const path = require('node:path');
const contract = require(path.join(__dirname, '..', 'C042', 'contract.js'));
const { openEngine } = require(path.join(__dirname, '..', 'C042', 'engine.cjs'));
const { createMemoryIo } = require(path.join(__dirname, '..', 'C042', 'journal.cjs'));
const journey = require('./journey.js');
const { closeServer, createLocalServer } = require('./server.cjs');

const REQUIRED_CODES = ['CAPACITY_EXHAUSTED', 'IDEMPOTENCY_KEY_CONFLICT', 'STEP_IN_FLIGHT', 'STEP_CANCELLED', 'STEP_INTERRUPTED', 'UNSUPPORTED_ACTION', 'STEP_NOT_FOUND', 'REQUIRED_FIELD'];
const REQUIRED_OUTCOMES = ['succeeded', 'rejected', 'unsupported', 'unknown', 'cancelled', 'interrupted'];
const input = (key, over = {}) => ({ schemaVersion: 1, step: contract.STEP, idempotencyKey: key, leaseId: 'synthetic-lease-001', units: 4, ...over });

function call(port, method, target, body) {
  return new Promise((resolve, reject) => {
    const payload = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const request = http.request({ host: '127.0.0.1', port, method, path: target, agent: false, headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {} }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

async function instance(io, executor) {
  const engine = await openEngine({ io, executor });
  const server = createLocalServer({ engine, assets: new Map() });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

async function produceTranscript() {
  const events = [];
  const note = (scenario, text) => events.push({ n: events.length + 1, scenario, kind: 'note', note: text });
  const exchange = async (scenario, port, method, target, body) => {
    const answer = await call(port, method, target, body);
    events.push({ n: events.length + 1, scenario, kind: 'exchange', request: { method, path: target, body: body ?? null }, response: answer });
    return answer;
  };
  const held = new Map();
  const holdKeys = new Set(['tr-key-0010', 'tr-key-0012']);
  const executor = async ({ key }) => { if (holdKeys.has(key)) await new Promise((resolve) => held.set(key, resolve)); };
  const dropped = async (scenario, port, body) => {
    const request = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/steps', agent: false, headers: { 'Content-Type': 'application/json' } });
    request.on('error', () => {});
    request.end(JSON.stringify(body));
    for (let turn = 0; turn < 20000 && !held.has(body.idempotencyKey); turn += 1) await new Promise((resolve) => setImmediate(resolve));
    request.destroy();
    events.push({ n: events.length + 1, scenario, kind: 'abort', note: 'the client disappeared before any answer' });
  };

  const plain = await instance(createMemoryIo());
  try {
    const p = plain.port;
    await exchange('journey', p, 'POST', '/v1/steps', input('tr-key-0001'));
    await exchange('journey', p, 'POST', '/v1/steps', input('tr-key-0001'));
    await exchange('journey', p, 'GET', '/v1/steps/tr-key-0001');
    await exchange('journey', p, 'POST', '/v1/steps', input('tr-key-0001', { units: 5 }));
    await exchange('journey', p, 'POST', '/v1/steps', input('tr-key-0002', { leaseId: 'synthetic-lease-002', units: 10 }));
    await exchange('journey', p, 'POST', '/v1/steps', input('tr-key-0003', { leaseId: 'synthetic-lease-002', units: 1 }));
    await exchange('journey', p, 'POST', '/v1/steps', { schemaVersion: 1 });
    await exchange('journey', p, 'POST', '/v1/steps', { ...input('tr-key-0004'), step: 'release-capacity' });
    await exchange('journey', p, 'POST', '/v1/steps/tr-key-0001/undo');
    await exchange('journey', p, 'GET', '/v1/steps/tr-key-9999');
    await exchange('journey', p, 'GET', '/v1/leases');
  } finally {
    await closeServer(plain.server);
  }

  const io = createMemoryIo();
  let busy = await instance(io, executor);
  try {
    await dropped('recovery', busy.port, input('tr-key-0010'));
    await exchange('recovery', busy.port, 'GET', '/v1/steps/tr-key-0010');
    await exchange('recovery', busy.port, 'POST', '/v1/steps/tr-key-0010/cancel');
    await exchange('recovery', busy.port, 'POST', '/v1/steps', input('tr-key-0011'));
    await dropped('recovery', busy.port, input('tr-key-0012', { units: 2 }));
    await closeServer(busy.server);
    note('recovery', 'the service restarted over the same journal; nothing is resumed automatically');
    busy = await instance(io);
    await exchange('recovery', busy.port, 'GET', '/v1/steps/tr-key-0012');
    await exchange('recovery', busy.port, 'POST', '/v1/steps/tr-key-0012/resume');
    await exchange('recovery', busy.port, 'GET', '/v1/leases');
  } finally {
    await closeServer(busy.server);
  }
  return { kind: 'C059-server-transcript', schemaVersion: 1, scope: contract.SCOPE, events };
}

// Re-checks a transcript with the page's own rules: shapes, HTTP honesty, one effect per key, ledger totals, required evidence.
function verifyTranscript(transcript) {
  const fail = (code, message) => ({ ok: false, code, message });
  const events = transcript && Array.isArray(transcript.events) ? transcript.events : [];
  if (!transcript || transcript.kind !== 'C059-server-transcript' || transcript.schemaVersion !== 1 || transcript.scope !== contract.SCOPE || events.length === 0 || events.length > 200) {
    return fail('TRANSCRIPT_SHAPE', 'The transcript has the wrong kind, version, scope or size.');
  }
  const outcomes = new Set();
  const codes = new Set();
  const commits = new Map();
  const ledger = new Map();
  let replays = 0;
  let aborts = 0;
  for (const [index, event] of events.entries()) {
    if (event.n !== index + 1) return fail('SEQUENCE_GAP', `Event ${index + 1} is out of order or missing.`);
    if (!['exchange', 'abort', 'note'].includes(event.kind)) return fail('EVENT_SHAPE', `Event ${event.n} has an unknown kind.`);
    if (event.kind === 'abort') aborts += 1;
    if (event.kind !== 'exchange') continue;
    const answer = event.response;
    if (!answer || !Number.isInteger(answer.status) || !answer.body) return fail('EVENT_SHAPE', `Event ${event.n} has no response.`);
    if (!event.request || typeof event.request.path !== 'string') return fail('EVENT_SHAPE', `Event ${event.n} has no recorded request.`);
    if (answer.body.kind === 'C042-lease-snapshot') {
      for (const [id, lease] of Object.entries(answer.body.leases)) {
        if (lease.committed !== (ledger.get(`${event.scenario}/${id}`) ?? 0) || lease.committed + lease.held > lease.capacity) return fail('LEDGER_MISMATCH', `Event ${event.n}: the ledger disagrees with the recorded effects.`);
      }
      continue;
    }
    const view = journey.present(answer, journey.expectedFor(event.request));
    if (!view.ok) return fail(view.code, `Event ${event.n}: the answer is not a valid result.`);
    const body = answer.body;
    outcomes.add(body.outcome);
    if (body.error) codes.add(body.error.code);
    if (body.outcome === 'succeeded' && body.replayed) replays += 1;
    const commit = body.trail.find((item) => item.type === 'commit');
    const id = `${event.scenario}/${body.idempotencyKey}`;
    if (commit && commits.has(id) && commits.get(id) !== commit.seq) return fail('SECOND_EFFECT', `Event ${event.n}: a second commit appeared for one key.`);
    if (commit && !commits.has(id)) {
      commits.set(id, commit.seq);
      ledger.set(`${event.scenario}/${body.effect.leaseId}`, (ledger.get(`${event.scenario}/${body.effect.leaseId}`) ?? 0) + body.effect.units);
    }
  }
  const missing = [...REQUIRED_OUTCOMES.filter((name) => !outcomes.has(name)), ...REQUIRED_CODES.filter((code) => !codes.has(code))];
  if (missing.length || replays < 1 || aborts < 2) return fail('MISSING_EVIDENCE', `The transcript lacks required evidence: ${missing.join(', ') || 'a replay or the aborts'}.`);
  return { ok: true, summary: { exchanges: events.filter((event) => event.kind === 'exchange').length, outcomes: [...outcomes].sort(), codes: [...codes].sort(), replays, aborts, effects: commits.size } };
}

module.exports = Object.freeze({ REQUIRED_CODES, REQUIRED_OUTCOMES, produceTranscript, verifyTranscript });
