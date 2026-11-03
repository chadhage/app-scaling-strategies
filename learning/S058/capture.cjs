'use strict';

const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const [label, expectedText, ...args] = process.argv.slice(2);
assert.match(label || '', /^[a-z][a-z0-9-]{1,60}$/);
assert.match(expectedText || '', /^(0|1)$/);
assert.ok(args.length > 0);
const folder = path.join(__dirname, 'evidence');
fs.mkdirSync(folder, { recursive: true });
for (const suffix of ['json', 'stdout.txt', 'stderr.txt']) {
  assert.equal(fs.existsSync(path.join(folder, `${label}.${suffix}`)), false, 'Raw receipts are append-only.');
}
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const startedAtUtc = new Date().toISOString();
const result = spawnSync(process.execPath, args, {
  cwd: path.resolve(__dirname, '..', '..'), encoding: null, timeout: 180000, maxBuffer: 8 * 1024 * 1024,
});
const streams = {};
for (const name of ['stdout', 'stderr']) {
  const raw = result[name] || Buffer.alloc(0);
  const file = `${label}.${name}.txt`;
  fs.writeFileSync(path.join(folder, file), raw, { flag: 'wx' });
  streams[name] = { file, bytes: raw.length, sha256: hash(raw) };
  (name === 'stdout' ? process.stdout : process.stderr).write(raw);
}
const receipt = {
  cardId: 'A-S058', workerId: 'worker-A-S058', label, startedAtUtc, finishedAtUtc: new Date().toISOString(),
  command: [process.execPath, ...args], node: process.version, expectedExitCode: Number(expectedText),
  exitCode: result.status, signal: result.signal, processError: result.error?.message || null,
  browserCaptureAuthorized: process.env.CAPTURE_BROWSER_EVIDENCE === '1', ...streams,
};
fs.writeFileSync(path.join(folder, `${label}.json`), `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
assert.equal(receipt.processError, null);
assert.equal(receipt.exitCode, receipt.expectedExitCode, `Unexpected ${label} exit; retain this raw receipt and use a new label.`);
