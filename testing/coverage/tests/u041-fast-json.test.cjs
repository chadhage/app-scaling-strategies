'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { fs, path, subject, load, makeScratch, dispose } = require('./u041-support.cjs');
const { fakeRunner, tapSummary, lcovRecord } = require('./support.cjs');
const { SCHEMA } = require('../evaluate.cjs');

test('U041 named conflict-handler mutant: REPORT_CHANGED leaves a foreign winner byte-identical', async (t) => {
  const { main } = load('gate.cjs');
  const base = makeScratch('u041-fast-conflict');
  t.after(() => dispose(base));
  const target = path.join(base, 'report.json');
  const precious = '{"schema":"U009-coverage-gate/1","pass":true,"winner":"independent"}\n';
  const stdout = [];
  const run = fakeRunner(({ include }) => {
    fs.rmSync(target);
    fs.writeFileSync(target, precious);
    return { run: { stdout: tapSummary() }, lcov: lcovRecord(include) };
  });
  const exit = await main(['--root', path.join(subject, 'fixtures', 'pass'), '--json', target, '--scratch', base], {
    fsApi: fs, cwd: base, repoRoot: path.resolve(subject, '..', '..'), env: {}, run,
    stdout: (text) => stdout.push(text), stderr: () => {}
  });
  assert.equal(exit, 1);
  assert.deepEqual([JSON.parse(stdout.join('')).schema, JSON.parse(stdout.join('')).error.code], [SCHEMA, 'REPORT_CHANGED']);
  assert.equal(fs.readFileSync(target, 'utf8'), precious, 'the displaced writer may report failure only on its own stdout');
});

test('U041 named equals/empty mutants: one scalar JSON rule accepts both forms and rejects empty values', () => {
  const { parseArgs } = load('gate.cjs');
  assert.deepEqual(parseArgs(['--root', 'r', '--json=a.json']), parseArgs(['--root', 'r', '--json', 'a.json']));
  for (const args of [['--json='], ['--json', '']]) {
    assert.throws(() => parseArgs(['--root', 'r', ...args]), (error) => error.code === 'USAGE' && /needs a value/.test(error.message));
  }
});
