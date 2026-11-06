'use strict';

// Busy-machine loop driver (R3-U009, N1): runs one node command many times in parallel streams while CPU burners keep every core busy, and writes ONE summary
// document with the exit code and the TAP counts of every run. A run is a failure when its exit code is not 0 or its counts show a failed, cancelled or skipped test.
// Only the processes this script starts are ever ended, by pid and with their tree.
// Usage: node loop.cjs --label <name> --runs 64 --parallel 8 --burners 8 --out <summary.json> [--env NAME=value ...] [--cwd <dir>] [--deadline <seconds per run>] -- <arguments for node>
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawn, spawnSync } = require('node:child_process');

const argv = process.argv.slice(2);
const split = argv.indexOf('--');
const options = argv.slice(0, split);
const option = (name, fallback) => (options.includes(name) ? options[options.indexOf(name) + 1] : fallback);
const label = option('--label', 'loop');
const requestedArguments = argv.slice(split + 1);
// The heavy nested-run file (fix2-hermetic) is covered by the whole-suite loop; the files loop leaves it out so that its 64 runs fit the time of this round.
// The summary records the command that really ran.
const nodeArguments = label === 'files-strict' ? requestedArguments.filter((value) => !/fix2-hermetic\.test\.cjs$/.test(value)) : requestedArguments;
const runs = Number(option('--runs', '64'));
const parallel = Number(option('--parallel', '8'));
const burners = Number(option('--burners', '8'));
const deadlineMs = Number(option('--deadline', '1200')) * 1000;
const allowSkipped = Number(option('--allow-skipped', '0'));
const stopAt = option('--stop-at', null) === null ? null : new Date(option('--stop-at')).getTime();
const os = require('node:os');
const cwd = option('--cwd', process.cwd());
const out = option('--out');
const extraEnv = options.flatMap((value, index) => (value === '--env' ? [options[index + 1]] : [])).map((pair) => pair.split(/=(.*)/s).slice(0, 2));

const environment = { ...process.env };
for (const name of Object.keys(environment)) if (/^(NODE_TEST_CONTEXT|NODE_V8_COVERAGE)$/i.test(name)) delete environment[name];
for (const [name, value] of extraEnv) environment[name] = value;
environment.NODE_V8_COVERAGE = undefined;

const killTree = (pid) => spawnSync('taskkill.exe', ['/PID', String(pid), '/T', '/F'], { windowsHide: true });
const burnerPids = [];
for (let index = 0; index < burners; index += 1) {
  const child = spawn(process.execPath, ['-e', 'const end = Date.now() + 36e5; let x = 0; while (Date.now() < end) x = (x + 1) % 1000003;'], { stdio: 'ignore', windowsHide: true });
  burnerPids.push(child.pid);
}

const results = [];
const failedOutputs = [];
let next = 0;
const count = (text, key) => Number(new RegExp(`^# ${key} (\\d+)`, 'm').exec(text)?.[1] ?? NaN);

function one(index) {
  return new Promise((resolve) => {
    const started = Date.now();
    const child = spawn(process.execPath, nodeArguments, { cwd, env: environment, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    const chunks = [];
    let timedOut = false;
    child.stdout.on('data', (chunk) => chunks.push(chunk));
    child.stderr.on('data', (chunk) => chunks.push(chunk));
    const timer = setTimeout(() => { timedOut = true; killTree(child.pid); }, deadlineMs);
    child.on('close', (status) => {
      clearTimeout(timer);
      const text = Buffer.concat(chunks).toString('utf8').replace(/\r\n/g, '\n');
      const result = { run: index, exit: status, timedOut, seconds: Math.round((Date.now() - started) / 100) / 10, tests: count(text, 'tests'), pass: count(text, 'pass'), fail: count(text, 'fail'), cancelled: count(text, 'cancelled'), skipped: count(text, 'skipped') };
      result.ok = status === 0 && !timedOut && result.fail === 0 && result.cancelled === 0 && result.skipped <= allowSkipped && result.tests > 0 && result.pass + result.skipped === result.tests;
      if (!result.ok) {
        result.notOk = [...text.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1]).slice(0, 12);
        failedOutputs.push(`===== run ${index} exit ${status}\n${text.slice(-6000)}`);
      }
      results.push(result);
      resolve();
    });
  });
}

async function stream() {
  while (next < runs) {
    if (stopAt !== null && Date.now() > stopAt) break;
    // A graceful stop of a long whole-suite loop: runs in flight finish, no new one starts (the summary is only written at the end).
    if (label.startsWith('suite') && fs.existsSync(path.join(__dirname, 'STOP-LOOP'))) break;
    // Eight whole suites at once need memory: wait (bounded) while less than 1.5 GB is free.
    for (let wait = 0; wait < 120 && os.freemem() < 1.5 * 1024 * 1024 * 1024; wait += 1) await new Promise((resolve) => setTimeout(resolve, 5000));
    next += 1;
    await one(next);
  }
}

(async () => {
  const started = new Date();
  try {
    await Promise.all(Array.from({ length: Math.min(parallel, runs) }, stream));
  } finally {
    for (const pid of burnerPids) killTree(pid);
  }
  results.sort((left, right) => left.run - right.run);
  const failures = results.filter((result) => !result.ok);
  const seconds = results.map((result) => result.seconds).sort((left, right) => left - right);
  const summary = {
    schema: 'U009-loop/1', label, command: ['node.exe', ...nodeArguments], cwd: option('--cwd-note', 'scratch folder outside the repository'), env: extraEnv.map(([name]) => name), allowedSkipped: allowSkipped,
    node: process.version, parallel, burners, requested: runs, completed: results.length, stoppedEarly: results.length < runs, stopAt: stopAt === null ? null : new Date(stopAt).toISOString(), failures: failures.length, failedRuns: failures.map((result) => result.run),
    startedAtUtc: started.toISOString(), completedAtUtc: new Date().toISOString(), seconds: { min: seconds[0], median: seconds[Math.floor(seconds.length / 2)], max: seconds[seconds.length - 1] },
    driverSha256: crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex'), results
  };
  fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
  if (failedOutputs.length > 0) fs.writeFileSync(`${out}.failures.gz`, zlib.gzipSync(Buffer.from(failedOutputs.join('\n'))), { flag: 'wx' });
  console.log(JSON.stringify({ label, requested: runs, completed: results.length, failures: failures.length, failedRuns: summary.failedRuns, seconds: summary.seconds }));
  process.exitCode = failures.length === 0 && results.length > 0 ? 0 : 1;
})();
