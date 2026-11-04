'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { gunzipSync } = require('node:zlib');
const source = require('..\\source.cjs');
const root = path.resolve(__dirname, '..');
function files(directory = root) {
  const result = [];
  function walk(current) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const file = path.join(current, entry.name);
      assert.equal(entry.isSymbolicLink(), false);
      if (entry.isDirectory()) walk(file);
      else result.push(path.relative(root, file));
    }
  }
  walk(directory);
  return result;
}
function read(relative) {
  assert.equal(typeof relative, 'string');
  assert.equal(path.isAbsolute(relative), false);
  const file = path.resolve(root, relative);
  assert.ok(file.startsWith(`${root}${path.sep}`));
  return source.readRegular(path.relative(source.repository, file), 16 * 1024 * 1024);
}
function captures() {
  const raw = path.join(root, 'evidence', 'raw');
  const executions = [];
  const edges = [];
  for (const name of fs.readdirSync(raw).sort()) {
    assert.match(name, /^(?:bdd|stub|red|iac|pins|tools|focused|syntax|browser|integrity|verify|edge)-[0-9a-f-]{36}$/);
    const directory = path.join(raw, name);
    assert.equal(fs.lstatSync(directory).isDirectory(), true);
    const prefix = path.relative(root, directory);
    const summary = JSON.parse(read(path.join(prefix, 'summary.json')).toString('utf8'));
    if (name.startsWith('edge-')) {
      assert.equal(summary.schema, 'C035-actual-Edge-DOM/1');
      assert.equal(summary.cardId, 'C035');
      assert.ok(['passed', 'failed'].includes(summary.outcome));
      assert.equal(summary.actualDomChecksPassed, summary.checks.length);
      assert.equal(summary.actualCancellationPerformed, false);
      if (summary.outcome === 'passed') {
        assert.ok(summary.checks.every((item) => item.passed === true));
        assert.ok(Object.values(summary.cleanup).every((value) => value === true));
        assert.equal(summary.helperRawSha256, source.imports().browserHelperRawSha256);
        assert.equal(summary.actualSignedEdge.authenticodeStatus, 'Valid');
      }
      for (const file of fs.readdirSync(directory)) {
        assert.ok(file === 'summary.json' || /^[a-z-]+\.html\.gz$/.test(file));
        if (file.endsWith('.gz')) assert.ok(gunzipSync(read(path.join(prefix, file))).length > 0);
      }
      edges.push({ directory: prefix, ...summary });
    } else {
      assert.equal(summary.schema, 'C035-raw-execution/1');
      assert.equal(summary.cardId, 'C035');
      assert.equal(summary.exactCapture, 'CAPTURE_BROWSER_EVIDENCE=1');
      assert.equal(summary.rawBytesPreserved, true);
      assert.deepEqual(fs.readdirSync(directory).sort(), ['stderr.raw.gz', 'stdout.raw.gz', 'summary.json']);
      const text = {};
      const rawProof = {};
      for (const stream of ['stdout', 'stderr']) {
        const bytes = gunzipSync(read(path.join(prefix, `${stream}.raw.gz`)));
        assert.equal(source.hash(bytes), summary[`${stream}Sha256`]);
        text[stream] = bytes.toString('utf8');
        rawProof[stream] = {
          rawSha256: source.hash(bytes), crlfToLfSha256: source.hash(source.lf(bytes)),
          byteLength: bytes.length, crlfPairs: (text[stream].match(/\r\n/g) || []).length
        };
      }
      executions.push({ directory: prefix, ...summary, text, rawProof });
    }
  }
  return { executions, edges };
}
function checkIndex() {
  const index = JSON.parse(read('evidence-index.json').toString('utf8'));
  assert.equal(index.schema, 'C035-immutable-evidence-index/1');
  const indexed = new Set();
  for (const entry of index.files) {
    assert.equal(indexed.has(entry.path), false);
    indexed.add(entry.path);
    const bytes = read(entry.path);
    assert.equal(source.hash(bytes), entry.rawSha256, entry.path);
    assert.equal(bytes.length, entry.byteLength, entry.path);
  }
  for (const file of files()) {
    if (file === 'evidence-index.json' || indexed.has(file) ||
        /^publication-result-[0-9a-f-]{36}\.json$/.test(file) ||
        /^evidence\\publication-[0-9a-f-]{36}\\[^\\]+$/.test(file)) continue;
    assert.match(file, /^evidence\\raw\\(?:focused|syntax|browser|edge|integrity|verify)-[0-9a-f-]{36}\\[^\\]+$/,
      'Only unique append-only guarded raw executions may follow finalization.');
  }
  const observed = captures();
  const red = observed.executions.filter((run) => run.stage === 'red');
  assert.equal(red.length, 1);
  assert.equal(red[0].exitCode, 1);
  assert.match(red[0].text.stdout, /ERR_ASSERTION/);
  assert.match(red[0].text.stdout, /# fail 2/);
  assert.equal(red[0].classifierSourceSha256, source.hash(read('evidence\\red\\classifier.initial.snapshot.cjs')));
  const chronology = ['bdd', 'stub', 'red', 'iac'].map((stage) => observed.executions.find((run) => run.stage === stage));
  chronology.forEach((run) => assert.ok(run));
  for (let i = 1; i < chronology.length; i++) assert.ok(chronology[i].startedAtUtc >= chronology[i - 1].completedAtUtc);
  const green = observed.executions.filter((run) => run.stage === 'focused' && run.exitCode === 0);
  assert.ok(green.length >= 1);
  const goodEdge = observed.edges.filter((run) => run.outcome === 'passed');
  const failedEdge = observed.edges.filter((run) => run.outcome === 'failed');
  assert.ok(goodEdge.some((run) => run.actualDomChecksPassed === 18));
  assert.ok(failedEdge.some((run) => run.actualDomChecksPassed === 0 &&
    run.cleanup.exactOwnedHelperSessionRemoved === false));
  assert.ok(index.preservedFailures.every((entry) => observed.executions.some((run) =>
    run.directory === entry.directory && run.exitCode !== 0) || observed.edges.some((run) =>
    run.directory === entry.directory && run.outcome === 'failed')));
  return {
    indexedFiles: index.files.length, rawExecutions: observed.executions.length,
    preservedFailedExecutions: observed.executions.filter((run) => run.exitCode !== 0).length,
    preservedFailedEdgeCaptures: failedEdge.length, successfulEdgeCaptures: goodEdge.length,
    actualDomChecksInPassingCapture: 18, initialRedAssertionsFailed: 2,
    latestFocusedTapTotals: green.sort((a, b) => a.completedAtUtc.localeCompare(b.completedAtUtc))
      .at(-1).text.stdout.split(/\r?\n/).filter((line) => /^# (tests|pass|fail) /.test(line)),
    rawCrlfPairs: observed.executions.reduce((count, run) => count + run.rawProof.stdout.crlfPairs + run.rawProof.stderr.crlfPairs, 0)
  };
}
module.exports = Object.freeze({ root, files, read, captures, checkIndex });
