'use strict';

// U005 evidence integrity: recomputes every archived run, pins the final runs to the bytes they ran on, checks that the RED is
// behavioral, the GREEN and coverage numbers are the ones the README claims, every mutant was killed and the real Edge
// observation is Microsoft-signed within a qualified major. The tamper tests prove the verifier fails when evidence is edited.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { repoRoot, evidenceRoot, readManifest, verifyRun, stdoutOf } = require('./u005-support-evidence.cjs');

const T = { timeout: 60000 };
const DRAFT_REDS = ['red-1-race', 'red-2-name', 'red-3-late'];
// History: archived on earlier bytes of owned.cjs and of the tests (before the retry passes of OwnedTree.run and the real-test fixes). They are verified (transcripts,
// hashes, exit codes), never pinned to the current files. red-4..6 and green-1..3 are the first "final" runs; mutation-1 is the first full mutation run (72 of 73 killed, S32 reported a
// stale pattern: exit 1) with its complement mutation-2-s32; real-1 to real-3 are the real runs on a machine at 100 percent CPU that failed (exit 1): real-1 hit the file-level
// --test-timeout, real-2 the 480 s test timeout with one survivor in the final report, real-3 listed a root that was still exiting as survivor (ERR_KILL) and an over-strict
// "every recorded process is alive" assertion; that survivor is what the retry passes fix.
const HISTORY_REDS = ['red-4-final-race', 'red-5-final-name', 'red-6-final-late'];
const HISTORY_OK = ['green-1-suite', 'green-2-coverage-owned', 'green-3-coverage-startup', 'mutation-2-s32'];
const KEPT_FAILED = ['mutation-1', 'real-1', 'real-2', 'real-3'];
// The final runs, pinned to the bytes they ran on.
const FINAL_REDS = ['red-7-final-race', 'red-8-final-name', 'red-9-final-late'];
const GREENS = ['green-4-suite', 'green-5-coverage-owned', 'green-6-coverage-startup'];
const FINAL = [...FINAL_REDS, ...GREENS, 'mutation-3', 'real-4'];
const ALL = [...DRAFT_REDS, ...HISTORY_REDS, ...HISTORY_OK, ...KEPT_FAILED, ...FINAL];
// Files that the fix (a later commit) changed: the first-publication final runs recorded their FIRST-PUBLICATION bytes, so they are no longer pinned to the
// working tree. owned.cjs and startup.cjs are instead tied to the archived snapshot of the fix evidence (first-publication.json), the others are history.
const CHANGED_BY_FIX = ['owned.cjs', 'startup.cjs', 'U005.feature', 'u005-support-impl.cjs', 'u005-support-world.cjs', 'u005-real.test.cjs', 'u005-startup-flow.test.cjs', 'u005-owned.test.cjs'];
const snapshotRoot = path.resolve(__dirname, '..', 'evidence', 'u005-fix', 'first-publication');
const dirOf = (name) => path.join(evidenceRoot, name);

test('the evidence folder holds exactly the archived runs, the specimen and nothing else', T, () => {
  const present = fs.readdirSync(evidenceRoot).filter((name) => name !== '.gitattributes').sort();
  const expected = [...ALL, 'specimen'].sort();
  assert.deepEqual(present.filter((name) => name !== 'green-7-integrity'), expected);
  assert.equal(fs.readFileSync(path.join(evidenceRoot, '.gitattributes'), 'utf8').trim(), '* -text -diff');
  for (const name of ALL) {
    assert.deepEqual(fs.readdirSync(dirOf(name)).sort(), ['raw', `${name}.json`].sort(), name);
    assert.deepEqual(fs.readdirSync(path.join(dirOf(name), 'raw')).sort(), [`${name}.stderr.raw.gz`, `${name}.stdout.raw.gz`], name);
  }
  assert.deepEqual(fs.readdirSync(path.join(evidenceRoot, 'specimen')), ['naive-impl.cjs.txt']);
});

test('every archived run verifies: transcripts, hashes, exit codes and summaries are the ones recorded', T, () => {
  for (const name of ALL.filter((item) => !KEPT_FAILED.includes(item))) assert.deepEqual(verifyRun(dirOf(name), name), [], name);
  for (const name of KEPT_FAILED) assert.deepEqual(verifyRun(dirOf(name), name, { expectedExitCode: 1 }), [], name);
});

