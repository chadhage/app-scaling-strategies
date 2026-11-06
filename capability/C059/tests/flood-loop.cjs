'use strict';

// Test tooling, not production code: the load loop of the refusal-flood test (review F2). It keeps every core busy with CPU burners, runs
// flood.test.cjs `runs` times, `parallel` at a time, and prints ONE JSON summary (pass and fail per run, the measured structure of the
// service and of the bare reference of each run). The flood test asserts structure and ratios, never seconds, so every run must pass.
// Usage: node tests\flood-loop.cjs [runs=20] [parallel=5] [burners=CPU count]
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');

const runs = Number(process.argv[2] ?? 20);
const parallel = Number(process.argv[3] ?? 5);
const burnerCount = Number(process.argv[4] ?? os.cpus().length);
const env = { ...process.env };
for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'C059_FLOOD_SUBJECT', 'C059_RED_SUBJECT', 'CAPTURE_BROWSER_EVIDENCE']) delete env[key];
const burners = Array.from({ length: burnerCount }, () => spawn(process.execPath, ['-e', 'for (;;) {}'], { stdio: 'ignore', windowsHide: true }));

function once(index) {
  return new Promise((resolve) => {
    const started = process.hrtime.bigint();
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=280000', path.join(__dirname, 'flood.test.cjs')], { env, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const watchdog = setTimeout(() => child.kill(), 290000);
    child.on('close', (code) => {
      clearTimeout(watchdog);
      const text = Buffer.concat(chunks).toString('utf8');
      const count = (key) => Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1] ?? -1);
      const diagnostics = [...text.matchAll(/^# (\{"(?:reference|subject)":.*\})$/gm)].map((match) => JSON.parse(match[1]));
      resolve({ run: index, exit: code, tests: count('tests'), pass: count('pass'), fail: count('fail'), seconds: Math.round(Number(process.hrtime.bigint() - started) / 1e9), measured: diagnostics[0] ?? null, failures: [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]) });
    });
  });
}

async function main() {
  const results = [];
  let next = 1;
  const lane = async () => { while (next <= runs) { const index = next; next += 1; results.push(await once(index)); } };
  await Promise.all(Array.from({ length: parallel }, lane));
  results.sort((a, b) => a.run - b.run);
  const summary = { runs, parallel, burners: burnerCount, passed: results.filter((item) => item.exit === 0 && item.fail === 0 && item.pass === item.tests && item.tests === 2).length, results };
  console.log(JSON.stringify(summary, null, 1));
  if (summary.passed !== runs) process.exitCode = 1;
}

main().finally(() => { for (const burner of burners) burner.kill(); });
