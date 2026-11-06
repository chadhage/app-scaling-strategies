'use strict';

// A SEEDED fuzz of what arrives from outside the code (L-0164, self-review 7): hostile documents for the redactor, hostile text for its masking, hostile
// configurations, errors and bodies for the vault, errorSteps and validateInput. The answer is a public body, a typed refusal or a result, never another throw;
// the WORK is bounded by counters of the reads a proxy sees, never by a clock (the per-test timeout is only the hang guard). Three fixed seeds: a failure names its seed and round.
const test = require('node:test');
const assert = require('node:assert/strict');
const { createRedactor, isPublicBody, SCHEMAS, LIMITS } = require('../redact.cjs');
const { ConfigError, createVault } = require('../vault.cjs');
const { errorSteps, createEvidence } = require('../evidence.cjs');
const { validateInput } = require('../service.cjs');
const { scan, ENCODERS } = require('./scanner.cjs');
const { seedConfig, canaryList } = require('./canaries.cjs');

const SEEDS = [11, 2027, 90210];
const ROUNDS = 100;
const CANARIES = canaryList();
const SECRETS = createVault(seedConfig()).secrets();
const BAIT = CANARIES[4].value;

function generator(seed) {
  let state = seed >>> 0;
  const next = () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), state | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
  const int = (limit) => Math.floor(next() * limit);
  return { next, int, pick: (list) => list[int(list.length)], chance: (share) => next() < share };
}

const cyclic = () => { const node = {}; node.self = node; node.steps = [node]; node.items = [node]; node.result = node; return node; };
const deep = (depth) => { let value = {}; for (let level = 0; level < depth; level += 1) value = [value]; return value; };
const throwingFields = (source) => {
  const holder = {};
  for (const key of Object.keys(source)) Object.defineProperty(holder, key, { enumerable: true, get() { throw new Error(BAIT); } });
  return holder;
};
const counting = (target, meter) => new Proxy(target, {
  get(inner, key, receiver) { meter.reads += 1; return Reflect.get(inner, key, receiver); },
  getOwnPropertyDescriptor(inner, key) { meter.reads += 1; return Reflect.getOwnPropertyDescriptor(inner, key); },
  has(inner, key) { meter.reads += 1; return Reflect.has(inner, key); },
  ownKeys(inner) { meter.reads += 1; return Reflect.ownKeys(inner); }
});
const trap = () => new Proxy({}, { get() { throw new Error(BAIT); }, has() { throw new Error(BAIT); }, ownKeys() { throw new Error(BAIT); }, getOwnPropertyDescriptor() { throw new Error(BAIT); } });

function phrase(rng) {
  const canary = rng.pick(CANARIES).value;
  const encoded = ENCODERS[rng.pick(Object.keys(ENCODERS))](canary);
  return rng.pick([() => 'accepted', () => `step ${rng.int(100)} of ${rng.int(100)}`, () => canary, () => `see ${encoded} end`, () => `${encoded.slice(0, 4)} ${encoded}`, () => BAIT, () => `${canary}${canary}`])();
}

