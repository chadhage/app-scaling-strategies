'use strict';

// Produces the server-side transcript the page displays and verifies: the service is driven over real loopback
// sockets against private instances (in-memory journals, a gated executor, a manual clock), because the isolated
// browser helper blocks writes. Nothing here touches the disk, the network beyond 127.0.0.1, or the wall clock.
const http = require('node:http');
const contract = require('./contract.js');
const { openRunner } = require('./runner.cjs');
const { closeServer, createLocalServer } = require('./server.cjs');
const { openEngine } = require('../C042/engine.cjs');
const { createMemoryIo } = require('../C042/journal.cjs');

const step = (key, units = 5, leaseId = 'synthetic-lease-001') => ({ schemaVersion: 1, step: 'reserve-capacity', idempotencyKey: key, leaseId, units });
const preset = (key, steps, bounds = {}, name = 'transcript-preset') => ({
  schemaVersion: 1, preset: name, idempotencyKey: key, bounds: { maxSteps: 4, maxDurationMs: 1000, maxUnits: 40, ...bounds }, steps,
});
const three = (key, units = 5) => preset(key, [1, 2, 3].map((n) => step(`${key}-step-${n}`, units)));
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

async function listen({ stepIo = createMemoryIo(), runIo = createMemoryIo(), executor, clock = () => 0 } = {}) {
  const engine = await openEngine({ io: stepIo, executor });
  const runner = await openRunner({ engine, io: runIo, clock });
  const server = createLocalServer({ engine, runner });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return { server, port: server.address().port, engine, runner, stepIo, runIo };
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
  return {
    add: (event) => events.push({ n: events.length + 1, scenario, ...event }),
    async call(port, method, target, text, note) {
      const answer = await exchange(port, method, target, text ?? null);
      events.push({ n: events.length + 1, scenario, kind: 'exchange', request: { method, path: target, body: text ?? null }, response: answer, note });
      return answer;
    },
  };
}

const settle = async () => { for (let turn = 0; turn < 3; turn += 1) await new Promise((resolve) => setImmediate(resolve)); };
const text = (value) => JSON.stringify(value);

async function conduct(events) {
  const { add, call } = recorder(events, 'conduct');
  const service = await listen();
  try {
    const { port } = service;
    const base = three('tp-conduct-0001');
    await call(port, 'GET', '/v1/presets', null, 'The declared presets (a closed, versioned catalog).');
    await call(port, 'POST', '/v1/presets', text(base), 'A valid preset runs every step through the step service.');
    await call(port, 'POST', '/v1/presets', text(base), 'The identical request returns the recorded result and calls no step again.');
    await call(port, 'POST', '/v1/presets', text(preset('tp-conduct-0001', base.steps.map((entry, index) => (index === 1 ? { ...entry, units: 6 } : entry)))), 'The same key with another preset is a typed conflict.');
    await call(port, 'POST', '/v1/presets', text(base).replace('"preset":"transcript-preset"', '"preset":"transcript-preset","preset":"other"'), 'A duplicated key is refused with no effect.');
    await call(port, 'POST', '/v1/presets', text(base).replace('{"schemaVersion":1', '{"__proto__":{"x":1},"schemaVersion":1'), '__proto__ is refused with no effect.');
    await call(port, 'POST', '/v1/presets', text({ ...three('tp-conduct-0002'), schemaVersion: 2 }), 'An unknown preset version is unsupported; nothing is run.');
    await call(port, 'POST', '/v1/presets', text(preset('tp-conduct-0003', Array.from({ length: 9 }, (_, index) => step(`tp-conduct-0003-step-${index + 1}`, 1)), { maxSteps: 8, maxUnits: 80 })), 'More steps than the contract allows is refused.');
    await call(port, 'POST', '/v1/presets', text(preset('tp-conduct-0004', [step('tp-conduct-0004-a'), step('tp-conduct-0004-b'), step('tp-conduct-0004-c', 11)])), 'An invalid step in the LAST position refuses the whole preset before any step runs.');
    await call(port, 'POST', '/v1/presets', text(preset('tp-conduct-0006', [step('tp-conduct-0006-a'), step('tp-conduct-0006-a'), step('tp-conduct-0006-c')])), 'Two steps with one idempotency key are refused with no effect.');
    await call(port, 'POST', '/v1/presets', text(preset('tp-conduct-0005', three('tp-conduct-0005', 10).steps, { maxUnits: 25 })), 'A declared bound that the preset exceeds is PRESET_BOUND_EXCEEDED, with nothing run.');
    await call(port, 'POST', '/v1/presets/tp-conduct-0001/undo', null, 'There is no undo; the refusal changes nothing.');
    await call(port, 'POST', '/v1/presets/tp-conduct-0001/cancel', null, 'A completed preset cannot be cancelled.');
    await call(port, 'GET', '/v1/presets/tp-conduct-0001', null, 'Inspect: the same facts, read-only.');
    await call(port, 'GET', '/v1/leases', null, 'The ledger shows exactly one set of effects: 15 units.');
    add({ kind: 'note', note: 'Refused presets wrote nothing: both journals hold only the run of tp-conduct-0001.' });
  } finally {
    await closeServer(service.server);
  }
}

