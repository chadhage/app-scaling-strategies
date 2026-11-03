'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { execFileSync, spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const folder = path.resolve(__dirname, '..');
const repo = path.resolve(folder, '..', '..');
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exclusions = [
  path.join('evidence', 'integrity.json'),
  ...['stdout.txt', 'stderr.txt', 'run.json'].map((name) => path.join('evidence', 'raw', 'integrity', name)),
];
function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.isSymbolicLink()) throw new Error('Owned integrity inputs cannot be symlinks');
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(file) : [file];
  });
}
if (process.argv[2] !== '--capture') throw new Error('Explicit --capture is required; normal integrity verification is read-only.');
const indexPath = path.join(folder, 'evidence', 'integrity.json');
if (fs.existsSync(indexPath)) throw new Error('Retained integrity proof will not be overwritten.');
const files = walk(folder)
  .filter((file) => !exclusions.includes(path.relative(folder, file)))
  .sort()
  .map((file) => {
    const relative = path.relative(folder, file);
    const proof = relative.startsWith(`evidence${path.sep}`);
    const raw = fs.readFileSync(file);
    const bytes = proof ? raw : Buffer.from(raw.toString('utf8').replace(/\r\n/g, '\n'));
    return {
      path: relative, mode: proof ? 'raw-proof-bytes' : 'canonical-lf-git-source',
      bytes: bytes.length, sha256: sha256(bytes),
      gitBlobSha1: execFileSync('git', ['hash-object', `--path=${path.basename(file)}`, file], {
        cwd: path.dirname(file), encoding: 'utf8', windowsHide: true,
      }).trim(),
    };
  });
fs.writeFileSync(indexPath, `${JSON.stringify({
  cardId: 'A-S064', kanoUnit: 'A-S064', packet: 'SC-S064', workerId: 'worker-A-S064',
  createdAtUtc: new Date().toISOString(), node: process.version,
  headAtQualification: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(),
  exclusions,
  exclusionReason: 'Only this self-referential index and its own raw command receipt/streams. Receipt stream hashes are independently verified on subsequent read-only runs.',
  files,
}, null, 2)}\n`, { flag: 'wx' });
console.log(`Qualified ${files.length} owned files: byte-exact proof and canonical LF Git-filtered source.`);
const result = spawnSync(process.execPath, ['--test', path.join(__dirname, 'integrity.test.cjs')], {
  cwd: repo, stdio: 'inherit', windowsHide: true,
});
if (result.error) throw result.error;
process.exitCode = result.status === 0 ? 0 : 1;
