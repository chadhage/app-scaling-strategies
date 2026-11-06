'use strict';

// Test tooling, not production code: recomputes EVERY hash of the evidence archives that the shared recorder (archive-run.cjs) wrote for the
// fix cycle after the independent review (L-0133): the transcripts (gzip and raw), the exit code against the expected one, the failing-test
// count against the transcript, and every pinned input against the file it names. A retained RED also needs its replay.json and the
// snapshots its overlay points at. Used by evidence.test.cjs and as a command:
//   node capability\C017\tests\evidence-check.cjs            checks every fix-* RED archive and the retained pre-fix snapshots (and, when
//                                                              present, green-02, verify-green-02 and coverage-02)
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const root = path.join(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const sha = (buffer) => createHash('sha256').update(buffer).digest('hex');
const here = (rel) => path.join(repo, rel.replaceAll('\\', '/'));

// The captures of the FIRST fix pin the live files of the day they were made; the second fix changed some of them, so those pins are recomputed
// against the manifest of that commit's tree (tests\tree-manifest.cjs, anchored to git) instead of against today's files.
const treeFile = path.join(root, 'evidence', 'tree-8e7046e9.json');
const treePin = () => {
  const tree = JSON.parse(fs.readFileSync(treeFile, 'utf8'));
  return (rel) => { const hit = tree.files[rel.replaceAll('\\', '/')]; return hit ? hit.sha256 : null; };
};

// The two legacy tests of the first fix (absolute time bounds) were rewritten structurally in the second fix (F22). A RED archive that pinned their
// OLD bytes is satisfied by the retained copy in evidence\red\prefix-legacy-8e7046e9 (itself pinned by verifyPrefix) exactly as a pin on the live file.
const legacyFile = path.join(root, 'evidence', 'red', 'prefix-legacy-8e7046e9', 'manifest.json');
function retainedMatches(input, { manifest = legacyFile, base = repo } = {}) {
  if (!fs.existsSync(manifest)) return false;
  const kept = JSON.parse(fs.readFileSync(manifest, 'utf8')).files.find((item) => item.live === input.path.replaceAll('\\', '/'));
  const snapshot = kept ? path.join(base, kept.snapshot.replaceAll('\\', '/')) : null;
  return Boolean(kept) && kept.sha256 === input.rawSha256 && fs.existsSync(snapshot) && sha(fs.readFileSync(snapshot)) === kept.sha256;
}

function verifyManifest(dir, name, { resolve = here, expectFail, pin } = {}) {
  const file = path.join(dir, `${name}.json`);
  if (!fs.existsSync(file)) return { ok: false, problems: [`${name}.json is missing`] };
  const manifest = JSON.parse(fs.readFileSync(file, 'utf8'));
  const problems = [];
  if (manifest.exitCode !== manifest.expectedExitCode || manifest.timedOut || manifest.spawnError) problems.push(`${name}: the run did not end with its expected exit code`);
  if (expectFail !== undefined && (manifest.expectedExitCode === 0) === expectFail) problems.push(`${name}: the archive is of the wrong kind`);
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    const gzFile = path.join(dir, entry.path);
    if (!fs.existsSync(gzFile)) { problems.push(`${entry.path} is missing`); continue; }
    const gz = fs.readFileSync(gzFile);
    if (sha(gz) !== entry.gzipSha256) problems.push(`${entry.path}: the gzip file changed`);
    let raw = null;
    try { raw = zlib.gunzipSync(gz); } catch { problems.push(`${entry.path}: not a gzip file`); }
    if (!raw) continue;
    if (sha(raw) !== entry.sha256 || raw.length !== entry.bytes) problems.push(`${entry.path}: the transcript changed`);
    if (stream === 'stdout') {
      const text = raw.toString('utf8').replace(/\r\n/g, '\n');
      const count = (label) => Number((new RegExp(`^# ${label} (\\d+)$`, 'm').exec(text) || [0, 0])[1]);
      if (count('fail') !== (manifest.summary.fail ?? 0) || count('tests') !== (manifest.summary.tests ?? 0) || count('pass') !== (manifest.summary.pass ?? 0)) problems.push(`${name}: the summary does not match the transcript`);
    }
  }
  for (const input of manifest.inputs) {
    if (pin) {
      const want = pin(input.path);
      if (want === null) problems.push(`${input.path}: the pinned input is not in the tree of the commit it was made at`);
      else if (want !== input.rawSha256) problems.push(`${input.path}: differs from its pin`);
      continue;
    }
    const target = resolve(input.path);
    if (!fs.existsSync(target)) problems.push(`${input.path}: the pinned input is missing`);
    else if (sha(fs.readFileSync(target)) !== input.rawSha256 && !(resolve === here && retainedMatches(input))) problems.push(`${input.path}: differs from its pin`);
  }
  return { ok: problems.length === 0, problems, manifest };
}

