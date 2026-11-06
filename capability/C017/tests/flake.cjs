'use strict';

// Test tooling, not production code: the flake loop. Runs ONE test file many times, several at once (the load that exposed the heap sampler race),
// each run a separate `node --test` process under a hard timeout; any failing run is reported. Exit 1 when a single run failed. The printed JSON carries
// the SHA-256 of every non-evidence file of the namespace it ran against (`inputs`), so evidence-check.cjs names a loop result that outlived an edit.
//   node capability\C017\tests\flake.cjs child.test.cjs 20 5
const { spawn } = require('node:child_process');
const path = require('node:path');
const { inputPins } = require('./evidence-check.cjs');

const [fileName, runsText = '20', parallelText = '5'] = process.argv.slice(2);
const runs = Number(runsText);
const parallel = Number(parallelText);
if (!/^[a-z0-9-]+\.test\.cjs$/.test(fileName || '') || !(runs >= 1 && runs <= 200) || !(parallel >= 1 && parallel <= 16)) {
  console.error('usage: flake.cjs <name.test.cjs> <runs 1-200> <parallel 1-16>');
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
  const results = [];
  let next = 1;
  await Promise.all(Array.from({ length: parallel }, async () => { while (next <= runs) results.push(await one(next++)); }));
  const failures = results.filter((r) => r.exit !== 0);
  console.log(JSON.stringify({ file: fileName, runs, parallel, failures: failures.length, slowestSeconds: Math.max(...results.map((r) => r.seconds)), failing: failures, inputs: inputPins() }, null, 2));
  process.exit(failures.length ? 1 : 0);
})();