async function stopping(events) {
  const { call } = recorder(events, 'stop');
  const service = await listen();
  try {
    const { port } = service;
    const small = preset('tp-stop-0001', [step('tp-stop-0001-a', 6, 'synthetic-lease-002'), step('tp-stop-0001-b', 6, 'synthetic-lease-002'), step('tp-stop-0001-c')]);
    await call(port, 'POST', '/v1/presets', text(small), 'Step 2 is refused (capacity); step 3 is never called; step 1 stands.');
    await call(port, 'GET', '/v1/leases', null, 'Only the first step left an effect.');
  } finally {
    await closeServer(service.server);
  }
}

async function bounded(events) {
  const { call } = recorder(events, 'duration');
  let now = 0;
  const service = await listen({ clock: () => now, executor: async () => { now += 600; } });
  try {
    await call(service.port, 'POST', '/v1/presets', text(three('tp-time-0001')), 'The injected clock passes the declared 1000 ms after step 2: step 3 is not run.');
    await call(service.port, 'GET', '/v1/leases', null, 'Two effects stand; nothing was undone.');
  } finally {
    await closeServer(service.server);
  }
}

async function cancelling(events) {
  const { call } = recorder(events, 'cancel');
  const held = gate();
  const service = await listen({ executor: held.executor });
  try {
    const { port } = service;
    const original = call(port, 'POST', '/v1/presets', text(three('tp-cancel-0001')), 'Answered only after the explicit cancel below.');
    await held.entered('tp-cancel-0001-step-1');
    held.release('tp-cancel-0001-step-1');
    await held.entered('tp-cancel-0001-step-2');
    await call(port, 'GET', '/v1/presets/tp-cancel-0001', null, 'In flight: the outcome is unknown, not success.');
    await call(port, 'POST', '/v1/presets/tp-cancel-0001/cancel', null, 'Cancelled explicitly while step 2 was in flight; step 1 stands.');
    await original;
    held.release('tp-cancel-0001-step-2');
    await settle();
    await call(port, 'GET', '/v1/leases', null, 'Only step 1 is committed and nothing is held.');
  } finally {
    await closeServer(service.server);
  }
}

async function restarting(events) {
  const { call } = recorder(events, 'restart');
  const held = gate();
  const first = await listen({ executor: held.executor });
  const original = call(first.port, 'POST', '/v1/presets', text(three('tp-restart-0001')), 'The service is stopped while step 2 is in flight (no answer is ever delivered).').catch(() => null);
  await held.entered('tp-restart-0001-step-1');
  held.release('tp-restart-0001-step-1');
  await held.entered('tp-restart-0001-step-2');
  await closeServer(first.server);
  await original;
  const second = await listen({ stepIo: first.stepIo, runIo: first.runIo });
  try {
    const { port } = second;
    await call(port, 'GET', '/v1/presets/tp-restart-0001', null, 'After the restart the preset is INTERRUPTED; nothing is resumed automatically.');
    await call(port, 'POST', '/v1/presets/tp-restart-0001/resume', null, 'An explicit resume continues at step 2; step 1 is not called again.');
    await call(port, 'POST', '/v1/presets/tp-restart-0001/resume', null, 'A second resume is refused: nothing is left to resume.');
    await call(port, 'GET', '/v1/leases', null, 'Exactly one set of effects: 15 units.');
  } finally {
    await closeServer(second.server);
  }
}

async function produceTranscript() {
  const events = [];
  for (const scenario of [conduct, stopping, bounded, cancelling, restarting]) await scenario(events);
  return { schemaVersion: 1, kind: 'C043-server-transcript', scope: contract.SCOPE, events };
}

module.exports = Object.freeze({ produceTranscript });
