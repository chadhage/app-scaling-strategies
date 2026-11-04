'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');

function inventory(base, excluded = []) {
  const result = {};
  function visit(directory, relative = '') {
    for (const name of fs.readdirSync(directory).sort()) {
      const file = path.join(relative, name);
      if (excluded.includes(file)) continue;
      const target = path.join(base, file);
      const stat = fs.lstatSync(target);
      if (stat.isSymbolicLink()) throw new Error('Byte inventory will not follow links.');
      if (stat.isDirectory()) visit(target, file);
      else if (stat.isFile()) result[file] = sha(fs.readFileSync(target));
      else throw new Error('Byte inventory requires regular files.');
    }
  }
  visit(base);
  return result;
}

function dependencies() {
  return Object.fromEntries(['C001', 'C002', 'C015'].map((id) =>
    [id, inventory(path.join(repo, 'capability', id), id === 'C015' ? ['test-scratch', 'publication.json'] : [])]));
}

function pinDependencies() {
  const observedHead = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim();
  const records = [];
  const names = execFileSync('git', ['ls-files', '--', 'capability\\C001', 'capability\\C002', 'capability\\C015'],
    { cwd: repo, encoding: 'utf8' }).trim().split(/\r?\n/);
  for (const gitFile of names) {
    const file = gitFile.split('/').join(path.sep);
    const raw = fs.readFileSync(path.join(repo, file));
    const canonical = execFileSync('git', ['--no-pager', 'show', `${observedHead}:${gitFile}`], { cwd: repo, maxBuffer: 8 * 1024 * 1024 });
    records.push({
      file, rawBytes: raw.length, rawSha256: sha(raw), rawCRLF: (raw.toString('utf8').match(/\r\n/g) || []).length,
      gitCanonicalBytes: canonical.length, gitCanonicalSha256: sha(canonical),
    });
  }
  const value = {
    schemaVersion: 1, cardId: 'C016', kind: 'immutable-accepted-dependency-byte-pins',
    observedHead, independentlyAcceptedC015Commit: '78341b3370d7764b7f9c3eacc1796892dbc4f40f',
    records,
  };
  fs.writeFileSync(path.join(root, 'dependency-pins.json'), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ observedHead, pinnedFiles: records.length, writtenOwnedFile: 'dependency-pins.json' }));
}

module.exports = Object.freeze({ root, repo, sha, inventory, dependencies, pinDependencies, randomUUID });
if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== 'pin-accepted') throw new Error('Explicit one-time pin-accepted only.');
  pinDependencies();
}
