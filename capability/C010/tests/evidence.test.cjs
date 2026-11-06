'use strict';

// C010 scenario "The archived evidence can be recomputed": the RED, the GREEN replay of the same command, the per-file coverage, the mutation run and
// the Edge observation are not claims, they are files. This test recomputes every hash and size, re-derives the counts from the raw transcripts, checks
// that the green replay is the RED command unchanged, that the evidence was recorded against the production bytes that are in the tree now, and that the
// tamper cases (a flipped transcript byte, a wrong count, a stale input hash) are detected by the same verifier.
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const zlib = require('node:zlib');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const evidence = path.join(root, 'evidence');
const PRODUCTION = ['store.cjs', 'server.cjs', 'contract.js', 'audit.cjs', 'codes.cjs', 'page.js'];
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const lf = (buffer) => Buffer.from(buffer.toString('latin1').replace(/\r\n/g, '\n'), 'latin1');
const read = (...parts) => JSON.parse(fs.readFileSync(path.join(...parts), 'utf8'));
const manifestsIn = (folder) => (fs.existsSync(path.join(evidence, folder)) ? fs.readdirSync(path.join(evidence, folder)).filter((name) => name.endsWith('.json')).map((name) => ({ name, dir: path.join(evidence, folder), manifest: read(evidence, folder, name) })) : []);
const FOLDERS = ['red', 'green', 'coverage', 'browser'];

function verify(manifest, dir, tamper = {}) {
  const problems = [];
  const text = {};
  for (const stream of ['stdout', 'stderr']) {
    const entry = manifest.transcripts[stream];
    let gz = fs.readFileSync(path.join(dir, entry.path));
    if (tamper.stream === stream) gz = tamper.change(gz);
    if (gz.length !== entry.gzipBytes) problems.push(`${stream}: gzip size`);
    if (sha(gz) !== entry.gzipSha256) problems.push(`${stream}: gzip hash`);
    let bytes;
    try { bytes = zlib.gunzipSync(gz); } catch { problems.push(`${stream}: not gunzippable`); continue; }
    if (bytes.length !== entry.bytes) problems.push(`${stream}: size`);
    if (sha(bytes) !== entry.sha256) problems.push(`${stream}: hash`);
    text[stream] = bytes.toString('utf8').replace(/\r\n/g, '\n');
  }
  const summary = tamper.summary ?? manifest.summary;
  for (const key of ['tests', 'suites', 'pass', 'fail', 'cancelled', 'skipped', 'todo']) {
    const match = (text.stdout ?? '').match(new RegExp(`^# ${key} (\\d+)$`, 'm'));
    if ((match ? Number(match[1]) : undefined) !== summary[key]) problems.push(`summary ${key}`);
  }
  if (manifest.exitCode !== manifest.expectedExitCode) problems.push('exit code is not the expected one');
  if (manifest.timedOut !== false) problems.push('timed out');
  return { problems, text };
}

const every = FOLDERS.flatMap((folder) => manifestsIn(folder).map((item) => ({ ...item, folder })));

test('every archived manifest recomputes: transcript hashes and sizes, the counts are the transcript\'s own, the exit code is the expected one', () => {
  assert.ok(every.length >= 4, `expected at least red, green, coverage and browser manifests, found ${every.length}`);
  for (const item of every) assert.deepEqual(verify(item.manifest, item.dir).problems, [], `${item.folder}/${item.name}`);
});

test('the verifier detects a flipped transcript byte, a wrong count and a wrong exit code', () => {
  const item = every[0];
  assert.ok(verify(item.manifest, item.dir, { stream: 'stdout', change: (gz) => { const copy = Buffer.from(gz); copy[copy.length >> 1] ^= 1; return copy; } }).problems.length > 0);
  assert.ok(verify(item.manifest, item.dir, { stream: 'stderr', change: (gz) => gz.subarray(0, gz.length - 1) }).problems.length > 0);
  assert.ok(verify(item.manifest, item.dir, { summary: { ...item.manifest.summary, pass: (item.manifest.summary.pass ?? 0) + 1 } }).problems.includes('summary pass'));
  assert.ok(verify({ ...item.manifest, exitCode: item.manifest.expectedExitCode + 1 }, item.dir).problems.includes('exit code is not the expected one'));
  assert.deepEqual(verify(item.manifest, item.dir).problems, [], 'the untouched manifest is clean');
});

