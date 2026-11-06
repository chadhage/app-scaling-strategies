'use strict';

// Integrity of the evidence of the FOURTH worker's fix (third review: K1, M2, Q1 to Q9). The old subjects of the new REDs are the bytes published in c2390608 (recomputed against git),
// every new RED is a recorded behavioral failure with unchanged inputs, a tamper of any of them is caught BY NAME, and each RED REPLAYS both ways: it fails against its old subject and
// passes UNCHANGED against the final code (the same test files, the same command; only the environment variable C059_RED_SUBJECT differs). Every failed capture is named in the README,
// the README figures are recomputed from the manifests, and no file this fix added carries a local identifier (a Windows user folder, a session folder).
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawn, execFileSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { sha, verifyManifest } = require('./evidence-verify.cjs');
const figures = require('./figures.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const red = path.join(root, 'evidence', 'red');
const raw = path.join(root, 'evidence', 'raw');
const PARENT = 'c2390608feccd87712d0848692b5ad238c5f63d5';
const OPTIONS = { timeout: 600000 };
const git = (...args) => execFileSync('git', ['--no-pager', ...args], { cwd: repository, maxBuffer: 16 * 1024 * 1024, windowsHide: true });
const blob = (relative) => git('cat-file', 'blob', `${PARENT}:${relative}`);
const readme = () => fs.readFileSync(path.join(root, 'README.md'), 'utf8').replace(/\r\n/g, '\n');
const S1 = ['writeAnswer(next.request, next.response, 417, EXPECTATION_REFUSED); return; }', 'writeAnswer(next.request, next.response, 417, EXPECTATION_REFUSED); }'];

// [run directory, test files, folder of the old subject, extra environment, tests, pass and fail against the old subject]
const RUNS = [
  ['run-13', ['pins.test.cjs'], 'stubs-8', {}, 6, 2, 4],
  ['run-14', ['journey-freeze.test.cjs'], 'stubs-8', {}, 9, 5, 4],
  ['run-15', ['lane.test.cjs'], 'stubs-9', { C059_MATRIX: 'quick' }, 16, 11, 5],
  ['run-16', ['pending.test.cjs', 'lane-flood.test.cjs'], 'stubs-8', {}, 6, 3, 3],
];

function replay(files, env) {
  const clean = { ...process.env, ...env };
  for (const key of ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE', 'CAPTURE_BROWSER_EVIDENCE']) delete clean[key];
  if (!env.C059_RED_SUBJECT) delete clean.C059_RED_SUBJECT;
  if (!env.C059_MATRIX) delete clean.C059_MATRIX;
  const args = ['--test', '--test-concurrency=1', '--test-timeout=240000', ...files.map((file) => path.join('capability', 'C059', 'tests', file))];
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: repository, env: clean, windowsHide: true });
    const out = [];
    child.stdout.on('data', (chunk) => out.push(chunk));
    child.stderr.on('data', (chunk) => out.push(chunk));
    const timer = setTimeout(() => child.kill(), 270000);
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, text: Buffer.concat(out).toString('utf8') }); });
  });
}

// The replays are real runs (seconds each when alone). They run one after the other, the first started when the file is loaded, and every test awaits its own: eight node test
// processes at once starve each other on a busy machine and a watchdog of the suite under replay fires.
let turn = Promise.resolve();
const queued = (task) => { const run = turn.then(task); turn = run.then(() => undefined); return run; };
const failures = (text) => `${(text.match(/^\s*not ok .*$/gm) ?? []).join('\n')}\n${text.slice(-1500)}`;
const replays = new Map(RUNS.map(([directory, files, stub, env]) => [directory, {
  old: queued(() => replay(files, { ...env, C059_RED_SUBJECT: path.join('capability', 'C059', 'evidence', 'red', stub) })),
  final: queued(() => replay(files, env)),
}]));

test('the old subjects of the new REDs are the bytes published in c2390608 (recomputed against git); the S1 subject is that server with exactly one return deleted', OPTIONS, () => {
  for (const [stub, published] of [['stubs-8/server.cjs', 'capability/C059/server.cjs'], ['stubs-8/journey.js', 'capability/C059/journey.js'], ['stubs-8/evidence-verify.cjs', 'capability/C059/tests/evidence-verify.cjs']]) {
    assert.equal(sha(fs.readFileSync(path.join(red, ...stub.split('/')))), sha(blob(published)), `${stub} is ${published} of ${PARENT.slice(0, 12)}`);
  }
  const server = blob('capability/C059/server.cjs').toString('utf8');
  assert.equal(server.split(S1[0]).length, 2, 'the S1 anchor occurs once');
  assert.equal(fs.readFileSync(path.join(red, 'stubs-9', 'server.cjs'), 'utf8'), server.replace(S1[0], () => S1[1]), 'stubs-9/server.cjs is the published server with the return after the 417 deleted (the reviewer mutant S1)');
});

