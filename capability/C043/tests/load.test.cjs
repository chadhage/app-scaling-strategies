'use strict';

// No absolute time decides a resource test (self-review line 12; the second-round coverage run failed 'the flood ended
// within 16475 ms' on a loaded machine). The SERVER CHILD of every resource test is stalled once, at its first accepted
// connection, for longer than the wall-clock bounds the first version of the tests asserted (event-loop lag 4 s, GET
// latency 6 s, flood 12 s, keep-alive close 3 s). A CORRECT server that the scheduler did not run must still pass: the
// facts the tests decide on are closed sockets, answered probes, a collected heap and the configured timers. Requested
// blocks are proved by explicitly armed counters, not a native histogram that may miss its first sample.
const path = require('node:path');
const test = require('node:test');
const { spawnSync } = require('node:child_process');
const { assert } = require('./support.cjs');
const { observationProblems } = require('./u059-stall-observer.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const STALL_MS = 5000;

test('a correct server that is stalled for 5 s still passes every resource test: no wall-clock bound decides one', { timeout: 900000 }, () => {
  const env = { ...process.env, C043_KINDS: 'get-body,invalid-preset-400', C043_FLOOD: '4', C043_STALL_MS: String(STALL_MS) };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'C043_MUTANT']) delete env[key];
  // The replay preload of the RED (old-flood.preload.cjs) arrives through the inherited NODE_OPTIONS: keep it.
  env.NODE_OPTIONS = [process.env.NODE_OPTIONS, `--require=${path.join(__dirname, 'stall.preload.cjs')}`].filter(Boolean).join(' ');
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', path.join(__dirname, 'resources.test.cjs')], {
    cwd: repository, env, encoding: 'utf8', timeout: 800000, windowsHide: true, maxBuffer: 64 * 1024 * 1024,
  });
  const output = `${result.stdout}${result.stderr}`;
  assert.equal(result.status, 0, `the resource tests failed under a stalled server:\n${output.slice(-4000)}`);
  assert.match(output, /^# fail 0$/m);
  const counted = (name) => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(output)?.[1] ?? NaN);
  assert.deepEqual([counted('tests'), counted('pass'), counted('skipped'), counted('cancelled')], [11, 11, 0, 0], 'nine tests and two flood kinds, every one passed');
  const observations = [...output.matchAll(/stall-observation (\S+): (\{[^\r\n]+\})/g)]
    .map((match) => ({ kind: match[1], facts: JSON.parse(match[2]) }));
  assert.deepEqual(observations.map((entry) => entry.kind).sort(), ['get-body', 'invalid-preset-400'], 'each declared flood kind reports exactly one armed observation');
  for (const { kind, facts } of observations) assert.deepEqual(observationProblems(facts, STALL_MS), [], `${kind}: requested block is explicitly exercised`);
});
