'use strict';

// R3 self-review line 5 (NO SHARED MUTABLE RETURNS): a GENERIC aliasing walker. For every public return value of the
// production code it visits every reachable object (own keys, including non-enumerable ones, cycles guarded), tries in
// STRICT mode to overwrite every property, delete it and add a new one, then asks the SAME function again and requires the
// answer to equal what the first call returned. A returned object that is internal state (or a module constant that is not
// frozen) changes the later answers and fails by name. The walker reports how many objects it reached, so a vacuous walk fails.
const test = require('node:test');
const contract = require('../contract.js');
const envelope = require('../envelope.js');
const presets = require('../preset.cjs');
const result = require('../result.cjs');
const server = require('../server.cjs');
const validate = require('../validate.js');
const verify = require('../verify.js');
const {
  assert, boot, doc,
} = require('./support.cjs');

function reachable(root) {
  const seen = new Set();
  const stack = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    // Functions and prototypes are code, not state: the walk follows own data properties of plain objects and arrays only.
    if (value === null || typeof value !== 'object' || seen.has(value)) continue;
    seen.add(value);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Reflect.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) stack.push(descriptor.value);
    }
  }
  return [...seen];
}

function poison(root) {
  'use strict';

  let attempts = 0;
  for (const object of reachable(root)) {
    for (const key of Reflect.ownKeys(object)) {
      for (const attempt of [() => { object[key] = '__poisoned__'; }, () => { delete object[key]; }]) {
        try { attempt(); attempts += 1; } catch { /* frozen or read-only: the correct answer */ }
      }
    }
    try { object.__poisoned__ = true; attempts += 1; } catch { /* sealed */ }
  }
  return attempts;
}

const copy = (value) => JSON.stringify(value, (key, item) => (typeof item === 'function' ? `[function ${item.name}]` : item));

function assertNoAliasing(name, produce) {
  const first = produce();
  const before = copy(first);
  const objects = reachable(first).length;
  poison(first);
  assert.equal(copy(produce()), before, `${name}: a write to a returned object changed a later answer`);
  assert.equal(objects > 0, true, `${name}: the walk reached no object`);
  return objects;
}

test('no public return value of the production code shares a mutable object: a write to every reachable object changes no later answer', { timeout: 60000 }, async () => {
  const booted = await boot();
  const bytes = Buffer.from(JSON.stringify(doc()));
  assert.equal((await booted.runner.run(bytes)).status, 201);
  const key = 'preset-run-0001';
  const invalid = { schemaVersion: 1, preset: 'bounded-sequence', idempotencyKey: 'x', steps: [] };
  const producers = {
    'preset.catalogDocument()': () => presets.catalogDocument(),
    'preset.parsePreset(valid)': () => presets.parsePreset(doc()),
    'preset.parsePreset(invalid)': () => presets.parsePreset(invalid),
    'preset.LIMITS and CATALOG': () => ({ limits: presets.LIMITS, catalog: presets.CATALOG }),
    'contract (the whole module)': () => contract,
    'validate (the whole module)': () => validate,
    'envelope (the whole module)': () => envelope,
    'verify (the whole module)': () => verify,
    'result.refusal(NOT_FOUND)': () => result.refusal('NOT_FOUND'),
    'result.refusal(INVALID_FORMAT with details)': () => result.refusal('INVALID_FORMAT', { action: 'run', details: [{ path: 'key', code: 'INVALID_FORMAT', message: 'x' }] }),
    'runner.inspect(run)': () => booted.runner.inspect(key),
    'runner.inspect(unknown)': () => booted.runner.inspect('preset-run-9999'),
    'runner.health()': () => booted.runner.health(),
    'runner.unsupportedAction(run)': () => booted.runner.unsupportedAction(key),
    'the engine ledger snapshot the server answers GET /v1/leases with': () => booted.real.snapshot(),
    'server.scope and server.bounds': () => ({ scope: server.scope, bounds: server.bounds }),
  };
  let reached = 0;
  const failures = [];
  for (const [name, produce] of Object.entries(producers)) {
    try { reached += assertNoAliasing(name, produce); } catch (error) { failures.push(error.message); }
  }
  assert.deepEqual(failures, [], 'every public return value is frozen or a fresh copy');
  assert.equal(reached > 100, true, `the walker reached ${reached} objects in total`);
  // The run answer of a fresh preset, asked twice: the second answer is the idempotent replay of the first, never the first object.
  const again = await booted.runner.run(bytes);
  const copyOfAgain = copy(again);
  poison(again);
  assert.equal(copy(await booted.runner.run(bytes)), copyOfAgain, 'runner.run(replay)');
});

test('the walker itself finds a shared mutable object: a naive producer that returns its internal state fails by name', () => {
  const state = { items: [{ n: 1 }] };
  assert.throws(() => assertNoAliasing('naive producer', () => state), /a write to a returned object changed a later answer/);
  assert.equal(assertNoAliasing('copying producer', () => JSON.parse(JSON.stringify(state))) > 0, true);
  assert.equal(assertNoAliasing('frozen producer', () => Object.freeze({ items: Object.freeze([Object.freeze({ n: 1 })]) })) > 0, true);
});
