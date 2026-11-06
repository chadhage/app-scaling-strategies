'use strict';

// Test tooling, not production code (U039 fix 4): the flake loop of the NEW timing-sensitive files (the incomplete-body rows with their burst and their
// leaving clients, the ordering rows with a request in flight and the seeded fuzz). Runs the three files <runs> times, <parallel> at once, next to
// <burners> CPU burner processes (a busy machine) it starts itself, records their PIDs on its first and its last line and stops exactly those PIDs.
// Usage (repository root): node capability\C042\tests\u039-loop-body.cjs <runs> <parallel> <burners>   (exit 1 on any failed run)
const path = require('node:path');
const { spawn } = require('node:child_process');
const lib = require('./u039-lib.cjs');

const [runs, parallel, burners] = process.argv.slice(2, 5).map(Number);
const repository = path.resolve(__dirname, '..', '..', '..');
const env = lib.childEnv();
for (const key of ['U039_SUBJECT', 'U039_CLOSE_MS', 'CAPTURE_BROWSER_EVIDENCE']) delete env[key];
const tests = ['u039-body', 'u039-body-order', 'u039-body-fuzz'].map((name) => path.join('capability', 'C042', 'tests', `${name}.test.cjs`));
const args = ['--test', '--test-concurrency=1', ...tests];

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
  const burnerPids = burning.map((burner) => burner.pid);
  console.log(JSON.stringify({ started: true, burnerPids }));
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
  console.log(JSON.stringify({ summary: true, runs: results.length, parallel, burners, burnerPids, burnersStoppedByPid: true, testsPerRun: results[0]?.tests, failedRuns: failed.length }));
  process.exitCode = failed.length === 0 && results.length === runs ? 0 : 1;
}

main();
