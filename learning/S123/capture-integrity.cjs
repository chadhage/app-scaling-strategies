'use strict';

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

if (process.env.CAPTURE_BROWSER_EVIDENCE !== '1') {
  throw new Error('Explicit CAPTURE_BROWSER_EVIDENCE=1 is required for deliberate evidence sealing; normal verification is read-only.');
}

const root = path.resolve(__dirname, '..', '..');
const sealPath = path.join(__dirname, 'evidence', 'source-hashes.json');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const files = {};

function walk(directory, prefix = '') {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = path.join(prefix, entry.name);
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      walk(target, name);
      continue;
    }
    if (!entry.isFile()) throw new Error('Only ordinary owned lesson files may be sealed.');
    if (target === sealPath) continue;
    const bytes = fs.readFileSync(target);
    const raw = name.startsWith(path.join('evidence', 'raw') + path.sep)
      || name.startsWith(path.join('evidence', 'red-stub') + path.sep);
    const repoPath = path.join('learning', 'S123', name);
    files[name] = {
      gitText: !raw,
      rawSha256: sha(bytes),
      canonicalGitSha256: sha(raw ? bytes : Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'))),
      rawGitBlobSha1: execFileSync('git', ['hash-object', '--no-filters', repoPath], { cwd: root, encoding: 'utf8' }).trim(),
      canonicalGitBlobSha1: execFileSync('git', ['hash-object', `--path=${repoPath}`, repoPath], { cwd: root, encoding: 'utf8' }).trim(),
    };
  }
}

walk(__dirname);
fs.writeFileSync(sealPath, `${JSON.stringify({
  schemaVersion: 1, cardId: 'A-S123',
  convention: 'Raw bytes and attribute-filtered canonical Git bytes are separate; raw proof is -text.',
  files,
}, null, 2)}\n`);
console.log(`Explicit integrity seal captured for ${Object.keys(files).length} owned files.`);
