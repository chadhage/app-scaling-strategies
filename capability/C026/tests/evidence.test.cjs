'use strict';

// Verifies evidence.json against the archived bytes: every indexed hash is recomputed, every archive directory is indexed,
// and the fix RED ran against the first publication's production bytes and failed on assertions only.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const { root, index, sha, read, PUBLISHED, manifestOf, stdoutOf, inputHash } = require('./evidence-support.cjs');

test('every run of the first publication is indexed with hashes that match the archived bytes', () => {
  assert.equal(index.runs.length, 7);
  for (const run of index.runs) {
    assert.equal(sha(read(run.runJson)), run.runJsonSha256, run.runJson);
    assert.equal(sha(read(run.stdout)), run.stdoutSha256, run.stdout);
    assert.equal(sha(read(run.stderr)), run.stderrSha256, run.stderr);
    const record = JSON.parse(read(run.runJson));
    assert.deepEqual([record.stdoutSha256, record.stderrSha256, record.exitCode], [run.stdoutSha256, run.stderrSha256, run.exitCode], run.runJson);
  }
  for (const browser of index.browserAcceptance) {
    assert.equal(sha(read(browser.record)), browser.recordSha256);
    assert.equal(sha(read(browser.screenshot)), browser.screenshotSha256);
    assert.equal(JSON.parse(read(browser.record)).outcome, browser.outcome);
  }
});

test('every archive directory under evidence/raw and every fix directory under evidence/red is indexed', () => {
  const indexed = JSON.stringify(index);
  const raw = fs.readdirSync(path.join(root, 'evidence', 'raw'), { withFileTypes: true }).filter((entry) => entry.isDirectory());
  const fixes = fs.readdirSync(path.join(root, 'evidence', 'red'), { withFileTypes: true }).filter((entry) => entry.isDirectory() && entry.name.startsWith('fix-'));
  assert.equal(raw.length >= 6 && fixes.length >= 2, true);
  for (const directory of [...raw, ...fixes]) assert.equal(indexed.includes(directory.name), true, `${directory.name} is not in evidence.json`);
});

test('the fix RED runs fail on assertions only and ran against the first publication\'s production bytes', () => {
  const reds = index.fixRuns.filter((run) => run.kind === 'red');
  assert.deepEqual(reds.map((run) => run.name), ['fix-red-resource-limits', 'fix-red-refusal-close']);
  for (const run of reds) {
    const manifest = manifestOf(run);
    const stdout = stdoutOf(run, manifest);
    assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.timedOut], [1, 1, false], run.name);
    assert.equal(manifest.summary.tests > 0 && manifest.summary.fail === manifest.summary.tests, true, run.name);
    assert.equal((stdout.match(/name: 'AssertionError'/g) ?? []).length, manifest.summary.tests, `${run.name}: every failure is an assertion`);
    for (const trap of ['TypeError', 'ReferenceError', 'SyntaxError', 'MODULE_NOT_FOUND', 'Cannot find module', 'test timed out']) assert.equal(stdout.includes(trap), false, `${run.name}: ${trap}`);
    for (const name of ['server.cjs', 'stream.cjs', 'conversation.cjs', 'page.js']) assert.equal(inputHash(manifest, name), PUBLISHED[name], `${run.name}: ${name} is not the published file`);
  }
  assert.equal(inputHash(manifestOf(reds[0]), 'framing.cjs'), PUBLISHED['framing.cjs']);
  assert.notEqual(inputHash(manifestOf(reds[1]), 'framing.cjs'), PUBLISHED['framing.cjs'], 'the second RED is disclosed as run after the framing fix');
});