// A retained RED: the run failed (exit 1, at least one failing test), and replay.json lists tests and overlay snapshots that are pinned inputs.
function verifyRed(dir, options = {}) {
  const result = verifyManifest(dir, 'red', { ...options, expectFail: true });
  const problems = [...result.problems];
  const replayFile = path.join(dir, 'replay.json');
  if (!fs.existsSync(replayFile)) return { ok: false, problems: [...problems, 'replay.json is missing'] };
  const replay = JSON.parse(fs.readFileSync(replayFile, 'utf8'));
  if (result.manifest) {
    const pinned = new Set(result.manifest.inputs.map((input) => input.path.replaceAll('\\', '/')));
    for (const target of [...replay.tests, ...Object.values(replay.overlay)]) if (!pinned.has(target)) problems.push(`${target}: replay.json names a file that is not a pinned input`);
    if (!(result.manifest.summary.fail > 0)) problems.push('a RED must have at least one failing test');
  }
  return { ok: problems.length === 0, problems, manifest: result.manifest, replay };
}

function verifyPrefix(dir = path.join(root, 'evidence', 'red', 'prefix-ed21ef79')) {
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const problems = manifest.files.filter((item) => sha(fs.readFileSync(here(item.snapshot))) !== item.sha256).map((item) => `${item.snapshot}: differs from its pin`);
  return { ok: problems.length === 0, problems, manifest };
}

// The coverage table the runner printed, row "all files": the numbers the manifest claims must be the numbers of the transcript (F20).
function transcriptTotals(dir, manifest) {
  const entry = manifest.transcripts.stdout;
  const text = zlib.gunzipSync(fs.readFileSync(path.join(dir, entry.path))).toString('utf8');
  const hit = /^# all files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/m.exec(text);
  return hit ? { lines: Number(hit[1]), branches: Number(hit[2]), functions: Number(hit[3]) } : null;
}

function verifyCoverage(dir, fileName, options = {}) {
  const name = fileName.replace(/\.json$/, '');
  const result = verifyManifest(dir, name, { ...options, expectFail: false });
  const target = name.replace(/^coverage-/, '');
  const rows = result.manifest ? result.manifest.summary.coverageRows : [];
  if (!rows.some((row) => row.file === target && row.lines >= 85 && row.branches >= 85 && row.functions >= 85)) result.problems.push(`${name}: no row of ${target} with at least 85/85/85`);
  const totals = result.manifest ? transcriptTotals(dir, result.manifest) : null;
  const row = rows.find((candidate) => candidate.file === target);
  if (!totals || !row || row.lines !== totals.lines || row.branches !== totals.branches || row.functions !== totals.functions) result.problems.push(`${name}: the claimed coverage row is not the row of the transcript`);
  return { ...result, ok: result.problems.length === 0 };
}

// Evidence pins: the SHA-256 of every manifest JSON and observation file, written once at the end (node evidence-check.cjs pin), so a one-byte edit
// of a descriptive field in a manifest or in the browser observation is named (F20). Hashes of files that are pinned elsewhere are not repeated.
const pinsFile = path.join(root, 'evidence', 'pins.json');
function pinnedFiles(evidence = path.join(root, 'evidence')) {
  const out = [];
  for (const entry of fs.readdirSync(evidence, { withFileTypes: true })) {
    if (entry.isFile() && /^(browser-observation.*|browser-journal.*|tree-.*|mutants-.*)\.json$/.test(entry.name)) out.push(entry.name);
    if (entry.isDirectory() && /^loops-\d\d$/.test(entry.name)) {
      for (const file of fs.readdirSync(path.join(evidence, entry.name)).filter((name) => name.endsWith('.json'))) out.push(`${entry.name}/${file}`);
    }
    if (entry.isDirectory() && /^(coverage|green|verify-green)-\d\d$/.test(entry.name)) {
      for (const file of fs.readdirSync(path.join(evidence, entry.name)).filter((name) => name.endsWith('.json'))) out.push(`${entry.name}/${file}`);
    }
  }
  const red = path.join(evidence, 'red');
  if (fs.existsSync(red)) {
    for (const dir of fs.readdirSync(red).filter((name) => name.startsWith('fix-'))) {
      for (const file of ['red.json', 'replay.json']) out.push(`red/${dir}/${file}`);
    }
    for (const dir of fs.readdirSync(red).filter((name) => name.startsWith('prefix-'))) out.push(`red/${dir}/manifest.json`);
  }
  // The README is written after the captures (it states what they show), so it is not an input of any capture; it is pinned here instead, last.
  if (fs.existsSync(path.join(evidence, '..', 'README.md'))) out.push('../README.md');
  return out.sort();
}

function writePins(evidence = path.join(root, 'evidence')) {
  const files = Object.fromEntries(pinnedFiles(evidence).map((name) => [name, sha(fs.readFileSync(path.join(evidence, name)))]));
  fs.writeFileSync(path.join(evidence, 'pins.json'), `${JSON.stringify({ schema: 'C017-pins/1', files }, null, 1)}\n`, { flag: 'wx' });
}

