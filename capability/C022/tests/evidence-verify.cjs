'use strict';

// Test tooling, not production code: verifies the archived evidence of C022 under a namespace root (the real one, or a scratch COPY that a
// tamper test has altered). Every manifest written by RUN\scripts\archive-run.cjs is checked: its transcripts (gunzip and gzip SHA-256 and
// size), its pinned inputs (raw or LF-normalized SHA-256), and the shape that its purpose demands. final/seal.json (written last by seal.cjs)
// pins the final bytes of the README, the feature, every test and production file and imports.json. It returns a list of problems.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const lf = (buffer) => Buffer.from(buffer.toString('latin1').replaceAll('\r\n', '\n'), 'latin1');
const PRODUCTION = ['contract.js', 'identity.cjs', 'store.cjs', 'service.cjs', 'server.cjs', 'page.js', 'index.html', 'style.css'];

function walk(directory, found = []) {
  if (!fs.existsSync(directory)) return found;
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(full, found);
    else found.push(full);
  }
  return found;
}

function manifestsOf(root) {
  const parsed = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };
  return walk(path.join(root, 'evidence')).filter((file) => file.endsWith('.json') && !file.includes(`${path.sep}raw${path.sep}`)).map((file) => ({ file, json: parsed(file) }))
    .filter(({ json }) => json && json.schemaVersion === 1 && json.transcripts);
}

function verify(root, { repoRoot = path.resolve(root, '..', '..') } = {}) {
  const problems = [];
  const rel = (file) => path.relative(root, file);
  const manifests = manifestsOf(root);
  const retainedFailures = new Set();
  const failuresFile = path.join(root, 'evidence', 'final', 'nonqualifying-attempts.json');
  if (fs.existsSync(failuresFile)) {
    try {
      const history = JSON.parse(fs.readFileSync(failuresFile, 'utf8'));
      if (history.schema !== 'C022-nonqualifying-attempts/1' || history.attempts.length !== 1) throw new Error('closed failed-attempt shape');
      const [entry] = history.attempts;
      if (entry.path !== 'evidence/browser/browser-3.json' || entry.successor !== 'evidence/browser/browser-4.json'
        || entry.cause !== 'SUBST_NATIVE_PATH_REQUIRED' || entry.accepted !== false) throw new Error('closed failed-attempt vocabulary');
      const failedBytes = fs.readFileSync(path.join(root, entry.path));
      const failed = JSON.parse(failedBytes);
      const successor = JSON.parse(fs.readFileSync(path.join(root, entry.successor), 'utf8'));
      if (sha(lf(failedBytes)) !== entry.manifestLfSha256 || failed.exitCode !== 1 || failed.expectedExitCode !== 0
        || failed.timedOut || successor.exitCode !== 0 || successor.expectedExitCode !== 0 || successor.timedOut) throw new Error('the failed attempt must stay failed and its successor must pass');
      const failedOut = zlib.gunzipSync(fs.readFileSync(path.join(root, path.dirname(entry.path), failed.transcripts.stdout.path))).toString('utf8');
      const successorOut = zlib.gunzipSync(fs.readFileSync(path.join(root, path.dirname(entry.successor), successor.transcripts.stdout.path))).toString('utf8');
      if (/C022 BROWSER OK/.test(failedOut) || !/C022 BROWSER OK/.test(successorOut)
        || !/C022 OWN CLEANUP/.test(successorOut)) throw new Error('a qualifier-only failure is not a UI observation');
      retainedFailures.add(entry.path);
    } catch (error) { problems.push(`nonqualifying attempts: ${error.message}`); }
  }
  if (manifests.length === 0) problems.push('no archived run manifest found');
  for (const file of walk(path.join(root, 'evidence')).filter((candidate) => candidate.endsWith('.json') && !candidate.includes(`${path.sep}raw${path.sep}`))) {
    try { JSON.parse(fs.readFileSync(file, 'utf8')); } catch { problems.push(`${rel(file)}: is not valid JSON`); }
  }
  // Earlier captures stay in the tree exactly as archived (immutable) and are listed in a superseded list: evidence/red/superseded.json (the
  // first RED cycle, made before the cost split of the pipelining files) and evidence/superseded.json (what was captured for the first
  // publication, before the fix of its review). An input of a listed manifest may match the live file OR the retained bytes in a snapshot
  // directory of a list (a .snap copy, so that no runner picks it up). Every other manifest must match the live files.
  const { manifests: retainedNames, snapshotDirs } = retainedOf(root);
  for (const { file, json } of manifests) {
    const where = rel(file);
    const retained = retainedNames.has(where.split(path.sep).join('/'));
    for (const stream of ['stdout', 'stderr']) {
      const transcript = json.transcripts[stream];
      const target = path.join(path.dirname(file), transcript.path);
      if (!fs.existsSync(target)) { problems.push(`${where}: transcript ${transcript.path} is missing`); continue; }
      const gz = fs.readFileSync(target);
      if (sha(gz) !== transcript.gzipSha256) problems.push(`${where}: ${stream} gzip hash differs`);
      let bytes;
      try { bytes = zlib.gunzipSync(gz); } catch { problems.push(`${where}: ${stream} is not valid gzip`); continue; }
      if (sha(bytes) !== transcript.sha256) problems.push(`${where}: ${stream} stream hash differs`);
      if (bytes.length !== transcript.bytes) problems.push(`${where}: ${stream} size differs`);
    }
    for (const input of json.inputs || []) {
      const target = path.join(repoRoot, input.path);
      const pinned = (bytes) => sha(bytes) === input.rawSha256 || sha(lf(bytes)) === input.crlfToLfSha256;
      const live = fs.existsSync(target);
      if (live && pinned(fs.readFileSync(target))) continue;
      const snapshots = retained ? snapshotDirs.map((directory) => path.join(root, directory, `${path.win32.basename(input.path)}.snap`)) : [];
      if (snapshots.some((snapshot) => fs.existsSync(snapshot) && pinned(fs.readFileSync(snapshot)))) continue;
      problems.push(live || retained ? `${where}: input ${input.path} differs from its pin` : `${where}: input ${input.path} is missing`);
    }
    if ((json.exitCode !== json.expectedExitCode && !retainedFailures.has(where.split(path.sep).join('/'))) || json.timedOut) problems.push(`${where}: exit ${json.exitCode} (expected ${json.expectedExitCode})`);
  }
  const sealFile = path.join(root, 'evidence', 'final', 'seal.json');
  if (!fs.existsSync(path.join(root, 'evidence', 'seal.json'))) problems.push('evidence/seal.json is missing');
  if (!fs.existsSync(sealFile)) problems.push('evidence/final/seal.json is missing');
  else {
    const seal = JSON.parse(fs.readFileSync(sealFile, 'utf8'));
    const previous = path.join(root, 'evidence', 'seal.json');
    if (seal.previousSeal?.path !== 'evidence/seal.json' || !fs.existsSync(previous)
      || seal.previousSeal.sha256 !== seal.files['evidence/seal.json']
      || seal.previousSeal.lf !== seal.lf['evidence/seal.json']
      || sha(lf(fs.readFileSync(previous))) !== seal.previousSeal.lf) problems.push('seal: previous seal binding differs');
    for (const [name, hash] of Object.entries(seal.files)) {
      const target = path.join(root, name);
      if (!fs.existsSync(target)) problems.push(`seal: ${name} is missing`);
      else if (sha(fs.readFileSync(target)) !== hash && sha(lf(fs.readFileSync(target))) !== seal.lf[name]) problems.push(`seal: ${name} differs from its pin`);
    }
    const sealed = new Set(Object.keys(seal.files));
    const present = [...PRODUCTION, 'README.md', 'C022.feature', 'C022-final.feature', 'imports.json', 'imports.final.json', ...fs.readdirSync(path.join(root, 'tests')).filter((name) => /\.c?js$/.test(name)).map((name) => `tests/${name}`), ...sealedEvidence(root)];
    for (const name of present) if (!sealed.has(name)) problems.push(`seal: ${name} is not sealed`);
  }
  return problems;
}

