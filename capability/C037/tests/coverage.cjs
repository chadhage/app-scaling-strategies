'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const production = ['routing.js', 'cli.cjs', 'page.js', 'authority.cjs', 'pins.cjs'];
const suites = ['routing', 'surface', 'authority', 'page', 'cli', 'pins'].map((name) => path.join('capability', 'C037', 'tests', `${name}.test.cjs`));
const bar = 85;
if (process.argv.length !== 2) throw new Error('No coverage overrides: the file set and the bar are enumerated here.');
// The set is enumerated, never discovered; this only proves that no root JavaScript production file was left out.
assert.deepEqual([...production].sort(), fs.readdirSync(root).filter((name) => /\.(?:cjs|js)$/.test(name)).sort());
function measure(file) {
  const args = ['--test', '--test-concurrency=1', '--experimental-test-coverage', '--test-reporter=tap',
    `--test-coverage-include=**/C037/${file}`, `--test-coverage-lines=${bar}`, `--test-coverage-branches=${bar}`,
    `--test-coverage-functions=${bar}`, ...suites];
  const env = { ...process.env };
  for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C037_CAPTURE_DIR']) delete env[name];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: repository, env, windowsHide: true, timeout: 840000 });
    const chunks = [];
    const errors = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => errors.push(chunk));
    child.on('error', reject);
    child.on('close', (status) => {
      const stdout = Buffer.concat(chunks).toString('utf8');
      const match = new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s+\\|\\s+([0-9.]+)\\s+\\|\\s+([0-9.]+)\\s+\\|\\s+([0-9.]+)\\s+\\|`, 'm').exec(stdout);
      const report = /^# start of coverage report[\s\S]*?^# end of coverage report/m.exec(stdout)?.[0] ?? '(no coverage report: the file was never loaded)';
      resolve({ file, status, command: ['node', ...args].join(' '), stdout, stderr: Buffer.concat(errors).toString('utf8'), report,
        tally: ['tests', 'pass', 'fail'].map((name) => new RegExp(`^# ${name} (\\d+)`, 'm').exec(stdout)?.[1]),
        loaded: Boolean(match), lines: match ? Number(match[1]) : 0, branches: match ? Number(match[2]) : 0, functions: match ? Number(match[3]) : 0 });
    });
  });
}
(async () => {
  const results = await Promise.all(production.map(measure));
  const failures = [];
  for (const result of results) {
    console.log(`=== ${result.file}: ${result.command}`);
    console.log(result.report);
    console.log(`tests ${result.tally[0]}, pass ${result.tally[1]}, fail ${result.tally[2]}; unchanged coverage command exit ${result.status}`);
    if (result.stderr.trim()) console.log(`stderr: ${result.stderr.trim()}`);
    for (const metric of ['lines', 'branches', 'functions']) {
      if (!(result[metric] >= bar)) failures.push(`${result.file} ${metric} ${result[metric]}% is below ${bar}%${result.loaded ? '' : ' (unloaded counts as 0%)'}`);
    }
    if (result.status !== 0) failures.push(`${result.file}: the unchanged coverage command exited ${result.status}`);
    if (result.tally[2] !== '0') failures.push(`${result.file}: ${result.tally[2]} failing tests in the coverage run`);
  }
  console.log('--- per-file summary (line % / branch % / function %)');
  for (const result of results) console.log(`${result.file.padEnd(14)} ${result.lines.toFixed(2).padStart(6)} / ${result.branches.toFixed(2).padStart(6)} / ${result.functions.toFixed(2).padStart(6)}`);
  if (failures.length) {
    console.error(`C037 coverage RED: ${failures.join('; ')}`);
    process.exitCode = 1;
    return;
  }
  console.log(`C037 coverage GREEN: ${production.length} enumerated production files each reach at least ${bar}% line, branch and function coverage; ` +
    'unloaded files count as 0%; read-state.ps1 (PowerShell) is not measurable by the Node command and is exercised end to end by the State readers.');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
