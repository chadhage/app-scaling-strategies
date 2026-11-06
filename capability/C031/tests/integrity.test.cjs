'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');
const { spawnSync } = require('node:child_process');
const { childEnvironment, runNodeTest } = require('.\\nested-runner.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const red = path.join(root, 'evidence', 'red');
const sha = (file) => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const bytesSha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const gunzipped = (run, name) => zlib.gunzipSync(fs.readFileSync(path.join(red, run, `${name}.raw.gz`)));

// The archived RED is immutable: its bytes are pinned here, so editing any file fails this test. The raw captures were taken
// as plain text and are stored as byte-exact gzip (tests/pack-raw.cjs): the pinned values below are the SHA-256 of the
// DECOMPRESSED bytes, which are identical to the plain-text captures hashed before packing.
const archived = {
  'evaluator.red.test.cjs': 'da75435d4d920e0badbc5363c0a3229f1454724cb1519588011e47c3c9ed9272',
  'evaluator.stub.cjs': 'adbe582d7ab71bcdebb607d788d921e790dfdc96185479f7c11153428d29878b',
  'run-1\\exit-code.txt': '4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865',
  'run-1\\manifest.json': '7d282c4a4040c7201a14c3b81dd0f0abda49eb8a6a5747918e8dbb97ed1a6f4a',
  'run-1\\raw-sha256.json': '3435f8b8738daf16c4bb2ad1033052d62bbcea84c497ab6c25fb46a631a60ce4',
  'run-1\\stderr.raw.gz': '46b50c321b39e89a491b6727a01628c34245605a30beb3e7414c5e01cff90e6e',
  'run-1\\stdout.raw.gz': 'b6d132f9d43b11494c73170da52911e1d0ceb7643eb7b8008178053c4eacc760',
  'old-request-missing.red.test.cjs': '4ae309f5b69ca8188ca136fcc4c34125eb06dc1a46b4c0df68f46fdc78e43ffc',
  'run-2\\exit-code.txt': '4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865',
  'run-2\\manifest.json': '1b0a32d77d7938b70edc67e3262f25d7fe60fb759f72ce4c12e3423a3c190691',
  'run-2\\raw-sha256.json': '939533a03eba35e1eeafe26f64fb8841eb94efdb97a684f4e7ff8d77b1d91bc3',
  'run-2\\stderr.raw.gz': '46b50c321b39e89a491b6727a01628c34245605a30beb3e7414c5e01cff90e6e',
  'run-2\\stdout.raw.gz': '508a79ea44382a8fc508835728a79bcadb6b621c9a2bd77ff81b6d52e56dcb52',
  'leading-new-version.red.test.cjs': '5233c97d935e893cade12082aa84713e2ef66afc0bd83288a8b373187d39ac7e',
  'evaluator.before-run3.js': '4e27e3886e71e0139880e0dfd839189be50c7f94776444f6db722307bdcea989',
  'run-3\\exit-code.txt': '4355a46b19d348dc2f57c046f8ef63d4538ebb936000f3c9ee954a27460dd865',
  'run-3\\manifest.json': '8e87b5705f18902bd5c53898c4bc118ddf382753d4fab9c7f18b6d01b5689e23',
  'run-3\\raw-sha256.json': '721ac6b22c59486862f021d796a15ffc400cac141491ae0dbde1fecde2a95747',
  'run-3\\stderr.raw.gz': '46b50c321b39e89a491b6727a01628c34245605a30beb3e7414c5e01cff90e6e',
  'run-3\\stdout.raw.gz': 'e52fd45fa21c7c035ae1b2eed522ba957af6ae5babd1bbdaf36591d45fda12e0'
};
const decompressed = {
  'run-1': { stdout: '28dfd830f030cb215790b27a36daba48f0f165eed3bc1ed851807a7f328eb0b3', stderr: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  'run-2': { stdout: 'af8719806a8aad0cd0317d8d2e7fb4369f0985b1a15f226ea38fc27294889764', stderr: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' },
  'run-3': { stdout: 'fcf70dcc54b21034817ee0fdf18d3f47630bac2b316fc38a9cc42aecef5d1b39', stderr: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855' }
};

test('the archived RED files are exactly the bytes recorded before the implementation existed', () => {
  const listed = fs.readdirSync(red, { recursive: true, withFileTypes: true }).filter((entry) => entry.isFile())
    .map((entry) => path.relative(red, path.join(entry.parentPath, entry.name))).sort();
  assert.deepEqual(listed, Object.keys(archived).sort());
  for (const [name, expected] of Object.entries(archived)) assert.equal(sha(path.join(red, name)), expected, name);
});

test('the gzip raw captures decompress to exactly the plain-text bytes captured before packing', () => {
  for (const [run, expected] of Object.entries(decompressed)) {
    assert.equal(bytesSha(gunzipped(run, 'stdout')), expected.stdout, `${run} stdout`);
    assert.equal(bytesSha(gunzipped(run, 'stderr')), expected.stderr, `${run} stderr`);
    assert.deepEqual(JSON.parse(fs.readFileSync(path.join(red, run, 'raw-sha256.json'), 'utf8')),
      { 'stderr.raw.gz': expected.stderr, 'stdout.raw.gz': expected.stdout });
  }
});

test('the archived RED run is behavioral: exit 1, three assertion failures, no missing module or syntax error', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(red, 'run-1', 'manifest.json'), 'utf8'));
  const stdout = gunzipped('run-1', 'stdout').toString('utf8');
  assert.deepEqual([manifest.exitCode, manifest.behavioral, manifest.tests, manifest.failedTests, manifest.node], [1, true, 3, 3, 'v22.23.4']);
  assert.equal(fs.readFileSync(path.join(red, 'run-1', 'exit-code.txt'), 'utf8'), '1\n');
  assert.equal(gunzipped('run-1', 'stderr').toString('utf8'), '');
  assert.equal((stdout.match(/^not ok \d+/gm) || []).length, 3);
  assert.equal((stdout.match(/name: 'AssertionError'/g) || []).length, 3);
  assert.ok(!/MODULE_NOT_FOUND|SyntaxError|Cannot find module|TypeError|ReferenceError/.test(stdout));
  for (const title of ['a flood of unchanged new-version clients cannot raise the migration success rate',
    'a replayed new-version request without an acknowledged version is not a transition',
    'each client is exactly one of four classes recomputed from its ordered actions']) assert.ok(stdout.includes(`not ok`) && stdout.includes(title), title);
});

test('the RED inputs recorded in the manifest are the stub, the RED test and the unchanged feature', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(red, 'run-1', 'manifest.json'), 'utf8'));
  assert.deepEqual(manifest.inputs, {
    'evidence\\red\\evaluator.red.test.cjs': archived['evaluator.red.test.cjs'],
    'evidence\\red\\evaluator.stub.cjs': archived['evaluator.stub.cjs'],
    'C031.feature': sha(path.join(root, 'C031.feature'))
  });
  assert.equal(manifest.command, 'node --test --test-concurrency=1 capability\\C031\\evidence\\red\\evaluator.red.test.cjs');
});

