'use strict';

// Test tooling, not production code (U039): the flake loop. Runs the timing-sensitive U039 suites (the ordering tests, the
// refusal flood and the h11 rows of the matrix in this process and in a separate one) <runs> times, <parallel> at once, next
// to <burners> CPU burner processes (a busy machine), and reports how many runs failed. Only processes started here are stopped.
// Usage (repository root): node capability\C042\tests\u039-loop.cjs <runs> <parallel> <burners>   (exit 1 on any failed run)
const path = require('node:path');
const { spawn } = require('node:child_process');
const lib = require('./u039-lib.cjs');

const [runs, parallel, burners] = process.argv.slice(2, 5).map(Number);
const repository = path.resolve(__dirname, '..', '..', '..');
const env = lib.childEnv();
for (const key of ['U039_SUBJECT', 'U039_CLOSE_MS', 'CAPTURE_BROWSER_EVIDENCE']) delete env[key];
const tests = ['u039-ordering', 'u039-flood', 'u039-nodeown', 'u039-matrix', 'u039-lane'].map((name) => path.join('capability', 'C042', 'tests', `${name}.test.cjs`));
// The timing-sensitive tests only: ordering, flood, the Node-own timers, a spread of h11 rows of the matrix (in this process and in a
// separate one: sync, unread, async and Node-own refusals) and the lane tests for a parse error, CONNECT and an unknown Expect behind two
// earlier requests (also the 128-socket burst).
const NAMES = '^(a (legitimate|request|queued|parse|long|failing|refusal flood|connection)|a burst of 128|at most|Expect|after |the server|an h2c|two services|every status|in-process h11 (R404|R415|R400json|R409conflict|N417expect|N400garbage):|separate-process h11 (R404|N421nohost):|lane (in-process|separate-process) h11 \\[GGX\\] (parse-error|connect|expect-get):)';
const args = ['--test', '--test-concurrency=1', `--test-name-pattern=${NAMES}`, ...tests];

function once(index) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: repository, env, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => child.kill(), 1800000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString('utf8');
      resolve({ run: index, code, tests: Number(/^# tests (\d+)$/m.exec(text)?.[1] ?? 0), fail: Number(/^# fail (\d+)$/m.exec(text)?.[1] ?? -1), failed: [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]) });
    });
  });
}

async function main() {
  const burning = Array.from({ length: burners }, () => spawn(process.execPath, ['-e', 'for (;;) {}'], { env, windowsHide: true, stdio: 'ignore' }));
  const results = [];
  let next = 0;
  try {
    await Promise.all(Array.from({ length: parallel }, async () => {
      while (next < runs) { next += 1; results.push(await once(next)); }
    }));
  } finally {
    for (const burner of burning) burner.kill();
  }
  const failed = results.filter((item) => item.code !== 0 || item.fail !== 0 || item.tests === 0);
  for (const item of failed) console.log(JSON.stringify(item));
  console.log(JSON.stringify({ summary: true, runs: results.length, parallel, burners, testsPerRun: results[0]?.tests, failedRuns: failed.length }));
  process.exitCode = failed.length === 0 && results.length === runs ? 0 : 1;
}

main();
