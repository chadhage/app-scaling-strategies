'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const [stage, expectedText, ...args] = process.argv.slice(2);
assert.match(stage || '', /^[a-z][a-z0-9-]{0,60}$/);
assert.match(expectedText || '', /^[01]$/);
assert.ok(args.length > 0);
const root = path.resolve(__dirname, '..');
for (const extension of ['json', 'stdout.gz', 'stderr.gz']) {
  assert.equal(fs.existsSync(path.join(root, 'evidence', `${stage}.${extension}`)), false, 'Retained attempts cannot be overwritten.');
}
const sourceHashes = fs.readdirSync(root, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile() && /\.(?:cjs|js)$/.test(entry.name))
  .map((entry) => {
    const file = path.join(entry.parentPath, entry.name);
    return { path: path.relative(root, file), sha256: createHash('sha256').update(fs.readFileSync(file)).digest('hex') };
  }).sort((a, b) => a.path.localeCompare(b.path));
const result = spawnSync(process.execPath, args, {
  cwd: root, encoding: 'utf8', timeout: 180000, maxBuffer: 8 * 1024 * 1024
});
const record = {
  label: '[C027][S]', stage, runtime: process.version,
  sourceHashes,
  command: ['node', ...args], exitCode: result.status, spawnError: result.error?.code || null,
  stdoutSha256: createHash('sha256').update(result.stdout || '').digest('hex'),
  stderrSha256: createHash('sha256').update(result.stderr || '').digest('hex'),
  tests: Number(/^# tests (\d+)$/m.exec(result.stdout || '')?.[1] || 0),
  passed: Number(/^# pass (\d+)$/m.exec(result.stdout || '')?.[1] || 0),
  failed: Number(/^# fail (\d+)$/m.exec(result.stdout || '')?.[1] || 0)
};
fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
for (const stream of ['stdout', 'stderr']) {
  fs.writeFileSync(path.join(root, 'evidence', `${stage}.${stream}.gz`), gzipSync(result[stream] || ''), { flag: 'wx' });
}
fs.writeFileSync(path.join(root, 'evidence', `${stage}.json`), `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
if (result.status !== Number(expectedText) || result.error) {
  process.stdout.write((result.stdout || '').slice(-14000));
  process.stderr.write((result.stderr || '').slice(-6000));
}
assert.equal(result.error, undefined);
assert.equal(result.status, Number(expectedText), `Expected deliberate ${stage} exit ${expectedText}.`);
console.log(JSON.stringify(record));
