'use strict';

// Test tooling, not production code: verifies the archived evidence of C010 under a namespace root (the real one, or the tree as an overlay of a tamper
// test has altered it: every read goes through evidence-io.cjs). verify() returns a list of problems, each naming the file it is about, so that a
// test can demand a failure BY NAME.
//   1. every manifest written by RUN\scripts\archive-run.cjs: its transcripts (gzip and stream hashes, sizes), its counts re-derived from the
//      transcript, its exit code and its pinned inputs (a FINAL capture must pin every input file and each must match the bytes in the tree; the
//      captures of the first publication and the retained attempt pin the bytes of their time);
//   2. seal.json, written LAST by seal.cjs: the SHA-256 (raw and LF-normalized) of the README, the feature, imports.json, every production file, every
//      file under tests\ and every evidence file that no recorder manifest pins by itself (the manifests, the mutation, guard, loop and fresh reports,
//      the retained stub); a file that is not sealed is a problem too.
const path = require('node:path');
const zlib = require('node:zlib');
const fs = require('./evidence-io.cjs');
const { ASSETS, PRODUCTION, fileMatches, hashesOf, inputFiles, sha } = require('./evidence-pins.cjs');

// The captures of the first publication (3f219a81af4f), kept exactly as archived: retained history, never re-pinned to the new bytes.
const FIRST = Object.freeze(['red/red-01-ownership-behavior.json', 'green/green-01-ownership-behavior.json', 'green/green-02-whole-suite.json', 'green/green-03-pending-first-flood.json',
  'coverage/coverage-01-per-file.json', 'browser/browser-01-edge.json']);
const FIRST_OTHER = Object.freeze(['mutation/mutation-01.report.json', 'mutation/mutation-01.results.jsonl', 'red/stub/server.cjs']);
// A kept attempt of THIS fix would pin the bytes of its time; the one RED attempt that the runner's 60 s limit cut was discarded (its transcript carried the profile path).
const RETAINED_ATTEMPTS = Object.freeze([]);

function walk(directory, found = []) {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

const rel = (root, file) => path.relative(root, file).split(path.sep).join('/');
const readJson = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const tryJson = (file) => { try { return readJson(file); } catch { return null; } };

// Every recorder manifest under evidence/ (a JSON with schemaVersion 1 and transcripts), as { file, name, json }.
function manifestsOf(root) {
  return walk(path.join(root, 'evidence')).filter((file) => file.endsWith('.json') && !file.includes(`${path.sep}raw${path.sep}`)).map((file) => ({ file, name: rel(path.join(root, 'evidence'), file), json: tryJson(file) }))
    .filter(({ json }) => json && json.schemaVersion === 1 && json.transcripts);
}

// The text of a transcript (gunzipped, LF), or null when it is missing or broken.
function transcriptText(manifestFile, manifest, stream) {
  try { return zlib.gunzipSync(fs.readFileSync(path.join(path.dirname(manifestFile), manifest.transcripts[stream].path))).toString('utf8').replaceAll('\r\n', '\n'); } catch { return null; }
}

// What a capture of the final bytes must pin: every input file of the namespace (and the retained stub for a RED run), by its path from the repository root.
const finalInputPaths = (root, kind) => [...inputFiles(root).map((name) => `capability\\C010\\${name.replaceAll('/', '\\')}`), ...(kind === 'red' ? ['capability\\C010\\evidence\\red\\stub\\server.cjs'] : [])].sort();

function verifyManifest(root, { file, name, json }, problems) {
  const where = `evidence/${name}`;
  for (const stream of ['stdout', 'stderr']) {
    const transcript = json.transcripts[stream];
    const target = path.join(path.dirname(file), transcript.path);
    if (!fs.existsSync(target)) { problems.push(`${where}: transcript ${transcript.path} is missing`); continue; }
    const gz = fs.readFileSync(target);
    if (gz.length !== transcript.gzipBytes) problems.push(`${where}: ${stream} gzip size differs`);
    if (sha(gz) !== transcript.gzipSha256) problems.push(`${where}: ${stream} gzip hash differs`);
    let bytes;
    try { bytes = zlib.gunzipSync(gz); } catch { problems.push(`${where}: ${stream} is not valid gzip`); continue; }
    if (sha(bytes) !== transcript.sha256) problems.push(`${where}: ${stream} stream hash differs`);
    if (bytes.length !== transcript.bytes) problems.push(`${where}: ${stream} size differs`);
  }
  const stdout = transcriptText(file, json, 'stdout');
  if (stdout !== null) {
    for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
      const match = stdout.match(new RegExp(`^# ${key} (\\d+)$`, 'm'));
      if ((match ? Number(match[1]) : undefined) !== json.summary[key]) problems.push(`${where}: summary ${key} is not the transcript's`);
    }
  }
  if (json.exitCode !== json.expectedExitCode || json.timedOut !== false) problems.push(`${where}: exit ${json.exitCode} (expected ${json.expectedExitCode}), timedOut ${json.timedOut}`);
  if (FIRST.includes(name) || RETAINED_ATTEMPTS.includes(name)) return;
  const kind = name.split('/')[0];
  const pinned = new Map((json.inputs || []).map((input) => [input.path, input]));
  for (const wanted of finalInputPaths(root, kind)) if (!pinned.has(wanted)) problems.push(`${where}: does not pin ${wanted}`);
  for (const input of json.inputs || []) {
    const target = path.join(root, '..', '..', input.path);
    if (!fs.existsSync(target)) problems.push(`${where}: input ${input.path} is missing`);
    else if (!fileMatches(target, input)) problems.push(`${where}: input ${input.path} differs from its pin`);
  }
}

