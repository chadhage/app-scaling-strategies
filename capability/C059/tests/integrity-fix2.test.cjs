'use strict';

// Integrity of the evidence of the THIRD worker's fix (second review, N1 to N4): the subjects of the new REDs are the bytes published in dfdace94 (recomputed against
// git), every new RED is a recorded behavioral failure with unchanged inputs, a tamper of any of them is caught BY NAME, the retained snapshots ARE the final tests
// (only their header and require lines differ), and the final REDs REPLAY both ways: they fail against their old subject and pass UNCHANGED against the final code.
// run-7, run-8 and run-11 are retained attempts (their flaws are named in the README); they are verified and tamper-tested, and run-7 is replayed on the final code.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { sha, verifyManifest } = require('./evidence-verify.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const red = path.join(root, 'evidence', 'red');
const FIRST_FIX = 'dfdace94e5791dce67a543a36659071956661a51';
const OPTIONS = { timeout: 280000 };
const blob = (relative) => execFileSync('git', ['--no-pager', 'cat-file', 'blob', `${FIRST_FIX}:${relative}`], { cwd: repository, maxBuffer: 4 * 1024 * 1024, windowsHide: true });
const subject = (name) => path.join('capability', 'C059', 'evidence', 'red', name);

// [run directory, snapshot files, old subject, tests, pass and fail against the old subject, failure codes allowed besides ERR_ASSERTION, replayed on the final code, replayed against the old subject]
const RUNS = [
  ['run-7', ['fix-g.snapshot.cjs', 'fix-h.snapshot.cjs'], 'stubs-5', 24, 18, 6, 2, true, false],
  ['run-8', ['fix-i.snapshot.cjs'], 'stubs-6', 4, 1, 3, 0, false, false],
  ['run-9', ['fix-j.snapshot.cjs'], 'stubs-7', 12, 6, 6, 0, true, true],
  ['run-10', ['fix-k.snapshot.cjs', 'fix-l.snapshot.cjs'], 'stubs-5', 25, 19, 6, 0, true, true],
  ['run-11', ['fix-m.snapshot.cjs'], 'stubs-6', 4, 1, 3, 0, false, false],
  ['run-12', ['fix-n.snapshot.cjs'], 'stubs-6', 4, 1, 3, 0, true, true],
];
// The old-subject replay of run-10 is limited to the tests that carry the defect: the published service keeps every hung connection open until a hard bound,
// so the full archive (run-10) is verified by its manifest and only these three are run again.
const OLD_SELECTION = { 'run-10': /reviewer shapes in the open|SEPARATE process\] an unknown expectation: Node would answer 417|128 sockets, each sending \[G\]\[G\]\[Expect/ };

function replay(files, env, selection) {
  const clean = { ...process.env, ...env };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete clean[key];
  if (!env.C059_RED_SUBJECT) delete clean.C059_RED_SUBJECT;
  const args = ['--test', '--test-concurrency=1', '--test-timeout=200000', ...(selection ? [`--test-name-pattern=${selection.source}`] : []), ...files.map((file) => path.join(red, file))];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: repository, env: clean, windowsHide: true });
    const out = [];
    const err = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => err.push(chunk));
    const timer = setTimeout(() => child.kill(), 260000);
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, stdout: Buffer.concat(out).toString('utf8'), stderr: Buffer.concat(err).toString('utf8') }); });
  });
}

// Every replay is a real test run; they all start together when the file is loaded and every test awaits its own (one file may not exceed the 280 seconds of the GREEN command).
const replays = new Map(RUNS.filter((item) => item[7] || item[8]).map(([directory, files, stub, , , , , finalReplay, oldReplay]) => [directory, {
  old: oldReplay ? replay(files, { C059_RED_SUBJECT: subject(stub) }, OLD_SELECTION[directory]) : null,
  final: finalReplay ? replay(files, {}) : null,
}]));

