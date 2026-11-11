'use strict';

// Test tooling, not production code: per-file coverage gate. For EVERY production file it runs the L-0004 command on its own (one command per file,
// so a weak file cannot hide in an aggregate), parses that file's row and enforces 85 lines, 85 branches and 85 functions. A file that no test loads
// prints no row and counts as 0%. A root JavaScript file that is not enumerated below fails the gate. The test files named in TESTS are every test
// that loads production code in THIS process (the child-process suites, the flood and burst tests and the evidence tests measure other things).
// Usage: node capability\C011\tests\coverage.cjs   (heavy slot: one command at a time)
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const PRODUCTION = ['codes.cjs', 'config.cjs', 'contract.js', 'json.cjs', 'page.js', 'server.cjs', 'store.cjs'];
const TESTS = ['audit', 'batch', 'cancellation-final', 'cancellation-order-final', 'commit', 'config', 'config-final', 'contract', 'guard-bounds-final', 'guards-final', 'hostile', 'idempotency', 'json', 'leaks', 'lifecycle', 'limits', 'page', 'u068-history', 'u068-ledger-store', 'u068-page', 'pipeline-inproc-a', 'pipeline-inproc-b', 'pipeline-inproc-c', 'property',
  'race', 'reserve', 'roles', 'store', 'store-more', 'two-instances']
  .map((name) => path.join('capability', 'C011', 'tests', `${name}.test.cjs`));
const FLOOR = Object.freeze({ lines: 85, branches: 85, functions: 85 });
const PARALLEL = 1;
const NUMBER = '(\\d+(?:\\.\\d+)?)';

const rootScripts = fs.readdirSync(root).filter((name) => /\.c?js$/.test(name) && fs.statSync(path.join(root, name)).isFile()).sort();
const unenumerated = rootScripts.filter((name) => !PRODUCTION.includes(name));
const missing = PRODUCTION.filter((name) => !rootScripts.includes(name));
const environment = { ...process.env };
for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C011_SUBJECT_DIR']) delete environment[key];

function measure(file) {
  const args = ['--test', '--test-concurrency=1', '--test-timeout=120000', '--experimental-test-coverage', `--test-coverage-include=${path.join(root, file)}`,
    '--test-coverage-lines=85', '--test-coverage-branches=85', '--test-coverage-functions=85', ...TESTS];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: repository, env: environment, windowsHide: true });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timer = setTimeout(() => child.kill(), 1500000);
    child.on('close', (status) => {
      clearTimeout(timer);
      const row = new RegExp(`^#\\s+${file.replace('.', '\\.')}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|\\s+${NUMBER}\\s+\\|`, 'm').exec(out);
      const values = row ? { lines: Number(row[1]), branches: Number(row[2]), functions: Number(row[3]) } : { lines: 0, branches: 0, functions: 0 };
      const failures = row ? [] : ['UNLOADED_COUNTS_AS_ZERO'];
      for (const metric of Object.keys(FLOOR)) if (values[metric] < FLOOR[metric]) failures.push(`${metric} ${values[metric]} < ${FLOOR[metric]}`);
      if (status !== 0) failures.push(`nested runner exit ${status}`);
      const failedTests = [...out.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim());
      const summary = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((key) => [key, Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(out)?.[1] ?? -1)]));
      if (process.env.C011_COVERAGE_OUT) {
        fs.mkdirSync(process.env.C011_COVERAGE_OUT, { recursive: true });
        fs.writeFileSync(path.join(process.env.C011_COVERAGE_OUT, file + '.original-output.txt'), out, { flag: 'wx' });
        fs.writeFileSync(path.join(process.env.C011_COVERAGE_OUT, file + '.command.json'), JSON.stringify({ args, status, summary }, null, 2), { flag: 'wx' });
      }
      resolve({ file, loaded: Boolean(row), ...values, nestedExit: status, summary, failedTests, failures });
    });
  });
}

(async () => {
  const results = [];
  const queue = [...PRODUCTION];
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (queue.length) results.push(await measure(queue.shift()));
  }));
  results.sort((left, right) => left.file.localeCompare(right.file));
  const passed = unenumerated.length === 0 && missing.length === 0 && results.every((item) => item.failures.length === 0);
  const report = { gate: 'C011 per-file coverage (85/85/85, one L-0004 command per file, unloaded counts as 0%)', tests: TESTS.length, files: results, unenumerated, missing, passed };
  if (process.env.C011_COVERAGE_REPORT) fs.writeFileSync(process.env.C011_COVERAGE_REPORT, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(report, null, 2));
  if (!passed) {
    console.error(`C011 coverage RED: ${results.filter((item) => item.failures.length).length} of ${PRODUCTION.length} production files below their floors; unenumerated: ${unenumerated.join(', ') || 'none'}.`);
    process.exitCode = 1;
  } else {
    console.log(`C011 coverage GREEN: ${PRODUCTION.length}/${PRODUCTION.length} production files at or above 85/85/85 each: ${PRODUCTION.join(', ')}.`);
  }
})();