for (const [directory, files, , , tests, passes, fails] of RUNS) {
  test(`${directory}: a recorded behavioral failure (${fails} of ${tests} assertions), inputs and transcripts unchanged`, OPTIONS, () => {
    const { manifest, problems, stdout } = verifyManifest(path.join(red, directory, 'red.json'), { root: repository });
    assert.deepEqual(problems, []);
    assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.timedOut], [1, 1, false]);
    assert.deepEqual([manifest.summary.tests, manifest.summary.pass, manifest.summary.fail], [tests, passes, fails]);
    assert.equal([...stdout.matchAll(/code: 'ERR_ASSERTION'/g)].length, fails, 'every failure is an assertion about behavior');
    assert.doesNotMatch(stdout, /MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError|TypeError/);
    assert.equal(manifest.transcripts.stderr.bytes, 0);
    for (const file of files) assert.ok(manifest.inputs.some((input) => input.path.endsWith(`tests\\${file}`)), `${file} is a recorded input`);
    assert.ok(manifest.inputs.some((input) => input.path.endsWith('C059-review-fix3.feature')), 'the specification is a recorded input');
    assert.ok(manifest.inputs.some((input) => input.path.endsWith('tests\\subject.cjs')), 'the subject loader is a recorded input');
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

  test(`${directory}: the retained RED fails against its old subject (${fails} of ${tests}) and passes UNCHANGED against the final code (${tests} of ${tests})`, OPTIONS, async () => {
    const { old, final } = replays.get(directory);
    const before = await old;
    assert.equal(before.status, 1, failures(before.text));
    assert.equal(Number(/^# pass (\d+)$/m.exec(before.text)?.[1]), passes);
    assert.equal(Number(/^# fail (\d+)$/m.exec(before.text)?.[1]), fails);
    assert.equal([...before.text.matchAll(/code: 'ERR_ASSERTION'/g)].length, fails);
    assert.doesNotMatch(before.text, /MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
    const after = await final;
    assert.equal(after.status, 0, failures(after.text));
    assert.match(after.text, new RegExp(`^# pass ${tests}$`, 'm'));
    assert.match(after.text, /^# fail 0$/m);
    const manifest = JSON.parse(fs.readFileSync(path.join(red, directory, 'red.json'), 'utf8'));
    for (const file of files) assert.equal(sha(fs.readFileSync(path.join(__dirname, file))), manifest.inputs.find((input) => input.path.endsWith(`tests\\${file}`)).rawSha256, `${file} is byte-identical to the RED run`);
  });
}

test('every FAILED capture that stays in the evidence is named in the README (none is hidden): the retained attempts of every publication', OPTIONS, () => {
  const text = readme();
  const failed = fs.readdirSync(raw).filter((name) => /^[a-z-]+-\d+\.json$/.test(name)).map((name) => [name.replace(/\.json$/, ''), JSON.parse(fs.readFileSync(path.join(raw, name), 'utf8'))])
    .filter(([, manifest]) => manifest.exitCode !== manifest.expectedExitCode).map(([name]) => name);
  assert.ok(failed.includes('coverage-5'), 'the failed coverage capture of the second fix is among them (review Q6)');
  for (const name of failed) assert.ok(text.includes(`\`${name}\``), `${name} is named in the README`);
});

test('the figures block of the README is recomputed from the latest manifests (coverage, the full mutation run, the loop, Edge, the REDs of this fix)', OPTIONS, () => {
  const block = figures.between(readme());
  assert.notEqual(block, null, 'the README has the figures block');
  assert.equal(block, figures.render());
});

test('no file this fix added carries a local identifier: the README, the new tests, the new manifests and their decompressed transcripts, the new RED runs and subjects', OPTIONS, () => {
  const parent = new Set(git('ls-tree', '-r', '--name-only', PARENT, '--', 'capability/C059').toString('utf8').split('\n').map((line) => line.trim()).filter(Boolean));
  const listed = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(full); else listed.push(path.relative(repository, full).split(path.sep).join('/'));
    }
  };
  walk(root);
  const added = listed.filter((file) => !parent.has(file) && !/\/scratch\//.test(file));
  assert.ok(added.length >= 20, `this fix added ${added.length} files`);
  const patterns = [/[A-Za-z]:[\\/]+Users[\\/]/i, new RegExp(['\\.co', 'pilot'].join(''), 'i'), new RegExp(['session', 'state'].join('-'), 'i')];
  const user = os.userInfo().username;
  if (user.length >= 4) patterns.push(new RegExp(user.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i'));
  const found = [];
  for (const file of [...added, 'capability/C059/README.md']) {
    let bytes = fs.readFileSync(path.join(repository, ...file.split('/')));
    if (file.endsWith('.gz')) bytes = zlib.gunzipSync(bytes);
    const text = bytes.toString('latin1');
    if (patterns.some((pattern) => pattern.test(text))) found.push(file);
  }
  assert.deepEqual(found, []);
});

test('the test runs leave no scratch folder behind', OPTIONS, () => {
  assert.equal(fs.existsSync(path.join(__dirname, 'scratch')), false);
});
