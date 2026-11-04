'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync, execFileSync } = require('node:child_process');

assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1',
  'Only exact CAPTURE_BROWSER_EVIDENCE=1 authorizes new append-only raw proof.');
const [label, ...args] = process.argv.slice(2);
assert.match(label || '', /^[a-z][a-z0-9-]{0,47}$/);
assert.ok(args.length, 'Provide a Node command to capture.');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const relative = file => path.relative(repository, file);
const hash = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}-${label}`;
const directory = path.join(root, 'evidence', 'raw', id);
fs.mkdirSync(directory, { recursive: true });
const owned = [];
function visit(folder) {
  for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
    if (entry.name === 'evidence') continue;
    const file = path.join(folder, entry.name);
    if (entry.isDirectory()) visit(file);
    else owned.push(file);
  }
}
visit(root);
const snapshots = owned.sort().map((file, index) => {
  const bytes = fs.readFileSync(file);
  const output = path.join(directory, `source-${String(index).padStart(3, '0')}.gz`);
  fs.writeFileSync(output, zlib.gzipSync(bytes), { flag: 'wx' });
  return {
    path: relative(file), rawSha256: hash(bytes),
    gitCanonicalSha256: hash(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))),
    rawCRLF: (bytes.toString('utf8').match(/\r\n/g) || []).length,
    snapshot: relative(output)
  };
});
const dependencies = [
  'capability\\C003\\matrix-contract.js', 'capability\\C003\\matrix-data.js',
  'capability\\C005\\catalog-contract.js', 'capability\\C005\\catalog-data.js',
  'capability\\C006\\search.js', 'capability\\C007\\catalog-filters.js',
  'capability\\local-harness\\index.html', 'capability\\local-harness\\composition.js',
  'testing\\browser\\isolated.cjs'
].map(name => {
  const bytes = fs.readFileSync(path.join(repository, name));
  const commit = execFileSync('git', ['--no-pager', 'log', '-1', '--format=%H', '--', name],
    { cwd: repository, encoding: 'utf8' }).trim();
  const canonical = execFileSync('git', ['--no-pager', 'show', `${commit}:${name.replaceAll('\\', '/')}`],
    { cwd: repository, encoding: 'buffer' });
  assert.deepEqual(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')), canonical,
    `Shared provider must remain unchanged: ${name}`);
  return {
    path: name, commit, rawSha256: hash(bytes), gitCanonicalSha256: hash(canonical),
    rawCRLF: (bytes.toString('utf8').match(/\r\n/g) || []).length,
    canonicalUnchanged: true
  };
});
assert.equal(dependencies.find(item => item.path === 'capability\\C005\\catalog-data.js').rawSha256,
  '193cc3dd536b2202f5b941366c151d11d4e01ad2d3bbb2d179ce94cf16ff76f6');
assert.equal(dependencies.find(item => item.path === 'testing\\browser\\isolated.cjs').rawSha256,
  '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
const startedAtUtc = new Date().toISOString();
const observed = spawnSync(process.execPath, args, {
  cwd: repository, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024,
  env: { ...process.env, NODE_DISABLE_COLORS: '1' }
});
const streams = {};
for (const name of ['stdout', 'stderr']) {
  const bytes = observed[name] || Buffer.alloc(0);
  const file = path.join(directory, `${name}.raw.gz`);
  fs.writeFileSync(file, zlib.gzipSync(bytes), { flag: 'wx' });
  streams[name] = {
    path: relative(file), sha256: hash(bytes), bytes: bytes.length,
    rawCRLF: (bytes.toString('utf8').match(/\r\n/g) || []).length
  };
}
const record = {
  schema: 'X003/raw-proof/1', cardId: 'X003', workerId: 'worker-X003', label,
  startedAtUtc, finishedAtUtc: new Date().toISOString(), runtime: process.version,
  executable: process.execPath, arguments: args, status: observed.status, signal: observed.signal,
  spawnError: observed.error ? { code: observed.error.code, message: observed.error.message } : null,
  captureRequested: true, rawPreservedWithoutNormalization: true, snapshots, dependencies, streams
};
const recordPath = path.join(directory, 'record.json');
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(observed.stdout || Buffer.alloc(0));
process.stderr.write(observed.stderr || Buffer.alloc(0));
console.log(`RAW_RECORD ${relative(recordPath)}`);
process.exitCode = observed.status === null ? 1 : observed.status;
