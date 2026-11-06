'use strict';

// Test tooling, not production code (U040, checklist line 12): runs the two U040 behaviour suites <runs> times with <parallel> runs at once,
// on the machine as it is, and exits 0 only when every run exited 0 with the same positive number of tests, every test passed and none was
// cancelled, skipped or marked todo. One run is exactly the replay command: node --test --test-concurrency=1 over the two suites.
// No pass or fail decision uses a clock: the per-run milliseconds are printed for the record only.
// Usage: node capability\C026\tests\u040-loop.cjs <runs 1..1000> <parallel 1..32>
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const SUITES = Object.freeze(['u040-pipelining.test.cjs', 'u040-node-own.test.cjs'].map((name) => path.join('capability', 'C026', 'tests', name)));
const HARD_BOUND_MS = 900000;

const isClean = (result) => result.exit === 0 && result.signal === null && !result.timedOut && result.tests > 0 && result.pass === result.tests
  && result.fail === 0 && result.cancelled === 0 && result.skipped === 0 && result.todo === 0;

function runOnce(index) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
    const started = Date.now();
    const out = [];
    const err = [];
    let timedOut = false;
    let settled = false;
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...SUITES], { cwd: repository, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const finish = (exit, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const text = Buffer.concat(out).toString('utf8').replace(/\r\n/g, '\n');
      const count = (key) => Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1] ?? Number.NaN);
      resolve({
        run: index, exit, signal, timedOut, tests: count('tests'), pass: count('pass'), fail: count('fail'), cancelled: count('cancelled'),
        skipped: count('skipped'), todo: count('todo'), ms: Date.now() - started,
        failedTests: [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()), stdout: text, stderr: Buffer.concat(err).toString('utf8')
      });
    };
    const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, HARD_BOUND_MS);
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    child.on('error', () => finish(null, null));
    child.on('close', (exit, signal) => finish(exit, signal));
  });
}

async function main() {
  const [runsText, parallelText] = process.argv.slice(2);
  const runs = Number(runsText);
  const parallel = Number(parallelText);
  if (!Number.isInteger(runs) || runs < 1 || runs > 1000 || !Number.isInteger(parallel) || parallel < 1 || parallel > 32) throw new Error('usage: node u040-loop.cjs <runs 1..1000> <parallel 1..32>');
  const started = Date.now();
  console.log(`U040 loop: ${runs} runs of ${SUITES.map((name) => path.basename(name)).join(' + ')}, ${parallel} at once, ${os.cpus().length} logical processors`);
  const results = [];
  let next = 1;
  async function worker() {
    for (;;) {
      const index = next;
      next += 1;
      if (index > runs) return;
      const result = await runOnce(index);
      results.push(result);
      console.log(`run ${String(index).padStart(2, '0')}/${runs} exit=${result.exit} tests=${result.tests} pass=${result.pass} fail=${result.fail} cancelled=${result.cancelled} skipped=${result.skipped} todo=${result.todo} timedOut=${result.timedOut} ms=${result.ms}`);
      if (!isClean(result)) {
        console.log(`run ${String(index).padStart(2, '0')}/${runs} FAILED TESTS: ${JSON.stringify(result.failedTests)}`);
        process.stderr.write(`--- run ${index} stdout\n${result.stdout}\n--- run ${index} stderr\n${result.stderr}\n`);
      }
    }
  }
  await Promise.all(Array.from({ length: parallel }, worker));
  const failed = results.filter((result) => !isClean(result));
  const counts = [...new Set(results.map((result) => result.tests))].sort((a, b) => a - b);
  const durations = results.map((result) => result.ms).sort((a, b) => a - b);
  console.log(`U040 loop: runs=${results.length} parallel=${parallel} ok=${results.length - failed.length} failed=${failed.length} testsPerRun=${JSON.stringify(counts)} fastestMs=${durations[0]} slowestMs=${durations[durations.length - 1]} wallMs=${Date.now() - started}`);
  process.exitCode = failed.length === 0 && results.length === runs && counts.length === 1 ? 0 : 1;
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