// A value that is not what any field expects. Mode 'plain' leaves out the one object whose key enumeration throws, mode 'owner' also the objects whose accessors throw:
// the stated limits pinned at the end of this file (the callers of those functions are the process owner and JSON.parse).
const accessors = () => throwingFields({ id: 1, units: 1, steps: 1, items: 1, detail: 1, event: 1 });
function hostile(rng, meter, mode = 'any') {
  const factories = [
    () => undefined, () => null, () => Number.NaN, () => Infinity, () => -Infinity, () => -0, () => 0, () => -1, () => 1.5, () => 2 ** 53, () => Number.MAX_VALUE,
    () => true, () => '', () => '\u0000', () => '\ud800', () => 10n, () => Symbol('hostile'), () => () => 1, () => class Hostile {},
    () => 'x'.repeat(LIMITS.textCap + 1), () => `${BAIT} `.repeat(1 + rng.int(40)), () => '%25'.repeat(20000), () => '&#65;'.repeat(20000), () => '\\u0041'.repeat(20000),
    () => '\u{1F600}'.repeat(40000), () => `${'a'.repeat(LIMITS.text)}${BAIT}`,
    () => [], () => [, , 1], () => new Array(2 ** 32 - 1), () => Object.assign([1, 2], { [BAIT]: BAIT }), () => ({ length: 1e9 }),
    () => cyclic(), () => deep(50), () => deep(20000), () => JSON.parse('{"__proto__":{"polluted":1},"constructor":{"prototype":{"polluted":1}}}'), () => Object.create(null),
    () => Object.freeze({ id: 'run-0001' }), () => new Date(0), () => new Map([[BAIT, BAIT]]), () => new Set([BAIT]), () => /x/g, () => Buffer.from(BAIT), () => new Uint8Array(8),
    () => Object(BAIT), () => Object(5), () => Promise.resolve(BAIT), () => new Error(BAIT), accessors,
    () => counting(new Array(2 ** 32 - 1), meter), () => counting({ id: 'run-0001', units: 1, steps: counting([], meter) }, meter)
  ];
  if (mode === 'any') factories.push(trap);
  return rng.pick(mode === 'owner' ? factories.filter((factory) => factory !== accessors) : factories)();
}

// Every value of the schema, valid; the fuzz then breaks a few of them.
function valid(node, rng, instance) {
  switch (node.t) {
    case 'int': return node.nullable && rng.chance(0.2) ? null : node.min + rng.int(Math.min(node.max - node.min, 1000) + 1);
    case 'bool': return rng.chance(0.5);
    case 'enum': return rng.pick(node.values);
    case 'id': return node.nullable && rng.chance(0.2) ? null : `run-${1000 + rng.int(8000)}`;
    case 'hex': return Array.from({ length: node.length }, () => '0123456789abcdef'[rng.int(16)]).join('');
    case 'text': return phrase(rng);
    case 'public': return rng.chance(0.7) ? instance.publish('runs', valid(SCHEMAS.runs, rng, instance)) : valid(SCHEMAS.runs, rng, instance);
    case 'array': return Array.from({ length: rng.int(Math.min(node.max, 5) + 1) }, () => valid(node.of, rng, instance));
    default: return Object.fromEntries(Object.entries(node.fields).map(([key, child]) => [key, valid(child, rng, instance)]));
  }
}

function paths(value, prefix = [], out = []) {
  if (value !== null && typeof value === 'object' && !isPublicBody(value)) {
    for (const key of Object.keys(value)) { out.push([...prefix, key]); paths(value[key], [...prefix, key], out); }
  }
  return out;
}

// One to three breaks of a valid document: a key deleted (a hole in an array), a value replaced by a hostile one, a key named after a canary, a text with a canary in a covered encoding.
function mutate(doc, rng, meter, mode = 'any') {
  const attempt = (read) => { try { return read(); } catch { return undefined; } };
  const all = paths(doc);
  for (let count = 1 + rng.int(3); count > 0 && all.length > 0; count -= 1) {
    const path = rng.pick(all);
    let holder = doc;
    for (const key of path.slice(0, -1)) holder = holder !== null && typeof holder === 'object' && !isPublicBody(holder) ? attempt(() => holder[key]) : null;
    if (holder === null || holder === undefined || typeof holder !== 'object' || isPublicBody(holder) || Object.isFrozen(holder)) continue;
    const key = path[path.length - 1];
    const current = attempt(() => holder[key]);
    const action = rng.int(5);
    attempt(() => {
      if (action === 0) delete holder[key];
      else if (action === 1) holder[key] = hostile(rng, meter, mode);
      else if (action === 2) holder[`${BAIT}${rng.int(9)}`] = hostile(rng, meter, mode);
      else if (action === 3 && mode !== 'owner' && current !== null && typeof current === 'object' && !isPublicBody(current) && !Array.isArray(current)) holder[key] = throwingFields(current);
      else holder[key] = phrase(rng);
    });
  }
  return rng.chance(0.06) ? hostile(rng, meter, mode) : doc;
}

