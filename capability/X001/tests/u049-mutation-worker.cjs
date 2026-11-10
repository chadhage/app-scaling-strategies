'use strict';

const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const assert = require('node:assert/strict');

delete process.env.NODE_TEST_CONTEXT;
delete process.env.NODE_V8_COVERAGE;
const externalOnly = new Set([
  'hostile sizes are refused by counters inside a capped heap: a 64 MB old space is enough for every refusal and for a 50,000-deep entry',
  'G1 depth24 and depth40 real-dependency refusals and exact boundary controls replay inside a 64 MB child',
]);

process.once('message', async ({ repository, file, mutated, suites }) => {
  const target = file ? path.join(repository, 'capability', 'X001', file) : null;
  const domStub = path.join(repository, 'capability', 'X001', 'tests', 'dom-stub.cjs');
  const read = fs.readFileSync;
  fs.readFileSync = function (name, ...rest) {
    const filename = typeof name === 'string' || name instanceof URL
      ? path.resolve(name instanceof URL ? require('node:url').fileURLToPath(name) : name) : null;
    if (target && filename === target) {
      const encoding = typeof rest[0] === 'string' ? rest[0] : rest[0] && rest[0].encoding;
      return encoding ? mutated : Buffer.from(mutated);
    }
    const bytes = read.call(this, name, ...rest);
    if (filename === domStub) {
      const changed = bytes.toString().replace('const sandbox = { document, location, history, calls };',
        'const sandbox = { document, location, history, calls, __X001_U049_MUTATION_TICK: globalThis.__X001_U049_MUTATION_TICK };');
      return typeof bytes === 'string' ? changed : Buffer.from(changed);
    }
    return bytes;
  };
  let registry = [];
  let active = null;
  const bounds = [];
  const failures = [];
  const external = [];
  let assertions = 0;
  let ran = 0;
  globalThis.__X001_U049_MUTATION_TICK = (loop, iterations) => {
    if (iterations > 210000) {
      bounds.push({ test: active, loop, iterations, limit: 210000 });
      assert.fail(`G3 counted loop iteration bound ${loop}: ${iterations} > 210000`);
    }
  };
  const fakeTest = (name, options, body) => registry.push({ name, body: typeof options === 'function' ? options : body });
  fakeTest.test = fakeTest;
  const load = Module._load;
  Module._load = function (request, parent, isMain) {
    return request === 'node:test' ? fakeTest : load.call(this, request, parent, isMain);
  };
  const reply = (value) => process.send({ ...value, pid: process.pid, priority: require('node:os').getPriority(), ran, assertionFailures: assertions, bounds, externalControlsNotMutantOracles: external }, () => process.exit(0));
  try {
    for (const suite of suites) {
      registry = [];
      try { require(path.join(repository, 'capability', 'X001', 'tests', suite)); }
      catch (error) {
        failures.push({ suite, test: null, code: error.code || null, name: error.name, message: String(error.message).slice(0, 160) });
        continue;
      }
      for (const { name, body } of registry) {
        if (externalOnly.has(name)) { external.push({ suite, test: name, reason: 'A separate child reads pristine disk bytes, not the injected mutant; independently run in the actual whole suite and coverage.' }); continue; }
        active = name;
        ran += 1;
        try { await body({ name, diagnostic() {} }); }
        catch (error) {
          if (error.code === 'ERR_ASSERTION' || error.name === 'AssertionError') {
            assertions += 1;
            reply({ status: 'killed', suite, by: [name], kind: bounds.length ? 'named-assertion-with-counted-bound' : 'named-behavioral-assertion',
              assertion: { code: error.code, name: error.name, operator: error.operator || null, message: String(error.message).slice(0, 200) } });
            return;
          }
          failures.push({ suite, test: name, code: error.code || null, name: error.name, message: String(error.message).slice(0, 160) });
        }
      }
    }
    reply({ status: failures.length ? 'undecided' : 'survived', failures });
  } catch (error) {
    reply({ status: 'undecided', failures: [...failures, { code: error.code || null, name: error.name, message: String(error.message).slice(0, 160) }] });
  }
});
