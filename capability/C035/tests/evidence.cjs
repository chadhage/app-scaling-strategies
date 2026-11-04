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
    assert.match(name, /^(?:bdd|stub|red|iac|pins|tools|focused|syntax|browser|integrity|verify|edge|repair-bdd|repair-stub|repair-red|coverage)-[0-9a-f-]{36}$/);
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
const addendumName = /^evidence-index-addendum-([1-9][0-9]*)\.json$/;
// The sealed index is never rewritten. Later guarded addenda may only supersede non-evidence paths (never RED or raw proof)
// and add new files; each one chains to the sealed index and to its predecessor by raw SHA-256.
function expectedFiles() {
  const base = read('evidence-index.json');
  const index = JSON.parse(base.toString('utf8'));
  assert.equal(index.schema, 'C035-immutable-evidence-index/1');
  const expected = new Map();
  for (const entry of index.files) {
    assert.equal(expected.has(entry.path), false);
    expected.set(entry.path, { rawSha256: entry.rawSha256, byteLength: entry.byteLength });
  }
  const names = fs.readdirSync(root).filter((name) => addendumName.test(name))
    .sort((a, b) => Number(addendumName.exec(a)[1]) - Number(addendumName.exec(b)[1]));
  const addenda = [];
  let previous = null;
  names.forEach((name, position) => {
    const bytes = read(name);
    const addendum = JSON.parse(bytes.toString('utf8'));
    assert.equal(addendum.schema, 'C035-evidence-index-addendum/1');
    assert.equal(addendum.sequence, position + 1);
    assert.equal(Number(addendumName.exec(name)[1]), position + 1);
    assert.equal(addendum.baseIndexRawSha256, source.hash(base));
    assert.equal(addendum.previousAddendumRawSha256, previous);
    for (const change of addendum.supersedes) {
      assert.ok(expected.has(change.path), `Only indexed paths can be superseded: ${change.path}`);
      assert.equal(change.path.startsWith('evidence\\'), false, `Sealed evidence and RED are never superseded: ${change.path}`);
      assert.deepEqual(expected.get(change.path), { rawSha256: change.previousRawSha256, byteLength: change.previousByteLength }, change.path);
      assert.notEqual(change.rawSha256, change.previousRawSha256, change.path);
      expected.set(change.path, { rawSha256: change.rawSha256, byteLength: change.byteLength });
    }
    for (const change of addendum.adds) {
      assert.equal(expected.has(change.path), false, `Only new paths can be added: ${change.path}`);
      assert.equal(change.path.startsWith('evidence\\raw\\'), false, change.path);
      assert.equal(addendumName.test(change.path) || change.path === 'evidence-index.json', false, change.path);
      expected.set(change.path, { rawSha256: change.rawSha256, byteLength: change.byteLength });
    }
    addenda.push({ name, sequence: addendum.sequence, rawSha256: source.hash(bytes) });
    previous = source.hash(bytes);
  });
  return { index, expected, addenda };
}
function checkIndex() {
  const { index, expected, addenda } = expectedFiles();
  for (const [file, pin] of expected) {
    const bytes = read(file);
    assert.equal(source.hash(bytes), pin.rawSha256, file);
    assert.equal(bytes.length, pin.byteLength, file);
  }
  for (const file of files()) {
    if (file === 'evidence-index.json' || expected.has(file) || addenda.some((entry) => entry.name === file) ||
        /^publication-result-[0-9a-f-]{36}\.json$/.test(file) ||
        /^evidence\\publication-[0-9a-f-]{36}\\[^\\]+$/.test(file)) continue;
    assert.match(file, /^evidence\\raw\\(?:focused|syntax|browser|edge|integrity|verify|coverage|repair-bdd|repair-stub|repair-red)-[0-9a-f-]{36}\\[^\\]+$/,
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
  const repair = ['repair-bdd', 'repair-stub', 'repair-red'].map((stage) => observed.executions.filter((run) => run.stage === stage));
  let repairRedAssertionsFailed = 0;
  if (repair.some((runs) => runs.length)) {
    repair.forEach((runs) => assert.equal(runs.length, 1, 'Exactly one retained repair specification, stub and RED.'));
    const [specification, stub, repairRed] = repair.map((runs) => runs[0]);
    assert.equal(specification.exitCode, 0);
    assert.equal(stub.exitCode, 0);
    assert.equal(repairRed.exitCode, 1);
    assert.ok(specification.completedAtUtc <= stub.startedAtUtc && stub.completedAtUtc <= repairRed.startedAtUtc);
    assert.match(repairRed.text.stdout, /ERR_ASSERTION/);
    assert.doesNotMatch(repairRed.text.stdout, /TypeError|SyntaxError|ReferenceError|MODULE_NOT_FOUND/);
    assert.equal(repairRed.foreignIndexSourceSha256, source.hash(read('evidence\\red\\foreign-index.initial.snapshot.cjs')));
    assert.equal(repairRed.foreignGuardSourceSha256, source.hash(read('evidence\\red\\foreign-guard.initial.snapshot.ps1')));
    repairRedAssertionsFailed = Number(/^# fail (\d+)$/m.exec(repairRed.text.stdout)[1]);
    assert.equal(repairRedAssertionsFailed, (repairRed.text.stdout.match(/code: 'ERR_ASSERTION'/g) || []).length);
    assert.ok(repairRedAssertionsFailed >= 1);
  }
  const coverageRuns = observed.executions.filter((run) => run.stage === 'coverage' && run.exitCode === 0)
    .sort((a, b) => a.completedAtUtc.localeCompare(b.completedAtUtc));
  const latestCoverage = coverageRuns.length ? JSON.parse(coverageRuns.at(-1).text.stdout.trim().split(/\r?\n/).at(-1)) : null;
  if (latestCoverage) {
    assert.equal(latestCoverage.schema, 'C035-per-file-coverage/1');
    assert.equal(latestCoverage.passed, true);
    assert.ok(latestCoverage.files.every((row) => row.met && row.lines >= 85 && row.branches >= 85 && row.functions >= 85));
  }
  const green = observed.executions.filter((run) => run.stage === 'focused' && run.exitCode === 0);
  assert.ok(green.length >= 1);
  const goodEdge = observed.edges.filter((run) => run.outcome === 'passed');
  const failedEdge = observed.edges.filter((run) => run.outcome === 'failed');
  const sealedFailures = new Set(index.preservedFailures.map((entry) => entry.directory));
  const laterFailedEdge = failedEdge.filter((run) => !sealedFailures.has(run.directory));
  assert.ok(goodEdge.some((run) => run.actualDomChecksPassed === 18));
  assert.ok(failedEdge.some((run) => run.actualDomChecksPassed === 0 &&
    run.cleanup.exactOwnedHelperSessionRemoved === false));
  assert.ok(index.preservedFailures.every((entry) => observed.executions.some((run) =>
    run.directory === entry.directory && run.exitCode !== 0) || observed.edges.some((run) =>
    run.directory === entry.directory && run.outcome === 'failed')));
  return {
    indexedFiles: expected.size, sealedIndexFiles: index.files.length, indexAddenda: addenda.length,
    rawExecutions: observed.executions.length,
    preservedFailedExecutions: observed.executions.filter((run) => run.exitCode !== 0).length,
    preservedFailedEdgeCaptures: failedEdge.length - laterFailedEdge.length, laterFailedEdgeCaptures: laterFailedEdge.length,
    successfulEdgeCaptures: goodEdge.length,
    actualDomChecksInPassingCapture: 18, initialRedAssertionsFailed: 2, repairRedAssertionsFailed,
    latestCoverage: latestCoverage && {
      files: latestCoverage.files.length, passed: latestCoverage.passed,
      minimum: ['lines', 'branches', 'functions'].map((key) => Math.min(...latestCoverage.files.map((row) => row[key])))
    },
    latestFocusedTapTotals: green.sort((a, b) => a.completedAtUtc.localeCompare(b.completedAtUtc))
      .at(-1).text.stdout.split(/\r?\n/).filter((line) => /^# (tests|pass|fail) /.test(line)),
    rawCrlfPairs: observed.executions.reduce((count, run) => count + run.rawProof.stdout.crlfPairs + run.rawProof.stderr.crlfPairs, 0)
  };
}
module.exports = Object.freeze({ root, files, read, captures, checkIndex, expectedFiles });
