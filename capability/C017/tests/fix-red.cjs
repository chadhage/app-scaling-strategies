'use strict';

// Test tooling, not production code: replays the NEW retained REDs of the fix cycle after the independent review.
//   node capability\C017\tests\fix-red.cjs replay <fix-name>        the unchanged RED tests against the retained PRE-FIX bytes (overlay): must fail as archived
//   node capability\C017\tests\fix-red.cjs verify-green <fix-name>  the same unchanged RED tests against the FINAL code: must pass (L-0121)
//   node capability\C017\tests\fix-red.cjs replay-all | verify-green-all
// A RED is a directory evidence\red\fix-<name>-<uuid> written by the shared recorder: red.json (manifest with pinned inputs), replay.json
// (tests, overlay map, NODE_OPTIONS) and the gzip transcripts. The overlay preload serves the retained pre-fix snapshots through require()
// and fs.readFileSync() to the test files and to every child process they start.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { verifyRedAuto } = require('./evidence-check.cjs');

const root = path.join(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const redRoot = path.join(root, 'evidence', 'red');

// Test NAMES at every nesting depth of a TAP transcript, never counts: a RED archived from a run that its own timeout cut has fewer tests than the
// final code (fix-chunked-structural: 26 against 28), and a replay on a loaded machine may be cut elsewhere; what must hold is that every test that
// failed in the archive fails again on the pre-fix bytes (replay) and passes on the final code (verify-green).
const tapNames = (text, ok) => new Set([...text.replace(/\r\n/g, '\n').matchAll(ok ? /^\s*ok \d+ - (.+?)(?: # (?:SKIP|TODO).*)?$/gm : /^\s*not ok \d+ - (.+?)(?: # (?:SKIP|TODO).*)?$/gm)].map((m) => m[1].trim()));
// A failing name that is the path of a test FILE is a CUT (the file's own timeout, a killed run), not an assertion: the archived chunked-structural run
// was cut that way and its transcript names the file. Such a name is never compared: only real test names are.
const failedNames = (text) => [...tapNames(text, false)].filter((name) => !/\.test\.cjs$/.test(name));
const archivedTranscript = (dir, manifest) => zlib.gunzipSync(fs.readFileSync(path.join(dir, manifest.transcripts.stdout.path))).toString('utf8');

// A replay serves the retained PRE-FIX bytes of the files named in replay.json; every other production file must be the world as it was when
// that RED ran, not today's: the second fix cycle moved the derivation into contract.js, so a pre-fix contract.js next to today's reconcile.cjs
// would not even load. The files this cycle changed are retained in prefix-8e7046e9 (the published bytes of the first fix) and fill the gaps.
function historicalOverlay() {
  const manifest = JSON.parse(fs.readFileSync(path.join(redRoot, 'prefix-8e7046e9', 'manifest.json'), 'utf8'));
  return Object.fromEntries(manifest.files.map((item) => [item.live, item.snapshot]));
}

const resolveDir = (name) => {
  const hits = fs.readdirSync(redRoot).filter((entry) => entry.startsWith('fix-') && (entry === name || entry.startsWith(`fix-${name}-`) || entry.startsWith(`${name}-`)));
  if (hits.length !== 1) throw new Error(`expected exactly one RED archive for ${name}, found ${hits.length}`);
  return path.join(redRoot, hits[0]);
};

// The two legacy tests of the first fix (absolute time bounds) were rewritten structurally in the second fix (F22). A RED archived on their OLD bytes
// pins those bytes, which now live only in evidence\red\prefix-legacy-8e7046e9: such an archive replays them under the live names through the
// overlay (also against the final code), every other archive runs the live tests. The old bytes are load-sensitive by construction, so
// `verify-green-all` skips those archives (the rewritten tests have their own RED, fix-chunked-structural); `verify-green <name>` still runs them.
function retainedLegacy(dir) {
  const manifestFile = path.join(redRoot, 'prefix-legacy-8e7046e9', 'manifest.json');
  if (!fs.existsSync(manifestFile)) return {};
  const pinned = new Set(JSON.parse(fs.readFileSync(path.join(dir, 'red.json'), 'utf8')).inputs.map((input) => `${input.path.replaceAll('\\', '/')}:${input.rawSha256}`));
  const kept = JSON.parse(fs.readFileSync(manifestFile, 'utf8')).files.filter((item) => pinned.has(`${item.live}:${item.sha256}`));
  return Object.fromEntries(kept.map((item) => [item.live, item.snapshot]));
}

function run(dir, { overlay }) {
  const replay = JSON.parse(fs.readFileSync(path.join(dir, 'replay.json'), 'utf8'));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  // An OWN empty key: spawn re-injects process.env.NODE_V8_COVERAGE into a child whose env merely lacks the key, so a nested run under
  // the coverage gate would write V8 data of the retained pre-fix snapshots into the caller's directory (L-0140).
  env.NODE_V8_COVERAGE = '';
  delete env.C017_OVERLAY;
  delete env.NODE_OPTIONS;
  // baseline "final": the world of this RED is the final code, only the overlay subject of replay.json is naive (fix-chunked-structural).
  const world = replay.baseline === 'final' ? {} : historicalOverlay();
  const legacy = retainedLegacy(dir);
  if (overlay || Object.keys(legacy).length) Object.assign(env, { C017_OVERLAY: JSON.stringify({ ...(overlay ? { ...world, ...replay.overlay } : {}), ...legacy }), NODE_OPTIONS: replay.nodeOptions });
  const args = ['--test', '--test-reporter=tap', '--test-concurrency=1', `--test-timeout=${replay.testTimeoutMs}`, ...replay.tests.map((p) => p.replaceAll('/', '\\'))];
  const result = spawnSync(process.execPath, args, { cwd: repo, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 3600000 });
  const text = result.stdout.replace(/\r\n/g, '\n');
  const count = (label) => Number((new RegExp(`^# ${label} (\\d+)$`, 'm').exec(text) || [0, 0])[1]);
  return { exitCode: result.status, tests: count('tests'), pass: count('pass'), fail: count('fail'), notOk: [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim()).slice(0, 60), passed: tapNames(text, true), failed: tapNames(text, false) };
}

function replay(name) {
  const dir = resolveDir(name);
  const archived = verifyRedAuto(dir);
  const now = run(dir, { overlay: true });
  const manifest = archived.manifest;
  const failedThen = failedNames(archivedTranscript(dir, manifest));
  const missing = failedThen.filter((testName) => !now.failed.has(testName));
  const same = now.exitCode === manifest.exitCode && missing.length === 0;
  return { name: path.basename(dir), reproduced: archived.ok && same, archiveProblems: archived.problems, exitCode: now.exitCode, fail: now.fail, tests: now.tests, failing: now.notOk, failedThen: failedThen.length, notFailingNow: missing };
}

function verifyGreen(name) {
  const dir = resolveDir(name);
  const archived = verifyRedAuto(dir);
  const now = run(dir, { overlay: false });
  const failedThen = failedNames(archivedTranscript(dir, archived.manifest));
  const notPassing = failedThen.filter((testName) => !now.passed.has(testName));
  return { name: path.basename(dir), unchangedRedPassesAgainstFinalCode: archived.ok && now.exitCode === 0 && now.fail === 0 && failedThen.length > 0 && notPassing.length === 0, archiveProblems: archived.problems, exitCode: now.exitCode, fail: now.fail, tests: now.tests, failedThen: failedThen.length, notPassing };
}

const all = () => fs.readdirSync(redRoot).filter((entry) => entry.startsWith('fix-')).sort();
const superseded = (entry) => Object.keys(retainedLegacy(path.join(redRoot, entry))).length > 0;

if (require.main === module) {
  const [mode, name] = process.argv.slice(2);
  const modes = { replay, 'verify-green': verifyGreen };
  let results;
  if (mode === 'replay-all') results = all().map((entry) => replay(entry));
  else if (mode === 'verify-green-all') results = all().map((entry) => (superseded(entry) ? { name: entry, superseded: true, note: 'retained legacy test bytes with absolute time bounds (F22); replaced by fix-chunked-structural; run `verify-green <name>` to run them anyway' } : verifyGreen(entry)));
  else if (modes[mode] && name) results = [modes[mode](name)];
  else { console.error('usage: fix-red.cjs replay|verify-green <fix-name> | replay-all | verify-green-all'); process.exit(2); }
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.every((r) => r.reproduced || r.unchangedRedPassesAgainstFinalCode || r.superseded) ? 0 : 1);
}

module.exports = Object.freeze({ replay, verifyGreen, run, all, retainedLegacy, tapNames, failedNames });
