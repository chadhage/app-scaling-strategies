'use strict';

// Test tooling, not production code: the whole suite of the namespace except the integrity and README tests (they read the captures of this run), ONE test file per child
// process, one after the other (`node --test --test-concurrency=1 <file>`), so that the time of every FILE is known: the review of the second fix asked which files are slowest
// and wants every file under the 60 s cap of the shared runner. It prints one JSON document (schema C014-suite/1: the cap, one row per file, the totals) and then the totals the
// way node:test prints them, so that the recorder reads them. Exit 1 when a test fails, is cancelled or skipped, a file exits non-zero, or a file takes the cap or more.
// Usage (repository root): node capability\C014\tests\suite.cjs
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const CAP_MS = 60000;
const KEYS = ['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'];
// The integrity and README tests are not in it: they read the captures that this very run produces, so they run on their own and inside the fresh trees.
const EXCLUDED = new Set(['integrity.test.cjs', 'readme.test.cjs']);
const files = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs') && !EXCLUDED.has(name)).sort();

function runFile(name) {
  const env = { ...process.env, NODE_V8_COVERAGE: '' };
  delete env.NODE_TEST_CONTEXT;
  const started = Date.now();
  const run = spawnSync(process.execPath, ['--require', path.join(__dirname, 'scratch-cwd.cjs'), '--test', '--test-concurrency=1', path.join(__dirname, name)], { env, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  const text = (run.stdout || '').replace(/\r\n/g, '\n');
  const count = (key) => Number((new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text) || [0, 0])[1]);
  const row = { file: name, exit: run.status, ...Object.fromEntries(KEYS.map((key) => [key, count(key)])), durationMs: Date.now() - started };
  if (run.status !== 0) process.stderr.write(`${name}: exit ${run.status}\n${text.split('\n').filter((line) => /^not ok|^# (fail|cancelled)|Error/.test(line)).slice(0, 20).join('\n')}\n${String(run.stderr || '').slice(0, 2000)}\n`);
  return row;
}

const rows = files.map(runFile);
const totals = Object.fromEntries(KEYS.map((key) => [key, rows.reduce((sum, row) => sum + row[key], 0)]));
const overCap = rows.filter((row) => row.durationMs >= CAP_MS).map((row) => row.file);
const broken = rows.filter((row) => row.exit !== 0 || row.tests === 0 || row.pass !== row.tests).map((row) => row.file);
console.log(JSON.stringify({ schema: 'C014-suite/1', capMs: CAP_MS, files: rows, totals, overCap, broken }, null, 1));
for (const key of KEYS) console.log(`# ${key} ${totals[key]}`);
if (overCap.length > 0 || broken.length > 0 || totals.fail + totals.cancelled + totals.skipped + totals.todo > 0) process.exitCode = 1;
