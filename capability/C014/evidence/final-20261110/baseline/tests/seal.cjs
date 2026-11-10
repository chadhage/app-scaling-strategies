'use strict';

// Test tooling, not production code: the SEAL. evidence\seal.json is written LAST (flag wx: it can never be rewritten) and holds the SHA-256, raw and LF-normalized, of every file at the
// root of the namespace (the README, the feature, imports.json and the production files included), every file under tests\ and every evidence file that no recorder manifest pins by itself (the
// manifests, the mutation reports and equivalences, the specs, the retained snapshots and the stub; the raw transcripts are pinned by their manifests). The README is the input of no capture
// (it states their figures), so it is pinned HERE and nowhere else. tests\integrity.test.cjs recomputes the seal. A consistent rewrite of the seal together with the files is not detectable
// by a test: the published commit and its tag are the anchor.
// Usage (repository root, after every capture and every edit): node capability\C014\tests\seal.cjs
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');

const ROOT = path.resolve(__dirname, '..');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const lf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return entry.name === 'raw' || entry.name === 'scratch' ? [] : walk(full);
    return [full];
  });
}

// Every name the seal covers, relative to the namespace with forward slashes.
function sealedNames(root = ROOT) {
  const relative = (file) => path.relative(root, file).split(path.sep).join('/');
  const atRoot = fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name);
  const below = ['tests', 'evidence'].flatMap((name) => (fs.existsSync(path.join(root, name)) ? walk(path.join(root, name)).map(relative) : []));
  return [...atRoot, ...below].filter((name) => name !== 'evidence/seal.json').sort();
}

// The problems of a seal: a file that differs from its pin (raw or LF form), a file that was sealed and is gone, a file that exists and was never sealed.
function verifySeal(seal, { read, names }) {
  const problems = [];
  for (const [name, hash] of Object.entries(seal.files)) {
    const bytes = read(name);
    if (bytes === undefined) problems.push(`seal: ${name} is missing`);
    else if (sha(bytes) !== hash && sha(lf(bytes)) !== seal.lf[name]) problems.push(`seal: ${name} differs from its pin`);
  }
  for (const name of names) if (!Object.hasOwn(seal.files, name)) problems.push(`seal: ${name} is not sealed`);
  return problems;
}

function writeSeal(root = ROOT) {
  const files = {};
  const lfs = {};
  for (const name of sealedNames(root)) {
    const bytes = fs.readFileSync(path.join(root, name));
    files[name] = sha(bytes);
    lfs[name] = sha(lf(bytes));
  }
  const note = 'written last by tests/seal.cjs; a consistent rewrite of the seal together with the files is not detectable by a test: the published commit is the anchor';
  fs.writeFileSync(path.join(root, 'evidence', 'seal.json'), `${JSON.stringify({ schemaVersion: 1, note, files, lf: lfs }, null, 1)}\n`, { flag: 'wx' });
  return Object.keys(files).length;
}

if (require.main === module) console.log(`sealed ${writeSeal()} files`);

module.exports = Object.freeze({ sha, lf, sealedNames, verifySeal, writeSeal });
