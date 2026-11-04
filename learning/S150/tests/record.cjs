'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const stage = process.argv[2];
if (stage !== 'red') throw new Error('Only deliberate initial behavioral RED recording is supported.');
const files = ['model.js', 'tests\\model.test.cjs', 'retirement.feature', '.gitattributes'];
for (const name of ['red.stdout.raw', 'red.stderr.raw', 'red.json',
  'red-model.js.snapshot', 'red-model-test.cjs.snapshot']) {
  if (fs.existsSync(path.join(root, 'evidence', name))) throw new Error(`Refusing to overwrite ${name}`);
}
const originals = Object.fromEntries(files.map((file) => [file, fs.readFileSync(path.join(root, file))]));
const args = ['--test', '--test-concurrency=1', 'learning\\S150\\tests\\model.test.cjs'];
const result = spawnSync(process.execPath, args, { cwd: repo, encoding: null });
const stdout = result.stdout || Buffer.alloc(0);
const stderr = result.stderr || Buffer.alloc(0);
if (result.status !== 1 || !stdout.toString().includes('ERR_ASSERTION')
    || !stdout.toString().includes('NOT_IMPLEMENTED')) {
  process.stdout.write(stdout);
  process.stderr.write(stderr);
  throw new Error('Expected a genuinely loaded behavioral assertion RED, not an import/tooling failure.');
}
fs.mkdirSync(path.join(root, 'evidence'), { recursive: true });
const write = (file, bytes) => fs.writeFileSync(path.join(root, 'evidence', file), bytes, { flag: 'wx' });
write('red.stdout.raw', stdout);
write('red.stderr.raw', stderr);
write('red-model.js.snapshot', originals['model.js']);
write('red-model-test.cjs.snapshot', originals['tests\\model.test.cjs']);
write('red.json', `${JSON.stringify({
  cardId: 'A-S150', workerId: 'worker-A-S150', stage: 'genuine-behavioral-RED',
  command: [process.execPath, ...args], runtime: process.version,
  recordedAtUtc: new Date().toISOString(), exitCode: result.status,
  expectedFailure: 'REJECTED versus NOT_IMPLEMENTED; module loaded successfully',
  sourceRawSha256: Object.fromEntries(files.map((file) => [file, sha(originals[file])])),
  stdoutSha256: sha(stdout), stderrSha256: sha(stderr),
  rawSnapshotsOutsideAutodiscovery: true, extraKanoCredit: 0,
}, null, 2)}\n`);
process.stdout.write(stdout);
process.stdout.write('Expected genuine assertion RED preserved without overwriting evidence.\n');
