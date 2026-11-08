'use strict';

const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
delete process.env.NODE_TEST_CONTEXT;
delete process.env.NODE_V8_COVERAGE;
const RUNS = 64;
const WORKERS = 2;
const TESTS = 4;
const repository = path.resolve(__dirname, '..', '..', '..');
let next = 1;
const results = [];
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');

function run(index) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, ['capability\\C026\\tests\\u055-suite.cjs', 'capability\\C026\\tests\\u055-boundary.test.cjs'], {
      cwd: repository, env: { ...process.env }, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe']
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (bytes) => stdout.push(bytes));
    child.stderr.on('data', (bytes) => stderr.push(bytes));
    child.once('exit', (exitCode, signal) => {
      const out = Buffer.concat(stdout);
      const err = Buffer.concat(stderr);
      const text = out.toString('utf8');
      const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((key) =>
        [key, Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1] ?? -1)]));
      const clean = exitCode === 0 && signal === null && counts.tests === TESTS && counts.pass === TESTS
        && counts.fail === 0 && counts.cancelled === 0 && counts.skipped === 0 && counts.todo === 0;
      const record = {
        run: index, exitCode, signal, ...counts, clean,
        stdoutSha256: sha(out), stderrSha256: sha(err),
        stdoutBase64: out.toString('base64'), stderrBase64: err.toString('base64')
      };
      results.push(record);
      console.log(JSON.stringify(record));
      resolve(record);
    });
  });
}

async function worker() {
  while (next <= RUNS) {
    const index = next;
    next += 1;
    await run(index);
  }
}

(async () => {
  console.log(`U055 structural loop: ${RUNS} runs, ${WORKERS} normal-priority workers, ${TESTS} tests per run; no burners or timing assertions.`);
  await Promise.all(Array.from({ length: WORKERS }, worker));
  const clean = results.filter((entry) => entry.clean).length;
  console.log(`U055 structural loop: complete=${results.length} clean=${clean} requested=${RUNS} workers=${WORKERS}`);
  console.log(`# tests ${results.reduce((sum, entry) => sum + Math.max(entry.tests, 0), 0)}`);
  console.log('# suites 0');
  console.log(`# pass ${results.reduce((sum, entry) => sum + Math.max(entry.pass, 0), 0)}`);
  console.log(`# fail ${results.reduce((sum, entry) => sum + Math.max(entry.fail, 0), 0)}`);
  console.log(`# cancelled ${results.reduce((sum, entry) => sum + Math.max(entry.cancelled, 0), 0)}`);
  console.log(`# skipped ${results.reduce((sum, entry) => sum + Math.max(entry.skipped, 0), 0)}`);
  console.log(`# todo ${results.reduce((sum, entry) => sum + Math.max(entry.todo, 0), 0)}`);
  if (results.length !== RUNS || clean !== RUNS) process.exitCode = 1;
})().catch(() => { process.stderr.write('U055 structural loop could not complete.\n'); process.exitCode = 1; });
