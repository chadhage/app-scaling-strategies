'use strict';

// Test tooling, not production code: recomputes the pins of imports.json against git OBJECTS (the pinned commit and tag, never the index or HEAD)
// and the working bytes, and names every kind of mismatch. verify() takes its readers as arguments so that a test can hand it tampered bytes.
// ONE git process answers every question (a git process costs several seconds on a loaded Windows machine): `git cat-file --batch` is fed the five
// blobs and the annotated tag and returns their object ids, sizes and bytes. C010_GIT_REPOSITORY names the repository whose objects are read when the
// suite runs in a scratch tree that has no .git (a git archive copy).
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const sha = (bytes) => crypto.createHash('sha256').update(bytes).digest('hex');
const lfOf = (bytes) => Buffer.from(bytes.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const gitPath = (relative) => relative.replaceAll('\\', '/');
const namespaceRoot = path.resolve(__dirname, '..');
const workRoot = path.resolve(namespaceRoot, '..', '..');
const repository = process.env.C010_GIT_REPOSITORY || workRoot;
// Another annotated C009 tag (the first fix): the tampering tests point a pin at it to see "a tag that points at another commit" for real.
const DECOY_TAG = 'kanban/C009/244f771ba72d';

// Parses the output of `git cat-file --batch`: "<oid> <type> <size>\n<size bytes>\n" per request, "<name> missing\n" for an object that is not there.
function parseBatch(output, names) {
  const found = new Map();
  let at = 0;
  for (const name of names) {
    const end = output.indexOf('\n', at);
    const header = output.subarray(at, end).toString('latin1').split(' ');
    at = end + 1;
    if (header[1] === 'missing') continue;
    const size = Number(header[2]);
    found.set(name, { oid: header[0], type: header[1], bytes: output.subarray(at, at + size) });
    at += size + 1;
  }
  return found;
}

let objects = null;
function loadObjects(spec) {
  if (objects) return objects;
  const accepted = spec.accepted.C009;
  const names = [...spec.dependencies.map((dependency) => `${accepted.commit}:${gitPath(dependency.path)}`), accepted.tag, DECOY_TAG];
  const env = { ...process.env };
  for (const name of ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE', 'GIT_COMMON_DIR']) delete env[name];
  const output = execFileSync('git', ['-C', repository, '--no-pager', 'cat-file', '--batch'], { env, input: `${names.join('\n')}\n`, maxBuffer: 1 << 26, windowsHide: true });
  objects = parseBatch(output, names);
  return objects;
}

const realReaders = (spec) => Object.freeze({
  blob(commit, file) {
    const found = loadObjects(spec).get(`${commit}:${gitPath(file)}`);
    if (!found) throw new Error('the object is not in the repository');
    return found.bytes;
  },
  oid: (commit, file) => loadObjects(spec).get(`${commit}:${gitPath(file)}`)?.oid ?? '',
  tagType: (tag) => loadObjects(spec).get(tag)?.type ?? '',
  tagCommit(tag) {
    const found = loadObjects(spec).get(tag);
    return found && found.type === 'tag' ? /^object ([0-9a-f]{40})$/m.exec(found.bytes.toString('latin1'))?.[1] ?? '' : '';
  },
  working: (file) => fs.readFileSync(path.join(workRoot, file))
});

function verify(spec, readers = realReaders(spec)) {
  const problems = [];
  const accepted = spec.accepted.C009;
  if (readers.tagType(accepted.tag) !== 'tag') problems.push('TAG_NOT_ANNOTATED');
  if (readers.tagCommit(accepted.tag) !== accepted.commit) problems.push('TAG_DOES_NOT_POINT_AT_THE_COMMIT');
  for (const dependency of spec.dependencies) {
    const label = dependency.path;
    if (dependency.commit !== accepted.commit || dependency.tag !== accepted.tag) problems.push(`${label}: COMMIT_OR_TAG_PIN_DIFFERS`);
    let blob;
    try { blob = readers.blob(dependency.commit, dependency.path); } catch { problems.push(`${label}: GIT_OBJECT_UNREADABLE`); continue; }
    if (sha(blob) !== dependency.git) problems.push(`${label}: GIT_BLOB_SHA256_DIFFERS`);
    if (readers.oid(dependency.commit, dependency.path) !== dependency.oid) problems.push(`${label}: GIT_OBJECT_ID_DIFFERS`);
    if (dependency.lf !== dependency.git || sha(lfOf(blob)) !== dependency.lf) problems.push(`${label}: LF_PIN_DIFFERS_FROM_THE_BLOB`);
    const working = readers.working(dependency.path);
    if (sha(working) !== dependency.raw && sha(lfOf(working)) !== dependency.lf) problems.push(`${label}: WORKING_BYTES_DIFFER_FROM_THE_PINS`);
  }
  return problems;
}

module.exports = Object.freeze({ lfOf, namespaceRoot, parseBatch, realReaders, repository, sha, verify, workRoot });