test('the subjects of the new REDs are the bytes published in dfdace94 (recomputed against git)', OPTIONS, () => {
  for (const [stub, published] of [
    ['stubs-5/server.cjs', 'capability/C059/server.cjs'], ['stubs-6/journey.js', 'capability/C059/journey.js'], ['stubs-6/page.js', 'capability/C059/page.js'],
    ['stubs-6/index.html', 'capability/C059/index.html'], ['stubs-7/a11y-check.js', 'capability/C059/a11y-check.js'],
  ]) assert.equal(sha(fs.readFileSync(path.join(red, ...stub.split('/')))), sha(blob(published)), `${stub} is ${published} of ${FIRST_FIX.slice(0, 12)}`);
});

for (const [directory, files, , tests, passes, fails, others] of RUNS) {
  test(`${directory}: a recorded behavioral failure (${fails} of ${tests}), inputs and transcripts unchanged`, OPTIONS, () => {
    const { manifest, problems, stdout } = verifyManifest(path.join(red, directory, 'red.json'), { root: repository });
    assert.deepEqual(problems, []);
    assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.timedOut], [1, 1, false]);
    assert.deepEqual([manifest.summary.tests, manifest.summary.pass, manifest.summary.fail], [tests, passes, fails]);
    assert.equal([...stdout.matchAll(/code: 'ERR_ASSERTION'/g)].length, fails - others, 'the failures are assertions about behavior (the retained first attempt has two thrown timeouts that name the open connection)');
    if (others) assert.equal([...stdout.matchAll(/error: 'hard timeout: the server kept the connection open'|error: 'SOCKETS_NOT_CLOSED_BY_THE_SERVER[^']*'/g)].length, others, 'the other failures are the named open-connection timeouts');
    assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError|TypeError/);
    assert.equal(manifest.transcripts.stderr.bytes, 0);
    for (const file of files) assert.ok(manifest.inputs.some((input) => input.path.endsWith(file)), `${file} is a recorded input`);
    assert.ok(manifest.inputs.some((input) => input.path.endsWith('C059-review-fix2.feature')), 'the specification is a recorded input');
    for (const file of files) assert.equal(sha(fs.readFileSync(path.join(red, file))), manifest.inputs.find((input) => input.path.endsWith(file)).rawSha256, `${file} is byte-identical to the RED run`);
  });

  test(`${directory}: a tampered input hash, transcript or summary of the archive is caught by name`, OPTIONS, () => {
    const scratch = path.join(__dirname, 'scratch', `t-${randomUUID()}`);
    try {
      const dir = path.join(scratch, directory);
      fs.cpSync(path.join(red, directory), dir, { recursive: true });
      const manifestPath = path.join(dir, 'red.json');
      const original = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      assert.deepEqual(verifyManifest(manifestPath, { root: repository }).problems, []);
      const flipped = JSON.parse(JSON.stringify(original));
      flipped.inputs[1].rawSha256 = `${flipped.inputs[1].rawSha256.slice(0, 63)}${flipped.inputs[1].rawSha256.endsWith('0') ? '1' : '0'}`;
      fs.writeFileSync(manifestPath, JSON.stringify(flipped));
      assert.deepEqual(verifyManifest(manifestPath, { root: repository }).problems, [`INPUT_CHANGED ${original.inputs[1].path}`]);
      fs.writeFileSync(manifestPath, JSON.stringify({ ...original, summary: { ...original.summary, fail: original.summary.fail + 1 } }));
      assert.deepEqual(verifyManifest(manifestPath, { root: repository }).problems, ['SUMMARY_MISMATCH fail']);
      fs.writeFileSync(manifestPath, JSON.stringify(original));
      const gz = path.join(dir, 'raw', 'red.stdout.raw.gz');
      const bytes = fs.readFileSync(gz);
      bytes[bytes.length - 12] ^= 0xff;
      fs.writeFileSync(gz, bytes);
      assert.ok(verifyManifest(manifestPath, { root: repository }).problems.some((problem) => /^(GZIP_CHANGED|GZIP_CORRUPT|RAW_CHANGED) stdout$/.test(problem)));
    } finally {
      fs.rmSync(scratch, { recursive: true, force: true });
      try { fs.rmdirSync(path.join(__dirname, 'scratch')); } catch { /* another file still uses it, or it is gone */ }
    }
  });
}

