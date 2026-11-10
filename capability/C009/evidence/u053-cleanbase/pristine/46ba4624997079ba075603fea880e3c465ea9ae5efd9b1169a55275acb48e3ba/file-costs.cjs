'use strict';

// Test tooling, not production code: the cost of the heavy test files (review F9c), one run of each file after the other, each under the
// 60 s of the suite command. Usage: node capability\C009\tests\file-costs.cjs <repository root> [test file name ...]
// The repository root may be another copy of the namespace (for example the second-fix bytes extracted with git archive). Without file
// names it measures the files that took part in the review: the three heavy process files, the three parts of the in-process matrix, the
// third-hole matrix, the CLI file and the evidence test. It prints one line per file:
//   COST <file> <wall seconds> exit <code> tests <n> pass <n> fail <n> cancelled <n>        (missing: COST <file> missing)
// and COSTS DONE. A cost is EVIDENCE of how long a file takes on this machine at this load, never an assertion. The load itself comes
// from load-loop.cjs (burners), or from whatever else the machine runs.
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const [repository, ...given] = process.argv.slice(2);
if (!repository) throw new Error('Usage: node file-costs.cjs <repository root> [name.test.cjs ...]');
const DEFAULT = ['refusal-flood', 'pipeline-process', 'resources', 'pipeline-refusal', 'pipeline-refusal-http10', 'pipeline-refusal-mixed', 'pipeline-node-own', 'cli', 'fix2-evidence'].map((name) => `${name}.test.cjs`);
const files = given.length ? given : DEFAULT;
const environment = { ...process.env };
delete environment.NODE_TEST_CONTEXT;
delete environment.NODE_V8_COVERAGE;
delete environment.C009_SUBJECT_DIR;

function cost(file) {
  const relative = path.join('capability', 'C009', 'tests', file);
  if (!fs.existsSync(path.join(repository, relative))) return Promise.resolve(`COST ${file} missing`);
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=60000', relative], { cwd: repository, env: environment, windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const hard = setTimeout(() => child.kill('SIGKILL'), 150000);
    child.on('close', (code) => {
      clearTimeout(hard);
      const count = (key) => Number((output.match(new RegExp(`^# ${key} (\\d+)`, 'm')) || [])[1] || 0);
      resolve(`COST ${file} ${((Date.now() - started) / 1000).toFixed(1)} exit ${code} tests ${count('tests')} pass ${count('pass')} fail ${count('fail')} cancelled ${count('cancelled')}`);
    });
  });
}

(async () => {
  for (const file of files) console.log(await cost(file));
  console.log('COSTS DONE');
})();
