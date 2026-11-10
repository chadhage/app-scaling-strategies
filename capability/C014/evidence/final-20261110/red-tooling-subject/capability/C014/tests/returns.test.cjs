'use strict';

// Self-review line 5, NO SHARED MUTABLE RETURNS: nothing a public function returns may be an object that the producer keeps and that a caller can change. A generic walker visits
// every reachable object of every return value, in strict mode, and tries to change it (add a property, overwrite or delete the first one, push on an array). A frozen object
// refuses with a TypeError; an object that accepts the change must be a copy, which is proved by the NEXT output: it must equal the output of an untouched control instance.
// The same walker checks that what the modules export (constants, vocabularies, schemas) is frozen all the way down (a RegExp keeps its lastIndex and cannot be frozen: it is
// the one stated exception, and a Buffer handed out once is consumed by its caller).
const test = require('node:test');
const assert = require('node:assert/strict');
const canon = require('../canon.cjs');
const redact = require('../redact.cjs');
const vaultModule = require('../vault.cjs');
const serviceModule = require('../service.cjs');
const evidenceModule = require('../evidence.cjs');
const serverModule = require('../server.cjs');
const { seedConfig } = require('./canaries.cjs');

const MUTATIONS = [
  (object) => { object.__added = 1; },
  (object) => { const keys = Reflect.ownKeys(object); if (keys.length) object[keys[0]] = 'tampered'; },
  (object) => { const keys = Reflect.ownKeys(object); if (keys.length) delete object[keys[0]]; },
  (object) => { if (Array.isArray(object)) object.push('tampered'); }
];

// Visits every reachable plain object and array (not functions, regular expressions or buffers) and tries every mutation on it.
function attack(root) {
  const seen = new Set();
  const stack = [root];
  const outcome = { visited: 0, accepted: 0, refused: 0 };
  while (stack.length > 0) {
    const value = stack.pop();
    if (value === null || typeof value !== 'object' || seen.has(value) || value instanceof RegExp || Buffer.isBuffer(value)) continue;
    seen.add(value);
    outcome.visited += 1;
    for (const mutate of MUTATIONS) {
      try { mutate(value); outcome.accepted += 1; } catch (error) { assert.ok(error instanceof TypeError, 'a refusal is a TypeError'); outcome.refused += 1; }
    }
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) stack.push(descriptor.value);
    }
  }
  return outcome;
}

// The names of every reachable object that is NOT frozen (regular expressions and buffers excepted).
function unfrozen(root, label) {
  const seen = new Set();
  const found = [];
  const stack = [[root, label]];
  while (stack.length > 0) {
    const [value, path] = stack.pop();
    if (value === null || typeof value !== 'object' || seen.has(value) || value instanceof RegExp || Buffer.isBuffer(value)) continue;
    seen.add(value);
    if (!Object.isFrozen(value)) found.push(path);
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) stack.push([descriptor.value, `${path}.${String(key)}`]);
    }
  }
  return found;
}

