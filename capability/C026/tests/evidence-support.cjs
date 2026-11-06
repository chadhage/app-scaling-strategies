'use strict';

// Test tooling, not production code: reads evidence.json and recomputes the hashes of the archived bytes.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const resolve = (relative) => path.join(repository, ...relative.split('\\'));
const read = (relative) => fs.readFileSync(resolve(relative));
const index = JSON.parse(fs.readFileSync(path.join(root, 'evidence.json'), 'utf8'));
const PRODUCTION = Object.freeze(['framing.cjs', 'stream.cjs', 'server.cjs', 'conversation.cjs', 'page.js', 'index.html', 'styles.css']);
// SHA-256 of the production files of the first publication (commit a878495a3528): the fix RED ran against exactly these bytes.
const PUBLISHED = Object.freeze({
  'framing.cjs': '7e808cc4cc3c0c8feb0d8b5b6333dd5a1e52c753836d5d43165367aacb6e124b',
  'server.cjs': '84d7559095bcb0b672436d66a6cead2f04c4a341ed142f16ffb6b681ab0de134',
  'stream.cjs': '7c4b6fd17dcf2a74fe8a3fa84990d036b776d401240f262161baad595b9e8a85',
  'conversation.cjs': '0ead68176e1ab3d9f99c626f0b397c6cb69c46f7b9141085e7696e62b293c231',
  'page.js': 'e640e0eca21a8a2cd2746808546d4140bf81b3f466a7b4db05119772deee3c40'
});

function manifestOf(run) {
  assert.equal(sha(read(run.manifest)), run.manifestSha256, `${run.name}: manifest bytes changed`);
  return JSON.parse(read(run.manifest));
}

function stdoutOf(run, manifest) {
  const texts = {};
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    const gz = fs.readFileSync(path.join(path.dirname(resolve(run.manifest)), ...entry.path.split('\\')));
    assert.equal(sha(gz), entry.gzipSha256, `${run.name} ${stream}: gzip bytes changed`);
    const raw = zlib.gunzipSync(gz);
    assert.deepEqual([sha(raw), raw.length], [entry.sha256, entry.bytes], `${run.name} ${stream}: transcript changed`);
    texts[stream] = raw.toString('utf8').replace(/\r\n/g, '\n');
  }
  return texts.stdout;
}

const inputHash = (manifest, name) => manifest.inputs.find((entry) => entry.path === `capability\\C026\\${name}`)?.rawSha256;

module.exports = Object.freeze({ root, index, sha, resolve, read, PRODUCTION, PUBLISHED, manifestOf, stdoutOf, inputHash });