// The report files that carry their own pinned inputs (relative to the namespace, raw and LF): guard mutants, loop and fresh runs.
function verifyReportInputs(root, where, document, problems) {
  const pinned = new Map((document.inputs || []).map((input) => [input.path, input]));
  for (const wanted of inputFiles(root)) if (!pinned.has(wanted)) problems.push(`${where}: does not pin ${wanted}`);
  for (const input of document.inputs || []) {
    const target = path.join(root, input.path);
    if (!fs.existsSync(target)) problems.push(`${where}: input ${input.path} is missing`);
    else if (!fileMatches(target, input)) problems.push(`${where}: input ${input.path} differs from its pin`);
  }
}

// Every evidence file that seal.cjs pins byte for byte: all but the raw transcripts (their manifests pin them), the seal itself and verify-N
// (this archive's own test run, written after the seal and verified as a manifest like any other).
function sealedEvidence(root) {
  return walk(path.join(root, 'evidence')).map((file) => rel(root, file)).filter((name) => name !== 'evidence/seal.json' && !name.includes('/raw/') && !/^evidence\/green\/verify-\d+\.json$/.test(name)).sort();
}

function sealedNames(root) {
  return [...PRODUCTION, ...ASSETS, 'README.md', 'C010.feature', 'imports.json', ...fs.readdirSync(path.join(root, 'tests')).filter((name) => /\.c?js$/.test(name)).map((name) => `tests/${name}`), ...sealedEvidence(root)].sort();
}

// The seal document of the tree as it is now (seal.cjs writes it once, a tamper test rebuilds it to show that the checks do not lean on the seal alone).
function buildSeal(root) {
  const files = {};
  const lfs = {};
  for (const name of sealedNames(root)) {
    const found = hashesOf(path.join(root, name));
    files[name] = found.raw;
    lfs[name] = found.lf;
  }
  return { schemaVersion: 1, note: 'written last by tests/seal.cjs; a consistent rewrite of the seal together with the files it pins is not detectable here: the published commit and tag are the anchor', files, lf: lfs };
}

function verifySeal(root, problems) {
  const sealFile = path.join(root, 'evidence', 'seal.json');
  if (!fs.existsSync(sealFile)) { problems.push('evidence/seal.json is missing'); return; }
  const seal = readJson(sealFile);
  for (const [name, hash] of Object.entries(seal.files)) {
    const target = path.join(root, name);
    if (!fs.existsSync(target)) problems.push(`seal: ${name} is missing`);
    else { const found = hashesOf(target); if (found.raw !== hash && found.lf !== seal.lf[name]) problems.push(`seal: ${name} differs from its pin`); }
  }
  const sealed = new Set(Object.keys(seal.files));
  for (const name of sealedNames(root)) if (!sealed.has(name)) problems.push(`seal: ${name} is not sealed`);
}

// Every manifest, every JSON, the retained captures: the part of verify() that needs no knowledge of what the captures mean.
function verifyArchive(root, problems) {
  for (const file of walk(path.join(root, 'evidence')).filter((candidate) => candidate.endsWith('.json') && !candidate.includes(`${path.sep}raw${path.sep}`))) {
    if (tryJson(file) === null) problems.push(`evidence/${rel(path.join(root, 'evidence'), file)}: is not valid JSON`);
  }
  const manifests = manifestsOf(root);
  if (manifests.length === 0) problems.push('no archived run manifest found');
  for (const manifest of manifests) verifyManifest(root, manifest, problems);
  for (const name of [...FIRST, ...FIRST_OTHER, ...RETAINED_ATTEMPTS]) if (!fs.existsSync(path.join(root, 'evidence', name))) problems.push(`evidence/${name}: the retained capture is missing`);
}

function verify(root, { checks = [] } = {}) {
  const problems = [];
  verifyArchive(root, problems);
  for (const check of checks) {
    try { check(root, problems); } catch (error) { problems.push(`a check of the archive crashed: ${String(error.message).slice(0, 120)}`); }
  }
  verifySeal(root, problems);
  return problems;
}

module.exports = Object.freeze({ FIRST, FIRST_OTHER, RETAINED_ATTEMPTS, buildSeal, finalInputPaths, manifestsOf, readJson, rel, sealedEvidence, sealedNames, transcriptText, tryJson, verify, verifyArchive,
  verifyManifest, verifyReportInputs, verifySeal, walk });
