'use strict';

// Recomputes the hashes of an evidence manifest written by the shared recorder (archive-run.cjs): the raw transcripts, the declared inputs
// and the exit code. `read` is injectable so tests tamper in memory. A consistent rewrite of a manifest together with its transcripts is
// detectable only against the published git commit (L-0096); the README says so.
// Two kinds of capture: the HISTORICAL ones (everything outside evidence\fix) describe the first publication 368332e2a881: their inputs are
// checked against the git blobs of that commit, never against the working tree, which the fix has changed since. The CURRENT ones (evidence\fix)
// pin the working tree: own files by raw bytes (the namespace is `-text`), files of other namespaces by their LF-normalized hash (a fresh
// checkout and the owner tree differ only in line endings, L-0188).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { execFileSync } = require('node:child_process');
const { sha, lf } = require('.\\pins-check.cjs');
const authority = require('.\\u049-authority.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const FIRST_PUBLICATION = '368332e2a881b54db780404d86635539317450bd';
const OWN = 'capability\\X001\\';
const fixDirectory = path.join(root, 'evidence', 'fix');
const historical = (file) => path.relative(fixDirectory, file).startsWith('..');
const posix = (file) => file.replaceAll('\\', '/');
let acceptedFixFiles = null;
function acceptedFixCapture(file) {
  if (historical(file)) return false;
  if (!acceptedFixFiles) {
    const base = JSON.parse(fs.readFileSync(path.join(root, authority.AUTHORITY_PATH), 'utf8'));
    acceptedFixFiles = new Set(base.files.map((entry) => entry.path));
  }
  return acceptedFixFiles.has(path.relative(root, file));
}

function acceptedFixSource(file, relative, expected, read = (target) => fs.readFileSync(target)) {
  if (!acceptedFixCapture(file)) return read(path.join(root, relative));
  const chain = authority.load(root, read);
  return authority.legacyBytes(chain, relative, expected, (name) => read(path.join(root, name)));
}

function manifests(directory = path.join(root, 'evidence')) {
  const found = [];
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) found.push(...manifests(full));
    else if (entry.name.endsWith('.json')) {
      const parsed = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (parsed && parsed.schemaVersion === 1 && parsed.transcripts) found.push(full);
    }
  }
  return found.sort();
}

// The git blobs of the first publication for a list of repository-relative paths (one `git cat-file --batch`); absent paths are null.
function firstBlobs(paths, commit = FIRST_PUBLICATION) {
  const keys = [...new Set(paths)].map((item) => `${commit}:${posix(item)}`);
  const out = execFileSync('git', ['--no-pager', 'cat-file', '--batch'], { cwd: repository, input: `${keys.join('\n')}\n`, maxBuffer: 256 * 1024 * 1024, windowsHide: true });
  const found = new Map();
  let offset = 0;
  for (const key of keys) {
    const eol = out.indexOf(10, offset);
    const header = /^([0-9a-f]{40}) blob (\d+)$/.exec(out.toString('latin1', offset, eol));
    if (header) {
      found.set(key.slice(commit.length + 1).replaceAll('/', '\\'), out.subarray(eol + 1, eol + 1 + Number(header[2])));
      offset = eol + 1 + Number(header[2]) + 1;
    } else offset = eol + 1;
  }
  return found;
}

let blobCache = null;
function firstBlob(relative) {
  if (!blobCache) blobCache = firstBlobs(manifests().filter(historical).flatMap((file) => JSON.parse(fs.readFileSync(file, 'utf8')).inputs.map((input) => input.path)));
  return blobCache.get(relative) || null;
}

// The git blob of a foreign file at the commit its namespace was accepted at (the commit imports.json pins for that card); null when the card is not pinned or the file is not there.
function acceptedBlob(relative) {
  const card = /^capability\\([^\\]+)\\/.exec(relative);
  const pinned = card ? require('..\\imports.json').dependencies.find((entry) => entry.card === card[1]) : null;
  return pinned ? firstBlobs([relative], pinned.commit).get(relative) || null : null;
}

function check(file, read = (target) => fs.readFileSync(target), blob = firstBlob) {
  const manifest = JSON.parse(read(file).toString('utf8'));
  const problems = [];
  let chain = null;
  const inherited = acceptedFixCapture(file);
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    const gz = read(path.join(path.dirname(file), entry.path));
    if (gz.length !== entry.gzipBytes || sha(gz) !== entry.gzipSha256) problems.push(`${stream}: gzip bytes differ from the manifest`);
    let raw = null;
    try { raw = zlib.gunzipSync(gz); } catch { problems.push(`${stream}: not a gzip stream`); }
    if (raw && (raw.length !== entry.bytes || sha(raw) !== entry.sha256)) problems.push(`${stream}: raw bytes differ from the manifest`);
  }
  for (const input of manifest.inputs) {
    const own = input.path.startsWith(OWN);
    if (historical(file)) {
      const accepted = blob(input.path);
      const same = accepted && (own ? sha(accepted) === input.rawSha256 : sha(lf(accepted)) === input.crlfToLfSha256);
      if (!same) problems.push(`${input.path}: differs from the git blob of the first publication`);
      continue;
    }
    let bytes = null;
    if (own && inherited) {
      try {
        if (!chain) chain = authority.load(root, read);
        bytes = authority.legacyBytes(chain, input.path.slice(OWN.length), input.rawSha256, (name) => read(path.join(root, name)));
      } catch (error) {
        if (!(error instanceof authority.IntegrityError)) throw error;
        problems.push(`${input.path}: differs from the input hash recorded when the run was made or its exact current authority (${error.message})`);
        continue;
      }
      if (sha(bytes) !== input.rawSha256) problems.push(`${input.path}: differs from the input hash recorded when the run was made (retained accepted-fix input or unsuperseded current bytes)`);
      continue;
    }
    try { bytes = read(path.join(repository, input.path)); } catch (error) { if (own || !error || error.code !== 'ENOENT') throw error; }
    if (bytes === null) {
      // A scratch tree holds only the files imports.json pins: such a foreign input is verified against the blob of the commit its namespace was accepted at.
      const accepted = acceptedBlob(input.path);
      if (!accepted || sha(lf(accepted)) !== input.crlfToLfSha256) problems.push(`${input.path}: absent from this tree and not equal to the accepted blob of its namespace`);
      continue;
    }
    if (own ? sha(bytes) !== input.rawSha256 : sha(lf(bytes)) !== input.crlfToLfSha256) problems.push(`${input.path}: differs from the input hash recorded when the run was made`);
  }
  if (manifest.exitCode !== manifest.expectedExitCode || manifest.timedOut) problems.push('the exit code is not the expected one or the run timed out');
  return { manifest, problems };
}

const stdoutOf = (file, read = (target) => fs.readFileSync(target)) => {
  const manifest = JSON.parse(read(file).toString('utf8'));
  return zlib.gunzipSync(read(path.join(path.dirname(file), manifest.transcripts.stdout.path))).toString('utf8');
};

module.exports = Object.freeze({ manifests, check, stdoutOf, sha, root, repository, historical, firstBlob, firstBlobs, acceptedBlob, FIRST_PUBLICATION, acceptedFixSource });
