'use strict';

// What tests\evidence.test.cjs (the default suite) and tests\strict-evidence.cjs (the explicit strict mode) share.
// Nothing here reads a file outside the namespace: the default suite verifies what lives INSIDE testing\coverage and only the recorded identity of external
// inputs (N2 of the second review). Only strict-evidence.cjs asks git for the blobs of the accepted commits, through the readBlob it passes in.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');

const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const crlfToLf = (buffer) => Buffer.from(buffer.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const OWN = 'testing\\coverage\\';
const isOwn = (inputPath) => inputPath.startsWith(OWN);

// The accepted commits of this namespace whose bytes the retained archives pin, and the accepted C031 commit that the C031 runs measured.
const ACCEPTED = Object.freeze([
  Object.freeze({ name: 'first publication', commit: '8cfdce17f62c62318113c7becc3223bb5b78b6a1', tag: 'kanban/U009/8cfdce17f62c' }),
  Object.freeze({ name: 'first fix', commit: '85ee70a3d4c931c8ef6c52e3b15f545fb82f9a46', tag: 'kanban/U009/85ee70a3d4c9' })
]);
const C031 = Object.freeze({ prefix: 'capability\\C031\\', commit: '09297317f706518687b6c672a542c8f46f32483e', tag: 'kanban/C031/09297317f706' });
const C031_INPUTS = Object.freeze([
  'cli.cjs', 'evaluator.js', 'page.js', 'saved.js', 'source.cjs', 'index.html', 'imports.json',
  'tests\\catalog.test.cjs', 'tests\\cli.test.cjs', 'tests\\denominator.test.cjs', 'tests\\evaluator.test.cjs', 'tests\\hostile.test.cjs', 'tests\\page.test.cjs',
  'tests\\properties.test.cjs', 'tests\\saved.test.cjs', 'tests\\source.test.cjs', 'tests\\surface.test.cjs', 'tests\\dom-stub.cjs', 'tests\\fixtures.cjs', 'tests\\nested-runner.cjs'
].map((name) => `${C031.prefix}${name}`));
// The default-discovery run of C031 also ran these two test files of C031; the explicit selection of C031 does not.
const C031_DEFAULT_EXTRA = Object.freeze(['tests\\evidence.test.cjs', 'tests\\integrity.test.cjs'].map((name) => `${C031.prefix}${name}`));
// The exact [hit, total] counts of the reviewer figures for C031 that every C031 run must reproduce.
const C031_COUNTS = Object.freeze({
  'cli.cjs': { lines: [33, 33], branches: [18, 18], functions: [3, 3] },
  'evaluator.js': { lines: [490, 490], branches: [416, 417], functions: [78, 78] },
  'page.js': { lines: [122, 122], branches: [67, 69], functions: [15, 15] },
  'saved.js': { lines: [161, 161], branches: [5, 5], functions: [2, 2] },
  'source.cjs': { lines: [69, 69], branches: [41, 41], functions: [13, 13] }
});

// Every recorder manifest below `directory` (the gate's own report files are no manifests), with its path relative to `base` in / form.
function manifestsIn(directory, base = directory) {
  const found = [];
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory() && entry.name !== 'raw') {
      found.push(...manifestsIn(full, base));
    } else if (entry.isFile() && entry.name.endsWith('.json')) {
      const data = JSON.parse(fs.readFileSync(full, 'utf8'));
      if (data !== null && typeof data === 'object' && data.schemaVersion === 1 && data.transcripts && Array.isArray(data.inputs)) {
        found.push({ file: full, directory, data, relative: path.relative(base, full).split(path.sep).join('/') });
      }
    }
  }
  return found;
}

// The problems of the transcripts of one manifest: the exit code, the timeout flag and the whole gzip chain. Reads nothing but the transcripts.
function transcriptProblems(manifest, readTranscript) {
  const problems = [];
  if (manifest.exitCode !== manifest.expectedExitCode) problems.push(`exit ${manifest.exitCode}, expected ${manifest.expectedExitCode}`);
  if (manifest.timedOut) problems.push('timed out');
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    let gz;
    try {
      gz = readTranscript(entry.path);
    } catch {
      problems.push(`${stream}: transcript missing`);
      continue;
    }
    if (gz.length !== entry.gzipBytes || sha(gz) !== entry.gzipSha256) problems.push(`${stream}: gzip transcript differs`);
    let raw;
    try {
      raw = zlib.gunzipSync(gz);
    } catch {
      problems.push(`${stream}: not a gzip stream`);
      continue;
    }
    if (raw.length !== entry.bytes || sha(raw) !== entry.sha256) problems.push(`${stream}: raw transcript differs`);
    if ((raw.toString('latin1').match(/\r\n/g) || []).length !== entry.rawCRLFPairs) problems.push(`${stream}: CRLF pairs differ`);
  }
  return problems;
}