test('the first-publication final runs pin the bytes they ran on; what the fix changed is tied to the archived first-publication snapshot', T, () => {
  for (const name of FINAL) assert.deepEqual(verifyRun(dirOf(name), name, { pinInputs: true, ignoreInputs: CHANGED_BY_FIX }), [], name);
  const snapshots = JSON.parse(fs.readFileSync(path.join(snapshotRoot, 'first-publication.json'), 'utf8')).files;
  assert.deepEqual(snapshots.map((file) => path.basename(file.path)), ['owned.cjs', 'startup.cjs']);
  for (const file of snapshots) {
    const bytes = fs.readFileSync(path.join(snapshotRoot, file.snapshot));
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), file.sha256, `${file.snapshot} is the archived snapshot`);
    for (const name of FINAL) {
      const input = readManifest(dirOf(name), name).inputs.find((item) => path.basename(item.path) === path.basename(file.path));
      if (input) assert.equal(input.crlfToLfSha256, file.sha256, `${name} ran on the first-publication ${path.basename(file.path)}`);
    }
  }
});

test('the draft REDs pin the naive specimen and the accepted U004 files, which never changed', T, () => {
  const lifecycle = path.resolve(__dirname, '..');
  const helper = fs.readFileSync(path.join(__dirname, 'u006-u061-authority.cjs'));
  const helperHash = crypto.createHash('sha256').update(helper).digest('hex');
  assert.ok(['6b78b899e55598f45c8863d841d2f79040483b49ca829e7bc3d222a16336f182', 'ae059820be272488a69073aed011708c8bee01d3aa2113c65e96f8154de6c249'].includes(helperHash), 'U061_HELPER_PIN');
  const authority = require('./u006-u061-authority.cjs').loadAuthority((p) => fs.readFileSync(path.join(lifecycle, p)));
  for (const name of DRAFT_REDS) {
    const manifest = readManifest(dirOf(name), name);
    const stable = manifest.inputs.filter((input) => /naive-impl\.cjs\.txt$|[\\/]tree\.cjs$|[\\/]windows\.cjs$/.test(input.path));
    assert.equal(stable.length, 3, name);
    for (const input of stable) {
      const bytes = fs.readFileSync(path.join(repoRoot, input.path));
      const manifestPath = path.relative(lifecycle, path.join(dirOf(name), `${name}.json`));
      const inputPath = input.path.replace(/\//g, '\\').slice('testing\\browser\\lifecycle\\'.length);
      assert.equal(authority.verifyStable(manifestPath, inputPath, bytes).ok, true, `${name} ${input.path}`);
    }
  }
});

test('every RED fails on assertions about the specified behavior, never on a missing module or a syntax error', T, () => {
  for (const name of [...DRAFT_REDS, ...FINAL_REDS]) {
    const manifest = readManifest(dirOf(name), name);
    const text = stdoutOf(dirOf(name), name);
    assert.equal(manifest.exitCode, 1, name);
    assert.ok(manifest.summary.fail >= 40 && manifest.summary.tests >= 52, `${name}: ${manifest.summary.fail} of ${manifest.summary.tests}`);
    assert.ok((text.match(/code: 'ERR_ASSERTION'/g) || []).length >= 25, `${name}: assertion failures`);
    assert.doesNotMatch(text, /Cannot find module|MODULE_NOT_FOUND|SyntaxError/, name);
  }
});

test('the GREEN runs pass every test and the per-file coverage rows are at least 85/85/85', T, () => {
  for (const name of GREENS) {
    const { summary } = readManifest(dirOf(name), name);
    assert.deepEqual([summary.tests, summary.pass, summary.fail], [72, 72, 0], name);
  }
  for (const [name, file] of [['green-5-coverage-owned', 'owned.cjs'], ['green-6-coverage-startup', 'startup.cjs']]) {
    const rows = readManifest(dirOf(name), name).summary.coverageRows.filter((row) => row.file === file);
    assert.equal(rows.length, 1, name);
    assert.ok(rows[0].lines >= 85 && rows[0].branches >= 85 && rows[0].functions >= 85, JSON.stringify(rows[0]));
  }
});

test('mutation evidence of the first publication: the control passes and every chosen guard mutant of those bytes is killed by a named failing test', T, () => {
  const report = JSON.parse(stdoutOf(dirOf('mutation-3'), 'mutation-3'));
  const ids = [...require('./u005-mutants-owned.cjs'), ...require('./u005-mutants-startup.cjs')].map((mutant) => mutant.id);
  assert.equal(report.control.ok, true);
  assert.deepEqual(report.mutants.map((mutant) => mutant.id), ids);
  assert.deepEqual(report.mutants.filter((mutant) => mutant.status !== 'killed'), []);
  assert.deepEqual(report.summary.notKilled, []);
  assert.equal(report.summary.total, ids.length);
  assert.equal(ids.length, 76);
  assert.equal(new Set(ids).size, ids.length);
});

test('the history runs stay what they were: the first full mutation run missed only a stale pattern, the earlier real runs failed', T, () => {
  const first = JSON.parse(stdoutOf(dirOf('mutation-1'), 'mutation-1'));
  const complement = JSON.parse(stdoutOf(dirOf('mutation-2-s32'), 'mutation-2-s32'));
  assert.deepEqual(first.summary.notKilled, ['S32:bad-pattern']);
  assert.deepEqual(complement.mutants.map((mutant) => [mutant.id, mutant.status]), [['S32', 'killed']]);
  for (const name of KEPT_FAILED.filter((item) => item.startsWith('real-'))) assert.equal(readManifest(dirOf(name), name).exitCode, 1, name);
});

test('real Edge evidence: Microsoft-signed within a qualified major, tree gone, look-alike and foreign Edge untouched', T, () => {
  const lines = [...stdoutOf(dirOf('real-4'), 'real-4').matchAll(/^# U005-REAL-OBSERVATION (.+)$/gm)].map((match) => JSON.parse(match[1]));
  assert.equal(lines.length, 2);
  const majors = require(path.join(repoRoot, 'testing', 'browser', 'qualify', 'adapters.cjs')).readQualified().qualifiedMajors;
  for (const line of lines) {
    assert.equal(line.edge.status, 'Valid');
    assert.match(line.edge.subject, /O=Microsoft Corporation/);
    assert.ok(majors.includes(Number(line.edge.version.split('.')[0])));
  }
  const [forced, normal] = lines;
  assert.ok(['found', 'open-complete'].includes(forced.trigger));
  assert.equal(forced.survivors, 0);
  assert.equal(forced.finalClean, true);
  assert.equal(forced.lookAlikeAlive, true);
  assert.deepEqual(forced.foreignVanished, []);
  assert.ok(forced.killRequests >= 1 && forced.terminated >= 1);
  assert.ok(normal.recorded >= 1 && normal.roots >= 1 && normal.killRequests === 0);
});

function withScratch(run) {
  const dir = fs.mkdtempSync(path.join(__dirname, 'u005-tamper-'));
  try {
    const copy = path.join(dir, 'green-4-suite');
    fs.cpSync(dirOf('green-4-suite'), copy, { recursive: true });
    return run(dir, copy);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test('tampering is detected: a flipped transcript byte, an edited manifest, a missing transcript, a changed input', T, () => {
  const name = 'green-4-suite';
  const stdoutGz = (copy) => path.join(copy, 'raw', `${name}.stdout.raw.gz`);
  const edit = (copy, change) => { const file = path.join(copy, `${name}.json`); const manifest = JSON.parse(fs.readFileSync(file, 'utf8')); change(manifest); fs.writeFileSync(file, JSON.stringify(manifest)); };
  withScratch((dir, copy) => { assert.deepEqual(verifyRun(copy, name), []); });
  withScratch((dir, copy) => { const bytes = fs.readFileSync(stdoutGz(copy)); bytes[bytes.length - 12] ^= 0xff; fs.writeFileSync(stdoutGz(copy), bytes); assert.ok(verifyRun(copy, name).length > 0); });
  withScratch((dir, copy) => { edit(copy, (manifest) => { manifest.exitCode = 1; }); assert.ok(verifyRun(copy, name).some((item) => /exit/.test(item))); });
  withScratch((dir, copy) => { edit(copy, (manifest) => { manifest.transcripts.stdout.bytes += 1; }); assert.ok(verifyRun(copy, name).some((item) => /stdout text/.test(item))); });
  withScratch((dir, copy) => { edit(copy, (manifest) => { manifest.summary.pass = 69; }); assert.ok(verifyRun(copy, name).some((item) => /summary\.pass/.test(item))); });
  withScratch((dir, copy) => { fs.rmSync(path.join(copy, 'raw', `${name}.stderr.raw.gz`)); assert.ok(verifyRun(copy, name).some((item) => /stderr transcript unreadable/.test(item))); });
  withScratch((dir, copy) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(copy, `${name}.json`), 'utf8'));
    const stable = manifest.inputs.filter((input) => !CHANGED_BY_FIX.includes(path.basename(input.path)));
    for (const input of stable) {
      const target = path.join(dir, 'root', input.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, input.path), target);
    }
    const options = { pinInputs: true, root: path.join(dir, 'root'), ignoreInputs: CHANGED_BY_FIX };
    assert.deepEqual(verifyRun(copy, name, options), []);
    fs.appendFileSync(path.join(dir, 'root', stable[0].path), '\n// tampered\n');
    assert.ok(verifyRun(copy, name, options).some((item) => /changed after the run/.test(item)));
    fs.rmSync(path.join(dir, 'root', stable[1].path));
    assert.ok(verifyRun(copy, name, options).some((item) => /is missing/.test(item)));
  });
  assert.ok(verifyRun(path.join(evidenceRoot, 'no-such-run'), 'no-such-run').some((item) => /manifest unreadable/.test(item)));
});
