'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { childEnv } = require('./proc.cjs');

const root = path.resolve(__dirname, '..', '..', '..');
const options = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, i, all) =>
  value.startsWith('--') ? [...pairs, [value.slice(2), all[i + 1]]] : pairs, []));
const directory = path.resolve(options.report);
fs.mkdirSync(directory, { recursive: false });
const files = options.all === '1'
  ? fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs') && name !== 'evidence.test.cjs').sort()
  : (options.files || 'refusal-close.test.cjs').split(',');
const run = spawnSync(process.execPath, [
  '--require', path.join(__dirname, 'assertion-count.cjs'), '--test', '--test-concurrency=1', '--test-timeout=60000',
  ...files.map((file) => path.relative(root, path.join(__dirname, file)))
], { cwd: root, env: childEnv({ C022_ASSERTION_DIR: directory }), encoding: 'utf8', maxBuffer: 1 << 27, timeout: 1800000 });
process.stdout.write(run.stdout || '');
process.stderr.write(run.stderr || '');
assert.equal(run.status, 0, 'the instrumented tests themselves pass before their assertion census is judged');
const reports = fs.readdirSync(directory).filter((name) => /^assertions-\d+\.json$/.test(name))
  .map((name) => JSON.parse(fs.readFileSync(path.join(directory, name), 'utf8')));
assert.equal(reports.length, files.length, 'every executed file produced an assertion report');
const tests = reports.flatMap((report) => report.tests.map((test) => ({ file: report.file, ...test })));
assert.ok(tests.length > 0, 'the census executed tests');
const zero = tests.filter((test) => test.assertions === 0);
const result = { files: reports.length, executed: tests.length, zero, tests };
fs.writeFileSync(path.join(directory, 'counts.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(`ASSERTION CENSUS ${JSON.stringify({ files: reports.length, executed: tests.length, zero })}`);
assert.deepEqual(zero, [], 'each executed test must perform a positive number of assertions; an early return is not a skip');
