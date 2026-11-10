'use strict';

// Test tooling, not production code: the LOAD LOOP of the process-spawning files (controller decision of 6 Nov 13:08: 20 runs, 4 at a time, normal priority, under
// 4 CPU burners). One RUN executes the process-spawning files one after the other, each in its own `node --test` process, so that every file has its own duration;
// `--parallel` runs go at the same time. The burners are `node` processes started HERE (a busy loop that ends by itself after `--burner-minutes`, 90 by default):
// their PIDs are printed and recorded, they are ended by their handle in `finally`, and the script checks that none is alive afterwards.
// A BEHAVIOUR failure (a file that exits non-zero, a failing test, a test that did not run) is a defect and the loop exits 1. A file this script had to end after the
// hang guard is UNDECIDED and also exits 1. A file that needs more than the 60 s per-file cap of the shared runner only under this load is a FINDING: it is recorded
// with its figures and does not fail the loop. Nothing here decides anything by the clock except that hang guard.
// Usage (repository root): node capability\C014\tests\loop.cjs --runs=20 --parallel=4 --burners=4 [--files=process-flood,pending-flood] [--guard-seconds=300]
const path = require('node:path');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const REPOSITORY = path.resolve(ROOT, '..', '..');
const CAP_MS = 60000;
const FILES = ['process-sweep', 'process-matrix', 'process-matrix-10', 'process-flood', 'pending-flood', 'cleanup'];

const argument = (name, fallback) => { const hit = process.argv.find((item) => item.startsWith(`--${name}=`)); return hit ? hit.slice(name.length + 3) : String(fallback); };
const runs = Number(argument('runs', 20));
const parallel = Number(argument('parallel', 4));
const burnerCount = Number(argument('burners', 4));
const guardMs = Number(argument('guard-seconds', 300)) * 1000;
const burnerMinutes = Number(argument('burner-minutes', 90));
const files = argument('files', FILES.join(',')).split(',');

function runFile(name, runNumber) {
  return new Promise((resolve) => {
    const env = { ...process.env, NODE_V8_COVERAGE: '' };
    delete env.NODE_TEST_CONTEXT;
    const args = ['--require', path.join(ROOT, 'tests', 'scratch-cwd.cjs'), '--test', '--test-concurrency=1', path.join(ROOT, 'tests', `${name}.test.cjs`)];
    const started = Date.now();
    const child = spawn(process.execPath, args, { cwd: REPOSITORY, env, windowsHide: true });
    const output = [];
    const stdout = [];
    const stderr = [];
    child.stdout.on('data', (chunk) => { stdout.push(chunk); output.push(chunk); });
    child.stderr.on('data', (chunk) => { stderr.push(chunk); output.push(chunk); });
    let ended = false;
    const guard = setTimeout(() => { ended = true; child.kill(); }, guardMs);
    child.on('close', (code) => {
      clearTimeout(guard);
      const text = Buffer.concat(output).toString('utf8').replace(/\r\n/g, '\n');
      const count = (key) => Number((new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text) || [])[1] || 0);
      const row = { file: name, exit: code, durationMs: Date.now() - started, tests: count('tests'), pass: count('pass'), fail: count('fail'), cancelled: count('cancelled'), skipped: count('skipped'), todo: count('todo'), endedByGuard: ended };
      if (process.env.C014_PRIVATE_EVIDENCE && process.env.C014_ACTIVE_CAPTURE) {
        const relative = path.join('loop-children', process.env.C014_ACTIVE_CAPTURE, String(runNumber), name);
        const directory = path.join(process.env.C014_PRIVATE_EVIDENCE, relative);
        fs.mkdirSync(directory, { recursive: true });
        row.originalStreams = {};
        for (const [stream, chunks] of [['stdout', stdout], ['stderr', stderr]]) {
          const bytes = Buffer.concat(chunks);
          const gzip = zlib.gzipSync(bytes);
          const file = `${stream}.raw.gz`;
          fs.writeFileSync(path.join(directory, file), gzip, { flag: 'wx' });
          row.originalStreams[stream] = { path: path.join(relative, file).replace(/\\/g, '/'), bytes: bytes.length,
            sha256: createHash('sha256').update(bytes).digest('hex'), gzipSha256: createHash('sha256').update(gzip).digest('hex') };
        }
      }
      row.failing = [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1].trim().slice(0, 100));
      // the assertion text of a failing test (the YAML block node:test prints under `not ok`), with the repository and home paths made neutral: a failure under load must say what failed
      if (code !== 0 || row.fail > 0) row.detail = (/^not ok [^]*?^# /m.exec(text) || [''])[0].split(REPOSITORY).join('<REPO>').replace(/[A-Za-z]:[\\/]+Users[\\/]+[^\\/\s'"]+/g, '<HOME>').slice(0, 2500);
      row.ok = !ended && code === 0 && row.tests > 0 && row.pass === row.tests && row.fail === 0 && row.cancelled === 0 && row.skipped === 0 && row.todo === 0;
      resolve(row);
    });
  });
}

