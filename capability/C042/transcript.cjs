'use strict';

// Produces the server-side transcript the page displays and verifies: the service is driven over real loopback
// sockets against private instances (in-memory journals, a gated executor), because the isolated browser helper
// blocks writes. Nothing here touches the disk, the network beyond 127.0.0.1, or the clock.
const http = require('node:http');
const contract = require('./contract.js');
const { openEngine } = require('./engine.cjs');
const { createMemoryIo } = require('./journal.cjs');
const { closeServer, createLocalServer } = require('./server.cjs');

const BASE = Object.freeze({ schemaVersion: 1, step: contract.STEP, leaseId: 'synthetic-lease-001', units: 5 });
const body = (key, extra = {}) => JSON.stringify({ ...BASE, idempotencyKey: key, ...extra });
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

function gate() {
  const entered = new Map();
  const released = new Map();
  const slot = (map, key) => { if (!map.has(key)) map.set(key, deferred()); return map.get(key); };
  return {
    executor: async ({ key }) => { slot(entered, key).resolve(); await slot(released, key).promise; },
    entered: (key) => slot(entered, key).promise,
    release: (key) => slot(released, key).resolve(),
  };
}

async function listen(io, executor) {
  const engine = await openEngine({ io, executor });
  const server = createLocalServer({ engine });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, port: server.address().port };
}

function exchange(port, method, target, text) {
  return new Promise((resolve, reject) => {
    const payload = text === null ? null : Buffer.from(text);
    const headers = payload ? { 'Content-Type': 'application/json', 'Content-Length': payload.length } : {};
    const request = http.request({ host: '127.0.0.1', port, method, path: target, agent: false, headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve({ status: response.statusCode, body: JSON.parse(Buffer.concat(chunks).toString('utf8')) }));
    });
    request.on('error', reject);
    request.end(payload);
  });
}

function recorder(events, scenario) {
  const add = (event) => events.push({ n: events.length + 1, scenario, ...event });
  return {
    add,
    async call(port, method, target, text, note) {
      const answer = await exchange(port, method, target, text ?? null);
      add({ kind: 'exchange', request: { method, path: target, body: text ?? null }, response: answer, note });
      return answer;
    },
  };
}

function abandon(port, text) {
  const request = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/steps', agent: false, headers: { 'Content-Type': 'application/json' } });
  const ended = new Promise((resolve) => { request.on('response', resolve); request.on('error', resolve); });
  request.end(text);
  return { destroy: () => request.destroy(), ended };
}

const settle = async () => { for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve)); };

async function conduct(events) {
  const { add, call } = recorder(events, 'conduct');
  const service = await listen(createMemoryIo());
  try {
    const { port } = service;
    await call(port, 'POST', '/v1/steps', body('lease-key-0001'), 'A valid step is conducted once.');
    await call(port, 'POST', '/v1/steps', body('lease-key-0001'), 'The identical retry returns the recorded result.');
    await call(port, 'POST', '/v1/steps', body('lease-key-0001', { units: 6 }), 'The same key with other inputs is a typed conflict.');
    await call(port, 'POST', '/v1/steps', body('lease-key-0002').replace('"units":5', '"units":5,"units":6'), 'A duplicated field is refused.');
    await call(port, 'POST', '/v1/steps', body('lease-key-0002').replace('"units":5', '"units":5,"__proto__":{"units":1}'), '__proto__ is refused.');
    await call(port, 'POST', '/v1/steps', body('lease-key-0002', { units: 11 }), 'An out-of-range value is refused.');
    await call(port, 'POST', '/v1/steps', body('lease-key-0002', { step: 'release-capacity' }), 'An unsupported step is a typed refusal.');
    await call(port, 'POST', '/v1/steps/lease-key-0001/undo', null, 'There is no undo; the refusal changes nothing.');
    await call(port, 'POST', '/v1/steps/lease-key-0001/cancel', null, 'A succeeded step cannot be cancelled.');
    await call(port, 'GET', '/v1/leases', null, 'The ledger shows exactly one effect of 5 units.');
    add({ kind: 'note', note: 'Rejected and unsupported requests wrote nothing: the journal holds only the begin and commit of lease-key-0001.' });
  } finally {
    await closeServer(service.server);
  }
}

