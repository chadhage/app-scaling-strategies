'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fs, path, subject, load, startNode, makeScratch, dispose } = require('./u041-support.cjs');
const { fakeRunner, tapSummary, lcovRecord } = require('./support.cjs');

test('U041 P4: current timing and the historical 64-run loop scope agree with recorded observations', () => {
  const readme = fs.readFileSync(path.join(subject, 'README.md'), 'utf8');
  const observations = require('../evidence/u041/reviewer-observations.json');
  const minimum = Math.min(...observations.suiteTimesSeconds);
  const maximum = Math.max(...observations.suiteTimesSeconds);
  const commands = readme.split('## What it measures')[0];
  assert.match(commands, new RegExp(`${minimum} to ${maximum} s`), 'the current command hint uses the measured reviewer range');
  assert.doesNotMatch(commands, /about 35 s|72 to 172 s/, 'the contradicted current timing hint is removed');
  const loop = JSON.parse(fs.readFileSync(path.join(subject, 'evidence', 'fix2', 'loops', 'files-strict.json'), 'utf8'));
  const files = loop.command.filter((argument) => argument.endsWith('.test.cjs')).map((argument) => argument.split(/[\\/]/).pop());
  assert.deepEqual(files, observations.historicalLoop.testFiles);
  const sentence = readme.split('\n').find((line) => line.includes('**Busy-machine loops**'));
  for (const file of files) assert.equal(sentence.includes(file), true, `the historical loop scope names ${file}`);
  assert.doesNotMatch(sentence, /64 runs 8-way of the changed test files/);
});

test('U041 P4: the default hermetic copy is an explicit opt-in skip, not a silent passing return', async () => {
  const process = startNode([
    '--test', '--test-concurrency=1', '--test-name-pattern=^N2: the evidence test passes in a copy',
    path.join(subject, 'tests', 'fix2-hermetic.test.cjs')
  ], { env: { U009_HEAVY_HERMETIC: undefined, U009_EVIDENCE_CAPTURE: undefined } });
  try {
    const run = await process.done;
    assert.equal(run.status, 0, run.stderr);
    assert.match(run.stdout, /N2: the evidence test passes in a copy[^\n]*# SKIP[^\n]*U009_HEAVY_HERMETIC=1/, 'the expensive copy did not execute by default');
  } finally {
    await process.close();
  }
});

test('U041 P4: every full self-gate child enables heavy hermetic checks without the capture bypass', async (t) => {
  const { parseArgs, runGate } = load('gate.cjs');
  const base = makeScratch('u041-self-policy');
  t.after(() => dispose(base));
  const run = fakeRunner(({ include }) => ({ run: { stdout: tapSummary() }, lcov: lcovRecord(include) }));
  const result = await runGate(parseArgs(['--root', subject, '--scratch', base]), {
    fsApi: fs, cwd: base, repoRoot: path.resolve(subject, '..', '..'), env: {}, run, nodeExecutable: 'fixture-node',
    nodeVersion: 'v22.23.4', defaultScratch: base
  });
  assert.equal(result.report.files.length, 9, 'the whole enumerated production set is retained');
  assert.equal(result.exitCode, 0);
  for (const call of run.calls) {
    assert.equal(call.options.env.U009_HEAVY_HERMETIC, '1', `${call.include}: strict self-gate includes the heavy cases`);
    assert.notEqual(call.options.env.U009_EVIDENCE_CAPTURE, '1');
  }
});
