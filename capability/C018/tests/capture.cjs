'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const phase = process.argv[2];
if (process.argv.length !== 3 || !['red', 'focused', 'routes', 'integrity', 'syntax', 'browser'].includes(phase)) {
  throw new Error('Choose exactly red, focused, routes, integrity, syntax or browser deliberate owned capture.');
}
if (phase === 'browser' && process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Only exact CAPTURE_BROWSER_EVIDENCE=1 permits deliberate browser capture.');
}
const id = randomUUID();
const base = path.join(root, 'evidence', `${phase}-${id}`);
fs.mkdirSync(path.dirname(base), { recursive: true });
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const snapshots = [];
if (phase === 'red') {
  for (const relative of ['reader.cjs', 'fresh-reader.cjs', 'tests\\progress.test.cjs']) {
    const bytes = fs.readFileSync(path.join(root, relative));
    const file = `${base}-${path.basename(relative)}.snapshot`;
    fs.writeFileSync(file, bytes, { flag: 'wx' });
    snapshots.push({ path: path.relative(root, file), sha256: hash(bytes) });
  }
}
const args = phase === 'red'
  ? ['--test', '--test-concurrency=1', path.join(__dirname, 'progress.test.cjs')]
  : [path.join(__dirname, 'verify.cjs'), phase];
const startedAtUtc = new Date().toISOString();
const observed = spawnSync(process.execPath, args, {
  timeout: 600000, maxBuffer: 8 * 1024 * 1024, windowsHide: true,
});
const stdout = observed.stdout || Buffer.alloc(0);
const stderr = observed.stderr || Buffer.alloc(0);
fs.writeFileSync(`${base}.stdout.raw`, stdout, { flag: 'wx' });
fs.writeFileSync(`${base}.stderr.raw`, stderr, { flag: 'wx' });
const report = {
  cardId: 'C018', workerId: 'worker-C018', phase, id, startedAtUtc,
  finishedAtUtc: new Date().toISOString(), command: [process.execPath, ...args],
  exitCode: observed.status, signal: observed.signal, error: observed.error?.message || null,
  stdout: { path: path.relative(root, `${base}.stdout.raw`), sha256: hash(stdout), bytes: stdout.length },
  stderr: { path: path.relative(root, `${base}.stderr.raw`), sha256: hash(stderr), bytes: stderr.length },
  snapshots, node: process.version,
};
fs.writeFileSync(`${base}.raw.json`, `${JSON.stringify(report, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(stdout);
process.stderr.write(stderr);
console.log(JSON.stringify({ capture: path.relative(root, `${base}.raw.json`), exitCode: observed.status }));
if (phase === 'red') {
  process.exitCode = observed.status === 1 && stdout.includes(Buffer.from('ERR_ASSERTION')) && !observed.error ? 0 : 1;
} else {
  process.exitCode = observed.status === 0 && !observed.error ? 0 : 1;
}
