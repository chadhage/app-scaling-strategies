'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const [label, expectedText, ...args] = process.argv.slice(2);
assert.match(label || '', /^(red|green|syntax|browser|integrity)-\d{3}$/);
assert.match(expectedText || '', /^(0|1)$/);
assert.ok(args.length > 0);
if (label.startsWith('browser-')) {
  assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Browser capture must be deliberate.');
  assert.equal(process.env.BROWSER_EVIDENCE_ID, label);
}
const folder = path.resolve(__dirname, '..');
const repo = path.resolve(folder, '..', '..');
const destination = path.join(folder, 'evidence', 'raw', label);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
for (const name of ['run.json', 'stdout.txt', 'stderr.txt']) {
  assert.equal(fs.existsSync(path.join(destination, name)), false, 'Use a fresh append-only evidence label.');
}
fs.mkdirSync(destination, { recursive: true });
const startedAtUtc = new Date().toISOString();
const headAtStart = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
const result = spawnSync(process.execPath, args, {
  cwd: repo, encoding: null, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
});
const streams = {};
for (const name of ['stdout', 'stderr']) {
  const raw = result[name] || Buffer.alloc(0);
  const file = `${name}.txt`;
  fs.writeFileSync(path.join(destination, file), raw, { flag: 'wx' });
  streams[name] = { file, bytes: raw.length, sha256: hash(raw) };
  (name === 'stdout' ? process.stdout : process.stderr).write(raw);
}
const receipt = {
  cardId: 'A-S063', workerId: 'worker-A-S063', kanoUnit: 'A-S063', packet: 'SC-S063',
  label, cwd: repo, command: [process.execPath, ...args], node: process.version,
  headAtStart, startedAtUtc, finishedAtUtc: new Date().toISOString(),
  expectedExitCode: Number(expectedText), exitCode: result.status, signal: result.signal,
  processError: result.error?.message || null,
  browserCaptureAuthorized: process.env.CAPTURE_BROWSER_EVIDENCE === '1', ...streams,
};
fs.writeFileSync(path.join(destination, 'run.json'), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
assert.equal(receipt.processError, null);
assert.equal(receipt.exitCode, receipt.expectedExitCode, `Unexpected ${label} result; preserve this evidence and use a new label.`);