function readManifest(root, relative) {
  return JSON.parse(fs.readFileSync(path.join(root, 'evidence', relative), 'utf8'));
}

// The two lists of retained manifests (see verify): their manifests and their snapshot directories. A damaged list is reported by verify() as
// invalid JSON and retains nothing.
const SUPERSEDED_LISTS = ['evidence/red/superseded.json', 'evidence/superseded.json', 'evidence/final/retained.json', 'evidence/final/retained-phase-1.json'];
function retainedOf(root) {
  const manifests = new Set();
  const snapshotDirs = [];
  for (const name of SUPERSEDED_LISTS) {
    const file = path.join(root, name);
    if (!fs.existsSync(file)) continue;
    let list;
    try { list = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    for (const manifest of Array.isArray(list.manifests) ? list.manifests : []) manifests.add(manifest);
    if (typeof list.snapshotDir === 'string') snapshotDirs.push(list.snapshotDir);
  }
  return { manifests, snapshotDirs };
}

// Every file of the evidence folder that seal.cjs pins byte for byte: the recorder manifests, the mutation, loop and fresh figures, the
// retained snapshots, the stub and the superseded lists. The raw transcripts are pinned by their manifests (verify() recomputes them), seal.json
// is the seal itself and the verify-N that is not retained (this archive's own test run, written AFTER the seal) is checked as a manifest
// like any other; the verify-N of an earlier publication is retained and sealed like the rest.
function sealedEvidence(root) {
  const { manifests: retained } = retainedOf(root);
  return walk(path.join(root, 'evidence')).map((file) => path.relative(root, file).split(path.sep).join('/'))
    .filter((name) => name !== 'evidence/final/seal.json' && !name.includes('/raw/') && !(/^evidence\/green\/verify-\d+\.json$/.test(name) && !retained.has(name))).sort();
}

// The files a loop or a fresh-checkout run executes or reads: every production file, the feature, imports.json and every tool and test under
// tests\ except the three files that belong to the archive itself (the test that verifies the captures, its verifier and the seal writer: they are
// edited after the captures and are pinned by the seal). The run records the hashes before it starts; evidence.test.cjs compares them with the live
// bytes, so a capture cannot silently describe other bytes than the ones that ship.
const ARCHIVE_TOOLS = ['evidence.test.cjs', 'evidence-verify.cjs', 'seal.cjs'];
function runInputs(root) {
  const names = [...PRODUCTION, 'C022.feature', 'C022-final.feature', 'imports.json', 'imports.final.json', ...fs.readdirSync(path.join(root, 'tests')).filter((name) => /\.c?js$/.test(name) && !ARCHIVE_TOOLS.includes(name)).map((name) => `tests/${name}`)].sort();
  return Object.fromEntries(names.map((name) => {
    const bytes = fs.readFileSync(path.join(root, name));
    return [name, { raw: sha(bytes), lf: sha(lf(bytes)) }];
  }));
}

module.exports = Object.freeze({ PRODUCTION, lf, manifestsOf, readManifest, retainedOf, runInputs, sealedEvidence, sha, verify, walk });