// The inputs that live inside the namespace against the bytes `readOwn(relativeToNamespace)` returns (LF-normalized); external inputs are never read.
function inputProblems(manifest, readOwn, { filter = () => true } = {}) {
  const problems = [];
  for (const input of manifest.inputs.filter((entry) => isOwn(entry.path) && filter(entry.path))) {
    let bytes;
    try {
      bytes = readOwn(input.path.slice(OWN.length));
    } catch {
      problems.push(`${input.path}: missing`);
      continue;
    }
    if (sha(crlfToLf(bytes)) !== input.crlfToLfSha256) problems.push(`${input.path}: the bytes differ from the pinned hash`);
  }
  return problems;
}

const HEX64 = /^[0-9a-f]{64}$/;

// The recorded identity of the inputs outside the namespace: exactly the pinned C031 files (the explicit selection of C031, or that selection plus the two
// test files that default discovery also runs), each with well-formed digests. Nothing is read.
function externalProblems(manifest) {
  const problems = [];
  const external = manifest.inputs.filter((entry) => !isOwn(entry.path));
  const names = external.map((entry) => entry.path);
  if (names.length === 0) return problems;
  const sorted = JSON.stringify([...names].sort());
  if (![C031_INPUTS, [...C031_INPUTS, ...C031_DEFAULT_EXTRA]].some((list) => JSON.stringify([...list].sort()) === sorted)) {
    problems.push(`the external inputs are not the ${C031_INPUTS.length} (or ${C031_INPUTS.length + C031_DEFAULT_EXTRA.length}) pinned C031 files: ${names.join(', ')}`);
  }
  for (const entry of external) {
    if (!HEX64.test(entry.rawSha256) || !HEX64.test(entry.crlfToLfSha256) || !Number.isInteger(entry.bytes)) problems.push(`${entry.path}: the recorded digests are malformed`);
  }
  return problems;
}

// The C031 report in the stdout transcript must agree with the recorded identity: its root, the test files and the production files it names are among the
// listed inputs, and the figures are the exact counts of the reviewer.
function c031ReportProblems(manifest, readTranscript) {
  const problems = [];
  let report;
  try {
    report = JSON.parse(zlib.gunzipSync(readTranscript(manifest.transcripts.stdout.path)).toString('utf8'));
  } catch {
    return ['the stdout transcript is not the JSON report of the gate'];
  }
  const listed = new Set(manifest.inputs.map((entry) => entry.path));
  if (report.root !== 'capability/C031') problems.push(`the report measured ${report.root}`);
  if (report.pass !== true || report.fullBar !== true) problems.push('the report is not pass and fullBar');
  for (const test of report.tests) if (!listed.has(test.replace(/\//g, '\\'))) problems.push(`the report ran ${test}, which is not a listed input`);
  const files = report.files.map((file) => file.file).sort();
  if (JSON.stringify(files) !== JSON.stringify(Object.keys(C031_COUNTS).sort())) problems.push(`the report measured ${files.join(', ')}`);
  for (const file of report.files) {
    if (!listed.has(`${C031.prefix}${file.file}`)) problems.push(`${file.file} is not a listed input`);
    if (JSON.stringify(file.counts) !== JSON.stringify(C031_COUNTS[file.file])) problems.push(`${file.file}: the counts ${JSON.stringify(file.counts)} are not the reviewer figures`);
  }
  return problems;
}

// STRICT: every input is compared with the blob `readBlob(commit, repositoryPath)` returns (null when missing). C031 inputs against the accepted C031 commit;
// inputs inside the namespace of a retained generation against the blob at one of the accepted U009 commits. Returns { checked, problems }.
function verifyAgainstCommits(manifests, readBlob, { retained }) {
  const problems = [];
  let checked = 0;
  for (const { data, relative } of manifests) {
    for (const input of data.inputs) {
      const external = !isOwn(input.path);
      if (!external && !retained(relative)) continue;
      const commits = external ? [C031.commit] : ACCEPTED.map((accepted) => accepted.commit);
      const blobs = commits.map((commit) => readBlob(commit, input.path.replace(/\\/g, '/'))).filter((blob) => blob !== null);
      checked += 1;
      if (blobs.length === 0) problems.push(`${relative}: ${input.path} is in none of the accepted commits ${commits.map((commit) => commit.slice(0, 12)).join(', ')}`);
      else if (!blobs.some((blob) => sha(crlfToLf(blob)) === input.crlfToLfSha256)) problems.push(`${relative}: ${input.path} matches no accepted commit`);
    }
  }
  return { checked, problems };
}

module.exports = Object.freeze({
  fs, path, zlib, sha, crlfToLf, OWN, isOwn, ACCEPTED, C031, C031_INPUTS, C031_DEFAULT_EXTRA, C031_COUNTS, manifestsIn, transcriptProblems, inputProblems, externalProblems, c031ReportProblems, verifyAgainstCommits
});
