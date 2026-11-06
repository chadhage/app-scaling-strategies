'use strict';

// Run after the final archives are indexed in evidence.json (it cannot be part of the runs it verifies): the final runs
// passed, hashed the production files that ship, the replay passes every RED assertion unchanged, and the archived
// browser run scanned the rendered table for repeated event ids.
// U040 amendment (evidence-index-addendum-1.json): a production file whose bytes were replaced by an addendum is accepted when the
// archived run hashed exactly the bytes the addendum supersedes and the live file is exactly the bytes it names; the chain is read
// through tests\u040-chain.cjs, pinned below by its raw SHA-256. The replaced version of this test is archived under
// evidence\u040\superseded and its hash is in the addendum.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const chain = require('./u040-chain.cjs');
const { root, index, sha, resolve, PRODUCTION, manifestOf, stdoutOf, inputHash } = require('./evidence-support.cjs');

const CHAIN_SHA256 = '937fe67978f005dff2a12440999a0e75f5171fe7cf8900ea0de65b174a3fa0e2';
const readRelative = (relative) => {
  try { return fs.readFileSync(resolve(relative)); } catch { return null; }
};

test('the final runs passed, hashed the production files that ship, and the replay passes every RED assertion unchanged', () => {
  assert.equal(sha(fs.readFileSync(path.join(__dirname, 'u040-chain.cjs'))), CHAIN_SHA256, 'u040-chain.cjs is not the pinned helper');
  const amended = chain.verifyChain(readRelative);
  assert.deepEqual(amended.errors, [], 'the addendum chain must verify');
  const finals = index.fixRuns.filter((run) => run.kind !== 'red');
  const kinds = new Set(finals.map((run) => run.kind));
  for (const kind of ['green', 'replay', 'syntax', 'coverage', 'browser']) assert.equal(kinds.has(kind), true, `no ${kind} run is indexed`);
  const reds = index.fixRuns.filter((run) => run.kind === 'red');
  const redTests = reds.reduce((sum, run) => sum + manifestOf(run).summary.tests, 0);
  const covered = new Set();
  for (const run of finals) {
    const manifest = manifestOf(run);
    const stdout = stdoutOf(run, manifest);
    assert.deepEqual([manifest.exitCode, manifest.expectedExitCode, manifest.timedOut], [0, 0, false], run.name);
    for (const name of PRODUCTION) {
      const shipped = sha(fs.readFileSync(path.join(root, name)));
      const recorded = inputHash(manifest, name);
      const replaced = chain.supersedes(amended.hashes, `capability\\C026\\${name}`, recorded, shipped);
      assert.equal(recorded === shipped || replaced, true, `${run.name}: ${name} is not the shipped file`);
    }
    if (run.kind === 'green' || run.kind === 'replay') assert.deepEqual([manifest.summary.fail, manifest.summary.pass], [0, manifest.summary.tests], run.name);
    if (run.kind === 'green') assert.equal(manifest.summary.tests >= 96, true, `the whole suite without this file is 96 tests, ran ${manifest.summary.tests}`);
    if (run.kind === 'replay') {
      assert.equal(manifest.summary.tests, redTests, 'the replay runs exactly the tests of the REDs');
      for (const red of reds) {
        for (const argument of manifestOf(red).command.filter((value) => value.endsWith('.test.cjs'))) assert.equal(manifest.command.includes(argument), true, `${argument} is not replayed`);
      }
    }
    if (run.kind === 'syntax') assert.match(stdout, /C026 syntax: \d+ JavaScript files parsed/);
    if (run.kind === 'coverage') {
      const row = manifest.summary.coverageRows.find((entry) => entry.file === run.file || entry.file.endsWith(`/${run.file}`));
      assert.equal(Boolean(row) && row.lines >= 85 && row.branches >= 85 && row.functions >= 85, true, `${run.file}: ${JSON.stringify(row)}`);
      covered.add(run.file);
    }
    if (run.kind === 'browser') {
      assert.match(stdout, /C026 browser GREEN/);
      const snapshots = [...stdout.matchAll(/^DOM_EVENT_IDS (.+)$/gm)].map((match) => JSON.parse(match[1]));
      assert.deepEqual(snapshots.map((snapshot) => snapshot.label), ['after first load', 'after recovery', 'after retry']);
      for (const snapshot of snapshots) {
        assert.equal(new Set(snapshot.ids).size, snapshot.ids.length, `${snapshot.label}: an event id is rendered twice`);
        assert.deepEqual(snapshot.ids, snapshot.ids.map((_, position) => position + 1), `${snapshot.label}: the ids are not 1..N`);
      }
    }
  }
  assert.deepEqual([...covered].sort(), ['conversation.cjs', 'framing.cjs', 'page.js', 'server.cjs', 'stream.cjs']);
});
