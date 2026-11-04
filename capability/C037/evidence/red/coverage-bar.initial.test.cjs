'use strict';

const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { spawn } = require('node:child_process');
const repository = path.resolve(__dirname, '..', '..', '..', '..');
const production = ['routing.js', 'cli.cjs', 'page.js', 'authority.cjs', 'pins.cjs'];
const initial = ['routing.test.cjs', 'surface.test.cjs', 'authority.test.cjs'].map((name) => path.join('capability', 'C037', 'tests', name));
const measured = new Map();
function measure(file) {
  const args = ['--test', '--test-concurrency=1', '--experimental-test-coverage', '--test-reporter=tap',
    `--test-coverage-include=**/C037/${file}`, '--test-coverage-lines=85', '--test-coverage-branches=85',
    '--test-coverage-functions=85', ...initial];
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: repository, env, windowsHide: true, timeout: 720000 });
    let stdout = '';
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.resume();
    child.on('error', reject);
    child.on('close', (status) => {
      const match = new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s+\\|\\s+([0-9.]+)\\s+\\|\\s+([0-9.]+)\\s+\\|\\s+([0-9.]+)\\s+\\|`, 'm').exec(stdout);
      resolve({ file, status, loaded: Boolean(match), lines: match ? Number(match[1]) : 0,
        branches: match ? Number(match[2]) : 0, functions: match ? Number(match[3]) : 0 });
    });
  });
}
before(async () => {
  for (const result of await Promise.all(production.map(measure))) measured.set(result.file, result);
});
for (const file of production) {
  test(`${file} reaches 85% line, branch and function coverage over the initial non-browser suites`, () => {
    const result = measured.get(file);
    const note = `${file}: lines ${result.lines}%, branches ${result.branches}%, functions ${result.functions}%, ` +
      `${result.loaded ? 'loaded' : 'unloaded counts as 0%'}, unchanged coverage command exit ${result.status}`;
    for (const metric of ['lines', 'branches', 'functions']) {
      assert.ok(result[metric] >= 85, `${metric} below the 85% bar - ${note}`);
    }
  });
}