// The shape a published document may have, from the schema alone: exactly the allow-listed keys, every value of its type, every list within its limit.
function conforms(node, value) {
  switch (node.t) {
    case 'int': return (Number.isSafeInteger(value) && value >= node.min && value <= node.max) || (node.nullable === true && value === null);
    case 'bool': return typeof value === 'boolean';
    case 'enum': return node.values.includes(value);
    case 'id': return (typeof value === 'string' && node.re.test(value)) || (node.nullable === true && value === null);
    case 'hex': return typeof value === 'string' && value.length === node.length && /^[0-9a-f]+$/.test(value);
    case 'text': return typeof value === 'string' && value.length <= LIMITS.text + 1;
    case 'public': return value !== null && typeof value === 'object';
    case 'array': return Array.isArray(value) && value.length <= node.max && value.every((entry) => conforms(node.of, entry));
    default: {
      if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
      const keys = Object.keys(node.fields);
      return Object.keys(value).join() === keys.join() && keys.every((key) => (value[key] === null ? !node.required.includes(key) : conforms(node.fields[key], value[key])));
    }
  }
}

// The most nodes a walk can visit, and at most three traps are read for each: the reads a hostile proxy sees can never exceed this, however large it claims to be.
const visits = (node) => {
  if (node.t === 'array') return 1 + node.max * visits(node.of);
  if (node.t === 'object') return 1 + Object.values(node.fields).reduce((sum, child) => sum + visits(child), 0);
  return 1;
};

// One scan of many outputs (compiling the 34 canaries for every output would cost minutes); the offender is named only when something shows.
function assertClean(outputs) {
  if (scan(outputs.map((output) => output.text).join('\n'), CANARIES).length === 0) return;
  const first = outputs.find((output) => scan(output.text, CANARIES).length > 0);
  assert.fail(`a canary shows: ${first ? first.where : 'across two outputs'}`);
}

test('publish over a seeded fuzz of hostile documents: every kind ends in a public body of exactly the allow-listed shape, with no canary in any covered encoding, the same answer twice, and no more reads of a hostile proxy than the schema can visit', { timeout: 300000 }, () => {
  let observed = 0;
  for (const seed of SEEDS) {
    const rng = generator(seed);
    const instance = createRedactor({ secrets: SECRETS });
    for (const kind of Object.keys(SCHEMAS)) {
      const outputs = [];
      for (let round = 0; round < ROUNDS; round += 1) {
        const meter = { reads: 0 };
        const doc = mutate(valid(SCHEMAS[kind], rng, instance), rng, meter);
        const where = `seed ${seed}, ${kind}, round ${round}`;
        const body = instance.publish(kind, doc);
        assert.ok(isPublicBody(body) && Object.isFrozen(body), `${where}: a frozen public body`);
        assert.ok(meter.reads <= 3 * visits(SCHEMAS[kind]), `${where}: ${meter.reads} reads`);
        observed += meter.reads;
        assert.ok(body.value === null || conforms(SCHEMAS[kind], body.value), `${where}: the shape`);
        const text = JSON.stringify(body);
        outputs.push({ text, where });
        assert.equal(JSON.stringify(instance.publish(kind, doc)), text, `${where}: the same answer twice`);
      }
      assertClean(outputs);
    }
  }
  assert.ok(observed > 0, 'the counting proxies were read');
  assert.equal(Object.prototype.polluted, undefined);
  assert.equal({}.polluted, undefined);
});

test('the oracles of the fuzz are not vacuous: an extra key, a value out of range, a required value missing, a list over its limit, and a canary in a covered encoding are each caught', () => {
  const body = createRedactor({ secrets: SECRETS }).publish('runs', { id: 'run-0001', units: 1, revision: 0, status: 'ok', artifacts: 0, steps: [] }).value;
  assert.equal(conforms(SCHEMAS.runs, body), true);
  assert.equal(conforms(SCHEMAS.runs, { ...body, extra: 1 }), false);
  assert.equal(conforms(SCHEMAS.runs, { ...body, units: -1 }), false);
  assert.equal(conforms(SCHEMAS.runs, { ...body, id: null }), false);
  assert.equal(conforms(SCHEMAS.runs, { ...body, steps: Array.from({ length: LIMITS.steps + 1 }, () => ({ event: 'note', detail: 'x' })) }), false);
  for (const name of Object.keys(ENCODERS)) assert.throws(() => assertClean([{ text: `x ${ENCODERS[name](CANARIES[0].value)} y`, where: name }]), /a canary shows/, name);
  assert.ok(visits(SCHEMAS.signedBundle) > visits(SCHEMAS.runs) && visits(SCHEMAS.runs) > LIMITS.steps);
});

