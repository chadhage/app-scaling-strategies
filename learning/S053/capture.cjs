'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const root = path.resolve(__dirname, '..', '..');
const [label, expectedText, ...args] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{0,60}$/.test(label || '')
    || !/^[01]$/.test(expectedText || '') || args.length === 0) {
  throw new Error('Usage: node learning\\S053\\capture.cjs <unique-label> <expected-exit:0|1> <node arguments>');
}
if (args.some((arg) => /browser\.cjs$/.test(arg))
    && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Browser proof capture requires deliberate CAPTURE_BROWSER_EVIDENCE=1.');
}
const folder = path.join(__dirname, 'evidence');
fs.mkdirSync(folder, { recursive: true });
const receiptPath = path.join(folder, `${label}.json`);
const stdoutPath = path.join(folder, `${label}.stdout.txt`);
const stderrPath = path.join(folder, `${label}.stderr.txt`);
for (const file of [receiptPath, stdoutPath, stderrPath]) {
  if (fs.existsSync(file)) throw new Error(`Refusing to overwrite retained evidence: ${file}`);
}
const startedAtUtc = new Date().toISOString();
const run = spawnSync(process.execPath, args, {
  cwd: root, encoding: null, maxBuffer: 8 * 1024 * 1024, timeout: 180000,
  env: { ...process.env },
});
const stdout = run.stdout || Buffer.alloc(0);
const stderr = run.stderr || Buffer.alloc(0);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
fs.writeFileSync(stdoutPath, stdout, { flag: 'wx' });
fs.writeFileSync(stderrPath, stderr, { flag: 'wx' });
const receipt = {
  schemaVersion: 1, cardId: 'A-S053', workerId: 'worker-A-S053', label,
  command: [process.execPath, ...args], cwd: root, node: process.version,
  startedAtUtc, finishedAtUtc: new Date().toISOString(),
  expectedExitCode: Number(expectedText), exitCode: run.status, signal: run.signal,
  processError: run.error ? run.error.message : null,
  stdout: { file: `${label}.stdout.txt`, bytes: stdout.length, sha256: digest(stdout) },
  stderr: { file: `${label}.stderr.txt`, bytes: stderr.length, sha256: digest(stderr) },
  browserCaptureAuthorized: process.env.CAPTURE_BROWSER_EVIDENCE === '1',
};
fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(JSON.stringify({ receipt: path.relative(root, receiptPath), exitCode: run.status }));
process.exitCode = !run.error && run.status === Number(expectedText) ? 0 : 1;