async function cancelling(events) {
  const { call } = recorder(events, 'cancel');
  const held = gate();
  const service = await listen(createMemoryIo(), held.executor);
  try {
    const { port } = service;
    const original = call(port, 'POST', '/v1/steps', body('lease-key-0003'), 'Answered only after the explicit cancel below.');
    await held.entered('lease-key-0003');
    await call(port, 'GET', '/v1/steps/lease-key-0003', null, 'In flight: the outcome is unknown, not success.');
    await call(port, 'POST', '/v1/steps/lease-key-0003/cancel', null, 'Cancelled explicitly before any effect was recorded.');
    await original;
    held.release('lease-key-0003');
    await settle();
    await call(port, 'POST', '/v1/steps/lease-key-0003/cancel', null, 'A second cancel is refused and lists what is allowed.');
    await call(port, 'GET', '/v1/leases', null, 'Nothing is reserved or held.');
  } finally {
    await closeServer(service.server);
  }
}

async function disappearing(events) {
  const { add, call } = recorder(events, 'disconnect');
  const held = gate();
  const service = await listen(createMemoryIo(), held.executor);
  try {
    const { port } = service;
    const client = abandon(port, body('lease-key-0004'));
    await held.entered('lease-key-0004');
    client.destroy();
    add({ kind: 'abort', note: 'The client destroys its socket while the step is in flight; nothing is cancelled.' });
    held.release('lease-key-0004');
    await client.ended;
    await call(port, 'POST', '/v1/steps', body('lease-key-0004'), 'The retry returns the one recorded success.');
  } finally {
    await closeServer(service.server);
  }
}

async function restarting(events) {
  const { add, call } = recorder(events, 'restart');
  const held = gate();
  const io = createMemoryIo();
  const first = await listen(io, held.executor);
  const original = exchange(first.port, 'POST', '/v1/steps', body('lease-key-0005')).catch(() => null);
  await held.entered('lease-key-0005');
  await closeServer(first.server);
  await original;
  add({ kind: 'abort', note: 'The service stops while the step is in flight: no terminal record exists.' });
  const second = await listen(io);
  try {
    const { port } = second;
    await call(port, 'GET', '/v1/steps/lease-key-0005', null, 'After the restart the step is interrupted, never resumed automatically.');
    await call(port, 'POST', '/v1/steps', body('lease-key-0005'), 'A retry reports the interruption; resume is an explicit action.');
    await call(port, 'POST', '/v1/steps/lease-key-0005/resume', null, 'Resume runs the persisted step to exactly one effect.');
    await call(port, 'POST', '/v1/steps', body('lease-key-0005'), 'A later retry replays the recorded success.');
  } finally {
    await closeServer(second.server);
  }
}

async function uncertain(events) {
  const { call } = recorder(events, 'uncertain');
  const inner = createMemoryIo();
  let writes = 0;
  const io = { ...inner, append(text) { writes += 1; inner.append(text); if (writes === 2) throw new Error('the acknowledgment was lost'); } };
  const service = await listen(io);
  try {
    const { port } = service;
    await call(port, 'POST', '/v1/steps', body('lease-key-0006'), 'The commit line landed but the write was not confirmed: unknown, not success.');
    await call(port, 'POST', '/v1/steps', body('lease-key-0006'), 'The retry re-reads the journal and reports the one recorded success.');
  } finally {
    await closeServer(service.server);
  }
}

async function capacity(events) {
  const { call } = recorder(events, 'capacity');
  const held = gate();
  const service = await listen(createMemoryIo(), held.executor);
  try {
    const { port } = service;
    const big = { leaseId: 'synthetic-lease-002', units: 6 };
    const first = call(port, 'POST', '/v1/steps', body('lease-key-0007', big), 'Admitted; its units are held while it is in flight.');
    await held.entered('lease-key-0007');
    await call(port, 'POST', '/v1/steps', body('lease-key-0008', big), 'Rejected: only 4 of the 10 units are free.');
    held.release('lease-key-0007');
    await first;
  } finally {
    await closeServer(service.server);
  }
}

async function produceTranscript() {
  const events = [];
  const scenarios = [
    ['conduct', 'Conduct, replay, conflict, hostile and unsupported requests', conduct],
    ['cancel', 'Cancel a step that is in flight', cancelling],
    ['disconnect', 'A client that disappears mid-step', disappearing],
    ['restart', 'Restart, interrupted, explicit resume', restarting],
    ['uncertain', 'A journal write that cannot be confirmed', uncertain],
    ['capacity', 'Capacity is held while a step is in flight', capacity],
  ];
  for (const [, , run] of scenarios) await run(events);
  return {
    schemaVersion: 1, kind: 'C042-server-transcript', scope: contract.SCOPE, banner: 'Synthetic business data, loopback only, no cloud call',
    scenarios: scenarios.map(([id, title]) => ({ id, title })), events,
  };
}

module.exports = Object.freeze({ produceTranscript });
