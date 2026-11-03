'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawnSync } = require('node:child_process');
const lesson = path.resolve(__dirname, '..');
const repo = path.resolve(lesson, '..', '..');
const sha256 = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
function files(directory = lesson) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? files(target) : [target];
  }).filter((file) => {
    const relative = path.relative(lesson, file);
    return relative !== path.join('evidence', 'content-index.json')
      && !relative.startsWith(`${path.join('evidence', 'captures')}${path.sep}`);
  }).sort();
}
function canonical(file, bytes) {
  return path.relative(lesson, file).startsWith(`${path.join('evidence', 'raw')}${path.sep}`)
    ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
}
function gitBlob(file, bytes) {
  // --path takes a Git object name; Windows separators would bypass raw attributes.
  const gitPath = path.relative(repo, file).split(path.sep).join('/');
  const run = spawnSync('git', ['hash-object', '--path', gitPath, '--stdin'], {
    cwd: repo, input: bytes, windowsHide: true,
  });
  if (run.error || run.status !== 0) throw run.error || new Error(run.stderr.toString());
  return run.stdout.toString().trim();
}
function build() {
  return files().map((file) => {
    const raw = fs.readFileSync(file);
    const bytes = canonical(file, raw);
    return {
      path: path.relative(lesson, file),
      mode: raw === bytes ? 'raw-bytes' : 'canonical-lf-text',
      bytes: bytes.length, sha256: sha256(bytes), gitBlob: gitBlob(file, raw),
    };
  });
}
if (require.main === module) {
  if (process.argv[2] !== '--write' || process.argv.length !== 3) {
    throw new Error('Deliberate sealing only: node tools\\seal.cjs --write. Normal tests never update proof.');
  }
  const entries = build();
  fs.writeFileSync(path.join(lesson, 'evidence', 'content-index.json'), `${JSON.stringify({
    schemaVersion: 1, cardId: 'A-S079', recordedAtUtc: new Date().toISOString(),
    policy: 'Exact raw bytes under evidence\\raw; canonical LF for Git text. Captures and this index excluded to avoid self-reference. Git clean-filter object IDs qualified read-only.',
    entries,
  }, null, 2)}\n`);
  console.log(`Sealed ${entries.length} owned source/provenance files; deliberate captures excluded.`);
}
module.exports = { files, canonical, gitBlob, sha256, build };
