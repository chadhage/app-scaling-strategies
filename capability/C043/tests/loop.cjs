'use strict';

// Test tooling, not production code: runs the given test files N times, P at a time, on this (busy) machine and records every
// run (exit code, seconds, counts, the names of the tests that failed, the tail of the output of a failed run) in a JSON file
// next to the label. The flood and resource tests must pass 64 of 64 in an 8-way loop (self-review line 12).
// Usage (from the repository root): node capability\C043\tests\loop.cjs <runs> <parallel> <label> <test file>...
// The result is written to capability\C043\tests\scratch\loop-<label>.json (git-ignored).
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const [runsText, parallelText, label, ...files] = process.argv.slice(2);
const runs = Number(runsText);
const parallel = Number(parallelText);
const repository = path.resolve(__dirname, '..', '..', '..');
const scratch = path.join(__dirname, 'scratch');
fs.mkdirSync(scratch, { recursive: true });
const outFile = path.join(scratch, `loop-${label}.json`);
const results = [];
let next = 0;
const clean = { ...process.env };
for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'NODE_OPTIONS', 'C043_MUTANT', 'C043_KINDS', 'C043_FLOOD', 'C043_LIVENESS_MS', 'C043_STALL_MS']) delete clean[key];

function one(index) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', ...files], { cwd: repository, env: clean, windowsHide: true });
    const chunks = [];
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => child.kill(), 900000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const output = Buffer.concat(chunks).toString('utf8');
      const count = (name) => Number(new RegExp(`^# ${name} (\\d+)$`, 'm').exec(output)?.[1] ?? NaN);
      const entry = {
        index, code, seconds: Math.round((Date.now() - started) / 1000), tests: count('tests'), pass: count('pass'), fail: count('fail'),
        failing: [...output.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()),
      };
      if (code !== 0) entry.tail = output.split(/\r?\n/).slice(-80).join('\n');
      results.push(entry);
      fs.writeFileSync(outFile, JSON.stringify({ label, files, runs, parallel, done: results.length, failed: results.filter((item) => item.code !== 0).length, results }, null, 1));
      resolve();
    });
  });
}

(async () => {
  await Promise.all(Array.from({ length: parallel }, async () => {
    while (next < runs) { const index = next; next += 1; await one(index); }
  }));
  console.log(`${label}: ${results.length} runs, ${results.filter((item) => item.code !== 0).length} failed`);
  process.exitCode = results.some((item) => item.code !== 0) ? 1 : 0;
})();
