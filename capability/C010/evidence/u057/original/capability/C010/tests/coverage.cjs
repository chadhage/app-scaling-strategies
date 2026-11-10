'use strict';

// Test tooling, not production code: per-file coverage gate. For EVERY production file it runs the L-0004 command on its own (one command per file,
// so a weak file cannot hide in an aggregate), parses that file's row and enforces 85 lines, 85 branches and 85 functions. A file that no test loads
// prints no row and counts as 0%. A root JavaScript file that is not enumerated below fails the gate. The test files named in TESTS are every test
// that loads production code in THIS process (the child-process suites, the flood, the oracle timing and the evidence tests measure other things).
// Usage: node capability\C010\tests\coverage.cjs   (heavy slot: about 3 minutes quiet, 3 commands at a time)
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const PRODUCTION = ['audit.cjs', 'codes.cjs', 'contract.js', 'page.js', 'server.cjs', 'store.cjs'];
const TESTS = ['anonymous', 'audit', 'batch', 'commit', 'contract', 'guard-boundaries', 'guard-close', 'guard-host', 'guard-requests', 'guard-server', 'hostile-fields', 'hostile-paths', 'idor', 'lists', 'operator',
  'page', 'page-learning', 'pipeline-inproc-a', 'pipeline-inproc-b', 'pipeline-inproc-c', 'property', 'quota', 'server-units', 'store', 'store-order', 'store-revisions', 'two-instances', 'uniform']
  .map((name) => path.join('capability', 'C010', 'tests', `${name}.test.cjs`));
const FLOOR = Object.freeze({ lines: 85, branches: 85, functions: 85 });
const PARALLEL = 3;
const NUMBER = '(\\d+(?:\\.\\d+)?)';

const rootScripts = fs.readdirSync(root).filter((name) => /\.c?js$/.test(name) && fs.statSync(path.join(root, name)).isFile()).sort();
const unenumerated = rootScripts.filter((name) => !PRODUCTION.includes(name));
const missing = PRODUCTION.filter((name) => !rootScripts.includes(name));
const environment = { ...process.env };
for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE', 'C010_SUBJECT_DIR']) delete environment[key];

function measure(file) {
  const args = ['--test', '--test-concurrency=1', '--test-timeout=120000', '--experimental-test-coverage', `--test-coverage-include=**/C010/${file}`,
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
      resolve({ file, loaded: Boolean(row), ...values, nestedExit: status, failedTests, failures });
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
  console.log(JSON.stringify({ gate: 'C010 per-file coverage (85/85/85, one L-0004 command per file, unloaded counts as 0%)', tests: TESTS.length, files: results, unenumerated, missing, passed }, null, 2));
  if (!passed) {
    console.error(`C010 coverage RED: ${results.filter((item) => item.failures.length).length} of ${PRODUCTION.length} production files below their floors; unenumerated: ${unenumerated.join(', ') || 'none'}.`);
    process.exitCode = 1;
  } else {
    console.log(`C010 coverage GREEN: ${PRODUCTION.length}/${PRODUCTION.length} production files at or above 85/85/85 each: ${PRODUCTION.join(', ')}.`);
  }
})();
