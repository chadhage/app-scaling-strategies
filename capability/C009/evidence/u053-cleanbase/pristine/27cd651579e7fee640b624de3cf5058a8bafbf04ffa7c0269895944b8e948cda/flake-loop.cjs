'use strict';

// Test tooling, not production code: a flake loop (derived from the independent reviewer's rep.cjs). It runs ONE test file of a
// namespace copy N times in parallel for M rounds, each run under a hard timeout (killed by PID), and prints every failing run.
// Usage: node capability\C009\tests\flake-loop.cjs <repository root> <test file name> <parallel> <rounds>
// The repository root may be a copy of the namespace (for example the first-publication bytes extracted with git archive).
// Take a heavy slot first (RUN\scripts\heavy-slot.ps1): 8 parallel runs load the whole machine.
const path = require('node:path');
const { spawn } = require('node:child_process');

const [repository, file, parallel = '8', rounds = '3'] = process.argv.slice(2);
if (!repository || !/^[a-z0-9.-]+\.test\.cjs$/.test(file || '')) throw new Error('Usage: node flake-loop.cjs <repository root> <name.test.cjs> <parallel> <rounds>');
const environment = { ...process.env };
delete environment.NODE_TEST_CONTEXT;
delete environment.NODE_V8_COVERAGE;
delete environment.C009_SUBJECT_DIR;

function run(id) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=60000', path.join('capability', 'C009', 'tests', file)], { cwd: repository, env: environment, windowsHide: true });
    let output = '';
    child.stdout.on('data', (chunk) => { output += chunk; });
    child.stderr.on('data', (chunk) => { output += chunk; });
    const hard = setTimeout(() => { child.kill('SIGKILL'); output += '\nHARD TIMEOUT'; }, 200000);
    child.on('close', (code) => {
      clearTimeout(hard);
      const failed = [...output.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]);
      const why = [...output.matchAll(/^\s+error: (.+)$/gm)].map((match) => match[1].slice(0, 160));
      resolve({ id, code, failed, why, seconds: Math.round((Date.now() - started) / 1000), tail: code === 0 ? '' : output.slice(-3000) });
    });
  });
}

(async () => {
  let total = 0;
  let bad = 0;
  for (let round = 1; round <= Number(rounds); round += 1) {
    const results = await Promise.all(Array.from({ length: Number(parallel) }, (_, index) => run(`${round}.${index + 1}`)));
    for (const result of results) {
      total += 1;
      if (result.code !== 0) {
        bad += 1;
        console.log(`BAD ${file} run ${result.id} exit=${result.code} ${result.seconds}s failed=${JSON.stringify(result.failed)} why=${JSON.stringify(result.why)}`);
        console.log(result.tail);
      }
    }
    console.log(`round ${round}: ${results.filter((result) => result.code === 0).length}/${results.length} ok, max ${Math.max(...results.map((result) => result.seconds))}s`);
  }
  console.log(`FLAKE HUNT ${file}: ${bad} bad of ${total}`);
})();