test('a hostile container costs at most the reads its limit allows: a proxied array that claims four billion entries is read at most as often as the list limit, never as often as it claims', () => {
  const instance = createRedactor({ secrets: SECRETS });
  const steps = { meter: { reads: 0 } };
  steps.huge = counting(new Array(2 ** 32 - 1), steps.meter);
  const runs = instance.publish('runs', { id: 'run-0001', units: 1, revision: 0, status: 'ok', artifacts: 0, steps: steps.huge });
  assert.deepEqual(runs.value.steps, []);
  assert.ok(steps.meter.reads > 0 && steps.meter.reads <= 1 + 2 * LIMITS.steps, `${steps.meter.reads} reads for ${LIMITS.steps} steps`);
  const items = { meter: { reads: 0 } };
  items.huge = counting(new Array(2 ** 32 - 1), items.meter);
  const list = instance.publish('list', { outcome: 'ok', kind: 'runs', revision: 0, total: 0, shown: 0, limit: 50, items: items.huge });
  assert.deepEqual(list.value.items, []);
  assert.ok(items.meter.reads > 0 && items.meter.reads <= 1 + 2 * LIMITS.entries, `${items.meter.reads} reads for ${LIMITS.entries} items`);
});

test('maskText over seeded hostile text: always a string of bounded length, no canary in any covered encoding, the same answer twice', { timeout: 300000 }, () => {
  const alphabet = ['%', '2', '5', '&#', 'x', ';', '\\u', '0', '4', '1', 'a', ' ', '\u200b', '\u00ad', '\u00e9', '\ud83d', '\ude00', '=', '+', '/', '.', '@', 'e', 'F'];
  for (const seed of SEEDS) {
    const rng = generator(seed);
    const instance = createRedactor({ secrets: SECRETS });
    const outputs = [];
    for (let round = 0; round < ROUNDS * 3; round += 1) {
      const pieces = Array.from({ length: 1 + rng.int(12) }, () => (rng.chance(0.4) ? phrase(rng) : Array.from({ length: 1 + rng.int(60) }, () => rng.pick(alphabet)).join('')));
      const text = rng.chance(0.05) ? hostile(rng, { reads: 0 }, 'plain') : pieces.join(rng.pick(['', ' ', '\n']));
      const masked = instance.maskText(text);
      const where = `seed ${seed}, round ${round}`;
      assert.equal(typeof masked, 'string', where);
      assert.ok(masked.length <= LIMITS.text + 1, `${where}: ${masked.length} characters`);
      outputs.push({ text: masked, where });
      assert.equal(instance.maskText(text), masked, `${where}: the same answer twice`);
    }
    assertClean(outputs);
  }
});

test('createVault over seeded hostile configurations: built, or a typed ConfigError that names no secret, never another throw', { timeout: 300000 }, () => {
  for (const seed of SEEDS) {
    const rng = generator(seed);
    const outputs = [];
    for (let round = 0; round < ROUNDS * 3; round += 1) {
      const where = `seed ${seed}, round ${round}`;
      try {
        createVault(mutate(seedConfig(), rng, { reads: 0 }, 'owner'));
      } catch (error) {
        assert.ok(error instanceof ConfigError && error.code === 'CONFIG_INVALID' && error.message === 'CONFIG_INVALID', `${where}: ${error && error.constructor && error.constructor.name}`);
        outputs.push({ text: JSON.stringify([error.message, error.field, error.stack.split('\n')[0]]), where });
      }
    }
    assert.ok(outputs.length > 0, 'some of the configurations were refused');
    assertClean(outputs);
  }
});

