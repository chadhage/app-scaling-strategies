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
const { spawnSync } = require('node:child_process');
const { verifyRed } = require('./evidence-check.cjs');

const root = path.join(__dirname, '..');
const repo = path.resolve(root, '..', '..');
const redRoot = path.join(root, 'evidence', 'red');

const resolveDir = (name) => {
  const hits = fs.readdirSync(redRoot).filter((entry) => entry.startsWith('fix-') && (entry === name || entry.startsWith(`fix-${name}-`) || entry.startsWith(`${name}-`)));
  if (hits.length !== 1) throw new Error(`expected exactly one RED archive for ${name}, found ${hits.length}`);
  return path.join(redRoot, hits[0]);
};

function run(dir, { overlay }) {
  const replay = JSON.parse(fs.readFileSync(path.join(dir, 'replay.json'), 'utf8'));
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  // An OWN empty key: spawn re-injects process.env.NODE_V8_COVERAGE into a child whose env merely lacks the key, so a nested run under
  // the coverage gate would write V8 data of the retained pre-fix snapshots into the caller's directory (L-0140).
  env.NODE_V8_COVERAGE = '';
  delete env.C017_OVERLAY;
  delete env.NODE_OPTIONS;
  if (overlay) Object.assign(env, { C017_OVERLAY: JSON.stringify(replay.overlay), NODE_OPTIONS: replay.nodeOptions });
  const args = ['--test', '--test-reporter=tap', '--test-concurrency=1', `--test-timeout=${replay.testTimeoutMs}`, ...replay.tests.map((p) => p.replaceAll('/', '\\'))];
  const result = spawnSync(process.execPath, args, { cwd: repo, env, encoding: 'utf8', maxBuffer: 1 << 26, timeout: 900000 });
  const text = result.stdout.replace(/\r\n/g, '\n');
  const count = (label) => Number((new RegExp(`^# ${label} (\\d+)$`, 'm').exec(text) || [0, 0])[1]);
  return { exitCode: result.status, tests: count('tests'), pass: count('pass'), fail: count('fail'), notOk: [...text.matchAll(/^not ok \d+ - (.+)$/gm)].map((m) => m[1].trim()).slice(0, 60) };
}

function replay(name) {
  const dir = resolveDir(name);
  const archived = verifyRed(dir);
  const now = run(dir, { overlay: true });
  const manifest = archived.manifest;
  const same = now.exitCode === manifest.exitCode && now.fail === manifest.summary.fail && now.tests === manifest.summary.tests && JSON.stringify(now.notOk) === JSON.stringify(manifest.summary.notOk);
  return { name: path.basename(dir), reproduced: archived.ok && same, archiveProblems: archived.problems, exitCode: now.exitCode, fail: now.fail, tests: now.tests, failing: now.notOk };
}

function verifyGreen(name) {
  const dir = resolveDir(name);
  const archived = verifyRed(dir);
  const now = run(dir, { overlay: false });
  return { name: path.basename(dir), unchangedRedPassesAgainstFinalCode: archived.ok && now.exitCode === 0 && now.fail === 0 && now.tests === archived.manifest.summary.tests, archiveProblems: archived.problems, exitCode: now.exitCode, fail: now.fail, tests: now.tests };
}

const all = () => fs.readdirSync(redRoot).filter((entry) => entry.startsWith('fix-')).sort();

if (require.main === module) {
  const [mode, name] = process.argv.slice(2);
  const modes = { replay, 'verify-green': verifyGreen };
  let results;
  if (mode === 'replay-all' || mode === 'verify-green-all') results = all().map((entry) => modes[mode.replace('-all', '')](entry));
  else if (modes[mode] && name) results = [modes[mode](name)];
  else { console.error('usage: fix-red.cjs replay|verify-green <fix-name> | replay-all | verify-green-all'); process.exit(2); }
  console.log(JSON.stringify(results, null, 2));
  process.exit(results.every((r) => r.reproduced || r.unchangedRedPassesAgainstFinalCode) ? 0 : 1);
}

module.exports = Object.freeze({ replay, verifyGreen, run, all });
