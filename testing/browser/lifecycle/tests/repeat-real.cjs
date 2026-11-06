'use strict';

// Repeat runner for the real-process scenario (test tooling, not production code): runs tests\real-tree.test.cjs in a fresh
// node process N times in a row, then scans read-only for fixture processes left behind. It terminates nothing itself.
// Usage: node testing\browser\lifecycle\tests\repeat-real.cjs [--runs=20] [--timeout-ms=300000]
// Exit code 0 only when every run passed and no fixture process was left after any run.

const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { readLeftovers } = require('./support/leftovers.cjs');

const option = (name, fallback) => {
  const argument = process.argv.slice(2).find((candidate) => candidate.startsWith(`--${name}=`));
  return argument ? Number(argument.slice(name.length + 3)) : fallback;
};
const runs = option('runs', 20);
const timeout = option('timeout-ms', 300000);
const target = path.join(__dirname, 'real-tree.test.cjs');
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_V8_COVERAGE;

const summary = [];
for (let index = 1; index <= runs; index += 1) {
  const started = Date.now();
  const result = spawnSync(process.execPath, ['--test', '--test-concurrency=1', target], {
    env, encoding: 'utf8', windowsHide: true, timeout, killSignal: 'SIGKILL', maxBuffer: 64 * 1024 * 1024,
  });
  const count = (name) => Number((new RegExp(`^# ${name} (\\d+)$`, 'm').exec(result.stdout || '') || [])[1]);
  const leftovers = readLeftovers();
  const row = {
    run: index, exit: result.status, signal: result.signal, tests: count('tests'), pass: count('pass'), fail: count('fail'),
    durationMs: Date.now() - started, leftovers: leftovers.length,
  };
  summary.push(row);
  console.log(JSON.stringify(row));
  if (result.status !== 0) console.log(`--- run ${index} output ---\n${result.stdout}\n${result.stderr}`);
}
const clean = summary.length === runs && summary.every((row) => row.exit === 0 && row.fail === 0 && row.leftovers === 0);
console.log(JSON.stringify({ runs, clean, passed: summary.filter((row) => row.exit === 0).length, leftoversTotal: summary.reduce((sum, row) => sum + row.leftovers, 0) }));
process.exitCode = clean ? 0 : 1;
