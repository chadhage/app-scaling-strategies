'use strict';

// Review minor m2 of the first publication: the per-file coverage capture was flaky under load because the test children (proc.cjs, the two flood
// tests) deleted only NODE_TEST_CONTEXT, so they inherited NODE_V8_COVERAGE and a killed child left a truncated V8 JSON file that failed the whole
// report ("Could not report code coverage. SyntaxError: Unexpected end of JSON input", no rows, exit 1). Now: every spawn of a node child builds
// its environment with childEnv (or removes the variable itself), and coverage.cjs runs a run whose report could not be written once more.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { test } = require('node:test');
const { childEnv } = require('./proc.cjs');
const { retryable, withRetry } = require('./coverage.cjs');

function withEnvironment(values, step) {
  const saved = Object.fromEntries(Object.keys(values).map((key) => [key, process.env[key]]));
  Object.assign(process.env, values);
  try { return step(); } finally { for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}

// The scratch directory of the control children: ABSOLUTE, unique, inside this namespace's own gitignored tests\scratch (never the working directory, never
// a relative path: a relative NODE_V8_COVERAGE made every control child write a coverage-*.json of about 95 KB into the repository root). It is the
// value of their NODE_V8_COVERAGE and their working directory, so whatever V8 writes lands there, and it is removed in finally.
function scratchDirectory() {
  const parent = path.join(__dirname, 'scratch');
  fs.mkdirSync(parent, { recursive: true });
  return fs.mkdtempSync(path.join(parent, 'child-env-'));
}

// The working directory of this test run, the repository root and this namespace: what they hold must be the same after the control children ran.
const PLACES = [...new Set([process.cwd(), path.resolve(__dirname, '..', '..', '..'), path.resolve(__dirname, '..')].map((place) => path.resolve(place)))];
const listing = () => Object.fromEntries(PLACES.map((place) => [place, fs.readdirSync(place).sort()]));

test('childEnv gives a child an EMPTY NODE_V8_COVERAGE (deleting it would change nothing: Node adds the parent\'s value back) and never changes the environment of this process; the control children leave nothing behind', () => {
  const scratch = scratchDirectory();
  const before = listing();
  try {
    withEnvironment({ NODE_V8_COVERAGE: scratch, NODE_TEST_CONTEXT: 'child-v8', C022_KEPT: 'kept' }, () => {
      const env = childEnv({ C022_EXTRA: 'extra' });
      assert.equal(env.NODE_V8_COVERAGE, '', 'an own, empty property: the only thing that stops Node from handing its own value down');
      assert.equal(Object.hasOwn(env, 'NODE_TEST_CONTEXT'), false);
      assert.deepEqual([env.C022_KEPT, env.C022_EXTRA], ['kept', 'extra']);
      assert.equal(process.env.NODE_V8_COVERAGE, scratch, 'this process keeps its own variable');
      const show = ['-e', 'process.stdout.write(JSON.stringify([process.env.NODE_V8_COVERAGE ?? null, process.env.NODE_TEST_CONTEXT ?? null, process.env.C022_KEPT ?? null]))'];
      const child = spawnSync(process.execPath, show, { env: childEnv(), cwd: scratch, encoding: 'utf8' });
      assert.deepEqual(JSON.parse(child.stdout), ['', null, 'kept'], 'a real child reads no coverage directory');
      assert.deepEqual(fs.readdirSync(scratch), [], 'and so it writes no coverage file');
      const deleted = Object.fromEntries(Object.entries(process.env).filter(([key]) => key !== 'NODE_V8_COVERAGE'));
      const inherited = JSON.parse(spawnSync(process.execPath, show, { env: deleted, cwd: scratch, encoding: 'utf8' }).stdout)[0];
      assert.equal(inherited, scratch, 'the control: a deleted variable is handed down again by Node, which is why childEnv sets it empty');
      assert.equal(fs.readdirSync(scratch).filter((name) => /^coverage-.*\.json$/.test(name)).length, 1, 'the control child wrote its V8 coverage into the scratch directory, which is the leak that childEnv prevents');
    });
    assert.deepEqual(listing(), before, 'no new entry in the working directory, the repository root or this namespace');
  } finally {
    fs.rmSync(scratch, { recursive: true, force: true });
  }
});

test('every test file and tool that spawns a node child gives it an empty NODE_V8_COVERAGE', () => {
  const spawning = fs.readdirSync(__dirname).filter((name) => name.endsWith('.cjs'))
    .filter((name) => /\b(spawn|spawnSync|fork)\(\s*process\.execPath/.test(fs.readFileSync(path.join(__dirname, name), 'utf8')));
  for (const needed of ['proc.cjs', 'pending-flood.test.cjs', 'refusal-flood.test.cjs', 'imports.test.cjs', 'coverage.cjs', 'loop.cjs', 'fresh.cjs', 'mutate-run.cjs']) assert.ok(spawning.includes(needed), `${needed} is recognized as a spawning file`);
  for (const name of spawning) {
    const source = fs.readFileSync(path.join(__dirname, name), 'utf8');
    assert.match(source, /childEnv\(|NODE_V8_COVERAGE = ''|NODE_V8_COVERAGE: ''|'NODE_V8_COVERAGE'/, `${name} spawns a node child: it must not pass NODE_V8_COVERAGE on`);
    assert.doesNotMatch(source, /delete\s+\w+\.NODE_V8_COVERAGE/, `${name}: a deleted NODE_V8_COVERAGE is handed down again by Node`);
  }
});

test('a coverage run whose report could not be written is run once more, and only that: a real failure is never retried and never hidden', async () => {
  const warned = { file: 'x.js', loaded: false, warning: true, failures: ['UNLOADED_COUNTS_AS_ZERO', 'nested runner exit 1'] };
  const good = { file: 'x.js', loaded: true, warning: false, failures: [] };
  const weak = { file: 'x.js', loaded: true, warning: false, failures: ['lines 80 < 85'] };
  const unloaded = { file: 'x.js', loaded: false, warning: false, failures: ['UNLOADED_COUNTS_AS_ZERO'] };
  assert.deepEqual([warned, good, weak, unloaded].map(retryable), [true, false, false, false]);
  const counting = (...results) => { const log = { calls: 0 }; return { log, run: async () => results[Math.min(log.calls++, results.length - 1)] }; };
  const recovered = counting(warned, good);
  const result = await withRetry(recovered.run, 'x.js');
  assert.equal(recovered.log.calls, 2);
  assert.deepEqual([result.loaded, result.retried.failures], [true, warned.failures], 'the second run is the result, the first is reported');
  const stubborn = counting(warned, warned);
  const twice = await withRetry(stubborn.run, 'x.js');
  assert.deepEqual([stubborn.log.calls, twice.loaded], [2, false], 'never a third run, and the failure stays visible');
  for (const single of [good, weak, unloaded]) {
    const once = counting(single);
    assert.equal(await withRetry(once.run, 'x.js'), single);
    assert.equal(once.log.calls, 1);
  }
});
