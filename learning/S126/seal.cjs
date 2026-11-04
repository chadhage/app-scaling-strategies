'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const digest = (bytes, algorithm = 'sha256') => crypto.createHash(algorithm).update(bytes).digest('hex');
const ignored = new Set([
  path.join('evidence', 'source-hashes.json'), path.join('evidence', 'verification.json'),
  path.join('evidence', 'handoff.json'),
]);
function sealedFiles(directory = __dirname, prefix = '') {
  const files = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name);
    assert.equal(entry.isSymbolicLink(), false, `No links in the owned bundle: ${relative}`);
    if (entry.isDirectory()) files.push(...sealedFiles(path.join(directory, entry.name), relative));
    else {
      assert.equal(entry.isFile(), true);
      const dynamicProof = relative.startsWith(`${path.join('evidence', 'raw')}${path.sep}`)
        && /^(?:browser-|pre-browser-focused-green|browser-green|final-readonly-green)/.test(entry.name);
      if (!ignored.has(relative) && !dynamicProof) files.push(relative);
    }
  }
  return files.sort();
}
function describe(relative, bytes) {
  const raw = relative.startsWith(`${path.join('evidence', 'raw')}${path.sep}`)
    || relative.startsWith(`${path.join('evidence', 'red-stub')}${path.sep}`);
  const canonicalLf = Buffer.from(bytes.toString('utf8').replace(/\r\n/g, '\n'));
  const gitBytes = raw ? bytes : canonicalLf;
  return {
    path: relative, gitTextMode: raw ? 'raw' : 'text-lf',
    rawBytes: bytes.length, rawSha256: digest(bytes),
    canonicalLfSha256: digest(canonicalLf),
    canonicalGitBlobOid: digest(Buffer.concat([Buffer.from(`blob ${gitBytes.length}\0`), gitBytes]), 'sha1'),
  };
}
function verify(entry, bytes) {
  const actual = describe(entry.path, bytes);
  assert.equal(actual.canonicalLfSha256, entry.canonicalLfSha256, `Canonical LF bytes: ${entry.path}`);
  assert.equal(actual.canonicalGitBlobOid, entry.canonicalGitBlobOid, `Canonical Git object: ${entry.path}`);
  assert.equal(actual.gitTextMode, entry.gitTextMode);
  if (entry.gitTextMode === 'raw') {
    assert.equal(actual.rawBytes, entry.rawBytes, `Preserved raw byte length: ${entry.path}`);
    assert.equal(actual.rawSha256, entry.rawSha256, `Preserved raw byte hash: ${entry.path}`);
  } else {
    assert.equal(actual.rawSha256 === entry.rawSha256 || actual.rawSha256 === entry.canonicalLfSha256, true,
      `Text must match measured working-tree bytes or published canonical LF: ${entry.path}`);
  }
}
if (require.main === module) {
  assert.deepEqual(process.argv.slice(2), ['--capture'], 'Source sealing is deliberate only, not a normal test.');
  const files = sealedFiles();
  const seal = {
    schemaVersion: 1, cardId: 'A-S126', capturedAtUtc: new Date().toISOString(),
    interpretation: 'Raw working-tree SHA-256, canonical LF SHA-256 and canonical Git blob identity are separate; raw proof is never normalized.',
    entries: files.map((relative) => describe(relative, fs.readFileSync(path.join(__dirname, relative)))),
    exclusions: 'Self-referential seal/verifier/handoff and later uniquely named browser/green raw captures; those captures retain their own measured source hashes.',
    extraKanoCredits: 0,
  };
  fs.writeFileSync(path.join(__dirname, 'evidence', 'source-hashes.json'), `${JSON.stringify(seal, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ sealedFiles: files.length, preservedRawFiles: seal.entries.filter((entry) => entry.gitTextMode === 'raw').length }));
}
module.exports = { sealedFiles, describe, verify };
