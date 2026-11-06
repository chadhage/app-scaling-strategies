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

function verifyManifest(dir, name, { resolve = here, expectFail } = {}) {
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
    const target = resolve(input.path);
    if (!fs.existsSync(target)) problems.push(`${input.path}: the pinned input is missing`);
    else if (sha(fs.readFileSync(target)) !== input.rawSha256) problems.push(`${input.path}: differs from its pin`);
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

function verifyCoverage(dir, fileName) {
  const name = fileName.replace(/\.json$/, '');
  const result = verifyManifest(dir, name, { expectFail: false });
  const target = name.replace(/^coverage-/, '');
  const rows = result.manifest ? result.manifest.summary.coverageRows : [];
  if (!rows.some((row) => row.file === target && row.lines >= 85 && row.branches >= 85 && row.functions >= 85)) result.problems.push(`${name}: no row of ${target} with at least 85/85/85`);
  return { ...result, ok: result.problems.length === 0 };
}

function verifyAll() {
  const red = path.join(root, 'evidence', 'red');
  const out = { red: {}, prefix: verifyPrefix() };
  for (const name of fs.readdirSync(red).filter((entry) => entry.startsWith('fix-')).sort()) out.red[name] = verifyRed(path.join(red, name));
  for (const [dirName, files, expectFail] of [['green-02', ['green'], false], ['verify-green-02', ['verify-green'], false]]) {
    const dir = path.join(root, 'evidence', dirName);
    if (fs.existsSync(dir)) out[dirName] = Object.fromEntries(files.map((file) => [file, verifyManifest(dir, file, { expectFail })]));
  }
  const coverage = path.join(root, 'evidence', 'coverage-02');
  if (fs.existsSync(coverage)) out['coverage-02'] = Object.fromEntries(fs.readdirSync(coverage).filter((f) => f.endsWith('.json')).map((f) => [f, verifyCoverage(coverage, f)]));
  return out;
}

if (require.main === module) {
  const everything = verifyAll();
  const flat = [everything.prefix, ...Object.values(everything.red), ...['green-02', 'verify-green-02', 'coverage-02'].flatMap((key) => Object.values(everything[key] || {}))];
  const problems = flat.flatMap((entry) => entry.problems);
  console.log(JSON.stringify({ checked: flat.length, red: Object.keys(everything.red), problems }, null, 2));
  process.exit(problems.length ? 1 : 0);
}

module.exports = Object.freeze({ verifyManifest, verifyRed, verifyPrefix, verifyAll, sha });
