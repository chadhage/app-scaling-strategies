'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const production = ['describe.js', 'page.js', 'saved.js', 'timeline.js'];
const [file] = process.argv.slice(2);
assert.equal(process.argv.length, 3);
assert.ok(production.includes(file));
assert.deepEqual(fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.(?:js|cjs|mjs)$/.test(entry.name))
  .map((entry) => entry.name).sort(), production, 'every first-party production script is enumerated');
const tests = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs')).sort().map((name) => path.join('capability', 'X001', 'tests', name));
delete process.env.NODE_TEST_CONTEXT;
delete process.env.NODE_V8_COVERAGE;
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
delete env.NODE_V8_COVERAGE;
const args = ['--test', '--test-concurrency=1', '--test-reporter=tap', '--experimental-test-coverage',
  `--test-coverage-include=capability/X001/${file}`, '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85', ...tests];
const run = spawnSync(process.execPath, args, { cwd: repository, env, windowsHide: true, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024 });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
if (run.error) throw run.error;
const row = new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s*\\|\\s*([\\d.]+)\\s*\\|\\s*([\\d.]+)\\s*\\|\\s*([\\d.]+)\\s*\\|`, 'm').exec(run.stdout);
const [lines, branches, functions] = row ? row.slice(1).map(Number) : [0, 0, 0];
const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((name) => [name, Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(run.stdout)?.[1])]));
const passed = Boolean(row) && [lines, branches, functions].every((value) => value >= 85) && run.status === 0
  && counts.tests > 0 && counts.pass === counts.tests && [counts.fail, counts.cancelled, counts.skipped, counts.todo].every((value) => value === 0);
console.log(JSON.stringify({ schema: 'X001-U049-per-file-coverage/1', file, production, tests, command: ['node', ...args],
  loaded: Boolean(row), lines, branches, functions, counts, nodeExit: run.status, threshold: 85, passed }));
process.exitCode = passed ? 0 : 1;