test('replaying the RED still fails against the original stub, and only the stub is loaded', () => {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', path.join(red, 'evaluator.red.test.cjs')], {
    cwd: repository, env: childEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 60000
  });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^# fail 3$/m);
  assert.match(run.stdout, /AssertionError/);
  assert.ok(!/evaluator\.js/.test(run.stdout));
  assert.equal(runNodeTest(path.join(red, 'evaluator.red.test.cjs')).status, 1);
});

test('the same archived RED assertions pass, byte for byte, against the real evaluator (GREEN replay)', () => {
  const run = spawnSync(process.execPath, ['--test', '--test-concurrency=1', '--require', path.join(__dirname, 'green-shim.cjs'),
    path.join(red, 'evaluator.red.test.cjs')], { cwd: repository, env: childEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /^# pass 3$/m);
  assert.match(run.stdout, /^# fail 0$/m);
  assert.equal(sha(path.join(red, 'evaluator.red.test.cjs')), archived['evaluator.red.test.cjs']);
});

test('the increment RED (run-2) was a genuine assertion failure archived before the fix, and its snapshot passes now', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(red, 'run-2', 'manifest.json'), 'utf8'));
  const stdout = gunzipped('run-2', 'stdout').toString('utf8');
  assert.deepEqual([manifest.exitCode, manifest.behavioral, manifest.tests, manifest.failedTests], [1, true, 1, 1]);
  assert.match(stdout, /expected: 'FAILED_OR_UNKNOWN'\s+actual: 'ACTUAL_TRANSITION'/);
  assert.ok(!/MODULE_NOT_FOUND|SyntaxError|Cannot find module/.test(stdout));
  assert.equal(manifest.inputs['evidence\\red\\old-request-missing.red.test.cjs'], archived['old-request-missing.red.test.cjs']);
  const replay = runNodeTest(path.join(red, 'old-request-missing.red.test.cjs'));
  assert.equal(replay.status, 0, replay.stdout);
  assert.match(replay.stdout, /^# pass 1$/m);
});

test('the increment RED (run-3) failed by assertion against the archived pre-fix evaluator and passes, unchanged, against the real one', () => {
  const manifest = JSON.parse(fs.readFileSync(path.join(red, 'run-3', 'manifest.json'), 'utf8'));
  const stdout = gunzipped('run-3', 'stdout').toString('utf8');
  assert.deepEqual([manifest.exitCode, manifest.behavioral, manifest.tests, manifest.failedTests], [1, true, 3, 2]);
  assert.deepEqual(manifest.inputs, {
    'evidence\\red\\leading-new-version.red.test.cjs': archived['leading-new-version.red.test.cjs'],
    'evidence\\red\\evaluator.before-run3.js': archived['evaluator.before-run3.js'],
    'C031.feature': sha(path.join(root, 'C031.feature'))
  });
  assert.equal((stdout.match(/^not ok \d+/gm) || []).length, 2);
  assert.match(stdout, /expected: true\s+actual: false/);
  assert.ok(!/MODULE_NOT_FOUND|SyntaxError|Cannot find module|TypeError|ReferenceError/.test(stdout));
  assert.notEqual(sha(path.join(root, 'evaluator.js')), archived['evaluator.before-run3.js'], 'the snapshot is the evaluator before the fix');
  const replay = spawnSync(process.execPath, ['--test', '--test-concurrency=1', path.join(red, 'leading-new-version.red.test.cjs')],
    { cwd: repository, env: childEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(replay.status, 1);
  assert.match(replay.stdout, /^# fail 2$/m);
  assert.match(replay.stdout, /AssertionError/);
  const green = spawnSync(process.execPath, ['--test', '--test-concurrency=1', path.join(red, 'leading-new-version.red.test.cjs')],
    { cwd: repository, env: { ...childEnvironment(), C031_GREEN_REPLAY: '1' }, encoding: 'utf8', windowsHide: true, timeout: 60000 });
  assert.equal(green.status, 0, green.stdout);
  assert.match(green.stdout, /^# pass 3$/m);
});

test('the namespace keeps byte-exact files: no end-of-line conversion for pinned data', () => {
  assert.equal(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8').replace(/\r\n/g, '\n'), '* -text\n');
});