test('validateInput over seeded hostile bodies: a typed answer, never a throw, and only the known fields come out', { timeout: 300000 }, () => {
  for (const seed of SEEDS) {
    const rng = generator(seed);
    for (let round = 0; round < ROUNDS * 3; round += 1) {
      const where = `seed ${seed}, round ${round}`;
      const command = rng.pick(['run.create', 'config.check', 'run.create', 'config.check', 'pool.resize', '', undefined]);
      const answer = validateInput(command, mutate(rng.chance(0.5) ? { name: 'a-run', units: 3 } : { mode: 'ok' }, rng, { reads: 0 }, 'plain'));
      assert.ok(answer !== null && typeof answer === 'object' && typeof answer.ok === 'boolean', `${where}: a typed answer`);
      if (answer.ok) assert.ok(Object.keys(answer.value).every((key) => ['name', 'units', 'mode'].includes(key)), `${where}: only the known fields`);
      else assert.equal(typeof answer.code, 'string', `${where}: a code`);
    }
  }
});

const rig = (seedSecrets = SECRETS) => {
  const redactor = createRedactor({ secrets: seedSecrets });
  const ledger = { auditLog: () => [], snapshot: () => ({ revision: 1, state: { runs: [] } }) };
  return createEvidence({ redactor, ledger, sign: () => '0'.repeat(64) });
};

test('the evidence over seeded hostile raw records: a record that cannot be read is published as nothing, every list and the signed bundle are public bodies without a canary, and what is shown reconciles with the total', { timeout: 300000 }, () => {
  for (const seed of SEEDS) {
    const rng = generator(seed);
    const evidence = rig();
    const outputs = [];
    for (let round = 0; round < ROUNDS; round += 1) {
      const kind = rng.pick(['trace', 'logs']);
      const raw = mutate({
        kind: 'request', method: 'GET', route: 'asset', status: 200, role: null, code: 'ok', level: 'info', event: 'request',
        steps: [{ event: 'note', detail: phrase(rng) }], error: { message: phrase(rng), cause: { message: phrase(rng) } }, stack: phrase(rng)
      }, rng, { reads: 0 });
      evidence.record(kind, raw);
      const where = `seed ${seed}, round ${round}`;
      const list = evidence.listBody(kind, 1 + rng.int(200));
      const bundle = evidence.bundleBody();
      assert.ok(isPublicBody(list) && isPublicBody(bundle), where);
      assert.ok(list.value.shown <= list.value.total && list.value.items.length === list.value.shown, `${where}: shown against total`);
      outputs.push({ text: JSON.stringify(list), where }, { text: JSON.stringify(bundle), where });
    }
    assertClean(outputs);
  }
});

test('stated limits, pinned: a configuration with a Proxy or an accessor that throws escapes createVault as the throwing object\'s own error, validateInput does not handle a Proxy, and errorSteps is not total on a Proxy or on a getter that throws; their callers hand them the configuration of the process owner, the result of JSON.parse and a record the evidence reads inside a try block (the record is then published as nothing); a change that makes them total fails here by name', () => {
  const config = seedConfig();
  config.contacts = trap();
  assert.throws(() => createVault(config), (error) => !(error instanceof ConfigError));
  const accessor = seedConfig();
  accessor.tokens = throwingFields(accessor.tokens);
  assert.throws(() => createVault(accessor), (error) => !(error instanceof ConfigError));
  assert.throws(() => validateInput('config.check', trap()));
  assert.throws(() => errorSteps(trap()));
  assert.throws(() => errorSteps({ get message() { throw new Error(BAIT); } }));
  const evidence = rig();
  evidence.record('trace', { kind: 'error', method: 'GET', route: 'asset', status: 500, steps: [], error: { get message() { throw new Error(BAIT); } } });
  evidence.record('trace', { kind: 'request', method: 'GET', route: 'asset', status: 200, steps: [] });
  const list = evidence.listBody('trace', 10).value;
  assert.deepEqual([list.total, list.shown, list.items.length], [2, 1, 1]);
});
