'use strict';
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const { createHash } = require('node:crypto');

const [stage, expectedText, ...files] = process.argv.slice(2);
const expected = Number(expectedText);
if (!/^(red|focused-green|browser-green)(?:-v[2-9]\d*)?$/.test(stage || '') || ![0, 1].includes(expected) || !files.length) {
  throw new Error('Usage: capture.cjs red|focused-green|browser-green[-vN] 0|1 <owned test files>');
}
const root = path.resolve(__dirname, '..');
for (const file of files) {
  const resolved = path.resolve(file);
  if (!resolved.startsWith(`${root}${path.sep}`) || !file.endsWith('.test.cjs')) {
    throw new Error('Capture accepts only owned S082 tests');
  }
}
const directory = path.join(root, 'evidence', stage);
fs.mkdirSync(directory);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshots = [];
if (stage === 'red') {
  for (const relative of ['model.js', 'tests\\acceptance.test.cjs', 'stale-epoch.feature', 'tests\\capture.cjs']) {
    const bytes = fs.readFileSync(path.join(root, relative));
    const name = relative.replace(/[\\/]/g, '_') + '.snapshot';
    fs.writeFileSync(path.join(directory, name), bytes, { flag: 'wx' });
    snapshots.push({ source: relative, path: name, bytes: bytes.length, rawSha256: sha(bytes) });
  }
}
const args = ['--test', ...files];
const startedAtUtc = new Date().toISOString();
const result = cp.spawnSync(process.execPath, args, {
  cwd: process.cwd(), encoding: null, timeout: 90000,
  env: { ...process.env, NODE_DISABLE_COLORS: '1' },
});
const stdout = result.stdout || Buffer.alloc(0);
const stderr = result.stderr || Buffer.alloc(0);
fs.writeFileSync(path.join(directory, 'stdout.raw'), stdout, { flag: 'wx' });
fs.writeFileSync(path.join(directory, 'stderr.raw'), stderr, { flag: 'wx' });
const text = stdout.toString();
const count = (name) => Number(text.match(new RegExp(`# ${name} (\\d+)`))?.[1] || 0);
const missingCodeOrTools = /MODULE_NOT_FOUND|Cannot find module|ENOENT|not recognized|SyntaxError/.test(text + stderr);
const run = {
  schemaVersion: 1, cardId: 'A-S082', stage, startedAtUtc,
  finishedAtUtc: new Date().toISOString(), node: process.version,
  command: [process.execPath, ...args], cwd: process.cwd(),
  exitCode: result.status, signal: result.signal, spawnError: result.error?.message || null,
  tests: count('tests'), passed: count('pass'), failed: count('fail'),
  actualAssertionFailure: /ERR_ASSERTION/.test(text),
  missingCodeOrTools,
  browserCaptureDeliberate: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
  stdout: { path: 'stdout.raw', bytes: stdout.length, rawSha256: sha(stdout) },
  stderr: { path: 'stderr.raw', bytes: stderr.length, rawSha256: sha(stderr) },
  snapshots,
};
fs.writeFileSync(path.join(directory, 'run.json'), JSON.stringify(run, null, 2) + '\n', { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
if (result.status !== expected || result.error || missingCodeOrTools
    || (expected === 1 && (!run.actualAssertionFailure || !run.failed || !run.passed))) {
  process.exitCode = 1;
}
