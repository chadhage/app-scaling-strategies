'use strict';

// Test tooling, not production code: per-file coverage gate. For EVERY production file it runs the L-0004 command on its own (one command
// per file, so a weak file cannot hide in an aggregate), parses that file's row and enforces 85 lines, 85 branches and 85 functions. A file
// that no test loads prints no row and counts as 0%. A root JavaScript file that is not enumerated below fails the gate.
// Usage (heavy slot, about 5 to 10 minutes): node capability\C022\tests\coverage.cjs
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const PRODUCTION = ['contract.js', 'identity.cjs', 'page.js', 'server.cjs', 'service.cjs', 'store.cjs'];
const FLOOR = Object.freeze({ lines: 85, branches: 85, functions: 85 });
const PARALLEL = 3;
const NUMBER = '(\\d+(?:\\.\\d+)?)';

const rootScripts = fs.readdirSync(root).filter((name) => /\.c?js$/.test(name) && fs.statSync(path.join(root, name)).isFile()).sort();
const unenumerated = rootScripts.filter((name) => !PRODUCTION.includes(name));
const missing = PRODUCTION.filter((name) => !rootScripts.includes(name));
const tests = fs.readdirSync(__dirname).filter((name) => name.endsWith('.test.cjs') && name !== 'evidence.test.cjs').sort().map((name) => path.join('capability', 'C022', 'tests', name));
const environment = { ...process.env };
for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C022_SUBJECT_DIR']) delete environment[key];

// A killed test child used to leave a truncated V8 coverage file and the report then failed as a whole ("Could not report code coverage ...
// Unexpected end of JSON input"), with no row. Children no longer inherit NODE_V8_COVERAGE (proc.cjs childEnv), and a run whose report could not
// be written is run ONCE more; a real failure (a floor missed, an unloaded file, a failing test) is never retried and never hidden.
const COVERAGE_WARNING = /Could not report code coverage/;
const retryable = (result) => !result.loaded && result.warning;
async function withRetry(run, file) {
  const first = await run(file);
  if (!retryable(first)) return first;
  return { ...(await run(file)), retried: { reason: 'the coverage report could not be written', failures: first.failures } };
}

function measure(file) {
  const args = ['--test', '--test-concurrency=1', '--test-timeout=600000', '--experimental-test-coverage', `--test-coverage-include=**/C022/${file}`,
    '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85', ...tests];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: repository, env: environment, windowsHide: true });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timer = setTimeout(() => child.kill(), 1200000);
    child.on('close', (status) => {
      clearTimeout(timer);
      const row = new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|`, 'm').exec(out);
      const values = row ? { lines: Number(row[1]), branches: Number(row[2]), functions: Number(row[3]) } : { lines: 0, branches: 0, functions: 0 };
      const failures = row ? [] : ['UNLOADED_COUNTS_AS_ZERO'];
      for (const metric of Object.keys(FLOOR)) if (values[metric] < FLOOR[metric]) failures.push(`${metric} ${values[metric]} < ${FLOOR[metric]}`);
      if (status !== 0) failures.push(`nested runner exit ${status}`);
      resolve({ file, loaded: Boolean(row), ...values, nestedExit: status, warning: COVERAGE_WARNING.test(out), failedTests: [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()), failures });
    });
  });
}

async function main() {
  const results = [];
  const queue = [...PRODUCTION];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (queue.length) results.push(await withRetry(measure, queue.shift()));
  }));
  results.sort((left, right) => left.file.localeCompare(right.file));
  const passed = unenumerated.length === 0 && missing.length === 0 && results.every((item) => item.failures.length === 0);
  console.log(JSON.stringify({ gate: 'C022 per-file coverage (85/85/85, one L-0004 command per file, unloaded counts as 0%)', tests: tests.length, files: results, unenumerated, missing, passed }, null, 2));
  if (!passed) {
    console.error(`C022 coverage RED: ${results.filter((item) => item.failures.length).length} of ${PRODUCTION.length} production files below their floors; unenumerated: ${unenumerated.join(', ') || 'none'}.`);
    process.exitCode = 1;
  } else {
    console.log(`C022 coverage GREEN: ${PRODUCTION.length}/${PRODUCTION.length} production files at or above 85/85/85 each: ${PRODUCTION.join(', ')}.`);
  }
}

if (require.main === module) main();
module.exports = Object.freeze({ retryable, withRetry });
