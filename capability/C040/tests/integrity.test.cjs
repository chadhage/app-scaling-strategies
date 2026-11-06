'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');
const { childEnvironment, runNodeTest } = require('.\\nested-runner.cjs');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const red = path.join(root, 'evidence', 'red');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
// SHA-256 of the archived RED bytes as they were when the RED run was recorded, before tables.js existed. They never change.
const archived = Object.freeze({
  'capability\\C040\\evidence\\red\\tables.red.test.cjs': '19824a7de7c925835fcee3e7bd6b4313f33886274125d4746f5ca9f3bd2ac9be',
  'capability\\C040\\evidence\\red\\tables.stub.cjs': '453f7b79a39bfbb172c942f4dfcf8a1bd7460b6b4fb8215ebf009b3f51f7e717',
  'capability\\C040\\C040.feature': 'f53928faf56f2b7b7e9b04cab7c8795facc0a465396d17dd91551e962f006439'
});
const manifest = JSON.parse(fs.readFileSync(path.join(red, 'run-1', 'red-run-1-tables.json'), 'utf8'));
const redFile = path.join(red, 'tables.red.test.cjs');

test('the archived RED inputs are byte-identical to what the RED run recorded', () => {
  assert.deepEqual(manifest.inputs.map((input) => input.path).sort(), Object.keys(archived).sort());
  for (const input of manifest.inputs) {
    assert.equal(input.rawSha256, archived[input.path], `${input.path}: the manifest records the pinned hash`);
    assert.equal(sha(fs.readFileSync(path.join(repository, input.path))), archived[input.path], `${input.path}: the file is unchanged`);
  }
});

test('the RED manifest records a failing run: the expected exit 1 and 9 of 9 behavioral assertion failures', () => {
  assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.timedOut, manifest.signal, manifest.spawnError], [1, 1, false, null, null]);
  assert.deepEqual([manifest.summary.tests, manifest.summary.pass, manifest.summary.fail], [9, 0, 9]);
  assert.deepEqual(manifest.environmentRemoved, ['NODE_TEST_CONTEXT', 'NODE_V8_COVERAGE']);
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    const gz = fs.readFileSync(path.join(red, 'run-1', entry.path));
    assert.equal(sha(gz), entry.gzipSha256, `${stream} gzip`);
    const raw = zlib.gunzipSync(gz);
    assert.equal(sha(raw), entry.sha256, `${stream} raw`);
    if (stream === 'stdout') {
      const text = raw.toString('utf8');
      assert.equal([...text.matchAll(/^not ok \d+ - /gm)].length, 9);
      assert.equal([...text.matchAll(/code: 'ERR_ASSERTION'/g)].length, 9, 'every failure is an assertion about behavior');
      assert.doesNotMatch(text, /MODULE_NOT_FOUND|Cannot find module|SyntaxError|ReferenceError|TypeError/);
    } else assert.equal(raw.length, 0);
  }
});

test('the archived RED replays against the naive stub: exit 1 with 9 assertion failures and no module or syntax error', () => {
  const run = runNodeTest(redFile, { timeout: 60000 });
  assert.equal(run.status, 1);
  assert.match(run.stdout, /^# fail 9$/m);
  assert.match(run.stdout, /^# pass 0$/m);
  assert.equal([...run.stdout.matchAll(/code: 'ERR_ASSERTION'/g)].length, 9);
  assert.doesNotMatch(`${run.stdout}${run.stderr}`, /MODULE_NOT_FOUND|SyntaxError|ReferenceError/);
});

test('the SAME archived RED file passes unchanged against the final tables.js (every assertion, not an edited copy)', () => {
  const run = spawnSync(process.execPath, ['--require', path.join(__dirname, 'green-shim.cjs'), '--test', redFile], {
    cwd: repository, env: childEnvironment(), encoding: 'utf8', windowsHide: true, timeout: 60000
  });
  assert.equal(run.status, 0, run.stdout);
  assert.match(run.stdout, /^# pass 9$/m);
  assert.match(run.stdout, /^# fail 0$/m);
  assert.equal(sha(fs.readFileSync(redFile)), archived['capability\\C040\\evidence\\red\\tables.red.test.cjs']);
});

test('the evidence folder keeps raw bytes exact and the namespace keeps its fixtures byte-exact', () => {
  assert.equal(fs.readFileSync(path.join(root, 'evidence', '.gitattributes'), 'utf8').trim(), '* -text -diff');
  assert.equal(fs.readFileSync(path.join(root, '.gitattributes'), 'utf8').trim(), '* -text');
});