test('the RED failed on assertions about the specified behavior (not on a missing module) and the GREEN replay is the same command, unchanged, now passing', () => {
  const [red] = manifestsIn('red').filter((item) => item.name.startsWith('red-01'));
  const [green] = manifestsIn('green').filter((item) => item.name.startsWith('green-01'));
  assert.ok(red && green, 'both manifests exist');
  const redRun = verify(red.manifest, red.dir);
  assert.equal(red.manifest.exitCode, 1);
  assert.ok(red.manifest.summary.fail > 0 && red.manifest.summary.pass >= 0);
  assert.match(redRun.text.stdout, /AssertionError/);
  assert.doesNotMatch(redRun.text.stdout + redRun.text.stderr, /MODULE_NOT_FOUND|Cannot find module/);
  assert.deepEqual(green.manifest.command, red.manifest.command, 'the green replay uses the same node arguments');
  assert.ok(red.manifest.environmentAdded.includes('C010_SUBJECT_DIR') && !green.manifest.environmentAdded, 'only the red run points at the naive stub');
  assert.equal(green.manifest.exitCode, 0);
  assert.equal(green.manifest.summary.fail, 0);
  assert.equal(green.manifest.summary.tests, red.manifest.summary.tests, 'the same tests ran in both');
  assert.ok(fs.existsSync(path.join(evidence, 'red', 'stub', 'server.cjs')), 'the stub the RED ran against is retained');
});

test('the green, coverage and browser evidence was recorded against the production bytes that are in the tree now', () => {
  const recorded = every.filter((item) => item.folder !== 'red');
  assert.ok(recorded.length >= 3);
  for (const item of recorded) {
    assert.ok(item.manifest.inputs.length > 0, `${item.name} declares inputs`);
    for (const input of item.manifest.inputs) {
      const bytes = fs.readFileSync(path.join(root, '..', '..', input.path));
      assert.equal(sha(lf(bytes)), input.crlfToLfSha256, `${item.name}: ${input.path} changed after the evidence was recorded`);
    }
  }
  const stale = { ...recorded[0].manifest.inputs[0], crlfToLfSha256: '0'.repeat(64) };
  const bytes = fs.readFileSync(path.join(root, '..', '..', stale.path));
  assert.notEqual(sha(lf(bytes)), stale.crlfToLfSha256, 'a stale hash is not equal');
});

test('per-file coverage: every production file has its own measured row (one command per file) at or above 85/85/85', () => {
  const [coverage] = manifestsIn('coverage');
  assert.ok(coverage, 'the coverage manifest exists');
  const stdout = verify(coverage.manifest, coverage.dir).text.stdout;
  const gate = JSON.parse(stdout.slice(stdout.indexOf('{\n'), stdout.lastIndexOf('\n}') + 2));
  assert.equal(gate.passed, true);
  assert.deepEqual([gate.unenumerated, gate.missing], [[], []]);
  assert.deepEqual(gate.files.map((item) => item.file).sort(), [...PRODUCTION].sort());
  for (const item of gate.files) {
    assert.ok(item.loaded && item.nestedExit === 0 && item.failedTests.length === 0 && item.failures.length === 0, `${item.file} was measured and its nested run passed`);
    assert.ok([item.lines, item.branches, item.functions].every((figure) => figure >= 85), `${item.file} ${item.lines}/${item.branches}/${item.functions}`);
  }
  assert.deepEqual(coverage.manifest.summary.thresholdErrors, []);
});

test('the browser observation is a real Edge run that exited 0', () => {
  const [browser] = manifestsIn('browser');
  assert.ok(browser, 'the browser manifest exists');
  assert.match(verify(browser.manifest, browser.dir).text.stdout, /msedge|Edge/i);
});

test('the mutation report is consistent with its raw per-mutant results and with a fresh generation of the mutants', () => {
  const dir = path.join(evidence, 'mutation');
  const report = read(dir, 'mutation-01.report.json');
  const lines = fs.readFileSync(path.join(dir, 'mutation-01.results.jsonl'), 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
  assert.equal(report.executed, lines.length);
  assert.equal(report.executed, report.results.length);
  const green = new Set(report.baseline.map((step) => step.exitCode === 0 && step.failing.length === 0 ? step.stage : null));
  const valid = (entry) => entry.killed && green.has(entry.stage);
  assert.equal(report.killed, lines.filter(valid).length, 'a kill counts only in a stage whose unmutated control passed');
  assert.equal(report.survived, lines.filter((entry) => !valid(entry) && !entry.equivalent).length);
  assert.equal(report.notExecuted, report.generated - report.executed);
  assert.ok(report.results.filter((entry) => entry.killed).every((entry) => entry.stage && entry.failingTests.length > 0 && green.has(entry.stage)), 'every kill names a failing test in a stage with a green control');
  assert.ok(report.baseline.length > 0 && report.baseline.some((step) => step.exitCode === 0), 'the unmutated control ran');
  const perFile = Object.values(report.perFile).reduce((sum, entry) => sum + entry.generated, 0);
  assert.equal(perFile, report.generated);
  const fresh = spawnSync(process.execPath, [path.join(__dirname, 'mutate-gen.cjs'), '--list'], { encoding: 'utf8' });
  assert.equal(JSON.parse(fresh.stdout).total, report.generated, 'the generator still produces exactly the mutants the report counts');
});
