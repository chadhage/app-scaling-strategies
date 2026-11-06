'use strict';

// Test tooling, not production code (U040 fix 2, checklist line 12): runs the three suites of fix 2 (u040-flood, u040-budget, u040-expect) <runs> times with
// <parallel> runs at once, on the machine as it is and under <burners> CPU burners that this driver starts itself (a node process that spins) and stops
// by process id when the runs are over (the pids are printed). It exits 0 only when every run exited 0 with the same positive number of tests, every test
// passed and none was cancelled, skipped or marked todo. One run is exactly the replay command: node --test --test-concurrency=1 over the three suites.
// No pass or fail decision uses a clock: the per-run milliseconds are printed for the record only.
// Usage: node capability\C026\tests\u040-loop-2.cjs <runs 1..1000> <parallel 1..32> [burners 0..8]
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const SUITES = Object.freeze(['u040-flood.test.cjs', 'u040-budget.test.cjs', 'u040-expect.test.cjs'].map((name) => path.join('capability', 'C026', 'tests', name)));
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
  const [runsText, parallelText, burnersText] = process.argv.slice(2);
  const runs = Number(runsText);
  const parallel = Number(parallelText);
  const burners = Number(burnersText ?? 0);
  if (!Number.isInteger(runs) || runs < 1 || runs > 1000 || !Number.isInteger(parallel) || parallel < 1 || parallel > 32 || !Number.isInteger(burners) || burners < 0 || burners > 8) throw new Error('usage: node u040-loop-2.cjs <runs 1..1000> <parallel 1..32> [burners 0..8]');
  const started = Date.now();
  console.log(`U040 loop 2: ${runs} runs of ${SUITES.map((name) => path.basename(name)).join(' + ')}, ${parallel} at once, ${burners} CPU burners, ${os.cpus().length} logical processors`);
  // CPU burners that this driver starts, records and stops by process id (never by name): they keep the machine busy while the suites run.
  const spinning = Array.from({ length: burners }, () => spawn(process.execPath, ['-e', 'for (;;) {}'], { windowsHide: true, stdio: 'ignore' }));
  console.log(`U040 loop 2: burner pids ${JSON.stringify(spinning.map((child) => child.pid))}`);
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
  try {
    await Promise.all(Array.from({ length: parallel }, worker));
  } finally {
    for (const child of spinning) process.kill(child.pid);
    console.log(`U040 loop 2: burners stopped by pid ${JSON.stringify(spinning.map((child) => child.pid))}`);
  }
  const failed = results.filter((result) => !isClean(result));
  const counts = [...new Set(results.map((result) => result.tests))].sort((a, b) => a - b);
  const durations = results.map((result) => result.ms).sort((a, b) => a - b);
  console.log(`U040 loop 2: runs=${results.length} parallel=${parallel} burners=${burners} ok=${results.length - failed.length} failed=${failed.length} testsPerRun=${JSON.stringify(counts)} fastestMs=${durations[0]} slowestMs=${durations[durations.length - 1]} wallMs=${Date.now() - started}`);
  process.exitCode = failed.length === 0 && results.length === runs && counts.length === 1 ? 0 : 1;
}

main().catch((error) => {
  console.error(error.stack ?? String(error));
  process.exitCode = 1;
});