function verifyPins(evidence = path.join(root, 'evidence')) {
  const file = path.join(evidence, 'pins.json');
  if (!fs.existsSync(file)) return { ok: false, problems: ['evidence/pins.json is missing'] };
  const pins = JSON.parse(fs.readFileSync(file, 'utf8')).files;
  const problems = [];
  for (const name of pinnedFiles(evidence)) {
    if (!pins[name]) problems.push(`${name}: not pinned in evidence/pins.json`);
    else if (sha(fs.readFileSync(path.join(evidence, name))) !== pins[name]) problems.push(`${name}: differs from its pin in evidence/pins.json`);
  }
  for (const name of Object.keys(pins)) if (!fs.existsSync(path.join(evidence, name))) problems.push(`${name}: pinned but missing`);
  return { ok: problems.length === 0, problems };
}

// The first fix's captures (tree pins) and the second fix's (live pins); each coverage directory holds one manifest per production file.
const CAPTURES = [['green-02', ['green'], 'tree'], ['verify-green-02', ['verify-green'], 'tree'], ['green-03', ['green'], 'live'], ['verify-green-03', ['verify-green'], 'live']];
const COVERAGE = [['coverage-02', 'tree'], ['coverage-03', 'live']];

// complete: the END state (every capture of the second fix present). While a capture is still being recorded its directory exists without its
// manifest, and the suite that is being recorded verifies the evidence too, so an unfinished capture is skipped unless `complete` is asked for.
function verifyAll({ complete = false } = {}) {
  const red = path.join(root, 'evidence', 'red');
  const optionalPrefix = (name) => (fs.existsSync(path.join(red, name)) ? verifyPrefix(path.join(red, name)) : { problems: [] });
  const out = { red: {}, prefix: verifyPrefix(), prefix2: optionalPrefix('prefix-8e7046e9'), prefix3: optionalPrefix('prefix-legacy-8e7046e9'), prefix4: optionalPrefix('prefix-naive-keepalive') };
  for (const name of fs.readdirSync(red).filter((entry) => entry.startsWith('fix-')).sort()) out.red[name] = verifyRed(path.join(red, name));
  for (const [dirName, files, mode] of CAPTURES) {
    const dir = path.join(root, 'evidence', dirName);
    if (!fs.existsSync(dir) && !(complete && mode === 'live')) continue;
    out[dirName] = Object.fromEntries(files.filter((file) => complete || fs.existsSync(path.join(dir, `${file}.json`))).map((file) => [file, verifyManifest(dir, file, { expectFail: false, pin: mode === 'tree' ? treePin() : undefined })]));
  }
  for (const [dirName, mode] of COVERAGE) {
    const dir = path.join(root, 'evidence', dirName);
    if (fs.existsSync(dir)) out[dirName] = Object.fromEntries(fs.readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => [f, verifyCoverage(dir, f, { pin: mode === 'tree' ? treePin() : undefined })]));
  }
  if (complete) {
    const missing = ['coverage-03/coverage-contract.js.json', 'coverage-03/coverage-reconcile.cjs.json', 'coverage-03/coverage-journal.cjs.json', 'coverage-03/coverage-engine.cjs.json', 'coverage-03/coverage-server.cjs.json', 'coverage-03/coverage-cli.cjs.json', 'coverage-03/coverage-page.js.json',
      'mutants-03.json', 'browser-observation-03.json', 'browser-journal-03.json', 'pins.json',
      ...['chunked', 'chunked-process', 'resources', 'drain', 'pipelining', 'two-servers', 'refusal-shapes', 'child'].map((name) => `loops-03/${name}.json`)].filter((name) => !fs.existsSync(path.join(root, 'evidence', name)));
    out.complete = { complete: { problems: missing.map((name) => `${name}: a capture of the second fix is missing`) } };
  }
  if (fs.existsSync(path.join(root, 'evidence', 'pins.json'))) out.pins = { pins: verifyPins() };
  return out;
}

if (require.main === module) {
  if (process.argv[2] === 'pin') {
    writePins();
    process.exit(0);
  }
  const everything = verifyAll({ complete: process.argv[2] === 'complete' });
  const keys = ['green-02', 'verify-green-02', 'green-03', 'verify-green-03', 'coverage-02', 'coverage-03', 'pins', 'complete'];
  const flat = [everything.prefix, everything.prefix2, everything.prefix3, everything.prefix4, ...Object.values(everything.red), ...keys.flatMap((key) => Object.values(everything[key] || {}))];
  const problems = flat.flatMap((entry) => entry.problems);
  console.log(JSON.stringify({ checked: flat.length, red: Object.keys(everything.red), problems }, null, 2));
  process.exit(problems.length ? 1 : 0);
}

module.exports = Object.freeze({ verifyManifest, verifyRed, verifyPrefix, verifyCoverage, verifyPins, writePins, verifyAll, treePin, pinnedFiles, retainedMatches, sha });
