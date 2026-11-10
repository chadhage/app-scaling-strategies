'use strict';

// Test tooling, not production code: the flake loop UNDER LOAD (L-0204, rev-C009 F9c, rev-C010 M2). It starts CPU burners that it owns (their PIDs
// are recorded and only those PIDs are ever stopped), runs each test file `rounds` times, `parallel` copies at once, with a hard timeout per run,
// and records the exit, the wall time and the failing test names of every run. The 60 s per-file cap of the runner is checked on the recorded times:
// a run over the cap under this load is a FINDING with its figures, a failing run is a defect. Burners and runs use NORMAL priority (a BelowNormal
// process starves on a saturated machine). The verdict is a count, never a bound on a clock.
//   node tests\loop.cjs --out <json> --files flood.test.cjs,... --rounds 20 --parallel 4 --burners 4
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pinInputs } = require('./evidence-pins.cjs');

const args = Object.fromEntries(process.argv.slice(2).reduce((pairs, value, index, all) => (value.startsWith('--') ? [...pairs, [value.slice(2), all[index + 1]]] : pairs), []));
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const files = args.files.split(',');
const rounds = Number(args.rounds || 20);
const parallel = Number(args.parallel || 4);
const burnerCount = Number(args.burners || 4);
const CAP_MS = 60000;

function run(file) {
  return new Promise((resolve) => {
    const env = { ...process.env };
    delete env.NODE_TEST_CONTEXT;
    delete env.NODE_V8_COVERAGE;
    const started = Date.now();
    const child = spawn(process.execPath, ['--test', '--test-concurrency=1', '--test-timeout=170000', path.join('capability', 'C010', 'tests', file)], { cwd: repository, env, windowsHide: true });
    let out = '';
    child.stdout.on('data', (chunk) => { out += chunk; });
    child.stderr.on('data', (chunk) => { out += chunk; });
    const timer = setTimeout(() => child.kill('SIGKILL'), 400000);
    child.on('close', (status) => {
      clearTimeout(timer);
      const count = (key) => Number((new RegExp(`^# ${key} (\\d+)$`, 'm').exec(out) || [])[1] || 0);
      resolve({ file, status, ms: Date.now() - started, tests: count('tests'), pass: count('pass'), fail: count('fail'), cancelled: count('cancelled'), failed: [...out.matchAll(/^\s*not ok \d+ - (.+)$/gm)].map((match) => match[1].trim()).slice(0, 5) });
    });
  });
}

async function main() {
  const inputs = pinInputs(root);
  const startedAt = new Date().toISOString();
  const burners = [];
  for (let index = 0; index < burnerCount; index += 1) burners.push(spawn(process.execPath, ['-e', 'for(;;){}'], { stdio: 'ignore', windowsHide: true }));
  const burnerPids = burners.map((burner) => burner.pid);
  console.log(`burners started: ${burnerPids.join(',')}`);
  const queue = [];
  for (let round = 0; round < rounds; round += 1) for (const file of files) queue.push(file);
  const results = [];
  try {
    await Promise.all(Array.from({ length: parallel }, async () => {
      while (queue.length) results.push(await run(queue.shift()));
    }));
  } finally {
    for (const burner of burners) burner.kill('SIGKILL');
  }
  const perFile = {};
  for (const file of files) {
    const mine = results.filter((result) => result.file === file);
    perFile[file] = {
      runs: mine.length, passed: mine.filter((result) => result.status === 0 && result.fail === 0 && result.cancelled === 0 && result.tests > 0).length,
      maxMs: Math.max(...mine.map((result) => result.ms)), overCap: mine.filter((result) => result.ms > CAP_MS).length
    };
  }
  const document = { tool: 'tests/loop.cjs', node: process.version, cpus: os.cpus().length, startedAt, finishedAt: new Date().toISOString(), burnerPids, burners: burnerCount, parallel, rounds, capMs: CAP_MS, inputs, perFile, runs: results };
  fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(document, null, 1)}\n`, { flag: 'wx' });
  console.log(JSON.stringify(perFile));
  process.exitCode = Object.values(perFile).every((entry) => entry.passed === entry.runs) ? 0 : 1;
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
