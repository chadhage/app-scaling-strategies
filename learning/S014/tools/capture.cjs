'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const [stage, ...args] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]*$/.test(stage || '') || args.length === 0) {
  throw new Error('Use capture.cjs <new-stage-name> <node arguments...>');
}
const files = ['tap.txt', 'stderr.txt', 'json'].map((suffix) => path.join(root, 'evidence', `${stage}.${suffix}`));
for (const file of files) {
  if (fs.existsSync(file)) throw new Error(`Evidence is append-only; choose a new stage name: ${file}`);
}
fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const inputs = {};
for (const name of ['scheduled-scaling.feature', 'schedule.js', 'schedule.test.cjs', 'invariants.test.cjs',
  'integrity.test.cjs', 'browser.test.cjs', 'lesson.js', 'index.html', 'lesson.css']) {
  const file = path.join(root, name);
  if (fs.existsSync(file)) inputs[name] = sha256(fs.readFileSync(file));
}
const startedAtUtc = new Date().toISOString();
const result = spawnSync(process.execPath, args, { cwd: process.cwd(), encoding: 'utf8', windowsHide: true });
const completedAtUtc = new Date().toISOString();
fs.writeFileSync(files[0], result.stdout || '', { flag: 'wx' });
fs.writeFileSync(files[1], result.stderr || '', { flag: 'wx' });
const record = {
  stage, startedAtUtc, completedAtUtc, node: process.version,
  executable: process.execPath, arguments: args, exitCode: result.status,
  signal: result.signal, spawnError: result.error ? String(result.error) : null,
  inputs, stdoutSha256: sha256(result.stdout || ''), stderrSha256: sha256(result.stderr || ''),
};
fs.writeFileSync(files[2], `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ stage, exitCode: result.status, spawnError: record.spawnError,
  summary: (result.stdout || '').split(/\r?\n/).filter((line) => /^# (tests|pass|fail|skipped|duration_ms) /.test(line)) }, null, 2));
if (result.status !== 0) {
  const raw = result.stdout || '';
  console.log(`Full failure output retained at ${files[0]}`);
  process.stdout.write(raw.length <= 6000 ? raw : `${raw.slice(0, 2500)}\n[console excerpt only]\n${raw.slice(-2500)}`);
}
if (result.stderr) process.stderr.write(result.stderr);
process.exitCode = Number.isInteger(result.status) ? result.status : 1;