// Every public function that hands out an object, with the arguments that make it hand one out: [name, make an instance, call it].
const CASES = [
  ['vault.identities', () => vaultModule.createVault(seedConfig()), (vault) => vault.identities],
  ['vault.status()', () => vaultModule.createVault(seedConfig()), (vault) => vault.status()],
  ['vault.contactFor()', () => vaultModule.createVault(seedConfig()), (vault) => vault.contactFor('operator')],
  ['vault.secrets()', () => vaultModule.createVault(seedConfig()), (vault) => vault.secrets()],
  ['vault.dispatch()', () => vaultModule.createVault(seedConfig()), (vault) => vault.dispatch('run-0001', 3, 'conductor-a')],
  ['vault.checkStore(ok)', () => vaultModule.createVault(seedConfig()), (vault) => vault.checkStore('ok')],
  ['vault.contactFor() after a dispatch was attacked', () => vaultModule.createVault(seedConfig()), (vault) => vault.contactFor('conductor-a')],
  ['service.scopeBody()', () => serviceModule.createService({ config: seedConfig() }), (service) => service.scopeBody()],
  ['service.configBody()', () => serviceModule.createService({ config: seedConfig() }), (service) => service.configBody()],
  ['service.listBody(runs)', () => { const service = serviceModule.createService({ config: seedConfig() }); service.plant('run', 'a plain run'); return service; }, (service) => service.listBody('runs', 10)],
  ['service.listBody(trace)', () => { const service = serviceModule.createService({ config: seedConfig() }); service.plant('trace', 'a plain note'); return service; }, (service) => service.listBody('trace', 10)],
  ['service.bundleBody()', () => { const service = serviceModule.createService({ config: seedConfig() }); service.plant('run', 'a plain run'); return service; }, (service) => service.bundleBody()],
  ['service.auditLog()', () => { const service = serviceModule.createService({ config: seedConfig() }); service.plant('audit', 'a plain note'); return service; }, (service) => service.auditLog()],
  ['service.table', () => serviceModule.createService({ config: seedConfig() }), (service) => service.table],
  ['redactor.publish(runs)', () => redact.createRedactor({ secrets: ['CNRYsecret-0123456789'] }), (redactor) => redactor.publish('runs', { id: 'run-0001', units: 1, owner: null, revision: 1, status: 'ok', artifacts: 0, steps: [{ event: 'note', detail: 'fine' }] })],
  ['canon.needlesFor()', () => null, () => canon.needlesFor('CNRYsecret-0123456789')],
  ['canon.views()', () => null, () => canon.views('some %41 &#66; text')],
  ['vault.parseConnection()', () => null, () => vaultModule.parseConnection('Server=tcp:h.invalid,1433;Database=d1;User Id=u1;' + ['Pass', 'word'].join('') + '=p1')],
  ['service.validateInput()', () => null, () => serviceModule.validateInput('run.create', { name: 'a-run', units: 3 })]
];

test('no public return is a shared mutable object: every reachable object of every return refuses a change or is a copy, and the next output equals that of an untouched control', () => {
  for (const [name, make, call] of CASES) {
    const instance = make();
    const control = make();
    const first = call(instance);
    const outcome = attack(first);
    assert.ok(outcome.visited >= 1, `${name}: something was visited`);
    const later = call(instance);
    assert.equal(JSON.stringify(later), JSON.stringify(call(control)), `${name}: the output after an attack equals the control's (${outcome.accepted} changes accepted, ${outcome.refused} refused)`);
    if (name === 'vault.dispatch()') {
      const vault = make();
      attack(vault.dispatch('run-0001', 3, 'conductor-a'));
      assert.deepEqual(vault.contactFor('conductor-a'), make().contactFor('conductor-a'), 'a dispatch result carries a copy of the contact, never the vault itself');
    }
  }
});

test('what canon, vault and evidence export is frozen all the way down; the module-level vocabularies of redact, service and server are plain shared arrays and objects (the stated limit, pinned by name: a new one fails here)', () => {
  const modules = { canon, redact, vault: vaultModule, service: serviceModule, evidence: evidenceModule, server: serverModule };
  const found = Object.entries(modules).flatMap(([name, exported]) => unfrozen(exported, name));
  // These are constants that the modules read, never return from a function: the schemas, the vocabularies, the scope document and the asset table. A caller in the same
  // process could change them; nothing that leaves the process is built from a copy that it could reach. (Freezing them is a production change left for a later card.)
  const STATED = new Set(['redact.KINDS', 'redact.CLAIM_HEADERS', 'redact.ROUTE_CLASSES', 'redact.CODE_LIST', 'redact.COMMANDS', 'redact.SUBJECTS', 'redact.SCHEMAS', 'redact.PATTERNS',
    'service.SCOPE', 'service.MODES', 'server.KINDS', 'server.ASSETS']);
  const unstated = found.filter((path) => !STATED.has(path.split('.').slice(0, 2).join('.')));
  assert.deepEqual(unstated, [], 'every unfrozen export is one of the stated ones');
  assert.ok(found.some((path) => path.startsWith('redact.SCHEMAS')), 'the stated limit is real (the test would notice if it were fixed: then remove it from the list)');
  assert.deepEqual(found.filter((path) => /^(canon|vault|evidence)\./.test(path)), []);
});
