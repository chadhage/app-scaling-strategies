'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { PRODUCTION } = require('./u053-authority.cjs');
const { childEnvironment } = require('./u053-environment.cjs');
const TESTS = Object.freeze([
  'audit-ring.test.cjs', 'authz.test.cjs', 'branches-page.test.cjs', 'branches-server.test.cjs', 'browser-retry.test.cjs',
  'cli-main.test.cjs', 'cli.test.cjs', 'connections.test.cjs', 'findings.test.cjs', 'fix-evidence.test.cjs',
  'fix2-evidence.test.cjs', 'fix3-evidence.test.cjs', 'guards.test.cjs', 'hostile-credentials.test.cjs', 'hostile-extra.test.cjs',
  'hostile-requests.test.cjs', 'imports.test.cjs', 'lanes.test.cjs', 'limits.test.cjs', 'node-own.test.cjs', 'page.test.cjs',
  'pipeline-node-own.test.cjs', 'pipeline-process.test.cjs', 'pipeline-refusal-http10.test.cjs', 'pipeline-refusal-mixed.test.cjs',
  'pipeline-refusal.test.cjs', 'quota.test.cjs', 'read-stop.test.cjs', 'readme-contract.test.cjs', 'red-archive.test.cjs',
  'refusal-close.test.cjs', 'refusal-flood.test.cjs', 'resources.test.cjs', 'server.test.cjs', 'timeouts.test.cjs',
  'two-instances.test.cjs', 'u053-predicate.test.cjs', 'u053.test.cjs', 'upgrade.test.cjs'
]);

function argumentsFor(mode, file, root = path.resolve(__dirname, '..')) {
  assert.deepEqual(fs.readdirSync(path.join(root, 'tests')).filter((name) => name.endsWith('.test.cjs')).sort(), [...TESTS].sort(), 'every test file is explicitly enumerated');
  assert.deepEqual(fs.readdirSync(root).filter((name) => /\.c?js$/.test(name)).sort(), [...PRODUCTION].sort(), 'every production file is explicitly enumerated');
  assert.ok(mode === 'suite' || mode === 'coverage-all' || (mode === 'coverage' && PRODUCTION.includes(file)), 'suite, or coverage of the enumerated production set');
  return ['--test', '--test-timeout=60000', '--test-concurrency=1',
    ...(['coverage', 'coverage-all'].includes(mode) ? ['--experimental-test-coverage',
      ...(mode === 'coverage-all' ? PRODUCTION : [file]).map((name) => `--test-coverage-include=**/C009/${name}`),
      '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85'] : []),
    ...TESTS.map((name) => path.join('capability', 'C009', 'tests', name))];
}

function coverageObservation(output, file) {
  assert.ok(PRODUCTION.includes(file), 'one enumerated file');
  const row = new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s+\\|\\s+([\\d.]+)\\s+\\|\\s+([\\d.]+)\\s+\\|\\s+([\\d.]+)\\s+\\|`, 'm').exec(output);
  const values = row ? row.slice(1).map(Number) : [0, 0, 0];
  return { file, loaded: Boolean(row), lines: values[0], branches: values[1], functions: values[2], passed: Boolean(row) && values.every((value) => value >= 85) };
}

if (require.main === module) {
  assert.ok(['suite', 'coverage-all'].includes(process.argv[2]) ? process.argv.length === 3 : process.argv.length === 4, 'closed runner arguments');
  const root = path.resolve(__dirname, '..');
  const env = childEnvironment();
  if (['coverage', 'coverage-all'].includes(process.argv[2])) delete env.NODE_V8_COVERAGE;
  const result = spawnSync(process.execPath, argumentsFor(process.argv[2], process.argv[3]), { cwd: path.resolve(root, '..', '..'),
    env, windowsHide: true, timeout: 1200000, maxBuffer: 64 * 1024 * 1024 });
  process.stdout.write(result.stdout || Buffer.alloc(0));
  process.stderr.write(result.stderr || Buffer.alloc(0));
  const measurements = process.argv[2] === 'coverage-all' ? PRODUCTION.map((file) => coverageObservation((result.stdout || Buffer.alloc(0)).toString('utf8'), file))
    : process.argv[2] === 'coverage' ? [coverageObservation((result.stdout || Buffer.alloc(0)).toString('utf8'), process.argv[3])] : [];
  if (measurements.length) console.log(`U053 COVERAGE ${JSON.stringify(measurements)}`);
  if (result.error) console.error(`U053 runner failed: ${result.error.code}`);
  process.exitCode = result.status === 0 && !result.error && measurements.every((entry) => entry.loaded && entry.passed) ? 0 : 1;
}
module.exports = Object.freeze({ TESTS, PRODUCTION, argumentsFor, coverageObservation });
