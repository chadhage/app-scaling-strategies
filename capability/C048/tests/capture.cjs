'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { spawnSync, execFileSync } = require('node:child_process');

assert.equal(process.env.CAPTURE_BROWSER_EVIDENCE, '1', 'Only exact CAPTURE_BROWSER_EVIDENCE=1 permits new raw proof.');
const [label, ...args] = process.argv.slice(2);
assert.match(label || '', /^[a-z][a-z0-9-]{0,47}$/);
assert.ok(args.length, 'Provide Node arguments to capture.');
const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const id = `${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID()}-${label}`;
const directory = path.join(root, 'evidence', 'raw', id);
fs.mkdirSync(directory, { recursive: true });
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const relative = (file) => path.relative(repository, file);
const snapshots = [];
for (const name of ['.gitattributes', '.gitignore', 'C048.feature', 'admission.js', 'index.html', 'page.js', 'styles.css',
  'tests\\fixtures.cjs', 'tests\\admission.test.cjs', 'tests\\guards.test.cjs', 'tests\\schema.test.cjs',
  'tests\\lineage.test.cjs', 'tests\\surface.test.cjs', 'tests\\browser.cjs', 'tests\\integrity.test.cjs',
  'tests\\syntax.cjs', 'tests\\verify.cjs', 'tests\\publisher-boundary.test.cjs',
  'publication\\publish.cjs.txt', 'publication\\publisher-boundary.cjs.txt', 'tests\\capture.cjs',
  'manifest.json', 'evidence.json', 'CONTRACT.txt', 'PUBLICATION.txt']) {
  const file = path.join(root, name);
  if (!fs.existsSync(file)) continue;
  const bytes = fs.readFileSync(file);
  const output = `${name.replace(/[\\\/]/g, '--')}.source.gz`;
  fs.writeFileSync(path.join(directory, output), zlib.gzipSync(bytes), { flag: 'wx' });
  snapshots.push({
    path: relative(file), rawSha256: sha256(bytes),
    gitCanonicalSha256: sha256(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))),
    snapshot: relative(path.join(directory, output)),
    rawCRLF: (bytes.toString('utf8').match(/\r\n/g) || []).length
  });
}
const dependencies = [
  ['C020', '2dc471daab3ffa202d83aba2df443e280cad3656', 'contract.js'],
  ['C020', '2dc471daab3ffa202d83aba2df443e280cad3656', 'inspector.js'],
  ['C020', '2dc471daab3ffa202d83aba2df443e280cad3656', 'profiles.cjs'],
  ['C021', 'c43069466970696d5433f5282e04e3148433986b', 'compatibility.js'],
  ['C023', '68be1c61cd83f177b45cbef4f4577c80c57d690e', 'ledger.js']
].map(([card, commit, name]) => {
  const file = path.join(repository, 'capability', card, name);
  const bytes = fs.readFileSync(file);
  const canonical = execFileSync('git', ['show', `${commit}:capability/${card}/${name}`], {
    cwd: repository, encoding: 'buffer'
  });
  assert.deepEqual(Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n')), canonical);
  return {
    path: relative(file), commit, rawSha256: sha256(bytes), gitCanonicalSha256: sha256(canonical),
    rawCRLF: (bytes.toString('utf8').match(/\r\n/g) || []).length, canonicalUnchanged: true
  };
});
const startedAtUtc = new Date().toISOString();
const observed = spawnSync(process.execPath, args, {
  cwd: repository, encoding: 'buffer', maxBuffer: 32 * 1024 * 1024,
  env: { ...process.env, NODE_DISABLE_COLORS: '1' }
});
for (const stream of ['stdout', 'stderr']) {
  const bytes = observed[stream] || Buffer.alloc(0);
  fs.writeFileSync(path.join(directory, `${stream}.raw.gz`), zlib.gzipSync(bytes), { flag: 'wx' });
}
const record = {
  schema: 'C048/raw-proof/1', cardId: 'C048', workerId: 'worker-C048', label,
  startedAtUtc, finishedAtUtc: new Date().toISOString(), runtime: process.version,
  executable: process.execPath, arguments: args, status: observed.status, signal: observed.signal,
  spawnError: observed.error ? { code: observed.error.code, message: observed.error.message } : null,
  captureRequested: true, rawPreservedWithoutNormalization: true, snapshots, dependencies,
  streams: Object.fromEntries(['stdout', 'stderr'].map((name) => {
    const bytes = observed[name] || Buffer.alloc(0);
    return [name, {
      path: relative(path.join(directory, `${name}.raw.gz`)), sha256: sha256(bytes), bytes: bytes.length,
      rawCRLF: (bytes.toString('utf8').match(/\r\n/g) || []).length
    }];
  }))
};
const recordPath = path.join(directory, 'record.json');
fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(observed.stdout || Buffer.alloc(0));
process.stderr.write(observed.stderr || Buffer.alloc(0));
console.log(`RAW_RECORD ${relative(recordPath)}`);
process.exitCode = observed.status === null ? 1 : observed.status;
