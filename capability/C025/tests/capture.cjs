'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const [label, expectedText, ...args] = process.argv.slice(2);
assert.match(label || '', /^[a-z][a-z0-9-]{0,60}$/);
assert.match(expectedText || '', /^[01]$/);
assert.ok(args.length > 0);
const root = path.resolve(__dirname, '..');
const result = spawnSync(process.execPath, args, {
  cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024
});
const record = {
  label: '[C025][S]', stage: label, runtime: process.version,
  command: ['node', ...args], exitCode: result.status,
  spawnError: result.error?.code || null,
  stdoutSha256: createHash('sha256').update(result.stdout || '').digest('hex'),
  stderrSha256: createHash('sha256').update(result.stderr || '').digest('hex'),
  tests: Number(/^# tests (\d+)$/m.exec(result.stdout || '')?.[1] || 0),
  passed: Number(/^# pass (\d+)$/m.exec(result.stdout || '')?.[1] || 0),
  failed: Number(/^# fail (\d+)$/m.exec(result.stdout || '')?.[1] || 0)
};
fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
for (const stream of ['stdout', 'stderr']) {
  fs.writeFileSync(path.join(root, 'evidence', `${label}.${stream}.gz`), gzipSync(result[stream] || ''));
}
fs.writeFileSync(path.join(root, 'evidence', `${label}.json`), `${JSON.stringify(record, null, 2)}\n`);
if (result.status !== Number(expectedText) || result.error) {
  process.stdout.write((result.stdout || '').slice(-12000));
  process.stderr.write((result.stderr || '').slice(-6000));
}
assert.equal(result.error, undefined);
assert.equal(result.status, Number(expectedText), `Expected deliberate ${label} exit ${expectedText}.`);
console.log(JSON.stringify(record));
