'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sourcePaths = Object.freeze([
  '.gitattributes', 'hot-partition.feature', 'model.js', 'app.js', 'index.html', 'styles.css',
  'manifest.json', 'README.md', 'tests/model.test.cjs', 'tests/surface.test.cjs',
  'tests/browser.test.cjs', 'tests/seal.cjs', 'tests/integrity.test.cjs',
  'evidence/iac-decision.json', 'evidence/provenance.json',
]);
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const canonical = (bytes) => Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'), 'utf8');

function blob(file, bytes, filtered = true) {
  const args = ['hash-object'];
  if (filtered) args.push(`--path=learning/S065/${file}`);
  args.push('--stdin');
  return execFileSync('git', args, { cwd: repo, input: bytes, encoding: 'utf8', windowsHide: true }).trim();
}

function rawPaths(directory) {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true })
    .flatMap((entry) => entry.isDirectory() ? rawPaths(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`])
    .sort();
}

function seal() {
  const source = sourcePaths.map((file) => {
    const raw = fs.readFileSync(path.join(root, file));
    const bytes = canonical(raw);
    const gitBlobOid = blob(file, raw);
    if (gitBlobOid !== blob(file, bytes, false)) throw new Error(`Git source normalization disagrees: ${file}`);
    return { path: file, canonicalSha256: digest(bytes), canonicalBytes: bytes.length, gitBlobOid };
  });
  const raw = [...rawPaths('evidence/red'), ...rawPaths('evidence/raw')].map((file) => {
    const bytes = fs.readFileSync(path.join(root, file));
    const gitBlobOid = blob(file, bytes);
    if (gitBlobOid !== blob(file, bytes, false)) throw new Error(`Raw evidence would be normalized by Git: ${file}`);
    return { path: file, rawSha256: digest(bytes), bytes: bytes.length, gitBlobOid };
  });
  return {
    schemaVersion: 1, cardId: 'A-S065', workerId: 'worker-A-S065',
    sourceHash: 'SHA256 of canonical UTF-8 bytes with CRLF normalized to LF; Git path-filtered blobs independently agree.',
    rawHash: 'SHA256 of exact retained bytes; owned evidence/red/** and evidence/raw/** -text attributes.',
    policy: 'Normal tests verify only. Resealing requires the explicit --write command after intentional reviewed changes.',
    source, raw,
  };
}

if (require.main === module) {
  if (process.argv.length !== 3 || process.argv[2] !== '--write') {
    throw new Error('No implicit writes. Deliberate reseal requires: node learning\\S065\\tests\\seal.cjs --write');
  }
  fs.writeFileSync(path.join(root, 'evidence', 'integrity.json'), `${JSON.stringify(seal(), null, 2)}\n`, 'utf8');
  console.log('A-S065 source/raw integrity sealed deliberately; verification is read-only.');
}

module.exports = { root, repo, sourcePaths, digest, canonical, blob, rawPaths };
