'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { gzipSync } = require('node:zlib');

const [stage, ...arguments_] = process.argv.slice(2);
if (!/^[a-z][a-z0-9-]{0,48}$/.test(stage || '') || !arguments_.length) {
  throw new Error('Explicit capture: node capability\\C024\\tests\\record.cjs <stage> <Node arguments>');
}
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
fs.mkdirSync(evidence, { recursive: true });
const filename = path.join(evidence, `${stage}.json`);
if (fs.existsSync(filename)) throw new Error('Historical records are immutable; use a distinct stage name.');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
function list(directory) {
  return fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.name !== 'evidence' && entry.name !== 'evidence.json')
    .flatMap((entry) => {
      const target = path.join(directory, entry.name);
      return entry.isDirectory() ? list(target) : [target];
    });
}
const sourceHashes = [...list(root), ...[
  ['capability', 'C020', 'contract.js'], ['capability', 'C020', 'profiles.cjs'],
  ['testing', 'browser', 'isolated.cjs']
].map((parts) => path.join(repository, ...parts))].map((file) => ({
  path: path.relative(repository, file), sha256: sha256(fs.readFileSync(file))
}));
const startedAtUtc = new Date().toISOString();
const run = spawnSync(process.execPath, arguments_, {
  cwd: repository, encoding: null, timeout: 120000, maxBuffer: 8 * 1024 * 1024
});
const output = {};
for (const name of ['stdout', 'stderr']) {
  const bytes = run[name] || Buffer.alloc(0);
  const target = path.join(evidence, `${stage}.${name}.gz`);
  fs.writeFileSync(target, gzipSync(bytes), { flag: 'wx' });
  output[name] = { path: path.relative(repository, target), bytes: bytes.length, sha256: sha256(bytes) };
  process[name].write(bytes);
}
const record = {
  cardId: 'C024', stage, command: ['node', ...arguments_], runtime: process.version,
  startedAtUtc, completedAtUtc: new Date().toISOString(), exitCode: run.status,
  signal: run.signal, error: run.error?.message || null,
  historicalSubject: process.env.C024_TEST_SUBJECT || null, sourceHashes, output
};
fs.writeFileSync(filename, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
console.log(`C024 ${stage}: exit=${run.status}; exact output preserved in gzip.`);
process.exitCode = Number.isInteger(run.status) ? run.status : 1;
