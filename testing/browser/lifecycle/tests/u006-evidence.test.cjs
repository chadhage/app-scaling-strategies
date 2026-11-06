'use strict';

// U006 evidence integrity: recomputes every archived run, pins the final runs to the bytes they ran on, checks that the RED is behavioral,
// the GREEN and coverage numbers, every mutant killed and the real Edge observations. The tamper tests prove the verifier fails on edits.
// The verifier is the U005 one (read-only import, pinned in imports.json).

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { repoRoot, readManifest, verifyRun, stdoutOf } = require('./u005-support-evidence.cjs');

const T = { timeout: 60000 };
const evidenceRoot = path.resolve(__dirname, '..', 'evidence', 'u006');
const DRAFT_REDS = ['red-1-await', 'red-2-name', 'red-3-ignore'];
// History: archived on the bytes before the retry passes of the U005 owned.cjs (and before the real test existed). They are verified (transcripts, hashes, exit codes), not pinned to the
// current files: red-4..6 and green-1..3 are the first "final" runs, mutation-1 the first full mutation run (30 of 30 killed).
const HISTORY_REDS = ['red-4-final-await', 'red-5-final-name', 'red-6-final-ignore'];
const HISTORY = [...HISTORY_REDS, 'green-1-suite', 'green-2-coverage-close', 'green-3-coverage-session', 'mutation-1'];
// The final runs, pinned to the bytes they ran on.
const FINAL_REDS = ['red-7-final-await', 'red-8-final-name', 'red-9-final-ignore'];
const GREENS = ['green-4-suite', 'green-5-coverage-close', 'green-6-coverage-session', 'green-7-imports'];
const FINAL = [...FINAL_REDS, ...GREENS, 'mutation-2', 'real-1'];
const ALL = [...DRAFT_REDS, ...HISTORY, ...FINAL];
const dirOf = (name) => path.join(evidenceRoot, name);

test('the evidence folder holds exactly the archived runs, the specimen and nothing else', T, () => {
  const present = fs.readdirSync(evidenceRoot).filter((name) => name !== '.gitattributes').sort();
  assert.deepEqual(present.filter((name) => name !== 'green-8-integrity'), [...ALL, 'specimen'].sort());
  assert.equal(fs.readFileSync(path.join(evidenceRoot, '.gitattributes'), 'utf8').trim(), '* -text -diff');
  for (const name of ALL) {
    assert.deepEqual(fs.readdirSync(dirOf(name)).sort(), ['raw', `${name}.json`].sort(), name);
    assert.deepEqual(fs.readdirSync(path.join(dirOf(name), 'raw')).sort(), [`${name}.stderr.raw.gz`, `${name}.stdout.raw.gz`], name);
  }
  assert.deepEqual(fs.readdirSync(path.join(evidenceRoot, 'specimen')), ['naive-close.cjs.txt']);
});

test('every archived run verifies, and the final runs pin the exact bytes of every file they ran on', T, () => {
  for (const name of ALL) assert.deepEqual(verifyRun(dirOf(name), name), [], name);
  for (const name of FINAL) assert.deepEqual(verifyRun(dirOf(name), name, { pinInputs: true }), [], name);
});

test('the draft REDs pin the naive specimen and the accepted U004 tree.cjs, which never changed', T, () => {
  for (const name of DRAFT_REDS) {
    const manifest = readManifest(dirOf(name), name);
    const stable = manifest.inputs.filter((input) => /naive-close\.cjs\.txt$|[\\/]tree\.cjs$/.test(input.path));
    assert.equal(stable.length, 2, name);
    for (const input of stable) assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(repoRoot, input.path))).digest('hex'), input.rawSha256, `${name} ${input.path}`);
  }
});

test('every RED fails on assertions about the specified behavior, never on a missing module or a syntax error', T, () => {
  for (const name of [...DRAFT_REDS, ...HISTORY_REDS, ...FINAL_REDS]) {
    const manifest = readManifest(dirOf(name), name);
    const text = stdoutOf(dirOf(name), name);
    assert.equal(manifest.exitCode, 1, name);
    assert.ok(manifest.summary.fail >= 10 && manifest.summary.tests >= 16, `${name}: ${manifest.summary.fail} of ${manifest.summary.tests}`);
    assert.ok((text.match(/code: 'ERR_ASSERTION'/g) || []).length >= 8, `${name}: assertion failures`);
    assert.doesNotMatch(text, /Cannot find module|MODULE_NOT_FOUND|SyntaxError/, name);
  }
});

