'use strict';

// Test tooling, not production code: the flake loop. Runs ONE test file many times, several at once (the load that exposed the heap sampler race),
// each run a separate `node --test` process under a hard timeout; any failing run is reported. Exit 1 when a single run failed. The printed JSON carries
// the SHA-256 of every non-evidence file of the namespace it ran against (`inputs`), so evidence-check.cjs names a loop result that outlived an edit.
// `--burners N` starts N CPU burners of its own (node processes that spin), records their PIDs in the result and stops exactly those in a finally block:
// the loops of the fourth fix run 20 x 4 under 4 burners (controller rule 13 and the order of the fourth fix), at normal priority, inside the loop slot.
//   node capability\C017\tests\flake.cjs child.test.cjs 20 5 [--burners 4]
const { spawn } = require('node:child_process');
const path = require('node:path');
const { inputPins } = require('./evidence-check.cjs');

const [fileName, runsText = '20', parallelText = '5', ...flags] = process.argv.slice(2);
const runs = Number(runsText);
const parallel = Number(parallelText);
const burnerCount = flags[0] === '--burners' ? Number(flags[1]) : 0;
if (!/^[a-z0-9-]+\.test\.cjs$/.test(fileName || '') || !(runs >= 1 && runs <= 200) || !(parallel >= 1 && parallel <= 16) || !(burnerCount >= 0 && burnerCount <= 8) || (flags.length && flags[0] !== '--burners')) {
  console.error('usage: flake.cjs <name.test.cjs> <runs 1-200> <parallel 1-16> [--burners 0-8]');
  process.exit(2);
}
const repo = path.resolve(__dirname, '..', '..', '..');
const env = { ...process.env };
delete env.NODE_TEST_CONTEXT;
env.NODE_V8_COVERAGE = '';

function one(index) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=1200000', `capability/C017/tests/${fileName}`], { cwd: repo, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '';
    child.stdout.on('data', (part) => { out += part; });
    child.stderr.on('data', (part) => { out += part; });
    const timer = setTimeout(() => child.kill(), 2400000);
    child.on('close', (code) => {
      clearTimeout(timer);
      const failing = [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((m) => m[1].trim());
      resolve({ run: index, exit: code, seconds: Math.round((Date.now() - started) / 100) / 10, failing });
    });
  });
}

(async () => {
  const burners = Array.from({ length: burnerCount }, () => spawn(process.execPath, ['-e', 'while (true) {}'], { windowsHide: true, stdio: 'ignore' }));
  const pids = burners.map((burner) => burner.pid);
  const results = [];
  try {
    let next = 1;
    await Promise.all(Array.from({ length: parallel }, async () => { while (next <= runs) results.push(await one(next++)); }));
  } finally {
    for (const burner of burners) if (burner.exitCode === null && burner.signalCode === null) burner.kill();
  }
  const failures = results.filter((r) => r.exit !== 0);
  console.log(JSON.stringify({ file: fileName, runs, parallel, burners: { count: burnerCount, pids }, failures: failures.length, slowestSeconds: Math.max(...results.map((r) => r.seconds)), failing: failures, inputs: inputPins() }, null, 2));
  process.exit(failures.length ? 1 : 0);
})();