const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const median = (numbers) => numbers.slice().sort((a, b) => a - b)[Math.floor(numbers.length / 2)];

async function main() {
  const report = { schema: 'C014-loop/1', runs, parallel, files, capMs: CAP_MS, guardMs, burners: { count: burnerCount, pids: [], allStopped: false }, results: [] };
  const burners = [];
  try {
    for (let index = 0; index < burnerCount; index += 1) {
      const burner = spawn(process.execPath, ['-e', `const end = Date.now() + ${burnerMinutes * 60000}; while (Date.now() < end) {}`], { stdio: 'ignore', windowsHide: true });
      burners.push(burner);
      report.burners.pids.push(burner.pid);
    }
    console.log(`burners started (pids): ${report.burners.pids.join(', ')}`);
    let next = 0;
    await Promise.all(Array.from({ length: parallel }, async () => {
      while (next < runs) {
        const run = next;
        next += 1;
        const rows = [];
        for (const name of files) {
          const row = await runFile(name, run + 1);
          rows.push(row);
          console.log(`run ${run + 1} ${name}: ${row.ok ? 'ok' : 'NOT OK'} ${(row.durationMs / 1000).toFixed(1)} s, ${row.pass} of ${row.tests} tests${row.failing.length ? `, failing: ${JSON.stringify(row.failing)}` : ''}`);
        }
        report.results[run] = { run: run + 1, rows };
      }
    }));
  } finally {
    for (const burner of burners) { try { burner.kill(); } catch { /* already gone */ } }
    await Promise.all(burners.map((burner) => new Promise((resolve) => { if (burner.exitCode !== null || burner.signalCode !== null) resolve(); else burner.once('exit', resolve); })));
    report.burners.allStopped = report.burners.pids.every((pid) => !alive(pid));
  }
  const rows = report.results.flatMap((entry) => entry.rows);
  report.perFile = Object.fromEntries(files.map((name) => {
    const own = rows.filter((row) => row.file === name);
    const durations = own.map((row) => row.durationMs);
    return [name, { runs: own.length, ok: own.filter((row) => row.ok).length, minMs: Math.min(...durations), medianMs: median(durations), maxMs: Math.max(...durations), overCap: own.filter((row) => row.durationMs > CAP_MS).length }];
  }));
  report.findings = rows.filter((row) => row.durationMs > CAP_MS).map((row) => `${row.file} took ${(row.durationMs / 1000).toFixed(1)} s (more than the ${CAP_MS / 1000} s cap) under this load`);
  report.failures = rows.filter((row) => !row.ok).map((row) => `${row.file}: exit ${row.exit}, ${row.pass} of ${row.tests} tests, ${row.endedByGuard ? 'ended by the hang guard (undecided)' : `failing ${JSON.stringify(row.failing)}`}`);
  const bad = report.failures.length > 0 || !report.burners.allStopped || rows.length !== runs * files.length;
  console.log(JSON.stringify(report, null, 1));
  console.log(`# tests ${rows.length}`);
  console.log(`# pass ${rows.filter((row) => row.ok).length}`);
  console.log(`# fail ${rows.filter((row) => !row.ok).length}`);
  console.log(`# burners stopped ${report.burners.allStopped}`);
  process.exitCode = bad ? 1 : 0;
}

main().catch((error) => { console.error(`loop failed: ${error && error.message}`); process.exitCode = 1; });