// The snapshots are the final tests: the same lines, except the leading comment block and the lines that load the subject.
const body = (text) => text.replace(/\r\n/g, '\n').split('\n').filter((line) => !/^\/\//.test(line) && !/^const .*require\(/.test(line) && !/^const subject = /.test(line)).join('\n');
test('the final RED snapshots ARE the final tests: only their comments and the lines that load the subject differ', OPTIONS, () => {
  for (const [live, snapshot] of [
    ['lane.test.cjs', 'fix-k.snapshot.cjs'], ['lane-flood.test.cjs', 'fix-l.snapshot.cjs'], ['lane-support.cjs', path.join('helpers-10', 'lane-support.cjs')],
    ['bind-null.test.cjs', 'fix-n.snapshot.cjs'], ['checker-fp.test.cjs', 'fix-j.snapshot.cjs'],
  ]) assert.equal(body(fs.readFileSync(path.join(__dirname, live), 'utf8')), body(fs.readFileSync(path.join(red, snapshot), 'utf8')), `${snapshot} is ${live}`);
  assert.equal(sha(fs.readFileSync(path.join(red, 'helpers-9', 'negatives.cjs'))), sha(fs.readFileSync(path.join(__dirname, 'negatives.cjs'))), 'the helper copy of the fixtures is the final fixtures');
});

for (const [directory, files, , tests, passes, fails, , finalReplay, oldReplay] of RUNS.filter((item) => item[7] || item[8])) {
  test(`${directory}: the retained RED ${oldReplay ? `fails against its old subject${OLD_SELECTION[directory] ? ' (the tests that carry the defect; the full archive is the manifest)' : ` (${fails} of ${tests})`}` : ''}${oldReplay && finalReplay ? ' and ' : ''}${finalReplay ? `passes UNCHANGED against the final code (${tests} of ${tests})` : ''}`, OPTIONS, async () => {
    const pending = replays.get(directory);
    if (oldReplay) {
      const old = await pending.old;
      assert.equal(old.status, 1, old.stdout.slice(-1500));
      const failed = Number(/^# fail (\d+)$/m.exec(old.stdout)?.[1]);
      const passed = Number(/^# pass (\d+)$/m.exec(old.stdout)?.[1]);
      if (OLD_SELECTION[directory]) assert.ok(failed >= 3 && passed === 0, `${passed} passed and ${failed} failed against the old subject`);
      else assert.deepEqual([passed, failed], [passes, fails]);
      assert.equal([...old.stdout.matchAll(/code: 'ERR_ASSERTION'/g)].length, failed);
      assert.doesNotMatch(`${old.stdout}${old.stderr}`, /MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
    }
    if (finalReplay) {
      const final = await pending.final;
      assert.equal(final.status, 0, final.stdout.slice(-2500));
      assert.match(final.stdout, new RegExp(`^# pass ${tests}$`, 'm'));
      assert.match(final.stdout, /^# fail 0$/m);
    }
    const manifest = JSON.parse(fs.readFileSync(path.join(red, directory, 'red.json'), 'utf8'));
    for (const file of files) assert.equal(sha(fs.readFileSync(path.join(red, file))), manifest.inputs.find((input) => input.path.endsWith(file)).rawSha256, `${file} is byte-identical to the RED run`);
  });
}

test('the latest archived real-Edge cleanup proof: the injected failure failed the browser run and its finally block still closed the real session', OPTIONS, () => {
  const raw = path.join(root, 'evidence', 'raw');
  const names = fs.readdirSync(raw).filter((name) => /^browser-cleanup-\d+\.json$/.test(name)).sort((a, b) => Number(/-(\d+)\.json$/.exec(a)[1]) - Number(/-(\d+)\.json$/.exec(b)[1]));
  assert.ok(names.length > 0, 'a cleanup proof is archived');
  const { manifest, problems, stdout } = verifyManifest(path.join(raw, names.at(-1)), { root: repository });
  assert.deepEqual(problems, []);
  assert.equal(manifest.exitCode, 0);
  assert.match(stdout, /"result":"ok","injected":true,"exit":1/);
});

test('the test runs leave no scratch folder behind', OPTIONS, () => {
  assert.equal(fs.existsSync(path.join(__dirname, 'scratch')), false);
});