test('the GREEN runs pass every test and the per-file coverage rows are at least 85/85/85', T, () => {
  for (const name of GREENS) {
    const { summary } = readManifest(dirOf(name), name);
    assert.equal(summary.fail, 0, name);
    assert.equal(summary.pass, summary.tests, name);
    assert.ok(summary.tests >= 3, name);
  }
  assert.ok(readManifest(dirOf('green-4-suite'), 'green-4-suite').summary.tests >= 18);
  for (const [name, file] of [['green-5-coverage-close', 'close.cjs'], ['green-6-coverage-session', 'session.cjs']]) {
    const rows = readManifest(dirOf(name), name).summary.coverageRows.filter((row) => row.file === file);
    assert.equal(rows.length, 1, name);
    assert.ok(rows[0].lines >= 85 && rows[0].branches >= 85 && rows[0].functions >= 85, JSON.stringify(rows[0]));
  }
});

test('mutation evidence: the control passes and every guard mutant of the final bytes is killed by a named failing test', T, () => {
  const ids = require('./u006-mutants.cjs').map((mutant) => mutant.id);
  for (const name of ['mutation-1', 'mutation-2']) {
    const report = JSON.parse(stdoutOf(dirOf(name), name));
    assert.equal(report.control.ok, true, name);
    assert.deepEqual(report.mutants.map((mutant) => mutant.id), ids, name);
    assert.ok(report.mutants.every((mutant) => mutant.status === 'killed'), `${name}: ${JSON.stringify(report.summary)}`);
    assert.deepEqual([report.summary.total, report.summary.killed], [ids.length, ids.length], name);
  }
  assert.equal(ids.length, 30);
});

test('real Edge evidence: a normal close and a forced stuck close, signed and qualified, look-alike and foreign Edge untouched', T, () => {
  const lines = [...stdoutOf(dirOf('real-1'), 'real-1').matchAll(/^# U006-REAL-OBSERVATION (.+)$/gm)].map((match) => JSON.parse(match[1]));
  assert.equal(lines.length, 2);
  const majors = JSON.parse(fs.readFileSync(path.join(repoRoot, 'testing', 'browser', 'qualify', 'qualified.json'), 'utf8')).qualifiedMajors;
  for (const line of lines) {
    assert.equal(line.edge.status, 'Valid');
    assert.match(line.edge.subject, /O=Microsoft Corporation/);
    assert.ok(majors.includes(Number(line.edge.version.split('.')[0])));
    assert.equal(line.scratch, 'removed');
  }
  const normal = lines.find((line) => line.case === 'normal');
  const forced = lines.find((line) => line.case === 'forced-stuck-close');
  assert.ok(normal.recorded >= 1 && normal.graceful === 'closed' && normal.killRequests === 0);
  assert.equal(forced.graceful, 'timeout');
  assert.ok(forced.terminated >= 1 && forced.killRequests >= 1);
  assert.equal(forced.lookAlikeAlive, true);
  assert.deepEqual(forced.foreignVanished, []);
});

function withScratch(run) {
  const dir = fs.mkdtempSync(path.join(__dirname, 'u006-tamper-'));
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
  const edit = (copy, change) => { const file = path.join(copy, `${name}.json`); const manifest = JSON.parse(fs.readFileSync(file, 'utf8')); change(manifest); fs.writeFileSync(file, JSON.stringify(manifest)); };
  withScratch((dir, copy) => assert.deepEqual(verifyRun(copy, name), []));
  withScratch((dir, copy) => { const file = path.join(copy, 'raw', `${name}.stdout.raw.gz`); const bytes = fs.readFileSync(file); bytes[bytes.length - 12] ^= 0xff; fs.writeFileSync(file, bytes); assert.ok(verifyRun(copy, name).length > 0); });
  withScratch((dir, copy) => { edit(copy, (manifest) => { manifest.exitCode = 1; }); assert.ok(verifyRun(copy, name).some((item) => /exit/.test(item))); });
  withScratch((dir, copy) => { edit(copy, (manifest) => { manifest.summary.pass = 1; }); assert.ok(verifyRun(copy, name).some((item) => /summary\.pass/.test(item))); });
  withScratch((dir, copy) => { fs.rmSync(path.join(copy, 'raw', `${name}.stderr.raw.gz`)); assert.ok(verifyRun(copy, name).some((item) => /stderr transcript unreadable/.test(item))); });
  withScratch((dir, copy) => {
    const manifest = JSON.parse(fs.readFileSync(path.join(copy, `${name}.json`), 'utf8'));
    for (const input of manifest.inputs) {
      const target = path.join(dir, 'root', input.path);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(repoRoot, input.path), target);
    }
    const options = { pinInputs: true, root: path.join(dir, 'root') };
    assert.deepEqual(verifyRun(copy, name, options), []);
    fs.appendFileSync(path.join(dir, 'root', manifest.inputs[0].path), '\n// tampered\n');
    assert.ok(verifyRun(copy, name, options).some((item) => /changed after the run/.test(item)));
  });
});
