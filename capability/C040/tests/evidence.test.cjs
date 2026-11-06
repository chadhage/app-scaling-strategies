'use strict';

// Checks that the newest recorded GREEN, coverage and browser evidence passed and still describes the CURRENT files.
// Record fresh evidence first (see README): this test is deliberately not part of the recorded runs.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { createHash } = require('node:crypto');

const root = path.resolve(__dirname, '..');
const repository = path.resolve(root, '..', '..');
const evidence = path.join(root, 'evidence');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const production = ['cli.cjs', 'page.js', 'saved.js', 'source.cjs', 'tables.js'];
const latest = (kind, prefix) => {
  const runs = fs.readdirSync(path.join(evidence, kind)).map((name) => new RegExp(`^${prefix}-(\\d+)$`).exec(name)).filter(Boolean)
    .sort((a, b) => Number(a[1]) - Number(b[1]));
  assert.ok(runs.length > 0, `no recorded ${kind} run`);
  const directory = path.join(evidence, kind, runs.at(-1)[0]);
  const file = fs.readdirSync(directory).find((name) => name.endsWith('.json'));
  return { directory, manifest: JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8')) };
};
const transcript = (run, stream) => {
  const entry = run.manifest.transcripts[stream];
  const gz = fs.readFileSync(path.join(run.directory, entry.path));
  assert.equal(sha(gz), entry.gzipSha256, `${stream} gzip`);
  const raw = zlib.gunzipSync(gz);
  assert.equal(sha(raw), entry.sha256, `${stream} raw`);
  return raw.toString('utf8');
};
const unchangedInputs = (manifest) => {
  assert.ok(manifest.inputs.length >= 20, 'the run recorded its inputs');
  for (const input of manifest.inputs) assert.equal(sha(fs.readFileSync(path.join(repository, input.path))), input.rawSha256, `${input.path} changed after the run was recorded`);
};

test('the newest recorded GREEN suite run passed and still describes the current files', () => {
  const run = latest('green', 'suite-run');
  assert.deepEqual([run.manifest.exitCode, run.manifest.expectedExitCode, run.manifest.timedOut], [0, 0, false]);
  assert.equal(run.manifest.summary.fail, 0);
  assert.equal(run.manifest.summary.pass, run.manifest.summary.tests);
  assert.ok(run.manifest.summary.tests >= 77);
  const out = transcript(run, 'stdout');
  assert.match(out, /^# fail 0$/m);
  assert.equal(transcript(run, 'stderr'), '');
  unchangedInputs(run.manifest);
  const names = run.manifest.inputs.map((input) => input.path);
  for (const name of production) assert.ok(names.includes(`capability\\C040\\${name}`), name);
});

test('the newest recorded GREEN replay of the archived RED passed all 9 assertions unchanged', () => {
  const run = latest('green', 'red-replay-run');
  assert.deepEqual([run.manifest.exitCode, run.manifest.summary.tests, run.manifest.summary.pass, run.manifest.summary.fail], [0, 9, 9, 0]);
  assert.ok(run.manifest.command.includes('capability\\C040\\evidence\\red\\tables.red.test.cjs'));
  const archived = run.manifest.inputs.find((input) => input.path.endsWith('tables.red.test.cjs'));
  assert.equal(archived.rawSha256, '19824a7de7c925835fcee3e7bd6b4313f33886274125d4746f5ca9f3bd2ac9be', 'the very same RED bytes');
  unchangedInputs(run.manifest);
});

test('the newest recorded per-file coverage run enumerated every production file and reached 85/85/85 in each, on the current files', () => {
  const run = latest('coverage', 'run');
  assert.deepEqual([run.manifest.exitCode, run.manifest.timedOut], [0, false]);
  const out = transcript(run, 'stdout');
  const result = JSON.parse(out.trim().split('\n').at(-1));
  assert.deepEqual(result.productionFiles, production);
  assert.deepEqual(fs.readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isFile() && /\.(?:js|cjs)$/.test(entry.name)).map((entry) => entry.name).sort(), production);
  assert.equal(result.passed, true);
  assert.equal(result.coverage.length, 5);
  for (const entry of result.coverage) {
    assert.equal(entry.loaded, true, `${entry.file} must be loaded: an unloaded file counts as 0 percent`);
    assert.ok(entry.lines >= 85 && entry.branches >= 85 && entry.functions >= 85, `${entry.file}: ${entry.lines}/${entry.branches}/${entry.functions}`);
    assert.equal(entry.nodeExit, 0);
    assert.equal(entry.failedTests, 0);
    assert.match(entry.command, new RegExp(`--test-coverage-include=capability/C040/${entry.file.replace('.', '\\.')} --test-coverage-lines=85 --test-coverage-branches=85 --test-coverage-functions=85`));
  }
  unchangedInputs(run.manifest);
});

test('the newest recorded real Edge observation passed on the current page files, cleaned up, and its archived DOM snapshots repeat no id', () => {
  const directories = fs.readdirSync(path.join(evidence, 'browser')).filter((name) => /^browser-[0-9a-f-]{36}$/.test(name)).map((name) => path.join(evidence, 'browser', name))
    .map((directory) => ({ directory, summary: JSON.parse(fs.readFileSync(path.join(directory, 'summary.json'), 'utf8')) }))
    .sort((a, b) => Date.parse(a.summary.completedAtUtc) - Date.parse(b.summary.completedAtUtc));
  assert.ok(directories.length > 0, 'no recorded browser run');
  const { directory, summary } = directories.at(-1);
  assert.equal(summary.outcome, 'passed');
  assert.deepEqual(summary.cleanup, { browserClosed: true, exactHelperSessionRemoved: true, exactOwnedProfileRemoved: true, exactOwnedEdgeGone: true });
  assert.match(summary.browserVersion, /^156\./);
  assert.equal(summary.installedSignature.authenticodeStatus, 'Valid');
  assert.equal(summary.helperRawSha256, '86c80bc2ce52f828a96b176056706c60970be4367b085dc0919d3bfce86cc055');
  assert.ok(summary.checks.length >= 14 && summary.checks.every((check) => check.passed === true));
  for (const [name, hash] of Object.entries(summary.sourceSha256)) assert.equal(sha(fs.readFileSync(path.join(root, name))), hash, `${name} changed after the browser run`);
  assert.ok(summary.scans.length >= 30);
  for (const scan of summary.scans) {
    assert.equal(scan.repeatedIds, 0, scan.label);
    assert.equal(scan.countsSum, scan.total, scan.label);
  }
  assert.equal(summary.cloudRuns, 0);
  assert.equal(summary.liveAzureResult, false);
  const snapshots = Object.entries(summary.snapshots);
  assert.ok(snapshots.length >= 4);
  for (const [name, recorded] of snapshots) {
    const html = fs.readFileSync(path.join(directory, `dom-${name}.html`));
    assert.equal(sha(html), recorded.sha256, name);
    const ids = [...html.toString('utf8').matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
    assert.equal(new Set(ids).size, ids.length, `${name}: the archived DOM snapshot repeats an id`);
    assert.equal(ids.length, recorded.idCount);
  }
  const rows = (name) => [...fs.readFileSync(path.join(directory, `dom-${name}.html`), 'utf8').matchAll(/<tr id="row-\d+"/g)].length;
  assert.equal(rows('cohort-forty-filter-success'), 45, 'the archived success-filter snapshot still holds all 45 rows');
  const attention = [...fs.readFileSync(path.join(directory, 'dom-cohort-forty-filter-success.html'), 'utf8').matchAll(/data-attention="true"/g)].length;
  assert.equal(attention, 5, 'and the 5 failed and unknown rows');
});
