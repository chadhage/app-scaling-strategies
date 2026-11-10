'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { gzipSync } = require('node:zlib');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..', '..');
const out = process.env.C011_LOOP_OUTPUT;
assert.ok(out && path.isAbsolute(out), 'an explicitly owned new loop output is required');
assert.equal(fs.existsSync(out), false);
const directory = path.join(path.dirname(out), 'loop-original-streams');
fs.mkdirSync(directory, { recursive: false });
const families = ['flood', 'flood-pending', 'burst', 'pipeline-process-a', 'pipeline-process-b', 'pipeline-process-c'];
const env = { ...process.env };
for (const name of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'C011_ASSERTION_DIR', 'C011_SUBJECT_DIR', 'CAPTURE_BROWSER_EVIDENCE']) delete env[name];
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const burners = [];
const reports = [];

function once(index) {
  const args = ['--test', '--test-concurrency=1', '--test-timeout=180000', ...families.map((name) => path.join('capability', 'C011', 'tests', name + '.test.cjs'))];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true });
    const stdout = [];
    const stderr = [];
    let timedOut = false;
    child.stdout.on('data', (bytes) => stdout.push(Buffer.from(bytes)));
    child.stderr.on('data', (bytes) => stderr.push(Buffer.from(bytes)));
    const watchdog = setTimeout(() => { timedOut = true; child.kill(); }, 600000);
    child.once('close', (code, signal) => {
      clearTimeout(watchdog);
      const streams = {};
      for (const [name, chunks] of Object.entries({ stdout, stderr })) {
        const bytes = Buffer.concat(chunks);
        const compressed = gzipSync(bytes);
        const filename = `${String(index).padStart(3, '0')}.${name}.raw.gz`;
        fs.writeFileSync(path.join(directory, filename), compressed, { flag: 'wx' });
        streams[name] = { path: path.join('loop-original-streams', filename), sha256: hash(bytes), gzipSha256: hash(compressed), bytes: bytes.length };
      }
      const text = Buffer.concat(stdout).toString('utf8');
      const summary = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((key) => [key, Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1] ?? -1)]));
      const failedTests = [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((match) => match[1]);
      resolve({ index, code, signal, timedOut, args, summary, failedTests, streams });
    });
  });
}

(async () => {
  try {
    for (let index = 0; index < 4; index += 1) {
      const child = spawn(process.execPath, ['-e', 'for (;;) {}'], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
      burners.push({ child, pid: child.pid, startedAtUtc: new Date().toISOString(), exited: new Promise((resolve) => child.once('exit', resolve)) });
    }
    for (let round = 0; round < 20; round += 1) {
      const results = await Promise.all(Array.from({ length: 4 }, (_, column) => once(round * 4 + column + 1)));
      reports.push(...results);
      console.log('C011_LOAD_ROUND ' + JSON.stringify({ round: round + 1, total: reports.length,
        bad: results.filter((run) => run.code !== 0 || run.signal || run.timedOut || run.summary.fail || run.summary.cancelled || run.summary.skipped).length }));
    }
  } finally {
    for (const burner of burners) burner.child.kill();
    await Promise.all(burners.map((burner) => burner.exited));
  }
  const bad = reports.filter((run) => run.code !== 0 || run.signal || run.timedOut || run.summary.fail !== 0 || run.summary.cancelled !== 0 || run.summary.skipped !== 0 || run.summary.tests <= 0);
  const report = { schema: 'C011-load-loop/1', rounds: 20, concurrency: 4, families,
    burners: burners.map(({ pid, startedAtUtc }) => ({ pid, startedAtUtc, stopped: true })),
    runs: reports, completed: reports.length, bad: bad.length, passed: reports.length === 80 && bad.length === 0 };
  fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n', { flag: 'wx' });
  assert.equal(report.passed, true, 'every requested loaded repetition must pass; a timeout is never a structural success');
})().catch((error) => { console.error(error); process.exitCode = 1; });
