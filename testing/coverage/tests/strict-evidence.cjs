'use strict';

// STRICT MODE of the evidence checks (N2 of the second review). It is NOT part of the default suite (its name does not end in .test.cjs).
//   node testing\coverage\tests\strict-evidence.cjs
// It re-verifies the inputs that the default suite deliberately does not compare with the checkout: the C031 inputs of every recorder manifest against the
// blobs of the accepted C031 commit, and the inputs inside testing\coverage of the retained archives (first publication and first fix) against the blobs of
// the accepted U009 commits, all through `git cat-file --batch` (never the working tree). It needs git and those commits in the local repository, and
// makes no network call. stdout is one JSON document; exit 0 only when every input matches, 1 otherwise.
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { ACCEPTED, C031, manifestsIn, verifyAgainstCommits, sha, crlfToLf } = require('./evidence-lib.cjs');
const { buildEnvironment } = require('../command.cjs');
const { verifyAuthority, ACCEPTED_COMMIT } = require('./u041-authority.cjs');

const namespace = path.resolve(__dirname, '..');
const repository = path.resolve(namespace, '..', '..');
const GIT_TIMEOUT_MS = 300000;

// One git process answers every request. A request is "<commit>:<path>"; the answer is the blob or null when git says missing.
function fetchBlobs(keys, { cwd = repository, spawn = spawnSync } = {}) {
  const environment = { ...process.env };
  for (const name of Object.keys(environment)) if (/^GIT_(DIR|INDEX_FILE|WORK_TREE)$/i.test(name)) delete environment[name];
  const run = spawn('git', ['cat-file', '--batch'], { cwd, env: environment, input: `${keys.join('\n')}\n`, maxBuffer: 1024 * 1024 * 1024, timeout: GIT_TIMEOUT_MS, windowsHide: true });
  if (run.error || run.status !== 0) throw new Error(`git cat-file failed: ${run.error ? run.error.message : String(run.stderr)}`);
  const blobs = new Map();
  let offset = 0;
  for (const key of keys) {
    const end = run.stdout.indexOf(0x0a, offset);
    const header = run.stdout.toString('latin1', offset, end);
    offset = end + 1;
    const found = /^[0-9a-f]+ blob (\d+)$/.exec(header);
    if (found === null) {
      blobs.set(key, null);
    } else {
      blobs.set(key, run.stdout.subarray(offset, offset + Number(found[1])));
      offset += Number(found[1]) + 1;
    }
  }
  return blobs;
}

// A retained archive pins the bytes of an accepted commit by design; the archives of the newest generation (fix2) are compared with the checkout by the default suite.
const retained = (relative) => !relative.startsWith('fix2/') && !/^red\/fix2-/.test(relative);

function strictVerify({ manifests, fetch = fetchBlobs }) {
  const wanted = new Set();
  verifyAgainstCommits(manifests, (commit, file) => { wanted.add(`${commit}:${file}`); return null; }, { retained });
  const blobs = fetch([...wanted]);
  return verifyAgainstCommits(manifests, (commit, file) => blobs.get(`${commit}:${file}`) ?? null, { retained });
}

function runHermeticChecks({ spawn = spawnSync, env = process.env } = {}) {
  const args = ['--test', '--test-concurrency=1', path.join(__dirname, 'fix2-hermetic.test.cjs')];
  const run = spawn(process.execPath, args, {
    cwd: repository, env: buildEnvironment(env, { U009_HEAVY_HERMETIC: '1', U009_EVIDENCE_CAPTURE: undefined }),
    maxBuffer: 64 * 1024 * 1024, windowsHide: true
  });
  const text = String(run.stdout || '');
  const counts = Object.fromEntries(['tests', 'pass', 'fail', 'cancelled', 'skipped', 'todo'].map((key) =>
    [key, Number(new RegExp(`^# ${key} (\\d+)$`, 'm').exec(text)?.[1])]));
  if (run.error || run.status !== 0 || !(counts.tests >= 8) || counts.pass !== counts.tests ||
      counts.fail !== 0 || counts.cancelled !== 0 || counts.skipped !== 0 || counts.todo !== 0) {
    throw new Error(`strict heavy hermetic checks failed: ${JSON.stringify(counts)}\n${text.slice(-6000)}\n${String(run.stderr || '')}`);
  }
  return { command: ['node', '--test', '--test-concurrency=1', 'testing\\coverage\\tests\\fix2-hermetic.test.cjs'], ...counts, heavy: true, capture: false };
}

function verifyAcceptedSurface(entries, fetch = fetchBlobs) {
  const keys = entries.map((entry) => `${ACCEPTED_COMMIT}:testing/coverage/${entry.path.replace(/\\/g, '/')}`);
  const blobs = fetch(keys);
  const problems = [];
  entries.forEach((entry, index) => {
    const blob = blobs.get(keys[index]);
    if (!blob || sha(blob) !== entry.gitBlobSha256 || sha(crlfToLf(blob)) !== entry.crlfToLfSha256) {
      problems.push(`accepted U009 surface: ${entry.path} differs from the exact ${ACCEPTED_COMMIT} blob`);
    }
  });
  return { checked: entries.length, problems };
}

function main() {
  const authority = verifyAuthority(namespace);
  const hermetic = runHermeticChecks();
  const manifests = manifestsIn(path.join(namespace, 'evidence'));
  const legacy = strictVerify({ manifests });
  const surface = verifyAcceptedSurface(authority.surfaceFiles());
  const problems = [...legacy.problems, ...surface.problems];
  const document = {
    strict: true, pass: problems.length === 0, manifests: manifests.length, checked: legacy.checked + surface.checked,
    accepted: ACCEPTED, c031: { commit: C031.commit, tag: C031.tag },
    authority: { acceptedCommit: authority.acceptedCommit, checked: authority.checked, tip: authority.tip }, hermetic, problems
  };
  process.stdout.write(`${JSON.stringify(document, null, 2)}\n`);
  process.exitCode = document.pass ? 0 : 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ strict: true, pass: false, problems: [String((error && error.message) || error)] }, null, 2)}\n`);
    process.exitCode = 1;
  }
}

module.exports = Object.freeze({ fetchBlobs, retained, strictVerify, runHermeticChecks, verifyAcceptedSurface });
