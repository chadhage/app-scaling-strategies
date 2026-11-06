'use strict';

// Test tooling, not production code: verifies imports.json against the working tree and the accepted Git blobs.
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const pins = JSON.parse(fs.readFileSync(path.join(root, 'imports.json'), 'utf8'));
const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const normalize = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));

function acceptedBlob(entry) {
  const spec = `${pins.accepted[entry.card].commit}:${entry.path.replaceAll('\\', '/')}`;
  return execFileSync('git', ['--no-pager', 'show', spec], { cwd: repository, maxBuffer: 1 << 24, windowsHide: true, timeout: 15000 });
}

function checkImports() {
  return pins.dependencies.map((entry) => {
    const raw = fs.readFileSync(path.join(repository, entry.path));
    const blob = acceptedBlob(entry);
    return {
      path: entry.path, rawMatches: sha256(raw) === entry.raw, lfMatches: sha256(normalize(raw)) === entry.lf,
      gitMatches: sha256(blob) === entry.git, rawEqualsGit: raw.equals(blob),
    };
  });
}

function tagCommit(tag) {
  return execFileSync('git', ['--no-pager', 'rev-parse', `${tag}^{commit}`], { cwd: repository, encoding: 'utf8', windowsHide: true, timeout: 15000 }).trim();
}

module.exports = Object.freeze({ pins, sha256, checkImports, tagCommit, repository });
